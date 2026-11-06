
import { useState, type FormEvent } from 'react'
import ScheduleMeetingForm from './components/ScheduleMeetingForm'
import EditMeetingForm from './components/EditMeetingForm'
import TrackedClassroom from './components/TrackedClassroom'
import AttendanceManager from './components/AttendanceManager'
import AutomaticAttendanceReport from './components/AutomaticAttendanceReport'
import Sidebar, {
  type DashboardPage,
} from './components/Sidebar'

type Account = {
  full_name: string
  role: string
}

type LoginResponse = {
  access_token: string
  token_type: string
}

type Course = {
  id: number
  title: string
  course_code: string
  description: string | null
}

type Meeting = {
  id: number
  course_id: number
  title: string
  description: string | null
  starts_at: string
  ends_at: string
  status: string
  meeting_url: string | null
}

type MeetingLink = {
  id: number
  meeting_url: string
  status: string
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers = new Headers(options.headers)

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(path, {
    ...options,
    headers,
  })

  if (!response.ok) {
    let message = `Request failed (${response.status})`

    try {
      const body = await response.json()
      if (typeof body.detail === 'string') {
        message = body.detail
      }
    } catch {
      // Keep the HTTP status message.
    }

    throw new Error(message)
  }

  return response.json()
}

function getJitsiRoom(meetingUrl: string): string {
  const url = new URL(meetingUrl)
  const roomName = url.pathname.slice(1)

  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'meet.jit.si' ||
    !/^[a-zA-Z0-9_-]+$/.test(roomName)
  ) {
    throw new Error('Invalid Jitsi meeting URL.')
  }

  return roomName
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString()
}

export default function App() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [editingMeetingId, setEditingMeetingId] = useState<number | null>(null)
  const [attendanceMeetingId, setAttendanceMeetingId] =
  useState<number | null>(null)
  const [account, setAccount] =
    useState<Account | null>(null)
  const [activeMeetingId, setActiveMeetingId] =
  useState<number | null>(null)
  const [page, setPage] =
    useState<DashboardPage>('dashboard')
  const [autoReportMeetingId, setAutoReportMeetingId] =
  useState<number | null>(null)
  const [courses, setCourses] = useState<Course[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])

  const [selectedCourseId, setSelectedCourseId] =
    useState<number | null>(null)

  const [roomName, setRoomName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const canManageMeetings =
    account?.role.toLowerCase() === 'professor' ||
    account?.role.toLowerCase() === 'admin'

  async function handleLogin(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const credentials = new URLSearchParams({
        username: email,
        password,
      })

      const login = await apiRequest<LoginResponse>(
        '/api/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/x-www-form-urlencoded',
          },
          body: credentials,
        }
      )

      const user = await apiRequest<Account>(
        '/api/auth/me',
        {},
        login.access_token
      )

      const courseList = await apiRequest<Course[]>(
        '/api/courses/',
        {},
        login.access_token
      )

      setToken(login.access_token)
      setAccount(user)
      setCourses(courseList)
      setPassword('')
      setPage('dashboard')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Login failed.'
      )
    } finally {
      setLoading(false)
    }
  }

  async function selectCourse(courseId: number) {
    setSelectedCourseId(courseId)
    setMeetings([])
    setRoomName('')
    setError('')
    setLoading(true)
    setEditingMeetingId(null)
    setAttendanceMeetingId(null)
    setActiveMeetingId(null)
    setAutoReportMeetingId(null)

    try {
      const result = await apiRequest<Meeting[]>(
        `/api/meetings/courses/${courseId}`,
        {},
        token
      )

      setMeetings(
        [...result].sort(
          (a, b) =>
            new Date(a.starts_at).getTime() -
            new Date(b.starts_at).getTime()
        )
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load meetings.'
      )
    } finally {
      setLoading(false)
    }
  }

  async function openMeeting(
    meeting: Meeting,
    create: boolean
  ) {
    setError('')
    setLoading(true)

    try {
      const action = create ? 'room' : 'join'

      const result = await apiRequest<MeetingLink>(
        `/api/meetings/${meeting.id}/${action}`,
        {
          method: create ? 'POST' : 'GET',
        },
        token
      )

      const room = getJitsiRoom(result.meeting_url)

      setActiveMeetingId(meeting.id)
      setRoomName(room)
      setPage('classroom')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to open classroom.'
      )
    } finally {
      setLoading(false)
    }
  }
  
