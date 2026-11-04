
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MaterialRead(BaseModel):
    id: int
    title: str
    description: str | None
    original_filename: str
    content_type: str | None
    file_size: int
    course_id: int
    uploaded_by: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

