"""Fetch and map ESPN transaction (`mTransactions2`) data.

The transaction payload carries only numeric player ids, so a second `kona_player_info` fetch,
filtered to just the ids that appear, resolves names/positions/NFL teams -- negative ids are team
D/STs and resolve through the same call (confirmed against the real league). Lineup moves
(ROSTER, FUTURE_ROSTER) are dropped.

A completed trade is one TRADE_ACCEPT entry whose items carry both sides (TRADE items, each with
a from/to team), sometimes plus ACQUISITION_BUDGET_TRADE items (FAAB moved -- ESPN gives the
direction but no dollar amount) and DROP items. ESPN also emits a companion TRADE_ACCEPT for the
other team at the same instant, holding only that team's forced DROP or nothing at all; those are
folded into the trade they belong to, matched on the shared `proposedDate`, and are not returned
on their own. A companion DROP with no trade to fold into (seen once in the real league) is
skipped.
"""

import asyncio
import json
from datetime import UTC, datetime
from typing import Literal, cast

from app.clients.espn import EspnClient
from app.espn_labels import POSITIONS, PRO_TEAMS
from app.sanitize import sanitize_name
from app.schemas.api import LeagueTransactionsResponse, TransactionItemOut, TransactionOut
from app.schemas.espn_raw import (
    RawLeagueTransactionsResponse,
    RawPlayerInfoResponse,
    RawRosterPlayer,
    RawTransaction,
)

_KINDS: dict[str, Literal["WAIVER", "FREEAGENT", "TRADE"]] = {
    "WAIVER": "WAIVER",
    "FREEAGENT": "FREEAGENT",
    "TRADE_ACCEPT": "TRADE",
}


# An empty status is a trade entry ESPN sent without one (never a processed claim).
_UNPROCESSED_STATUSES = {"PENDING", "CANCELED", ""}
_FAAB_ITEM = "ACQUISITION_BUDGET_TRADE"
_PLAYER_ITEM_TYPES = ("ADD", "DROP", "TRADE")
# Player ids per kona_player_info request. Each id is ~8 bytes of the X-Fantasy-Filter header,
# which tops out around 8KB, so this keeps a request well clear of it as the season grows.
_PLAYER_CHUNK_SIZE = 200
_MAX_CONCURRENT_WEEK_FETCHES = 4


def _iso(epoch_ms: int) -> str:
    return datetime.fromtimestamp(epoch_ms / 1000, UTC).isoformat()


async def _fetch_players(
    espn: EspnClient, season: int, player_ids: list[int]
) -> dict[int, RawRosterPlayer]:
    if not player_ids:
        return {}

    async def fetch_chunk(chunk: list[int]) -> RawPlayerInfoResponse:
        # No `limit` -- ESPN rejects one without a sort, and the id filter already bounds the
        # result.
        flt = json.dumps({"players": {"filterIds": {"value": chunk}}})
        raw = await espn.fetch_league(season, views=["kona_player_info"], x_fantasy_filter=flt)
        return RawPlayerInfoResponse.model_validate(raw)

    chunks = [
        player_ids[i : i + _PLAYER_CHUNK_SIZE]
        for i in range(0, len(player_ids), _PLAYER_CHUNK_SIZE)
    ]
    responses = await asyncio.gather(*(fetch_chunk(chunk) for chunk in chunks))
    return {entry.id: entry.player for response in responses for entry in response.players}


async def _fetch_all_weeks(espn: EspnClient, season: int) -> RawLeagueTransactionsResponse:
    """A request with no scoringPeriodId returns only the current period's transactions, so the
    first call also tells us how far back to walk. Weeks come back concurrently but capped, since
    the ESPN service can sit on a free-tier host."""
    first = RawLeagueTransactionsResponse.model_validate(
        await espn.fetch_league(season, views=["mTransactions2"])
    )
    semaphore = asyncio.Semaphore(_MAX_CONCURRENT_WEEK_FETCHES)

    async def fetch_week(week: int) -> RawLeagueTransactionsResponse:
        async with semaphore:
            raw = await espn.fetch_league(season, views=["mTransactions2"], scoring_period=week)
        return RawLeagueTransactionsResponse.model_validate(raw)

    earlier = await asyncio.gather(*(fetch_week(w) for w in range(1, first.scoringPeriodId)))

    # Deduped by id: a transaction can appear in more than one period's response.
    by_id = {t.id: t for response in earlier for t in response.transactions}
    by_id.update({t.id: t for t in first.transactions})
    return first.model_copy(update={"transactions": list(by_id.values())})


