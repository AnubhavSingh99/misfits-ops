import React, { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  CheckSquare,
  TrendingUp,
  Menu,
  X,
  Users,
  Activity,
  Target,
  Layers,
  Rocket,
  MapPin,
  ChevronRight,
  Headphones
} from 'lucide-react'
import clsx from 'clsx'

interface LayoutProps {
  children: React.ReactNode
}

// All available navigation items with their config IDs
const allNavigation = [
  { id: 'scaling-planner-v2', name: 'Scaling Planner V2', href: '/scaling-planner-v2', icon: Rocket },
  { id: 'health-dashboard', name: 'Health Dashboard', href: '/health-dashboard', icon: Activity },
  { id: 'venue-requirements', name: 'Venue Requirements', href: '/venue-requirements', icon: MapPin },
  { id: 'leader-requirements', name: 'Leader Requirements', href: '/leader-requirements', icon: Users },
  { id: 'customer-service', name: 'Customer Service', href: '/customer-service', icon: Headphones },
]

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [dashboardConfig, setDashboardConfig] = useState<Record<string, boolean>>({})
  const [configLoaded, setConfigLoaded] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  // Fetch dashboard visibility config
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${API_BASE}/config/dashboards`)
        const data = await res.json()
        if (data.success) {
          setDashboardConfig(data.dashboards)
        }
      } catch (err) {
        console.error('Failed to fetch dashboard config:', err)
      } finally {
        setConfigLoaded(true)
      }
    }
    fetchConfig()
  }, [])

  // Filter navigation based on config
  const navigation = allNavigation.filter(item => {
    if (!configLoaded) return false
    return dashboardConfig[item.id] !== false
  })

  // Redirect to default dashboard if current path is hidden
  useEffect(() => {
    if (!configLoaded) return
    const currentPath = location.pathname
    const currentItem = allNavigation.find(item => item.href === currentPath)
    if (currentItem && dashboardConfig[currentItem.id] === false) {
      navigate('/scaling-planner-v2', { replace: true })
    }
  }, [configLoaded, dashboardConfig, location.pathname, navigate])

  // Prevent body scroll when sidebar is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [sidebarOpen])

  // Get current page title
  const currentPage = navigation.find(item => item.href === location.pathname)
  const pageTitle = currentPage?.name || 'Misfits Operations'

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Overlay */}
      <div
        className={clsx(
          'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 transition-opacity duration-300',
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar Drawer */}
      <aside
        className={clsx(
          'fixed top-0 left-0 h-full w-72 bg-white z-50 shadow-2xl',
          'transform transition-transform duration-300 ease-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <img src="/favicon.png" alt="Misfits" className="w-9 h-9" />
            <div>
              <span className="text-base font-bold text-slate-800 tracking-tight">Misfits</span>
              <span className="text-[10px] font-medium text-slate-400 block -mt-0.5 uppercase tracking-widest">Operations</span>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all duration-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1 overflow-y-auto h-[calc(100%-4rem)]">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 mb-3">
            Navigation
          </div>
          {navigation.map((item) => {
            const isActive = location.pathname === item.href
            const Icon = item.icon

            return (
              <Link
                key={item.id}
                to={item.href}
                className={clsx(
                  'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/25'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                )}
              >
                <Icon
                  className={clsx(
                    'h-5 w-5 flex-shrink-0 transition-transform duration-200',
                    isActive ? 'text-white' : 'text-slate-400 group-hover:text-indigo-500',
                    !isActive && 'group-hover:scale-110'
                  )}
                />
                <span className="flex-1">{item.name}</span>
                {isActive && (
                  <ChevronRight className="h-4 w-4 text-white/70" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-100 bg-slate-50/80 backdrop-blur-sm">
          <div className="text-[10px] text-slate-400 text-center">
            Press <kbd className="px-1.5 py-0.5 bg-white rounded border border-slate-200 font-mono text-[9px]">ESC</kbd> to close
          </div>
        </div>
      </aside>

      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200/80">
        <div className="flex items-center h-14 px-4">
          {/* Hamburger Menu */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all duration-200 group"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
          </button>

          {/* Logo & Title */}
          <div className="flex items-center gap-3 ml-3">
            <img src="/favicon.png" alt="Misfits" className="w-7 h-7" />
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold text-slate-800">{pageTitle}</h1>
            </div>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right side - version and status indicator */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-400" title="Build version">
              v{__BUILD_VERSION__}
            </span>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">Live</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="min-h-[calc(100vh-3.5rem)]">
        {children}
      </main>

      {/* Keyboard shortcut handler */}
      <KeyboardHandler
        onEscape={() => setSidebarOpen(false)}
        onToggle={() => setSidebarOpen(prev => !prev)}
      />
    </div>
  )
}

// Keyboard shortcut component
function KeyboardHandler({
  onEscape,
  onToggle
}: {
  onEscape: () => void
  onToggle: () => void
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscape()
      }
      // Cmd/Ctrl + K to toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onToggle()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onEscape, onToggle])

  return null
}

interface NavItem {
  id: string
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}
