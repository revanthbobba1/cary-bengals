"""Fetch and map ESPN transaction (`mTransactions2`) data.

The transaction payload carries only numeric player ids, so a second `kona_player_info` fetch,
filtered to just the ids that appear, resolves names/positions/NFL teams -- negative ids are team
D/STs and resolve through the same call (confirmed against the real league). Lineup moves
(ROSTER, FUTURE_ROSTER) are dropped; a trade is currently surfaced as the ADD/DROP items on the
accepted-trade entry itself, with no attempt yet to pair its two sides.
"""

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
)

_KINDS: dict[str, Literal["WAIVER", "FREEAGENT", "TRADE"]] = {
    "WAIVER": "WAIVER",
    "FREEAGENT": "FREEAGENT",
    "TRADE_ACCEPT": "TRADE",
}


def _iso(epoch_ms: int) -> str:
    return datetime.fromtimestamp(epoch_ms / 1000, UTC).isoformat()


async def _fetch_players(
    espn: EspnClient, season: int, player_ids: list[int]
) -> dict[int, RawRosterPlayer]:
    if not player_ids:
        return {}
    # No `limit` -- ESPN rejects one without a sort, and the id filter already bounds the result.
    flt = json.dumps({"players": {"filterIds": {"value": player_ids}}})
    raw = await espn.fetch_league(season, views=["kona_player_info"], x_fantasy_filter=flt)
    parsed = RawPlayerInfoResponse.model_validate(raw)
    return {entry.id: entry.player for entry in parsed.players}


async def get_league_transactions(espn: EspnClient, season: int) -> LeagueTransactionsResponse:
    raw = await espn.fetch_league(season, views=["mTransactions2"])
    parsed = RawLeagueTransactionsResponse.model_validate(raw)

    # PENDING claims are bids that haven't run yet; exposing them would reveal every team's offer
    # before the waiver run, and they're replaced by an EXECUTED/FAILED_* entry once processed.
    relevant = [t for t in parsed.transactions if t.type in _KINDS and t.status != "PENDING"]
    player_ids = sorted(
        {i.playerId for t in relevant for i in t.items if i.type in ("ADD", "DROP")}
    )
    players = await _fetch_players(espn, season, player_ids)

    transactions: list[TransactionOut] = []
    warnings: list[str] = []

    for txn in sorted(relevant, key=lambda t: t.proposedDate, reverse=True):
        items: list[TransactionItemOut] = []
        for item in txn.items:
            if item.type not in ("ADD", "DROP"):
                continue
            player = players.get(item.playerId)
            name = sanitize_name(player.fullName) if player else ""
            if not name:
                warnings.append(f"Transaction {txn.id}: no usable name for player {item.playerId}")
                name = "Unknown player"
            items.append(
                TransactionItemOut(
                    action=cast(Literal["ADD", "DROP"], item.type),
                    player_name=name,
                    position=POSITIONS.get(player.defaultPositionId, "?") if player else "?",
                    pro_team=PRO_TEAMS.get(player.proTeamId, "FA") if player else "FA",
                    from_espn_team_id=item.fromTeamId,
                    to_espn_team_id=item.toTeamId,
                )
            )

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
