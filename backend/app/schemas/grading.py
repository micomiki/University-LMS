from decimal import Decimal
from pydantic import BaseModel, Field


class GradeSubmission(BaseModel):
    score: Decimal = Field(ge=0, decimal_places=2)
    feedback: str | None = None
