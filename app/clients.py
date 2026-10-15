"""Shared outbound HTTP client."""

import httpx

http = httpx.AsyncClient(timeout=30)
