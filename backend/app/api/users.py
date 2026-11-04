
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import require_roles
from app.db.session import get_db
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserUpdate, UserRead


router = APIRouter(
    prefix="/api/users",
    tags=["User Management"]
)


def get_admin():
    return require_roles(UserRole.ADMIN)


# 1. Create a professor or student account
@router.post(
    "/",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED
)
def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin())
):
    if data.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=403,
            detail="Administrator accounts cannot be created through this endpoint"
        )

    email = str(data.email).lower()

    existing_user = db.scalar(
        select(User).where(User.email == email)
    )

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists"
        )

    new_user = User(
        full_name=data.full_name,
        email=email,
        hashed_password=hash_password(data.password),
        role=data.role,
        is_active=True
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user


# 2. List users
@router.get("/", response_model=list[UserRead])
def list_users(
    role: UserRole | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin())
):
    statement = select(User).order_by(User.id)

    if role is not None:
        statement = statement.where(User.role == role)

    statement = statement.limit(limit).offset(offset)

    return db.scalars(statement).all()


# 3. View one user
@router.get("/{user_id}", response_model=UserRead)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin())
):
    user = db.get(User, user_id)

    if user is None:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    return user


# 4. Update user information
@router.put("/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin())
):
    user = db.get(User, user_id)

    if user is None:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    changes = data.model_dump(exclude_unset=True)

    if not changes:
        raise HTTPException(
            status_code=400,
            detail="No update information provided"
        )

    if "email" in changes and changes["email"] is not None:
        email = str(changes["email"]).lower()

        existing_user = db.scalar(
            select(User).where(
                User.email == email,
                User.id != user_id
            )
        )

        if existing_user:
            raise HTTPException(
                status_code=409,
                detail="This email is already being used"
            )

        changes["email"] = email

    if changes.get("is_active") is False:
        if user.id == current_user.id:
            raise HTTPException(
                status_code=400,
                detail="You cannot deactivate your own account"
            )

        if user.role == UserRole.ADMIN:
            raise HTTPException(
                status_code=400,
                detail="Administrator accounts cannot be deactivated here"
            )

    for field, value in changes.items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)

    return user


# 5. Deactivate a user
@router.delete("/{user_id}")
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin())
):
    user = db.get(User, user_id)

    if user is None:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    if user.id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="You cannot deactivate your own account"
        )

    if user.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=400,
            detail="Administrator accounts cannot be deactivated here"
        )

    user.is_active = False

    db.commit()

    return {
        "message": "User deactivated successfully",
        "user_id": user.id
    }

