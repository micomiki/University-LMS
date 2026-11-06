from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


AttendanceStatus = Literal["present", "absent", "late", "excused"]


class AttendanceCreate(BaseModel):
    student_id: int
    status: AttendanceStatus = "present"


class AttendanceUpdate(BaseModel):
    status: AttendanceStatus


class AttendanceRead(BaseModel):
    id: int
    meeting_id: int
    student_id: int
    status: str
    marked_by: int
    marked_at: datetime

    model_config = ConfigDict(from_attributes=True)

class AttendanceRosterItem(BaseModel):
    student_id: int
    full_name: str
    attendance_id: int | None = None
    status: str | None = None    
