import json
import re
from pathlib import Path

import pytest
import respx
from fastapi.testclient import TestClient
from httpx import Response

from app.clients.espn import ESPN_BASE_URL

FIXTURES = Path(__file__).parent / "fixtures"

_LEAGUE_URL_PATTERN = re.compile(
    re.escape(f"{ESPN_BASE_URL}/seasons/2026/segments/0/leagues/19467081") + r"(\?.*)?$"
)


def _mock_espn() -> respx.Route:
    transactions = json.loads((FIXTURES / "mtransactions2_2026.json").read_text())
    players = json.loads((FIXTURES / "kona_player_info_2026.json").read_text())

    def respond(request) -> Response:
        # Distinguish the two ESPN calls by the requested view.
        return Response(
            200, json=players if "kona_player_info" in str(request.url) else transactions
        )

    return respx.get(url__regex=_LEAGUE_URL_PATTERN).mock(side_effect=respond)


def test_transactions_require_service_token(client: TestClient) -> None:
    response = client.get("/v1/league/2026/transactions")
    assert response.status_code == 401


@respx.mock
def test_transactions_return_mapped_payload(client: TestClient) -> None:
    _mock_espn()

    response = client.get("/v1/league/2026/transactions", headers={"X-Service-Token": "test-token"})

    assert response.status_code == 200
    body = response.json()
    assert body["season"] == 2026
    assert len(body["transactions"]) == 40
    assert body["warnings"] == []


@respx.mock
def test_transactions_do_not_cache_across_requests(client: TestClient) -> None:
    route = _mock_espn()

    headers = {"X-Service-Token": "test-token"}
    client.get("/v1/league/2026/transactions", headers=headers)
    client.get("/v1/league/2026/transactions", headers=headers)

    # Two ESPN calls per request (transactions, then player names).
    assert route.call_count == 4


@respx.mock
@pytest.mark.parametrize(
    ("status", "detail"), [(401, "expired"), (404, "not found")], ids=["auth", "not-found"]
)
def test_transactions_map_espn_errors_to_502(client: TestClient, status: int, detail: str) -> None:
    respx.get(url__regex=_LEAGUE_URL_PATTERN).mock(return_value=Response(status))

    response = client.get("/v1/league/2026/transactions", headers={"X-Service-Token": "test-token"})

    assert response.status_code == 502
    assert detail in response.json()["detail"]
