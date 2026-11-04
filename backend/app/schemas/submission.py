
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SubmissionRead(BaseModel):
    id: int
    assignment_id: int
    student_id: int
    text_response: str | None
    original_filename: str | None
    submitted_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

