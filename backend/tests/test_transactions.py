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

    def __init__(self, transactions: dict, players: dict) -> None:
        self._by_view = {"mTransactions2": transactions, "kona_player_info": players}
        self.calls: list[tuple[list[str], str | None]] = []

    async def fetch_league(self, season: int, views: list[str], x_fantasy_filter=None) -> dict:
        self.calls.append((views, x_fantasy_filter))
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

    # 24 waiver + 15 free agent + 1 trade; the 49 ROSTER and 2 FUTURE_ROSTER lineup moves drop.
    assert len(result.transactions) == 40
    assert result.warnings == []
    assert {t.kind for t in result.transactions} == {"WAIVER", "FREEAGENT", "TRADE"}

    proposed = [t.proposed_at for t in result.transactions]
    assert proposed == sorted(proposed, reverse=True)


async def test_failed_and_pending_bids_are_kept(
    transactions_payload: dict, players_payload: dict
) -> None:
    result = await get_league_transactions(
        _StubEspnClient(transactions_payload, players_payload), season=2026
    )

    statuses = {t.status for t in result.transactions}
    assert {"EXECUTED", "PENDING", "FAILED_ROSTERLIMIT", "FAILED_INVALIDPLAYERSOURCE"} <= statuses

    pending = [t for t in result.transactions if t.status == "PENDING"]
    assert pending and all(t.processed_at is None for t in pending)
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

    assert len(result.transactions) == 40
    assert result.warnings
    assert all(i.player_name == "Unknown player" for t in result.transactions for i in t.items)


async def test_no_player_fetch_when_nothing_relevant() -> None:
    stub = _StubEspnClient({"id": 1, "seasonId": 2026, "transactions": []}, {"players": []})

    result = await get_league_transactions(stub, season=2026)

    assert result.transactions == []
    assert [views for views, _ in stub.calls] == [["mTransactions2"]]
