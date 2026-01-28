import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  FileText,
  CreditCard,
  Link2,
  AlertTriangle,
  Bot,
  Settings,
} from 'lucide-react'

interface NavItem {
  to: string
  icon: React.ElementType
  label: string
}

const navItems: NavItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/invoices', icon: FileText, label: 'Faktury' },
  { to: '/payments', icon: CreditCard, label: 'Płatności' },
  { to: '/matching', icon: Link2, label: 'Dopasowania' },
  { to: '/overdue', icon: AlertTriangle, label: 'Zaległości' },
  { to: '/ai-chat', icon: Bot, label: 'AI Fakturownia' },
  { to: '/settings', icon: Settings, label: 'Ustawienia' },
]

export function Sidebar(): React.JSX.Element {
  return (
    <aside className="hidden w-64 flex-col border-r bg-muted/40 md:flex">
      <nav className="flex flex-col gap-1 p-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
