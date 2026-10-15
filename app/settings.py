"""Everything read from the environment (.env locally, real env vars on a server)."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"

DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# Comma-separated origins allowed to call the API from a browser on another domain,
# e.g. "https://app.example.com,http://localhost:3000". Empty = same-origin only.
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]

# Saving each live session's audio + transcript is a local debugging aid. It writes patient
# speech to disk, so it is off unless explicitly enabled.
SAVE_RECORDINGS = os.getenv("SAVE_RECORDINGS", "false").lower() in ("1", "true", "yes")
RECORDINGS = Path(os.getenv("RECORDINGS_DIR", ROOT / "recordings"))

# Serve the bundled demo UI at "/" (turn off when the frontend team hosts their own).
SERVE_DEMO_UI = os.getenv("SERVE_DEMO_UI", "true").lower() in ("1", "true", "yes")
