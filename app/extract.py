"""Transcript + current form -> form fields, via an LLM on OpenRouter, then deterministic cleanup."""

import difflib
import json
from datetime import date

import httpx

from . import settings
from .catalog import EXTRACT_MODELS, FALLBACK_MODEL, FIELDS, OPTIONS
from .clients import http

EXTRACT_SCHEMA = {
    "name": "fill_form",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            k: {"type": ["string", "null"], "description": d} for k, d in FIELDS.items()
        },
        "required": list(FIELDS),
        "additionalProperties": False,
    },
}

SYSTEM = """You fill a medical "Add Patient" insurance-verification form from a spoken transcript
produced by speech-to-text. Reply with the JSON object only.

Rules:
- Return the FULL desired state of every field: start from the current form values and apply what
  the speaker said. Return null only for fields that are empty and not mentioned.
- The speaker may correct themselves ("no wait, it's Smith", "change the last name to ..."):
  the latest statement wins.
- Names, policy numbers and emails are often spelled letter by letter ("Q U E Z A D A",
  "A as in apple"). Prefer the spelled version over the phonetic word. Join spelled letters/digits.
- Speech-to-text may mishear words; use the field context to fix obvious errors
  (e.g. "at gmail dot com" -> "@gmail.com", "oh" -> "0" inside numbers).
- For dropdown fields pick the closest allowed option, or null if nothing reasonably matches.
- Resolve relative dates ("tomorrow", "next Monday") against today's date. Dates as YYYY-MM-DD.
- Never invent values that were not said."""


async def extract(transcript: str, current: dict, model: str, today: date) -> tuple[dict | None, str, str | None, str | None]:
    """Returns (fields, model_used, fallback_reason, error)."""
    user = (
        f"Today's date: {today.isoformat()}\n\n"
        f"Allowed options:\n{json.dumps(OPTIONS, indent=2)}\n\n"
        f"Current form values:\n{json.dumps(current, indent=2)}\n\n"
        f"Transcript:\n\"\"\"{transcript}\"\"\""
    )
    fields, err = await call_llm(model, user)
    fallback_reason = None
    if err and model != FALLBACK_MODEL:
        fallback_reason = err[:200]
        model = FALLBACK_MODEL
        fields, err = await call_llm(model, user)
    if err:
        return None, model, fallback_reason, err
    return normalize(fields), model, fallback_reason, None


async def call_llm(model: str, user: str) -> tuple[dict | None, str | None]:
    """One OpenRouter call. Returns (fields, None) or (None, error)."""
    slug, _, host = model.partition("@")
    body = {
        "model": slug,
        "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
        "response_format": {"type": "json_schema", "json_schema": EXTRACT_SCHEMA},
        "max_tokens": 1024,
        # Only route to providers that honour json_schema.
        "provider": {"require_parameters": True},
        **EXTRACT_MODELS[model],
    }
    if host:
        body["provider"] |= {"order": [host], "allow_fallbacks": False}
    try:
        r = await http.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}"},
            json=body,
        )
    except httpx.HTTPError as e:
        return None, f"{model}: {e!r}"
    if r.status_code != 200:
        return None, f"{model}: {r.text}"
    try:
        return json.loads(r.json()["choices"][0]["message"]["content"]), None
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        return None, f"{model}: bad output {r.text[:500]}"


def normalize(fields: dict) -> dict:
    """Deterministic cleanup so small models don't have to get formatting perfect."""
    for k, v in fields.items():
        if isinstance(v, str) and v.strip().lower() in ("", "null", "none", "n/a"):
            fields[k] = None
    for k, opts in OPTIONS.items():
        if fields.get(k):
            fields[k] = match_option(fields[k], opts)
    for k in ("first_name", "last_name"):
        # Spelled-out names come back as "QUEZADA"; leave mixed case (McDonald) alone.
        if fields.get(k) and (fields[k].isupper() or fields[k].islower()):
            fields[k] = fields[k].title()
    if fields.get("policy_number"):
        fields["policy_number"] = "".join(fields["policy_number"].split()).upper()
    if fields.get("email"):
        fields["email"] = "".join(fields["email"].split()).lower()
    return fields


def _key(s: str) -> str:
    s = "".join(c for c in s.lower() if c.isalnum() or c == " ")
    return " ".join(w for w in s.split() if w not in ("dr", "doctor"))


def match_option(value: str, options: list[str]) -> str | None:
    """Map an LLM/STT spelling ("barbaries", "Dr Gupta", "United") to an allowed option."""
    v = _key(value)
    keys = {_key(o): o for o in options}
    if v in keys:
        return keys[v]
    # Partial name: "gupta" -> "Shikha Gupta", "united" -> "UnitedHealthcare"
    hits = [o for k, o in keys.items() if v in k.split() or k.startswith(v) or v in k]
    if len(hits) == 1:
        return hits[0]
    if len(hits) > 1:
        return None  # ambiguous ("Blue Cross"): better empty than wrong
    close = difflib.get_close_matches(v, list(keys), n=1, cutoff=0.6)
    if close:
        return keys[close[0]]
    # Compare against each word too, e.g. "barbaries" vs "barberis"
    for k, o in keys.items():
        if any(difflib.SequenceMatcher(None, v, w).ratio() >= 0.75 for w in k.split() if len(w) > 3):
            return o
    return None
