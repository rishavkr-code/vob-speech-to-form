# vob-speech-to-form

Voice → Form (Add Patient): speak patient/insurance details, fields fill in live.

```
browser mic ──16 kHz PCM (WebSocket)──▶ FastAPI ──▶ Deepgram live
                                │
     form fields ◀── LLM via OpenRouter (JSON schema) ◀── transcript + current form state
```

## Run
```bash
cp .env.example .env   # fill DEEPGRAM_API_KEY, OPENROUTER_API_KEY
uv sync
uv run uvicorn app.main:app --reload --port 8000
```
API docs (OpenAPI): http://localhost:8000/docs

## Develop
```bash
uv sync                 # includes dev tools (pytest, ruff)
uv run pytest           # offline: the LLM call is stubbed
uv run ruff check .
```
CI runs the same checks plus a Docker build on every PR. Work on a branch and open a PR into `main`.

Postman: import `postman/vob-speech-to-form.postman_collection.json` and set `baseUrl`. Postman can also import `/openapi.json` directly.

## Deploy
```bash
docker build -t vob-audio .
docker run -p 8000:8000 --env-file .env vob-audio
```
Settings are env vars; see `.env.example` (`CORS_ORIGINS`, `SAVE_RECORDINGS`, `SERVE_DEMO_UI`).
Open http://localhost:8000 in **Chrome**. Press the mic (or Space).

## What you can compare
- **Engine**: Deepgram streaming / browser Web Speech (free baseline)
- **Speech-to-text model**: nova-3 (default), nova-3-medical (keyterm boosting for insurer/doctor names)
- **Extraction LLM**: gpt-oss-20b on Groq (default, ~0.6s; auto-falls back to gpt-oss-120b on Cerebras if Groq errors), gpt-oss-120b on Cerebras / Groq, gpt-4.1-mini, claude-haiku-5.5, gemini-3.1-flash-lite, gemini-2.5-flash-lite, qwen3.5-9b
- **Timings panel**: time to first words, extraction latency, "speech end → field filled"

## Things to try saying
- Spelled names: "last name Quezada, Q U E Z A D A"
- Corrections: "actually the first name is Emilia"
- Relative dates: "service date is next Tuesday"
- Dropdown fuzzy matching: "she's on United", "Blue Cross"

## Files
- `app/main.py` – FastAPI app, CORS, demo UI mount
- `app/settings.py` – env vars
- `app/catalog.py` – form fields, dropdown options, STT + LLM model lists
- `app/schemas.py` – request/response models (the API contract)
- `app/routes/api.py` – `/api/health`, `/api/config`, `/api/extract`
- `app/routes/stream.py` – `/ws/deepgram` live relay
- `app/stt.py`, `app/extract.py` – Deepgram live settings; LLM extraction + normalization
- `static/` – demo UI: replica of the Add Patient modal + POC toolbar/debug panels
- `tests/` – pytest suite
- `postman/` – Postman collection (smoke tests against a running server)
- `.github/` – CI workflow + Dependabot
