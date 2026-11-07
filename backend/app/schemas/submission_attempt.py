
from datetime import datetime

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
)


class AttemptFeedbackUpdate(BaseModel):
    feedback: str = Field(
        min_length=1,
        max_length=5000,
    )


class SubmissionAttemptRead(BaseModel):
    id: int
    submission_id: int
    attempt_number: int

    text_response: str | None
    original_filename: str | None

    submitted_at: datetime

    feedback: str | None
    reviewed_by: int | None
    reviewed_at: datetime | None

    model_config = ConfigDict(from_attributes=True)

