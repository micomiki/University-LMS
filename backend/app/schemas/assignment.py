
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class AssignmentCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str | None = None
    instructions: str | None = None
    due_at: datetime
    max_score: Decimal = Field(gt=0, le=999999.99)


class AssignmentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = None
    instructions: str | None = None
    due_at: datetime | None = None
    max_score: Decimal | None = Field(default=None, gt=0, le=999999.99)


class AssignmentRead(BaseModel):
    id: int
    title: str
    description: str | None
    instructions: str | None
    due_at: datetime
    max_score: Decimal
    course_id: int
    created_by: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

