FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

# Shell form, not exec-array -- Render assigns the listen port dynamically via $PORT and expects
# the service to bind to it; the array form can't expand env vars. Falls back to 8000 for local
# `docker run` without -e PORT=...
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
