/** Student deadline overview; based only on assignment dates already loaded by RoleDashboard. */
type DeadlineRow = { assignment: { due_at: string } }

type Props = {
  rows: DeadlineRow[]
  now: number
}

export default function WeeklyDeadlineStrip({ rows, now }: Props) {
  const today = new Date(now)
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    const next = new Date(day)
    next.setDate(day.getDate() + 1)
    const count = rows.filter(({ assignment }) => {
      const due = Date.parse(assignment.due_at)
      return Number.isFinite(due) && due >= day.getTime() && due < next.getTime()
    }).length
    return {
      key: day.toISOString(),
      label: day.toLocaleDateString(undefined, { weekday: 'short' }),
      date: day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      count,
      today: index === 0,
    }
  })
  const maxCount = Math.max(1, ...days.map((day) => day.count))
  const total = days.reduce((sum, day) => sum + day.count, 0)

  return (
    <section className="rd-week-card" aria-label="Seven-day deadline overview">
      <div className="rd-week-heading">
        <div>
          <span className="rd-eyebrow">PLAN AHEAD</span>
          <h3>This week's deadlines</h3>
          <p>Assignments due over the next seven calendar days.</p>
        </div>
        <span className="rd-week-total">{total} due</span>
      </div>
      <div className="rd-week-grid">
        {days.map((day) => (
          <div className={`rd-week-day${day.today ? ' rd-week-today' : ''}`} key={day.key}>
            <span className="rd-week-label">{day.label}</span>
            <span className="rd-week-date">{day.date}</span>
            <div className="rd-week-track" aria-hidden="true">
              <div className="rd-week-fill" style={{ height: `${day.count === 0 ? 0 : Math.max(18, (day.count / maxCount) * 100)}%` }} />
            </div>
            <strong aria-label={`${day.count} assignments due`}>{day.count}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}
