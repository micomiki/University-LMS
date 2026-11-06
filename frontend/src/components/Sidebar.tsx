
export type DashboardPage =
  | 'dashboard'
  | 'courses'
  | 'classroom'

type SidebarProps = {
  page: DashboardPage
  role: string
  onNavigate: (page: DashboardPage) => void
}

export default function Sidebar({
  page,
  role,
  onNavigate,
}: SidebarProps) {
  const courseLabel =
    role.toLowerCase() === 'professor'
      ? 'Teaching Courses'
      : role.toLowerCase() === 'admin'
        ? 'Manage Courses'
        : 'Courses'

  const items: {
    id: DashboardPage
    label: string
    icon: string
  }[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: '▦',
    },
    {
      id: 'courses',
      label: courseLabel,
      icon: '▤',
    },
    {
      id: 'classroom',
      label: 'Live Classroom',
      icon: '▶',
    },
  ]

  return (
    <aside className="lms-sidebar">
      <div className="lms-brand">
        <div className="lms-brand-icon">U</div>
        <div>
          <strong>University LMS</strong>
          <small>Learning Management</small>
        </div>
      </div>

      <p className="lms-menu-title">MAIN MENU</p>

      <nav aria-label="Main navigation">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={
              'lms-nav-button ' +
              (page === item.id ? 'active' : '')
            }
            aria-current={
              page === item.id ? 'page' : undefined
            }
            onClick={() => onNavigate(item.id)}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="lms-sidebar-footer">
        <span>Logged in as</span>
        <strong>{role.toUpperCase()}</strong>
      </div>
    </aside>
  )
}
