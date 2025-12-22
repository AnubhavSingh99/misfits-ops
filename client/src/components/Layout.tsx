import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  CheckSquare,
  BookOpen,
  BarChart3,
  TrendingUp,
  Menu,
  X,
  Bell,
  Settings,
  User,
  Upload,
  Users,
  Activity
} from 'lucide-react'
import clsx from 'clsx'

interface LayoutProps {
  children: React.ReactNode
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Scaling Planner', href: '/scaling-planner', icon: TrendingUp },
  { name: 'POC Management', href: '/poc-management', icon: Users },
  { name: 'Health Dashboard', href: '/health-dashboard', icon: Activity },
  { name: 'Task Tracker', href: '/workspace', icon: CheckSquare },
]

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <div className={clsx(
        'fixed inset-0 flex z-50 lg:hidden',
        sidebarOpen ? 'block' : 'hidden'
      )}>
        <div
          className="fixed inset-0 bg-black bg-opacity-25"
          onClick={() => setSidebarOpen(false)}
        />

        <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white shadow-xl">
          <div className="absolute top-0 right-0 -mr-12 pt-2">
            <button
              className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-6 w-6 text-white" />
            </button>
          </div>
          <SidebarContent />
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0">
        <div className="flex flex-col flex-grow bg-white border-r border-gray-200 pt-5 pb-4 overflow-y-auto">
          <SidebarContent />
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64 flex flex-col flex-1">
        {/* Top bar */}
        <div className="relative z-10 flex-shrink-0 flex h-16 bg-white border-b border-gray-200 lg:hidden">
          <button
            className="px-4 border-r border-gray-200 text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>

          <div className="flex-1 px-4 flex justify-between items-center">
            <div className="flex-1" />
            <div className="ml-4 flex items-center space-x-4">
              <button className="text-gray-400 hover:text-gray-500">
                <Bell className="h-6 w-6" />
              </button>
              <button className="text-gray-400 hover:text-gray-500">
                <Settings className="h-6 w-6" />
              </button>
              <button className="text-gray-400 hover:text-gray-500">
                <User className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Desktop top bar */}
        <div className="hidden lg:block bg-white border-b border-gray-200">
          <div className="px-6 py-4 flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">
              Misfits Operations
            </h1>
            <div className="flex items-center space-x-4">
              <button className="text-gray-400 hover:text-gray-500">
                <Bell className="h-6 w-6" />
              </button>
              <button className="text-gray-400 hover:text-gray-500">
                <Settings className="h-6 w-6" />
              </button>
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">S</span>
                </div>
                <span className="text-gray-700 font-medium">Saurabh</span>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}

function SidebarContent() {
  const location = useLocation()

  return (
    <>
      <div className="flex items-center flex-shrink-0 px-4">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">M</span>
          </div>
          <span className="text-xl font-bold text-gray-900">Misfits Ops</span>
        </div>
      </div>

      <div className="mt-8 flex-grow flex flex-col">
        <nav className="flex-1 px-2 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href
            const Icon = item.icon

            return (
              <Link
                key={item.name}
                to={item.href}
                className={clsx(
                  'group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700'
                    : 'text-gray-700 hover:text-blue-700 hover:bg-gray-50'
                )}
              >
                <Icon
                  className={clsx(
                    'mr-3 h-5 w-5',
                    isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-blue-500'
                  )}
                />
                {item.name}
              </Link>
            )
          })}
        </nav>
      </div>
    </>
  )
}