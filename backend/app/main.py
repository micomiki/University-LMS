from fastapi import FastAPI
from app.api.courses import router as courses_router
from app.core.config import settings
from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.api.enrollments import router as enrollments_router
from app.api.materials import router as materials_router
from app.api.assignments import router as assignments_router
from app.api.submissions import router as submissions_router
from app.api.meetings import router as meetings_router
from app.api.attendance import router as attendance_router

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="University Learning Management System API"
)


app.include_router(auth_router)
app.include_router(users_router)
app.include_router(courses_router)
app.include_router(enrollments_router)
app.include_router(materials_router)
app.include_router(assignments_router)
app.include_router(submissions_router)
app.include_router(meetings_router)
app.include_router(attendance_router)

@app.get("/")
def home():
    return {
        "message": "Welcome to University LMS",
        "status": "running"
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy"
    }
