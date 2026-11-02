import json
import re

import httpx
import respx
from httpx import Response

from app.clients.espn import ESPN_BASE_URL, EspnClient

_FEED_URL = re.compile(
    re.escape(f"{ESPN_BASE_URL}/seasons/2026/segments/0/leagues/19467081/communication/")
    + r"(\?.*)?$"
)


def _topics(count: int, start: int = 0) -> list[dict]:
    return [{"id": f"t{start + i}", "date": 1, "messages": []} for i in range(count)]


@respx.mock
async def test_pages_are_followed_until_a_short_page() -> None:
    route = respx.get(url__regex=_FEED_URL).mock(
        side_effect=[
            Response(200, json={"topics": _topics(100)}),
            Response(200, json={"topics": _topics(100, 100)}),
            Response(200, json={"topics": _topics(7, 200)}),
        ]
    )

    async with httpx.AsyncClient() as http:
        result = await EspnClient(http, 19467081).fetch_trade_activity(2026)

    assert len(result["topics"]) == 207
    assert route.call_count == 3
    offsets = [
        json.loads(call.request.headers["X-Fantasy-Filter"])["topics"]["offset"]
        for call in route.calls
    ]
    assert offsets == [0, 100, 200]


@respx.mock
async def test_only_trade_message_types_are_requested() -> None:
    route = respx.get(url__regex=_FEED_URL).mock(return_value=Response(200, json={"topics": []}))

    async with httpx.AsyncClient() as http:
        await EspnClient(http, 19467081).fetch_trade_activity(2026)

    sent = json.loads(route.calls[0].request.headers["X-Fantasy-Filter"])
    assert sent["topics"]["filterIncludeMessageTypeIds"]["value"] == [244, 245]
