import { useState } from 'react'

export type DashboardPage = 'dashboard' | 'courses' | 'classroom'

type SidebarProps = {
  page: DashboardPage
  role: string
  onNavigate: (page: DashboardPage) => void
}

type IconName = DashboardPage | 'menu' | 'close' | 'collapse' | 'expand' | 'graduation'

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const shared = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  }

  if (name === 'dashboard') return <svg {...shared}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
  if (name === 'courses') return <svg {...shared}><path d="M4 5.5C6.8 4 9.5 4 12 5.5c2.5-1.5 5.2-1.5 8 0V19c-2.8-1.5-5.5-1.5-8 0-2.5-1.5-5.2-1.5-8 0Z"/><path d="M12 5.5V19"/></svg>
  if (name === 'classroom') return <svg {...shared}><rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3"/></svg>
  if (name === 'graduation') return <svg {...shared}><path d="m2 9 10-5 10 5-10 5L2 9Z"/><path d="M6 11v5c3.7 3 8.3 3 12 0v-5M22 9v7"/></svg>
  if (name === 'menu') return <svg {...shared}><path d="M4 6h16M4 12h16M4 18h16"/></svg>
  if (name === 'close') return <svg {...shared}><path d="M5 5l14 14M19 5 5 19"/></svg>
  if (name === 'collapse') return <svg {...shared}><path d="m15 6-6 6 6 6"/></svg>
  return <svg {...shared}><path d="m9 6 6 6-6 6"/></svg>
}

export default function Sidebar({ page, role, onNavigate }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem('university-lms-sidebar-collapsed') === 'true' }
    catch { return false }
  })
  const [mobileOpen, setMobileOpen] = useState(false)

  const courseLabel = role.toLowerCase() === 'professor'
    ? 'Teaching Courses'
    : role.toLowerCase() === 'admin'
      ? 'Manage Courses'
      : 'Courses'

  const items: { id: DashboardPage; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'courses', label: courseLabel },
    { id: 'classroom', label: 'Live Classroom' },
  ]

  function goTo(nextPage: DashboardPage) {
    onNavigate(nextPage)
    setMobileOpen(false)
  }

  return (
    <aside className={`lms-sidebar modern-sidebar${collapsed ? ' is-collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}>
      <div className="modern-sidebar-top">
        <div className="lms-brand">
          <div className="lms-brand-icon"><Icon name="graduation" size={25} /></div>
          <div className="modern-brand-text"><strong>University LMS</strong><small>Learning &amp; planning</small></div>
        </div>
        <button type="button" className="modern-mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileOpen}>
          <Icon name={mobileOpen ? 'close' : 'menu'} />
        </button>
      </div>
      <div className="modern-sidebar-content">
        <p className="lms-menu-title">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`lms-nav-button${page === item.id ? ' active' : ''}`}
              aria-current={page === item.id ? 'page' : undefined}
              aria-label={item.label}
              title={item.label}
              onClick={() => goTo(item.id)}
            >
              <span className="modern-nav-icon"><Icon name={item.id} /></span>
              <span className="modern-nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="lms-sidebar-footer">
          <span>Signed in as</span><strong>{role.toUpperCase()}</strong>
        </div>
        <button
          type="button"
          className="modern-collapse-button"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => {
            const next = !collapsed
            setCollapsed(next)
            try { window.localStorage.setItem('university-lms-sidebar-collapsed', String(next)) }
            catch { /* local storage is optional */ }
          }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon name={collapsed ? 'expand' : 'collapse'} />

        </button>
      </div>
    </aside>
  )
}
