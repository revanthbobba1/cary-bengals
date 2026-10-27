import hmac

from fastapi import Depends, HTTPException, Security
from fastapi.security import APIKeyHeader

from app.config import Settings, get_settings

# A declared security scheme (not a bare Header param) so the generated docs show an Authorize
# button and list the header once instead of on every operation. auto_error=False keeps our own
# 401 body/status below instead of FastAPI's default 403.
service_token_header = APIKeyHeader(
    name="X-Service-Token",
    auto_error=False,
    description="Shared secret; must equal the service's SERVICE_TOKEN setting.",
)


async def verify_service_token(
    x_service_token: str | None = Security(service_token_header),
    settings: Settings = Depends(get_settings),
) -> None:
    if not x_service_token or not hmac.compare_digest(x_service_token, settings.service_token):
        raise HTTPException(status_code=401, detail="Invalid or missing service token")
