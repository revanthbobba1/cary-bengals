from fastapi import Depends, Header, HTTPException

from app.config import Settings, get_settings


async def verify_service_token(
    x_service_token: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    if not x_service_token or x_service_token != settings.service_token:
        raise HTTPException(status_code=401, detail="Invalid or missing service token")