async function cancelMeeting(meeting: Meeting) {
  const confirmed = window.confirm(
    `Are you sure you want to cancel "${meeting.title}"?`
  )

  if (!confirmed) {
    return
  }

  setError('')
  setLoading(true)

  try {
    await apiRequest<Meeting>(
      `/api/meetings/${meeting.id}`,
      {
        method: 'DELETE',
      },
      token
    )

    setEditingMeetingId(null)

    // Reload meetings to show the updated status.
    await selectCourse(meeting.course_id)
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : 'Unable to cancel meeting.'
    )
  } finally {
    setLoading(false)
  }
}

  function logout() {
    setToken('')
    setAccount(null)
    setCourses([])
    setMeetings([])
    setSelectedCourseId(null)
    setRoomName('')
    setError('')
    setPassword('')
    setAttendanceMeetingId(null)
    setPage('dashboard')
    setActiveMeetingId(null)
    setAutoReportMeetingId(null)
  }

  if (!account) {
    return (
      <main className="container">
        <header className="panel">
          <h1>University LMS</h1>
          <p>Learning Management System</p>
        </header>

        <form
          className="panel"
          onSubmit={handleLogin}
        >
          <h2>Sign In</h2>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </main>
    )
  }

  return (
    <div className="lms-shell">
      <Sidebar
        page={page}
        role={account.role}
        onNavigate={(nextPage) => {
          setPage(nextPage)
          setError('')
        }}
      />

      <main className="lms-main">
        <div className="lms-topbar">
          <div>
            <h1>University LMS</h1>
            <p>Learning Management Dashboard</p>
          </div>

          <button onClick={logout}>
            Logout
          </button>
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {page === 'dashboard' && (
          <>
            <section className="panel">
              <h2>Welcome, {account.full_name}</h2>
              <p>
                You are logged in as a{' '}
                <strong>{account.role}</strong>.
              </p>
            </section>

            <div className="lms-stat-grid">
              <div className="lms-stat-card">
                <span>Available Courses</span>
                <strong>{courses.length}</strong>
              </div>

              <div className="lms-stat-card">
                <span>Your Role</span>
                <strong className="lms-role">
                  {account.role}
                </strong>
              </div>
            </div>

            <section className="panel">
              <h2>Getting Started</h2>
              <p>
                View your courses and their scheduled
                online classes.
              </p>

              <button
                onClick={() => setPage('courses')}
              >
                Browse Courses
              </button>
            </section>
          </>
        )}

        {page === 'courses' && (
          <>
            <section className="panel">
              <h2>Courses</h2>

              <div className="course-grid">
                {courses.map((course) => (
                  <article
                    className="course-card"
                    key={course.id}
                  >
                    <h3>{course.title}</h3>
                    <p>{course.course_code}</p>
                    <p>
                      {course.description ||
                        'No description available.'}
                    </p>

                    <button
                      disabled={loading}
                      onClick={() =>
                        selectCourse(course.id)
                      }
                    >
                      View Meetings
                    </button>
                  </article>
                ))}
              </div>

              {courses.length === 0 && (
                <p>No courses available.</p>
              )}
            </section>
{selectedCourseId !== null && canManageMeetings && (
  <ScheduleMeetingForm
    courseId={selectedCourseId}
    token={token}
    onCreated={() => selectCourse(selectedCourseId)}
  />
)}
            {selectedCourseId !== null && (

              
              <section className="panel">
                <h2>Scheduled Meetings</h2>

                {loading && <p>Loading meetings...</p>}

                {!loading && meetings.length === 0 && (
                  <p>No meetings to display.</p>
                )}

                
{meetings.map((meeting) => (
  <article
    className="meeting-card"
    key={meeting.id}
  >
    <h3>{meeting.title}</h3>

    <p>
      {meeting.description || 'Online class'}
    </p>

    <p>
      Starts: {formatDate(meeting.starts_at)}
    </p>

    <p>
      Ends: {formatDate(meeting.ends_at)}
    </p>

    <p>
      Status: <strong>{meeting.status}</strong>
    </p>

    {meeting.status === 'scheduled' && (
      <div className="meeting-actions">
        {canManageMeetings && (
          <button
            disabled={loading}
            onClick={() => openMeeting(meeting, true)}
          >
            Create / Open Room
          </button>
        )}

        <button
          disabled={loading}
          onClick={() => openMeeting(meeting, false)}
        >
          Join Class
        </button>

        {canManageMeetings && (
          <>
            <button
              className="btn-secondary"
              disabled={loading}
              onClick={() =>
                setEditingMeetingId(
                  editingMeetingId === meeting.id
                    ? null
                    : meeting.id
                )
              }
            >
              Edit Meeting
            </button>

            <button
              className="btn-danger"
              disabled={loading}
              onClick={() => cancelMeeting(meeting)}
            >
              Cancel Class
            </button>
          </>
        )}
      </div>
    )}

    {canManageMeetings &&
      meeting.status === 'scheduled' &&
      editingMeetingId === meeting.id && (
        <EditMeetingForm
          meeting={meeting}
          token={token}
          onCancel={() =>
            setEditingMeetingId(null)
          }
          onUpdated={async () => {
            setEditingMeetingId(null)
            await selectCourse(meeting.course_id)
          }}
        />
      )}
    
{canManageMeetings && meeting.status !== 'cancelled' && (
  <div className="meeting-actions">
    <button
      type="button"
      className="btn-secondary"
      onClick={() =>
        setAttendanceMeetingId(
          attendanceMeetingId === meeting.id
            ? null
            : meeting.id
        )
      }
    >
      {attendanceMeetingId === meeting.id
        ? 'Close Attendance'
        : 'Manage Attendance'}
    </button>
  </div>
)}

{canManageMeetings &&
  meeting.status !== 'cancelled' &&
  attendanceMeetingId === meeting.id && (
    <AttendanceManager
      key={meeting.id}
      meetingId={meeting.id}
      token={token}
      onClose={() =>
        setAttendanceMeetingId(null)
      }
    />
  )}
  
{/* Automatic Attendance Report */}

{canManageMeetings && (
  <button
    type="button"
    className="btn-secondary"
    onClick={() =>
      setAutoReportMeetingId(
        autoReportMeetingId === meeting.id
          ? null
          : meeting.id
      )
    }
  >
    {autoReportMeetingId === meeting.id
      ? 'Hide Automatic Report'
      : 'Automatic Attendance Report'}
  </button>
)}

{canManageMeetings &&
  autoReportMeetingId === meeting.id && (
    <AutomaticAttendanceReport
      meetingId={meeting.id}
      token={token}
    />
  )}

  </article>
))}

              </section>
            )}
          </>
        )}

        {page === 'classroom' && (
          <section className="panel classroom">
            <h2>Live Classroom</h2>

            {roomName ? (
              <>
                <button
                  onClick={() => setRoomName('')}
                >
                  Close Classroom
                </button>

                {activeMeetingId !== null && (
  <TrackedClassroom
    meetingId={activeMeetingId}
    roomName={roomName}
    token={token}
    role={account.role}
    displayName={account.full_name}
    onClose={() => {
      setRoomName('')
      setActiveMeetingId(null)
    }}
  />
)}
              </>
            ) : (
              <>
                <p>
                  No classroom is open.
                  Select a course and join a scheduled
                  meeting to get started.
                </p>

                <button
                  onClick={() => setPage('courses')}
                >
                  Go to Courses
                </button>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
