from scripts.export_openapi import OPENAPI_PATH, render


def test_committed_openapi_json_matches_the_app():
    assert (
        OPENAPI_PATH.read_text() == render()
    ), "backend/openapi.json is stale -- run `uv run python -m scripts.export_openapi`"
