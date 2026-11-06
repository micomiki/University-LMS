
import { useEffect, useRef, useState } from 'react'
import { JitsiMeeting } from '@jitsi/react-sdk'

type Props = {
  meetingId: number
  roomName: string
  token: string
  role: string
  displayName: string
  onClose: () => void
}

export default function TrackedClassroom({
  meetingId,
  roomName,
  token,
  role,
  displayName,
  onClose,
}: Props) {
  const sessionRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const joiningRef = useRef(false)
  const closedRef = useRef(false)

  const [trackingError, setTrackingError] = useState('')

  const isStudent = role.toLowerCase() === 'student'

  function stopHeartbeat() {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  function sendLeave(sessionId: number) {
    void fetch(
      `/api/attendance-tracking/sessions/${sessionId}/leave`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        keepalive: true,
      }
    ).catch(() => {
      // The server will stop counting at the
      // last successful heartbeat if this fails.
    })
  }

  async function startTracking() {
    if (
      !isStudent ||
      closedRef.current ||
      joiningRef.current ||
      sessionRef.current !== null
    ) {
      return
    }

    joiningRef.current = true
    setTrackingError('')

    try {
      const response = await fetch(
        `/api/attendance-tracking/meetings/${meetingId}/join`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (!response.ok) {
        throw new Error(
          `Attendance tracking failed (${response.status}).`
        )
      }

      const data: { session_id: number } =
        await response.json()

      if (closedRef.current) {
        sendLeave(data.session_id)
        return
      }

      sessionRef.current = data.session_id

      timerRef.current = setInterval(() => {
        const sessionId = sessionRef.current

        if (sessionId === null || closedRef.current) {
          return
        }

        void fetch(
          `/api/attendance-tracking/sessions/${sessionId}/heartbeat`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        )
          .then((heartbeatResponse) => {
            if (
              heartbeatResponse.status === 409 &&
              !closedRef.current
            ) {
              stopHeartbeat()
              sessionRef.current = null
              void startTracking()
            } else if (!heartbeatResponse.ok) {
              setTrackingError(
                'Attendance connection could not be verified.'
              )
            }
          })
          .catch(() => {
            if (!closedRef.current) {
              setTrackingError(
                'Attendance heartbeat connection failed.'
              )
            }
          })
      }, 20000)
    } catch (error) {
      if (!closedRef.current) {
        setTrackingError(
          error instanceof Error
            ? error.message
            : 'Attendance tracking unavailable.'
        )
      }
    } finally {
      joiningRef.current = false
    }
  }

  function closeTracking() {
    if (closedRef.current) return

    closedRef.current = true
    stopHeartbeat()

    const sessionId = sessionRef.current
    sessionRef.current = null

    if (sessionId !== null) {
      sendLeave(sessionId)
    }

    onClose()
  }

  useEffect(() => {
    closedRef.current = false

    function handlePageHide() {
      closedRef.current = true
      stopHeartbeat()

      const sessionId = sessionRef.current
      sessionRef.current = null

      if (sessionId !== null) {
        sendLeave(sessionId)
      }
    }

    window.addEventListener('pagehide', handlePageHide)

    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      handlePageHide()
    }
  }, [meetingId, token])

  return (
    <div>
      {isStudent && (
        <p>
          Automatic attendance tracking is enabled.
        </p>
      )}

      {trackingError && (
        <p className="error" role="alert">
          {trackingError}
        </p>
      )}

      <JitsiMeeting
        domain="meet.jit.si"
        roomName={roomName}
        userInfo={{
          displayName,
        }}
        configOverwrite={{
          startWithAudioMuted: true,
          startWithVideoMuted: true,
        }}
        onApiReady={(api) => {
          api.addListener(
            'videoConferenceJoined',
            () => {
              void startTracking()
            }
          )

          api.addListener(
            'videoConferenceLeft',
            closeTracking
          )
        }}
        onReadyToClose={closeTracking}
        getIFrameRef={(element) => {
          element.style.width = '100%'
          element.style.height = '70vh'
        }}
      />
    </div>
  )
}
