import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas.espn_raw import RawLeagueTransactionsResponse
from app.services.transactions import get_league_transactions

FIXTURES = Path(__file__).parent / "fixtures"


class _StubEspnClient:
    """Stands in for EspnClient, answering by view -- respx-backed HTTP tests live in
    test_transactions_route.py."""

    def __init__(
        self, transactions: dict, players: dict, earlier_weeks: dict[int, dict] | None = None
    ) -> None:
        self._by_view = {"mTransactions2": transactions, "kona_player_info": players}
        self._earlier_weeks = earlier_weeks or {}
        self.calls: list[tuple[list[str], str | None, int | None]] = []

    async def fetch_league(
        self, season: int, views: list[str], x_fantasy_filter=None, scoring_period=None
    ) -> dict:
        self.calls.append((views, x_fantasy_filter, scoring_period))
        if views[0] == "mTransactions2" and scoring_period is not None:
            # A week with no fixture comes back empty, like a quiet week would.
            return self._earlier_weeks.get(
                scoring_period, {"id": 1, "seasonId": season, "transactions": []}
            )
        return self._by_view[views[0]]


@pytest.fixture
def transactions_payload() -> dict:
    return json.loads((FIXTURES / "mtransactions2_2026.json").read_text())


@pytest.fixture
def players_payload() -> dict:
    return json.loads((FIXTURES / "kona_player_info_2026.json").read_text())


def test_raw_model_ignores_unknown_fields() -> None:
    parsed = RawLeagueTransactionsResponse.model_validate(
        {"id": 1, "seasonId": 2026, "transactions": [], "draftDetail": {"nested": True}}
    )
    assert parsed.id == 1


def test_raw_model_requires_structural_fields() -> None:
    with pytest.raises(ValidationError):
        RawLeagueTransactionsResponse.model_validate({"seasonId": 2026})


async def test_against_real_fixture(transactions_payload: dict, players_payload: dict) -> None:
    result = await get_league_transactions(
        _StubEspnClient(transactions_payload, players_payload), season=2026
    )

    # 24 waiver + 15 free agent, minus 3 pending claims; the 49 ROSTER and 2 FUTURE_ROSTER lineup
    # moves drop, and so does the week's lone companion DROP (a TRADE_ACCEPT with no trade to
    # fold into).
    assert len(result.transactions) == 36
    assert result.warnings == []
    assert {t.kind for t in result.transactions} == {"WAIVER", "FREEAGENT"}

    proposed = [t.proposed_at for t in result.transactions]
    assert proposed == sorted(proposed, reverse=True)


async def test_failed_bids_are_kept_and_pending_claims_dropped(
    transactions_payload: dict, players_payload: dict
) -> None:
    result = await get_league_transactions(
        _StubEspnClient(transactions_payload, players_payload), season=2026
    )

    statuses = {t.status for t in result.transactions}
    assert {"EXECUTED", "FAILED_ROSTERLIMIT", "FAILED_INVALIDPLAYERSOURCE"} <= statuses
    assert "PENDING" not in statuses
    assert any(t.bid_amount > 0 for t in result.transactions if t.status.startswith("FAILED"))


async def test_team_defense_resolves_to_a_name(
    transactions_payload: dict, players_payload: dict
) -> None:
    result = await get_league_transactions(
        _StubEspnClient(transactions_payload, players_payload), season=2026
    )

    defenses = [
        item for t in result.transactions for item in t.items if item.player_name.endswith("D/ST")
    ]
    assert defenses and all(item.position == "D/ST" for item in defenses)


async def test_only_add_drop_items_are_returned(
    transactions_payload: dict, players_payload: dict
) -> None:
    result = await get_league_transactions(
        _StubEspnClient(transactions_payload, players_payload), season=2026
    )

    assert all(i.action in ("ADD", "DROP") for t in result.transactions for i in t.items)


async def test_missing_player_lookup_falls_back_with_warning(transactions_payload: dict) -> None:
    result = await get_league_transactions(
        _StubEspnClient(transactions_payload, {"players": []}), season=2026
    )

    assert len(result.transactions) == 36
    assert result.warnings
    assert all(i.player_name == "Unknown player" for t in result.transactions for i in t.items)


async def test_no_player_fetch_when_nothing_relevant() -> None:
    stub = _StubEspnClient({"id": 1, "seasonId": 2026, "transactions": []}, {"players": []})

    result = await get_league_transactions(stub, season=2026)

    assert result.transactions == []
    assert [views for views, _, _ in stub.calls] == [["mTransactions2"]]


@pytest.fixture
def week3_payload() -> dict:
    return json.loads((FIXTURES / "mtransactions2_2026_week3.json").read_text())


async def test_walks_every_week_up_to_the_current_one(
    transactions_payload: dict, players_payload: dict, week3_payload: dict
) -> None:
    # The fixture's current scoring period is 8, so periods 1-7 are requested on top of the
    # unfiltered call. Only week 3 has data here.
    stub = _StubEspnClient(transactions_payload, players_payload, {3: week3_payload})

    result = await get_league_transactions(stub, season=2026)

    requested = sorted(p for views, _, p in stub.calls if views == ["mTransactions2"] and p)
    assert requested == [1, 2, 3, 4, 5, 6, 7]
    assert {t.week for t in result.transactions} >= {3, 8}
    assert len(result.transactions) > 36


