import json

from scripts.export_openapi import OPENAPI_PATH, render


def test_committed_openapi_json_matches_the_app():
    # Compared as parsed JSON, not text: the repo's pre-commit Prettier pass reformats this file.
    assert json.loads(OPENAPI_PATH.read_text()) == json.loads(
        render()
    ), "backend/openapi.json is stale -- run `uv run python -m scripts.export_openapi`"
