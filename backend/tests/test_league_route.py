import json
import re
from pathlib import Path

import pytest
import respx
from fastapi.testclient import TestClient
from httpx import Response

from app.clients.espn import ESPN_BASE_URL

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "mteam_2026.json"

_LEAGUE_URL_PATTERN = re.compile(
    re.escape(f"{ESPN_BASE_URL}/seasons/2026/segments/0/leagues/19467081") + r"(\?.*)?$"
)


@pytest.fixture
def espn_payload() -> dict:
    return json.loads(FIXTURE_PATH.read_text())


def test_healthz(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readyz(client: TestClient) -> None:
    response = client.get("/readyz")
    assert response.status_code == 200


def test_teams_requires_service_token(client: TestClient) -> None:
    response = client.get("/v1/league/2026/teams")
    assert response.status_code == 401


def test_teams_rejects_wrong_token(client: TestClient) -> None:
    response = client.get("/v1/league/2026/teams", headers={"X-Service-Token": "nope"})
    assert response.status_code == 401


@respx.mock
def test_teams_returns_sanitized_payload(client: TestClient, espn_payload: dict) -> None:
    respx.get(url__regex=_LEAGUE_URL_PATTERN).mock(return_value=Response(200, json=espn_payload))

    response = client.get("/v1/league/2026/teams", headers={"X-Service-Token": "test-token"})

    assert response.status_code == 200
    body = response.json()
    assert body["season"] == 2026
    assert len(body["teams"]) == 12
    assert body["warnings"] == []


@respx.mock
def test_teams_caches_across_requests(client: TestClient, espn_payload: dict) -> None:
    route = respx.get(url__regex=_LEAGUE_URL_PATTERN).mock(
        return_value=Response(200, json=espn_payload)
    )

    headers = {"X-Service-Token": "test-token"}
    first = client.get("/v1/league/2026/teams", headers=headers)
    second = client.get("/v1/league/2026/teams", headers=headers)

    assert first.json()["fetched_at"] == second.json()["fetched_at"]
    assert route.call_count == 1


@respx.mock
def test_teams_maps_espn_auth_error_to_502(client: TestClient) -> None:
    respx.get(url__regex=_LEAGUE_URL_PATTERN).mock(
        return_value=Response(401, json={"messages": ["nope"]})
    )

    response = client.get("/v1/league/2026/teams", headers={"X-Service-Token": "test-token"})

    assert response.status_code == 502
    assert "expired" in response.json()["detail"]


@respx.mock
def test_teams_maps_espn_not_found_to_502(client: TestClient) -> None:
    respx.get(url__regex=_LEAGUE_URL_PATTERN).mock(return_value=Response(404))

    response = client.get("/v1/league/2026/teams", headers={"X-Service-Token": "test-token"})

    assert response.status_code == 502
    assert "not found" in response.json()["detail"]