async def test_a_transaction_returned_by_two_weeks_appears_once(
    transactions_payload: dict, players_payload: dict
) -> None:
    # Week 7 echoes the current week's payload, as ESPN does for any period it has no data for.
    stub = _StubEspnClient(transactions_payload, players_payload, {7: transactions_payload})

    result = await get_league_transactions(stub, season=2026)

    ids = [t.espn_transaction_id for t in result.transactions]
    assert len(ids) == len(set(ids)) == 36


async def test_canceled_claims_are_dropped(players_payload: dict) -> None:
    claim = {
        "id": "c1",
        "type": "WAIVER",
        "status": "CANCELED",
        "teamId": 1,
        "bidAmount": 5,
        "proposedDate": 1793152718566,
        "scoringPeriodId": 1,
        "items": [{"playerId": 4361411, "type": "ADD", "fromTeamId": 0, "toTeamId": 1}],
    }
    payload = {"id": 1, "seasonId": 2026, "scoringPeriodId": 1, "transactions": [claim]}

    result = await get_league_transactions(_StubEspnClient(payload, players_payload), season=2026)

    assert result.transactions == []


async def test_odd_trade_entries_do_not_fail_the_response(players_payload: dict) -> None:
    # Seen in the real league: a TRADE_ACCEPT with no status, and a TRADE_DECLINE whose only item
    # has a null type. Either one used to fail validation for the whole season.
    payload = {
        "id": 1,
        "seasonId": 2026,
        "scoringPeriodId": 1,
        "transactions": [
            {"id": "a", "type": "TRADE_ACCEPT", "teamId": 13, "proposedDate": 1793152718566},
            {
                "id": "b",
                "type": "TRADE_DECLINE",
                "status": "EXECUTED",
                "teamId": 2,
                "proposedDate": 1793152718566,
                "items": [{"playerId": 1, "type": None}],
            },
        ],
    }

    result = await get_league_transactions(_StubEspnClient(payload, players_payload), season=2026)

    assert result.transactions == []


async def test_player_lookup_is_chunked(players_payload: dict) -> None:
    transactions = [
        {
            "id": f"t{i}",
            "type": "FREEAGENT",
            "status": "EXECUTED",
            "teamId": 1,
            "proposedDate": 1793152718566 + i,
            "scoringPeriodId": 1,
            "items": [{"playerId": 1000 + i, "type": "ADD", "fromTeamId": 0, "toTeamId": 1}],
        }
        for i in range(450)
    ]
    payload = {"id": 1, "seasonId": 2026, "scoringPeriodId": 1, "transactions": transactions}
    stub = _StubEspnClient(payload, {"players": []})

    await get_league_transactions(stub, season=2026)

    lookups = [flt for views, flt, _ in stub.calls if views == ["kona_player_info"]]
    assert len(lookups) == 3
    assert all(len(json.loads(flt)["players"]["filterIds"]["value"]) <= 200 for flt in lookups)


async def test_trades_carry_both_sides_and_faab(
    transactions_payload: dict, players_payload: dict, week3_payload: dict
) -> None:
    stub = _StubEspnClient(transactions_payload, players_payload, {3: week3_payload})

    result = await get_league_transactions(stub, season=2026)

    trades = [t for t in result.transactions if t.kind == "TRADE"]
    assert len(trades) == 2
    assert result.warnings == []
    for trade in trades:
        assert any(i.action == "TRADE" and i.player_name != "Unknown player" for i in trade.items)
    faab = [i for t in trades for i in t.items if i.action == "FAAB"]
    assert len(faab) == 1
    assert (faab[0].from_espn_team_id, faab[0].to_espn_team_id) == (11, 4)


async def test_companion_entries_fold_into_their_trade(players_payload: dict) -> None:
    def trade(txn_id: str, team: int, items: list[dict], at: int = 1793152718566) -> dict:
        return {
            "id": txn_id,
            "type": "TRADE_ACCEPT",
            "status": "EXECUTED",
            "teamId": team,
            "proposedDate": at,
            "processDate": at + 30,
            "scoringPeriodId": 5,
            "items": items,
        }

    def item(kind: str, player: int, frm: int, to: int) -> dict:
        return {"type": kind, "playerId": player, "fromTeamId": frm, "toTeamId": to}

    payload = {
        "id": 1,
        "seasonId": 2026,
        "scoringPeriodId": 5,
        "transactions": [
            # The trade itself, with the other team's forced drop already inside it...
            trade("main", 1, [item("TRADE", 4361411, 1, 2), item("DROP", 4429676, 2, 0)]),
            # ...a companion repeating that same drop, and an empty companion.
            trade("dup", 2, [item("DROP", 4429676, 2, 0)]),
            trade("empty", 3, []),
            # A companion for a different, later moment folds into nothing and is skipped.
            trade("orphan", 4, [item("DROP", 4360238, 4, 0)], at=1793152999999),
        ],
    }

    result = await get_league_transactions(_StubEspnClient(payload, players_payload), season=2026)

    assert [t.espn_transaction_id for t in result.transactions] == ["main"]
    actions = [(i.action, i.from_espn_team_id) for i in result.transactions[0].items]
    assert actions == [("TRADE", 1), ("DROP", 2)]
