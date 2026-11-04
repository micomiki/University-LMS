
from getpass import getpass

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.user import User, UserRole


def create_admin():
    db = SessionLocal()

    try:
        existing_admin = db.scalar(
            select(User).where(User.role == UserRole.ADMIN)
        )

        if existing_admin:
            print("An administrator account already exists.")
            return

        full_name = input("Administrator full name: ").strip()
        email = input("Administrator email: ").strip().lower()

        if not full_name or not email:
            print("Name and email are required.")
            return

        existing_user = db.scalar(
            select(User).where(User.email == email)
        )

        if existing_user:
            print("This email already belongs to an account.")
            print("Use a different email address.")
            return

        password = getpass("Create password (minimum 12 characters): ")
        confirm_password = getpass("Confirm password: ")

        if len(password) < 12:
            print("Password must contain at least 12 characters.")
            return

        if password != confirm_password:
            print("Passwords do not match.")
            return

        admin = User(
            full_name=full_name,
            email=email,
            hashed_password=hash_password(password),
            role=UserRole.ADMIN,
            is_active=True
        )

        db.add(admin)
        db.commit()

        print("\nAdministrator account created successfully.")
        print(f"Email: {email}")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    create_admin()