def _fold_trades(transactions: list[RawTransaction]) -> list[RawTransaction]:
    """Merge each trade's companion entries into it and drop them as standalone transactions."""
    trades: dict[int, RawTransaction] = {
        t.proposedDate: t
        for t in transactions
        if t.type == "TRADE_ACCEPT" and any(i.type in ("TRADE", _FAAB_ITEM) for i in t.items)
    }

    folded: dict[int, RawTransaction] = {}
    for date, trade in trades.items():
        seen = {(i.type, i.playerId, i.fromTeamId, i.toTeamId) for i in trade.items}
        items = list(trade.items)
        for companion in transactions:
            if companion is trade or companion.type != "TRADE_ACCEPT":
                continue
            if companion.proposedDate != date:
                continue
            for item in companion.items:
                key = (item.type, item.playerId, item.fromTeamId, item.toTeamId)
                if item.type == "DROP" and key not in seen:
                    seen.add(key)
                    items.append(item)
        folded[date] = trade.model_copy(update={"items": items})

    result: list[RawTransaction] = []
    for t in transactions:
        if t.type != "TRADE_ACCEPT":
            result.append(t)
        elif t.proposedDate in trades and t is trades[t.proposedDate]:
            result.append(folded[t.proposedDate])
        # Anything else is a companion (folded above) or an orphan DROP -- not its own row.
    return result


async def get_league_transactions(espn: EspnClient, season: int) -> LeagueTransactionsResponse:
    parsed = await _fetch_all_weeks(espn, season)

    # PENDING claims are bids that haven't run yet and CANCELED ones were withdrawn before they
    # did; exposing pending ones would reveal every team's offer before the waiver run, and a
    # pending claim is replaced by an EXECUTED/FAILED_* entry once processed.
    relevant = _fold_trades(
        [
            t
            for t in parsed.transactions
            if t.type in _KINDS and t.status not in _UNPROCESSED_STATUSES
        ]
    )
    player_ids = sorted(
        {i.playerId for t in relevant for i in t.items if i.type in _PLAYER_ITEM_TYPES}
    )
    players = await _fetch_players(espn, season, player_ids)

    transactions: list[TransactionOut] = []
    warnings: list[str] = []

    for txn in sorted(relevant, key=lambda t: t.proposedDate, reverse=True):
        items: list[TransactionItemOut] = []
        for item in txn.items:
            if item.type == _FAAB_ITEM:
                items.append(
                    TransactionItemOut(
                        action="FAAB",
                        player_name="FAAB budget",
                        position="",
                        pro_team="",
                        from_espn_team_id=item.fromTeamId,
                        to_espn_team_id=item.toTeamId,
                    )
                )
                continue
            if item.type not in _PLAYER_ITEM_TYPES:
                continue
            player = players.get(item.playerId)
            name = sanitize_name(player.fullName) if player else ""
            if not name:
                warnings.append(f"Transaction {txn.id}: no usable name for player {item.playerId}")
                name = "Unknown player"
            items.append(
                TransactionItemOut(
                    action=cast(Literal["ADD", "DROP", "TRADE"], item.type),
                    player_name=name,
                    position=POSITIONS.get(player.defaultPositionId, "?") if player else "?",
                    pro_team=PRO_TEAMS.get(player.proTeamId, "FA") if player else "FA",
                    from_espn_team_id=item.fromTeamId,
                    to_espn_team_id=item.toTeamId,
                )
            )

        if not items:
            continue

        transactions.append(
            TransactionOut(
                espn_transaction_id=txn.id,
                kind=_KINDS[txn.type],
                status=txn.status,
                espn_team_id=txn.teamId,
                bid_amount=txn.bidAmount,
                week=txn.scoringPeriodId,
                proposed_at=_iso(txn.proposedDate),
                processed_at=_iso(txn.processDate) if txn.processDate else None,
                items=items,
            )
        )

    return LeagueTransactionsResponse(
        season=season,
        league_id=str(parsed.id),
        fetched_at=datetime.now(UTC).isoformat(),
        transactions=transactions,
        warnings=warnings,
    )
