import pytest

from app.extract import match_option, normalize

INSURERS = ["Aetna", "Blue Cross Blue Shield", "Anthem Blue Cross", "UnitedHealthcare"]
DOCTORS = ["Dr. Barberis", "Dr. Patel", "Dr. Shikha Gupta"]


@pytest.mark.parametrize(
    ("value", "options", "expected"),
    [
        ("aetna", INSURERS, "Aetna"),
        ("United", INSURERS, "UnitedHealthcare"),
        ("Blue Cross", INSURERS, None),  # ambiguous: better empty than wrong
        ("Dr Gupta", DOCTORS, "Dr. Shikha Gupta"),
        ("barbaries", DOCTORS, "Dr. Barberis"),
        ("Dr. Nobody", DOCTORS, None),
    ],
)
def test_match_option(value, options, expected):
    assert match_option(value, options) == expected


def test_normalize_cleans_formatting():
    out = normalize({
        "first_name": "EMILY",
        "last_name": "McDonald",
        "policy_number": "w 123 456",
        "email": " Emily@Gmail.com ",
        "appointment_type": "null",
        "insurance_provider": "united",
    })
    assert out["first_name"] == "Emily"
    assert out["last_name"] == "McDonald"
    assert out["policy_number"] == "W123456"
    assert out["email"] == "emily@gmail.com"
    assert out["appointment_type"] is None
    assert out["insurance_provider"] == "UnitedHealthcare"
