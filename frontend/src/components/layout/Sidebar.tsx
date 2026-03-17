import { LayoutDashboard, KanbanSquare, LogOut } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { useAuth } from '../../hooks/useAuth'

type Item = {
  to: string
  label: string
  icon: typeof LayoutDashboard
}

const items: Item[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/kanban', label: 'Kanban', icon: KanbanSquare },
]

export function Sidebar() {
  const { logout } = useAuth()

  return (
    <aside className="sidebar">
      <div>
        <div className="brand">
          <div className="brand-dot" />
          <span className="brand-text">PospectSocial</span>
        </div>
        <nav className="menu">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx('menu-item', {
                  active: isActive,
                })
              }
            >
              <Icon size={18} />
              <span className="menu-label">{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <button className="menu-item logout" onClick={logout} type="button">
        <LogOut size={18} />
        <span className="menu-label">Sair</span>
      </button>
    </aside>
  )
}
