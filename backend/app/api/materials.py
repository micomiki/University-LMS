
from pathlib import Path
from uuid import uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status
)
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User, UserRole
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.material import Material
from app.schemas.material import MaterialRead


router = APIRouter(
    prefix="/api/materials",
    tags=["Course Materials"]
)

# Store files in backend/uploads/course_materials
UPLOAD_DIR = (
    Path(__file__).resolve().parents[2]
    / "uploads"
    / "course_materials"
)

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB

ALLOWED_EXTENSIONS = {
    ".pdf",
    ".doc",
    ".docx",
    ".ppt",
    ".pptx",
    ".txt",
    ".csv",
    ".xls",
    ".xlsx",
    ".png",
    ".jpg",
    ".jpeg"
}


def check_course_access(
    db: Session,
    current_user: User,
    course_id: int
):
    course = db.get(Course, course_id)

    if course is None:
        raise HTTPException(
            status_code=404,
            detail="Course not found"
        )

    if current_user.role == UserRole.ADMIN:
        return course

    if current_user.role == UserRole.PROFESSOR:
        if course.professor_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="This course is not assigned to you"
            )
        return course

    if current_user.role == UserRole.STUDENT:
        enrollment = db.scalar(
            select(Enrollment).where(
                Enrollment.student_id == current_user.id,
                Enrollment.course_id == course_id
            )
        )

        if enrollment is None:
            raise HTTPException(
                status_code=403,
                detail="You must be enrolled in this course"
            )

        return course

    raise HTTPException(
        status_code=403,
        detail="Access denied"
    )


# 1. Upload course material
@router.post(
    "/courses/{course_id}",
    response_model=MaterialRead,
    status_code=status.HTTP_201_CREATED
)
async def upload_material(
    course_id: int,
    title: str = Form(..., min_length=2, max_length=200),
    description: str | None = Form(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in [UserRole.ADMIN, UserRole.PROFESSOR]:
        raise HTTPException(
            status_code=403,
            detail="Only administrators and professors can upload materials"
        )

    check_course_access(db, current_user, course_id)

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="A filename is required"
        )

    original_filename = file.filename.replace("\\", "/").split("/")[-1]
    extension = Path(original_filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="This file type is not supported"
        )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    stored_filename = f"{uuid4().hex}{extension}"
    file_path = UPLOAD_DIR / stored_filename
    file_size = 0

    try:
        with file_path.open("wb") as destination:
            while True:
                chunk = await file.read(1024 * 1024)

                if not chunk:
                    break

                file_size += len(chunk)

                if file_size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail="File exceeds the 20 MB upload limit"
                    )

                destination.write(chunk)

    except Exception:
        file_path.unlink(missing_ok=True)
        raise

    finally:
        await file.close()

    material = Material(
        title=title,
        description=description,
        original_filename=original_filename,
        stored_filename=stored_filename,
        content_type=file.content_type,
        file_size=file_size,
        course_id=course_id,
        uploaded_by=current_user.id
    )

    try:
        db.add(material)
        db.commit()
        db.refresh(material)

    except Exception:
        db.rollback()
        file_path.unlink(missing_ok=True)
        raise

    return material


# 2. List materials in a course
@router.get(
    "/courses/{course_id}",
    response_model=list[MaterialRead]
)
def list_course_materials(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    check_course_access(db, current_user, course_id)

    statement = (
        select(Material)
        .where(Material.course_id == course_id)
        .order_by(Material.created_at.desc())
    )

    return db.scalars(statement).all()


# 3. Download material
@router.get("/{material_id}/download")
def download_material(
    material_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    material = db.get(Material, material_id)

    if material is None:
        raise HTTPException(
            status_code=404,
            detail="Material not found"
        )

    check_course_access(db, current_user, material.course_id)

    file_path = UPLOAD_DIR / material.stored_filename

    if not file_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="The physical file could not be found"
        )

    return FileResponse(
        path=file_path,
        filename=material.original_filename,
        media_type=material.content_type or "application/octet-stream"
    )


# 4. Delete material
@router.delete("/{material_id}")
def delete_material(
    material_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in [UserRole.ADMIN, UserRole.PROFESSOR]:
        raise HTTPException(
            status_code=403,
            detail="Only administrators and professors can delete materials"
        )

    material = db.get(Material, material_id)

    if material is None:
        raise HTTPException(
            status_code=404,
            detail="Material not found"
        )

    check_course_access(db, current_user, material.course_id)

    file_path = UPLOAD_DIR / material.stored_filename

    db.delete(material)
    db.commit()

    file_path.unlink(missing_ok=True)

    return {
        "message": "Material deleted successfully",
        "material_id": material_id
    }

