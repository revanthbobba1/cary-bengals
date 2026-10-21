"""Shared ESPN-error-to-HTTP mapping, registered once in main.py's create_app() instead of
being duplicated as try/except in every router (league.py, roster.py, schedule.py all hit the
exact same four cases). A FastAPI exception handler is a cleaner fit here than a helper function
each router would still have to remember to call -- a router that forgets to import/wrap with a
helper silently loses the mapping, but a registered handler applies to every route automatically.

Registering a handler for pydantic.ValidationError is safe: FastAPI's own request-parsing errors
raise the separate RequestValidationError class, so this never shadows that."""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.clients.espn import EspnAuthError, EspnNotFoundError, EspnRequestError


async def _espn_auth_error_handler(request: Request, exc: EspnAuthError) -> JSONResponse:
    return JSONResponse(
        status_code=502, content={"detail": "ESPN credentials expired — re-capture cookies"}
    )


async def _espn_not_found_handler(request: Request, exc: EspnNotFoundError) -> JSONResponse:
    return JSONResponse(
        status_code=502, content={"detail": "ESPN league not found — check the league ID"}
    )


async def _espn_request_error_handler(request: Request, exc: EspnRequestError) -> JSONResponse:
    return JSONResponse(status_code=502, content={"detail": f"ESPN request failed: {exc}"})


async def _validation_error_handler(request: Request, exc: ValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=502, content={"detail": f"Unexpected ESPN response shape: {exc}"}
    )


def register_espn_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(EspnAuthError, _espn_auth_error_handler)
    app.add_exception_handler(EspnNotFoundError, _espn_not_found_handler)
    app.add_exception_handler(EspnRequestError, _espn_request_error_handler)
    app.add_exception_handler(ValidationError, _validation_error_handler)
