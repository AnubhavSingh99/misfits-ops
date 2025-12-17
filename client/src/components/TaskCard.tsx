import React from 'react'
import { Calendar, User, MapPin, AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import clsx from 'clsx'

interface TaskCardProps {
  task: {
    id: string
    title: string
    description: string
    priority: 'P0' | 'P1' | 'P2'
    dueDate: Date
    assignedTo: string
    clubName?: string
    status: 'pending' | 'in_progress' | 'completed'
  }
}

export function TaskCard({ task }: TaskCardProps) {
  const priorityConfig = {
    P0: {
      color: 'border-red-500 bg-red-50',
      badge: 'bg-red-100 text-red-800',
      icon: <AlertTriangle className="h-4 w-4 text-red-500" />
    },
    P1: {
      color: 'border-orange-500 bg-orange-50',
      badge: 'bg-orange-100 text-orange-800',
      icon: <Clock className="h-4 w-4 text-orange-500" />
    },
    P2: {
      color: 'border-blue-500 bg-blue-50',
      badge: 'bg-blue-100 text-blue-800',
      icon: <CheckCircle className="h-4 w-4 text-blue-500" />
    }
  }

  const statusConfig = {
    pending: { label: 'Pending', color: 'bg-gray-100 text-gray-800' },
    in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-800' },
    completed: { label: 'Completed', color: 'bg-green-100 text-green-800' }
  }

  const isOverdue = task.dueDate < new Date() && task.status !== 'completed'
  const isToday = task.dueDate.toDateString() === new Date().toDateString()

  return (
    <div className={clsx(
      'bg-white rounded-lg border-l-4 shadow-sm p-4 hover:shadow-md transition-all duration-200',
      priorityConfig[task.priority].color
    )}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          {priorityConfig[task.priority].icon}
          <span className={clsx(
            'px-2 py-1 rounded-full text-xs font-medium',
            priorityConfig[task.priority].badge
          )}>
            {task.priority}
          </span>
          {isOverdue && (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
              Overdue
            </span>
          )}
          {isToday && !isOverdue && (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
              Due Today
            </span>
          )}
        </div>
        <span className={clsx(
          'px-2 py-1 rounded-full text-xs font-medium',
          statusConfig[task.status].color
        )}>
          {statusConfig[task.status].label}
        </span>
      </div>

      <h3 className="font-semibold text-gray-900 mb-1">{task.title}</h3>
      <p className="text-sm text-gray-600 mb-3">{task.description}</p>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1">
            <User className="h-4 w-4" />
            <span>{task.assignedTo}</span>
          </div>
          {task.clubName && (
            <div className="flex items-center space-x-1">
              <MapPin className="h-4 w-4" />
              <span>{task.clubName}</span>
            </div>
          )}
        </div>
        <div className="flex items-center space-x-1">
          <Calendar className="h-4 w-4" />
          <span>
            {task.dueDate.toLocaleDateString('en-IN', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-2 mt-3">
        <button className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors">
          Take Action
        </button>
        <button className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200 transition-colors">
          Delegate
        </button>
        <button className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200 transition-colors">
          Later
        </button>
      </div>
    </div>
  )
}