"""Form fields, dropdown options and the model menus. Hardcoded for the POC."""

# Dropdown options. In the real product these come from the backend; hardcoded for the POC.
OPTIONS = {
    "insurance_provider": [
        "Aetna", "Anthem Blue Cross", "Blue Cross Blue Shield", "Cigna", "Humana",
        "Kaiser Permanente", "Medicaid", "Medicare", "Tricare", "UnitedHealthcare",
    ],
    "provider_name": ["Dr. Barberis", "Dr. Patel", "Dr. Shikha Gupta"],
    "clinic": ["Denver Allergy", "Boulder Allergy & Asthma", "Aurora Family Clinic", "Lakewood ENT"],
}

FIELDS = {
    "first_name": "Patient first name",
    "last_name": "Patient last name",
    "insurance_provider": "Insurance provider; must be one of the allowed options",
    "policy_number": "Insurance policy / member ID, uppercase alphanumeric, no spaces",
    "date_of_birth": "Patient date of birth, YYYY-MM-DD",
    "service_date": "Date of service / appointment, YYYY-MM-DD",
    "provider_name": "Treating provider (doctor); must be one of the allowed options",
    "clinic": "Clinic; must be one of the allowed options",
    "appointment_type": "Appointment type, e.g. New Patient, Follow Up, Annual Exam",
    "phone_number": "US phone formatted (XXX) XXX-XXXX",
    "email": "Email address, lowercase",
}

# ---- speech-to-text ----
DEEPGRAM_MODELS = ["nova-3", "nova-3-medical"]
DEFAULT_STT_MODEL = "nova-3"

# Words Deepgram should be biased towards (nova-3 "keyterm" prompting).
KEYTERMS = [*OPTIONS["insurance_provider"], "policy number", "date of birth", "service date",
            "Barberis", "Patel", "Shikha Gupta", "Quezada"]

# The browser streams raw 16 kHz mono PCM (see static/app.js).
SAMPLE_RATE = 16000

# ---- extraction LLMs (via OpenRouter) ----
# First is the default. All support json_schema structured output.
# Value = extra request params for that model. Thinking adds seconds of latency and this task
# doesn't need it, so it's switched off where the model has it.
NO_THINKING = {"reasoning": {"enabled": False}, "temperature": 0}
# "model@provider" pins the request to that host (Cerebras/Groq/SambaNova run on custom chips
# and are several times faster than GPU hosts).
LOW_THINKING = {"reasoning": {"effort": "low"}, "temperature": 0}
# Note: the same model gave much worse answers on other gpt-oss-20b hosts (CoreWeave, Vertex,
# DeepInfra, AkashML), so keep it pinned to Groq.
EXTRACT_MODELS = {
    "openai/gpt-oss-20b@groq": LOW_THINKING,       # chosen: ~0.6s, accurate, cheap
    "openai/gpt-oss-120b@cerebras": LOW_THINKING,  # ~0.5s; also the fallback below
    "openai/gpt-oss-120b@groq": LOW_THINKING,
    "openai/gpt-4.1-mini": {"temperature": 0},     # steady GPU-hosted baseline
    "anthropic/claude-haiku-5.5": {},              # accurate, ~2s; no temperature param
    "google/gemini-3.1-flash-lite": {"reasoning": {"effort": "minimal"}, "temperature": 0},
    "google/gemini-2.5-flash-lite": NO_THINKING,   # ~1s; sometimes adds words to appointment type
    "qwen/qwen3.5-9b": NO_THINKING,                # cheapest
}
DEFAULT_EXTRACT_MODEL = next(iter(EXTRACT_MODELS))
# Used when the chosen model's host is rate-limited or erroring (Groq on OpenRouter can 429).
FALLBACK_MODEL = "openai/gpt-oss-120b@cerebras"
