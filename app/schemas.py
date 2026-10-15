"""Request/response shapes. These are the API contract and drive the /docs (OpenAPI) page."""

from datetime import date

from pydantic import BaseModel, Field

from .catalog import FIELDS

# One optional string per form field, e.g. {"first_name": "Emily", "email": null, ...}
FormFields = dict[str, str | None]


class Error(BaseModel):
    error: str


class ConfigResponse(BaseModel):
    options: dict[str, list[str]] = Field(description="Allowed values for each dropdown field")
    fields: dict[str, str] = Field(description="Every form field name -> what it holds")
    stt_models: list[str] = Field(description="Models for /ws/deepgram; first one is the default")
    deepgram_configured: bool
    anthropic_configured: bool


class ExtractRequest(BaseModel):
    transcript: str = Field("", description="Everything said so far in this session (finals joined by spaces)")
    current: FormFields = Field(default_factory=dict, description="Current form values; keys from `fields`")
    today: date | None = Field(
        None, description="User's local date for 'tomorrow' etc. Omitted = the server's date (UTC on most hosts)"
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "transcript": "Patient is Emily Quezada, that's Q U E Z A D A. Insurance is Aetna.",
                "current": {k: None for k in FIELDS},
                "today": "2026-10-15",
            }
        }
    }


class ExtractResponse(BaseModel):
    fields: FormFields = Field(description="FULL desired state of every field (null = empty)")
    ms: int = Field(description="Model time, milliseconds")
    model: str = Field(description="Model that produced the answer")


class Health(BaseModel):
    status: str = "ok"
