
import { useState, type FormEvent } from 'react'
import { JitsiMeeting } from '@jitsi/react-sdk'

type Account = {
  full_name: string
  role: string
}

type LoginResponse = {
  access_token: string
  token_type: string
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

function App() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [account, setAccount] = useState<Account | null>(null)
  const [meetingId, setMeetingId] = useState('1')
  const [roomName, setRoomName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
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
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: credentials,
        }
      )

      const user = await apiRequest<Account>(
        '/api/auth/me',
        {},
        login.access_token
      )

      setToken(login.access_token)
      setAccount(user)
      setPassword('')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Login failed.'
      )
    } finally {
      setLoading(false)
    }
  }

  async function openMeeting(create: boolean) {
    const id = Number(meetingId)

    if (!Number.isInteger(id) || id <= 0) {
      setError('Enter a valid meeting ID.')
      return
    }

    setLoading(true)
    setError('')
    setRoomName('')

    try {
      const action = create ? 'room' : 'join'
      const result = await apiRequest<MeetingLink>(
        `/api/meetings/${id}/${action}`,
        { method: create ? 'POST' : 'GET' },
        token
      )

      setRoomName(getJitsiRoom(result.meeting_url))
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to join meeting.'
      )
    } finally {
      setLoading(false)
    }
  }

  const canCreateRoom =
    account?.role.toLowerCase() === 'professor' ||
    account?.role.toLowerCase() === 'admin'

  return (
    <main className="container">
      <h1>University LMS</h1>
      <p>Online Video Classroom</p>

      {error && <p className="error">{error}</p>}

      {!account ? (
        <form onSubmit={handleLogin} className="panel">
          <h2>Login</h2>

          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </form>
      ) : (
        <>
          <section className="panel">
            <h2>Welcome, {account.full_name}</h2>
            <p>Role: {account.role}</p>

            <label htmlFor="meeting-id">Meeting ID</label>
            <input
              id="meeting-id"
              type="number"
              min="1"
              value={meetingId}
              onChange={(event) => setMeetingId(event.target.value)}
            />

            {canCreateRoom && (
              <button
                disabled={loading}
                onClick={() => openMeeting(true)}
              >
                Create / Open Room
              </button>
            )}

            <button
              disabled={loading}
              onClick={() => openMeeting(false)}
            >
              Join Class
            </button>

            <button
              onClick={() => {
                setAccount(null)
                setToken('')
                setRoomName('')
                setError('')
              }}
            >
              Logout
            </button>
          </section>

          {roomName && (
            <section className="panel classroom">
              <h2>Live Classroom</h2>

              <button onClick={() => setRoomName('')}>
                Close Classroom
              </button>

              <JitsiMeeting
                domain="meet.jit.si"
                roomName={roomName}
                userInfo={{
                  displayName: account.full_name,
                }}
                configOverwrite={{
                  startWithAudioMuted: true,
                  startWithVideoMuted: true,
                }}
                onReadyToClose={() => setRoomName('')}
                getIFrameRef={(element) => {
                  element.style.width = '100%'
                  element.style.height = '70vh'
                }}
              />
            </section>
          )}
        </>
      )}
    </main>
  )
}

export default App
