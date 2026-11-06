
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, model_validator


class MeetingCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = None
    starts_at: datetime
    ends_at: datetime
    meeting_url: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_meeting_time(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("Meeting end time must be after start time")
        return self


class MeetingUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    meeting_url: str | None = Field(default=None, max_length=1000)
    status: str | None = None

    @model_validator(mode="after")
    def validate_meeting_time(self):
        if self.starts_at is not None and self.ends_at is not None:
            if self.ends_at <= self.starts_at:
                raise ValueError("Meeting end time must be after start time")
        return self


class MeetingRead(BaseModel):
    id: int
    title: str
    description: str | None
    starts_at: datetime
    ends_at: datetime
    meeting_url: str | None
    status: str
    course_id: int
    created_by: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
class MeetingLinkRead(BaseModel):
    id: int
    meeting_url: str
    status: str
