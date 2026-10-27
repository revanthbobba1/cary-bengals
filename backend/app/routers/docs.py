"""Shared OpenAPI documentation pieces for the /v1 routers -- the same auth and ESPN-failure
responses apply to every one of them, so they're declared once here instead of per route."""

from typing import Annotated

from fastapi import Path

from app.schemas.api import ErrorResponse

Season = Annotated[
    int,
    Path(
        description="NFL season year to fetch. Must be one the league has data for.",
        examples=[2026],
        ge=2000,
    ),
]

V1_RESPONSES: dict[int | str, dict] = {
    401: {
        "model": ErrorResponse,
        "description": "`X-Service-Token` header missing or incorrect.",
    },
    502: {
        "model": ErrorResponse,
        "description": (
            "ESPN could not be read: expired cookies (private leagues), unknown league ID, "
            "request failure/timeout, or a response shape this service doesn't recognize. "
            "`detail` says which."
        ),
    },
}
