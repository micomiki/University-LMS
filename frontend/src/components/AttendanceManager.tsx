
import {
  useCallback,
  useEffect,
  useState,
} from 'react'

type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'late'
  | 'excused'

type AttendanceRosterItem = {
  student_id: number
  full_name: string
  attendance_id: number | null
  status: string | null
}

type Props = {
  meetingId: number
  token: string
  onClose: () => void
}

const attendanceOptions: {
  value: AttendanceStatus
  label: string
}[] = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'late', label: 'Late' },
  { value: 'excused', label: 'Excused' },
]

export default function AttendanceManager({
  meetingId,
  token,
  onClose,
}: Props) {
  const [roster, setRoster] = useState<
    AttendanceRosterItem[]
  >([])

  const [selectedStatuses, setSelectedStatuses] =
    useState<Record<number, AttendanceStatus>>({})

  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(
    null
  )

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadRoster = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError('')

      try {
        const response = await fetch(
          `/api/attendance/meetings/${meetingId}/roster`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal,
          }
        )

        if (!response.ok) {
          throw new Error(
            `Unable to load attendance (${response.status}).`
          )
        }

        const data: AttendanceRosterItem[] =
          await response.json()

        if (signal?.aborted) return

        setRoster(data)

        const selections: Record<
          number,
          AttendanceStatus
        > = {}

        for (const student of data) {
          const existing = attendanceOptions.find(
            (option) => option.value === student.status
          )

          selections[student.student_id] =
            existing?.value ?? 'present'
        }

        setSelectedStatuses(selections)
      } catch (err) {
        if (signal?.aborted) return

        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load attendance.'
        )
      } finally {
        if (!signal?.aborted) {
          setLoading(false)
        }
      }
    },
    [meetingId, token]
  )

  useEffect(() => {
    const controller = new AbortController()

    void loadRoster(controller.signal)

    return () => controller.abort()
  }, [loadRoster])

  async function saveAttendance(
    student: AttendanceRosterItem
  ) {
    const status =
      selectedStatuses[student.student_id] ?? 'present'

    const isNew = student.attendance_id === null

    const endpoint = isNew
      ? `/api/attendance/meetings/${meetingId}`
      : `/api/attendance/${student.attendance_id}`

    setSavingId(student.student_id)
    setError('')
    setMessage('')

    try {
      const response = await fetch(endpoint, {
        method: isNew ? 'POST' : 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          isNew
            ? {
                student_id: student.student_id,
                status,
              }
            : { status }
        ),
      })

      if (!response.ok) {
        const data = await response
          .json()
          .catch(() => null)

        throw new Error(
          typeof data?.detail === 'string'
            ? data.detail
            : `Unable to save attendance (${response.status}).`
        )
      }

      setMessage(
        `Attendance saved for ${student.full_name}.`
      )

      await loadRoster()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save attendance.'
      )
    } finally {
      setSavingId(null)
    }
  }

  return (
    <section className="attendance-manager">
      <div className="attendance-header">
        <div>
          <h3>Class Attendance</h3>
          <p>Meeting ID: {meetingId}</p>
        </div>

        <button
          type="button"
          className="btn-secondary"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}

      {loading ? (
        <p>Loading student roster...</p>
      ) : roster.length === 0 ? (
        <p>No enrolled students found for this class.</p>
      ) : (
        <div className="attendance-table-wrapper">
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Current Status</th>
                <th>Mark As</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {roster.map((student) => (
                <tr key={student.student_id}>
                  <td>
                    <strong>{student.full_name}</strong>
                    <small>
                      ID: {student.student_id}
                    </small>
                  </td>

                  <td>
                    <span
                      className={`attendance-status ${
                        student.status || 'unmarked'
                      }`}
                    >
                      {student.status || 'Not marked'}
                    </span>
                  </td>

                  <td>
                    <select
                      aria-label={`Attendance status for ${student.full_name}`}
                      value={
                        selectedStatuses[
                          student.student_id
                        ] ?? 'present'
                      }
                      disabled={savingId !== null}
                      onChange={(event) =>
                        setSelectedStatuses(
                          (previous) => ({
                            ...previous,
                            [student.student_id]:
                              event.target.value as AttendanceStatus,
                          })
                        )
                      }
                    >
                      {attendanceOptions.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td>
                    <button
                      type="button"
                      disabled={
                        savingId !== null || loading
                      }
                      onClick={() =>
                        saveAttendance(student)
                      }
                    >
                      {savingId === student.student_id
                        ? 'Saving...'
                        : student.attendance_id === null
                          ? 'Mark'
                          : 'Update'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
