from app.models.user import User, UserRole
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.material import Material
from app.models.assignment import Assignment
from app.models.submission import Submission
from app.models.meeting import Meeting
from app.models.attendance import Attendance
from app.models.attendance_session import AttendanceSession
from app.models.submission_attempt import SubmissionAttempt
__all__ = [
    "User",
    "UserRole",
    "Course",
    "Enrollment",
]
