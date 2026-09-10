import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import Any


class TTLCache:
    """A tiny in-process async cache. Traffic here is a commissioner clicking
    "sync" a handful of times a season, so a single lock guarding the whole
    store (rather than per-key locking) is more than sufficient."""

    def __init__(self, ttl_seconds: int) -> None:
        self._ttl = ttl_seconds
        self._store: dict[Any, tuple[float, Any]] = {}
        self._lock = asyncio.Lock()

    async def get_or_set(self, key: Any, factory: Callable[[], Awaitable[Any]]) -> Any:
        async with self._lock:
            cached = self._store.get(key)
            if cached is not None:
                expires_at, value = cached
                if expires_at > time.monotonic():
                    return value

            value = await factory()
            self._store[key] = (time.monotonic() + self._ttl, value)
            return value
