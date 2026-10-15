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

# ---- extraction LLM ----
EXTRACT_MODEL = "claude-haiku-5-5"
