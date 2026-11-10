# University Learning Management System (LMS)

## Overview

**University LMS** is a web-based platform for managing teaching and learning activities in a university. It connects **administrators, professors, and students** in one system to organize courses, share learning materials, manage assignments and submissions, conduct online classes, track attendance, and exchange feedback and grades.

The application consists of a **React frontend**, a **FastAPI REST backend**, and a **PostgreSQL database**. Docker Compose provides the local database and Redis services.

## Technology Stack

| Component | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| Backend / REST API | Python, FastAPI, Pydantic |
| Database | PostgreSQL 17, SQLAlchemy ORM |
| Database migrations | Alembic |
| Supporting service | Redis 7 |
| Live classrooms | Jitsi Meet / React SDK |
| Authentication | JWT, Argon2 password hashing |
| Testing | pytest, Vitest, React Testing Library, Playwright |
| Infrastructure and CI | Docker Compose, GitHub Actions |

## Environment Requirements

Install the following before setting up the project:

- **Git** — clone the repository and manage source code.
- **Python** and **pip** — run the backend and install Python packages (CI uses Python 3.13).
- **Node.js** and **npm** — build and run the frontend (CI uses Node.js 22).
- **Docker Desktop** with Docker Compose — run PostgreSQL and Redis locally.
- **A modern web browser** — access the application.

The commands below use **Git Bash on Windows**. For Linux or macOS, change the Python virtual environment activation command as noted below.

Check your installed tools:

```bash
git --version
python --version
node --version
npm --version
docker --version
docker compose version
```

## Installation and Environment Setup

### 1. Clone the repository

```bash
git clone https://github.com/micomiki/University-LMS.git
cd University-LMS
```

If the project is already on your computer, open its existing root folder instead.

### 2. Start PostgreSQL and Redis

From the **project root**:

```bash
docker compose -f infrastructure/docker-compose.yml up -d --wait
```

This starts the local PostgreSQL database on port **5432** and Redis on port **6379**.

### 3. Install backend dependencies

Open a terminal in `backend/`:

```bash
cd backend
python -m venv venv
source venv/Scripts/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

On Linux or macOS, activate the environment with `source venv/bin/activate` instead.

### 4. Configure the backend environment

Create `backend/.env` with the following **local development** settings:

```dotenv
DATABASE_URL=postgresql+psycopg://lms_user:change_this_password@localhost:5432/university_lms
SECRET_KEY=replace_with_a_generated_secret
ACCESS_TOKEN_EXPIRE_MINUTES=30
REDIS_URL=redis://localhost:6379/0
DEBUG=true
```

Generate a random value for `SECRET_KEY` with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Paste the generated value into `.env`. The PostgreSQL credentials in `DATABASE_URL` must match `infrastructure/docker-compose.yml`. Keep `.env` out of Git.

### 5. Apply database migrations

With the backend virtual environment activated and PostgreSQL running:

```bash
grep '^sqlalchemy.url' alembic.ini
python -m alembic upgrade head
```

The `sqlalchemy.url` setting in `backend/alembic.ini` must point to the same intended development database as `DATABASE_URL` before running migrations.

### 6. Install frontend dependencies

Open another terminal from the project root:

```bash
cd frontend
npm ci
npx playwright install chromium
```

`npm ci` installs the dependencies defined by `package-lock.json`; the Playwright command installs the Chromium browser used by automated browser tests.

## Run the Application

Keep the **infrastructure**, **backend**, and **frontend** running together.

**Terminal 1 — Infrastructure** (project root):

```bash
docker compose -f infrastructure/docker-compose.yml up -d --wait
```

**Terminal 2 — Backend** (`backend/`):

```bash
source venv/Scripts/activate
python -m uvicorn app.main:app --reload
```

**Terminal 3 — Frontend** (`frontend/`):

```bash
npm run dev
```

Open the following addresses:

| Service | URL |
| --- | --- |
| LMS application | http://localhost:5173 |
| FastAPI backend | http://127.0.0.1:8000 |
| Interactive API documentation | http://127.0.0.1:8000/docs |
| API health endpoint | http://127.0.0.1:8000/health |

Users can sign in through the web application and access the functions available to their assigned role.

## Manage the System

Run infrastructure commands from the **project root**:

```bash
# View running database and Redis containers
docker compose -f infrastructure/docker-compose.yml ps

# View database logs
docker compose -f infrastructure/docker-compose.yml logs --tail=100 postgres

# View Redis logs
docker compose -f infrastructure/docker-compose.yml logs --tail=100 redis

# Inspect PostgreSQL tables
docker exec -it lms-postgres psql -U lms_user -d university_lms -c '\dt'

# Stop and remove development containers (named data volumes are retained)
docker compose -f infrastructure/docker-compose.yml down
```

To stop the backend or frontend, press **Ctrl+C** in the terminal running that server. To restart either server, run its startup command again.

For backend debugging, run from `backend/`:

```bash
python -m uvicorn app.main:app --reload --log-level debug
```

For frontend checks, run from `frontend/`:

```bash
npm run build
npm run lint
```

## Run Automated Tests

**Backend** — from `backend/` with the virtual environment active:

```bash
python -m pytest -v
```

The PostgreSQL integration tests use a dedicated test database; configure that database before running the complete backend suite.

**Frontend** — from `frontend/`:

```bash
npx vitest run --config vitest.config.ts
npm run build
```

**Playwright browser tests** — from `frontend/`:

```bash
npx playwright test --config playwright.config.ts
```

The real-database Playwright suite is configured separately in `playwright.fullstack.config.ts`. Its database setup and seed commands are described in the technical commands document.

