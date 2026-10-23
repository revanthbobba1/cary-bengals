from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get(
    "/healthz",
    summary="Liveness check",
    description="Returns 200 whenever the process is up. Unauthenticated; does not touch ESPN.",
)
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get(
    "/readyz",
    summary="Readiness check",
    description="Returns 200 once the service can take traffic. Unauthenticated; no ESPN call.",
)
async def readyz() -> dict[str, str]:
    return {"status": "ready"}
