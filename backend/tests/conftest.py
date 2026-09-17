from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

_TEST_ENV = {
    "ESPN_LEAGUE_ID": "19467081",
    "ESPN_S2": "test-s2",
    "ESPN_SWID": "{TEST-SWID}",
    "SERVICE_TOKEN": "test-token",
    "CACHE_TTL_SECONDS": "900",
}


@pytest.fixture(autouse=True)
def _settings_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Point every test at fake, deterministic settings instead of whatever
    real values (or absence of them) happen to be in backend/.env."""
    for key, value in _TEST_ENV.items():
        monkeypatch.setenv(key, value)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
