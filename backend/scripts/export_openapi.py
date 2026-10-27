"""Writes the ESPN service's OpenAPI schema to backend/openapi.json.

The Next.js admin API docs page (/admin/api-docs) merges this file into its Swagger UI, so the
service's endpoints are documented without the page ever calling the (token-gated) service.
Re-run after changing a router or schema; tests/test_openapi_export.py fails if it's stale.

    uv run python -m scripts.export_openapi
"""

import json
from pathlib import Path

from app.main import app

OPENAPI_PATH = Path(__file__).resolve().parent.parent / "openapi.json"


def render() -> str:
    return json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n"


if __name__ == "__main__":
    OPENAPI_PATH.write_text(render())
    print(f"Wrote {OPENAPI_PATH}")
