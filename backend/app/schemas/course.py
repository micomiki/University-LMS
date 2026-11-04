
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CourseCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str | None = None
    course_code: str = Field(min_length=2, max_length=30)
    professor_id: int = Field(gt=0)


class CourseUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = None
    course_code: str | None = Field(default=None, min_length=2, max_length=30)
    professor_id: int | None = Field(default=None, gt=0)


class CourseRead(BaseModel):
    id: int
    title: str
    description: str | None
    course_code: str
    professor_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

