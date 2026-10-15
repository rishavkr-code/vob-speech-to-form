"""Transcript + current form -> form fields, via Claude Haiku, then deterministic cleanup."""

import difflib
import json
from datetime import date

import anthropic

from . import settings
from .catalog import EXTRACT_MODEL, FIELDS, OPTIONS

client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY or None, timeout=20.0)

EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        k: {"type": ["string", "null"], "description": d} for k, d in FIELDS.items()
    },
    "required": list(FIELDS),
    "additionalProperties": False,
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


class ExtractError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


async def extract(transcript: str, current: dict, today: date) -> dict:
    """Returns the normalized form state. Raises ExtractError."""
    user = (
        f"Today's date: {today.isoformat()}\n\n"
        f"Allowed options:\n{json.dumps(OPTIONS, indent=2)}\n\n"
        f"Current form values:\n{json.dumps(current, indent=2)}\n\n"
        f"Transcript:\n\"\"\"{transcript}\"\"\""
    )
    return normalize(await call_llm(user))


async def call_llm(user: str) -> dict:
    """One Claude call with the form schema enforced. Raises ExtractError."""
    try:
        response = await client.messages.create(
            model=EXTRACT_MODEL,
            max_tokens=4096,  # room for (low-effort) thinking plus ~11 short fields
            # Latency matters more than depth here: low effort thinks little or not at all.
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": EXTRACT_SCHEMA}},
            system=SYSTEM,
            messages=[{"role": "user", "content": user}],
        )
    except anthropic.RateLimitError as e:
        raise ExtractError(f"rate limited by Anthropic: {e.message}", 429) from e
    except anthropic.APIStatusError as e:
        raise ExtractError(f"Anthropic API error {e.status_code}: {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise ExtractError(f"could not reach Anthropic: {e}") from e

    if response.stop_reason != "end_turn":
        raise ExtractError(f"model stopped early ({response.stop_reason})")
    text = next((b.text for b in response.content if b.type == "text"), None)
    if text is None:
        raise ExtractError("model returned no text")
    return json.loads(text)


def normalize(fields: dict) -> dict:
    """Deterministic cleanup so the model doesn't have to get formatting perfect."""
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
