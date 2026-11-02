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

    # 24 waiver + 15 free agent + 1 trade, minus 3 pending claims; the 49 ROSTER and 2
    # FUTURE_ROSTER lineup moves drop.
    assert len(result.transactions) == 37
    assert result.warnings == []
    assert {t.kind for t in result.transactions} == {"WAIVER", "FREEAGENT", "TRADE"}

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

    assert len(result.transactions) == 37
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
    assert len(result.transactions) > 37


async def test_a_transaction_returned_by_two_weeks_appears_once(
    transactions_payload: dict, players_payload: dict
) -> None:
    # Week 7 echoes the current week's payload, as ESPN does for any period it has no data for.
    stub = _StubEspnClient(transactions_payload, players_payload, {7: transactions_payload})

    result = await get_league_transactions(stub, season=2026)

    ids = [t.espn_transaction_id for t in result.transactions]
    assert len(ids) == len(set(ids)) == 37


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
