
import { useCallback, useEffect, useState } from 'react'

type ReportRow = {
  student_id: number
  full_name: string
  first_joined_at: string | null
  last_activity_at: string | null
  minutes_connected: number
  attendance_percent: number
  detected_status: string
}

type Props = {
  meetingId: number
  token: string
}

export default function AutomaticAttendanceReport({
  meetingId,
  token,
}: Props) {
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadReport = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        `/api/attendance-tracking/meetings/${meetingId}/report`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (!response.ok) {
        throw new Error(
          `Report request failed (${response.status}).`
        )
      }

      const data: ReportRow[] = await response.json()
      setRows(data)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load report.'
      )
    } finally {
      setLoading(false)
    }
  }, [meetingId, token])

  useEffect(() => {
    void loadReport()
  }, [loadReport])

  function formatTime(value: string | null) {
    return value
      ? new Date(value).toLocaleString()
      : '—'
  }

  return (
    <section className="attendance-manager">
      <div className="attendance-header">
        <div>
          <h3>Automatic Attendance Report</h3>
          <p>Calculated from classroom connection sessions.</p>
        </div>

        <button
          type="button"
          onClick={() => void loadReport()}
          disabled={loading}
        >
          Refresh Report
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {loading && <p>Loading report...</p>}

      {!loading && rows.length === 0 && (
        <p>No enrolled students found.</p>
      )}

      {rows.length > 0 && (
        <div className="attendance-table-wrapper">
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>First Joined</th>
                <th>Last Activity</th>
                <th>Minutes</th>
                <th>Participation</th>
                <th>Detected Status</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((student) => (
                <tr key={student.student_id}>
                  <td>{student.full_name}</td>
                  <td>
                    {formatTime(student.first_joined_at)}
                  </td>
                  <td>
                    {formatTime(student.last_activity_at)}
                  </td>
                  <td>{student.minutes_connected}</td>
                  <td>{student.attendance_percent}%</td>
                  <td>
                    <span className="attendance-status">
                      {student.detected_status.replace(
                        /_/g,
                        ' '
                      )}
                    </span>
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
