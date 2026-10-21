import json
import re
from pathlib import Path

import pytest
import respx
from fastapi.testclient import TestClient
from httpx import Response

from app.clients.espn import ESPN_BASE_URL

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "mroster_2026.json"

_LEAGUE_URL_PATTERN = re.compile(
    re.escape(f"{ESPN_BASE_URL}/seasons/2026/segments/0/leagues/19467081") + r"(\?.*)?$"
)


@pytest.fixture
def espn_payload() -> dict:
    return json.loads(FIXTURE_PATH.read_text())


def test_rosters_requires_service_token(client: TestClient) -> None:
    response = client.get("/v1/league/2026/rosters")
    assert response.status_code == 401


@respx.mock
def test_rosters_returns_sanitized_payload(client: TestClient, espn_payload: dict) -> None:
    respx.get(url__regex=_LEAGUE_URL_PATTERN).mock(return_value=Response(200, json=espn_payload))

    response = client.get("/v1/league/2026/rosters", headers={"X-Service-Token": "test-token"})

    assert response.status_code == 200
    body = response.json()
    assert body["season"] == 2026
    assert len(body["teams"]) == 2
    assert body["warnings"] == []
    assert body["teams"][0]["players"]


@respx.mock
def test_rosters_does_not_cache_across_requests(client: TestClient, espn_payload: dict) -> None:
    # Deliberately uncached, unlike /teams -- a commissioner re-syncing rosters shortly after a
    # trade/waiver move must get fresh data, not a 15-minute-stale cached response.
    route = respx.get(url__regex=_LEAGUE_URL_PATTERN).mock(
        return_value=Response(200, json=espn_payload)
    )

    headers = {"X-Service-Token": "test-token"}
    client.get("/v1/league/2026/rosters", headers=headers)
    client.get("/v1/league/2026/rosters", headers=headers)

    assert route.call_count == 2


@respx.mock
def test_rosters_maps_espn_auth_error_to_502(client: TestClient) -> None:
    respx.get(url__regex=_LEAGUE_URL_PATTERN).mock(
        return_value=Response(401, json={"messages": ["nope"]})
    )

    response = client.get("/v1/league/2026/rosters", headers={"X-Service-Token": "test-token"})

    assert response.status_code == 502
    assert "expired" in response.json()["detail"]
