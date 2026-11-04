
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class EnrollmentCreate(BaseModel):
    course_id: int = Field(gt=0)
    student_id: int | None = Field(default=None, gt=0)


class EnrollmentRead(BaseModel):
    id: int
    student_id: int
    course_id: int
    enrolled_at: datetime

    model_config = ConfigDict(from_attributes=True)

