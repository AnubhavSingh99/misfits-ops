import React from 'react'
import clsx from 'clsx'

interface StatsCardProps {
  title: string
  value: string
  icon: React.ReactNode
  trend: string
  color: 'blue' | 'green' | 'purple' | 'orange' | 'red'
}

export function StatsCard({ title, value, icon, trend, color }: StatsCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className={clsx(
            'text-xs mt-1',
            color === 'blue' && 'text-blue-600',
            color === 'green' && 'text-green-600',
            color === 'purple' && 'text-purple-600',
            color === 'orange' && 'text-orange-600',
            color === 'red' && 'text-red-600'
          )}>
            {trend}
          </p>
        </div>
        <div className={clsx(
          'p-3 rounded-lg',
          color === 'blue' && 'bg-blue-50',
          color === 'green' && 'bg-green-50',
          color === 'purple' && 'bg-purple-50',
          color === 'orange' && 'bg-orange-50',
          color === 'red' && 'bg-red-50'
        )}>
          {icon}
        </div>
      </div>
    </div>
  )
}