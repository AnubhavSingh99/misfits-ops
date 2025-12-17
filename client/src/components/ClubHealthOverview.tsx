import React from 'react'
import { AlertTriangle, CheckCircle, Clock, TrendingDown } from 'lucide-react'

export function ClubHealthOverview() {
  // Mock data representing club health distribution
  const healthData = {
    green: 95,
    yellow: 24,
    red: 8,
    total: 127
  }

  const redClubs = [
    { name: 'Mumbai Photography #3', issue: 'Venue cancelled', daysRed: 2 },
    { name: 'Delhi Pottery #1', issue: 'Leader quit', daysRed: 1 },
    { name: 'Pune Books #4', issue: 'Low attendance', daysRed: 5 }
  ]

  const improvingClubs = [
    { name: 'Bangalore Running #2', from: 'Red', to: 'Yellow', days: 3 },
    { name: 'Hyderabad Dance #1', from: 'Yellow', to: 'Green', days: 2 }
  ]

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Club Health Overview</h3>

      {/* Health Statistics */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <span className="text-sm text-gray-600">Healthy</span>
          </div>
          <div className="text-right">
            <span className="font-semibold text-green-600">{healthData.green}</span>
            <span className="text-sm text-gray-500 ml-1">
              ({Math.round((healthData.green / healthData.total) * 100)}%)
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Clock className="h-5 w-5 text-yellow-500" />
            <span className="text-sm text-gray-600">Attention Needed</span>
          </div>
          <div className="text-right">
            <span className="font-semibold text-yellow-600">{healthData.yellow}</span>
            <span className="text-sm text-gray-500 ml-1">
              ({Math.round((healthData.yellow / healthData.total) * 100)}%)
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <span className="text-sm text-gray-600">Critical</span>
          </div>
          <div className="text-right">
            <span className="font-semibold text-red-600">{healthData.red}</span>
            <span className="text-sm text-gray-500 ml-1">
              ({Math.round((healthData.red / healthData.total) * 100)}%)
            </span>
          </div>
        </div>
      </div>

      {/* Critical Clubs */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Critical Clubs</h4>
        <div className="space-y-2">
          {redClubs.map((club, index) => (
            <div key={index} className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-red-900 text-sm">{club.name}</p>
                  <p className="text-xs text-red-700">{club.issue}</p>
                </div>
                <span className="text-xs text-red-600">{club.daysRed}d</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Improving Clubs */}
      <div>
        <h4 className="text-sm font-medium text-gray-900 mb-2 flex items-center">
          <TrendingDown className="h-4 w-4 text-green-500 mr-1 transform rotate-180" />
          Recent Improvements
        </h4>
        <div className="space-y-2">
          {improvingClubs.map((club, index) => (
            <div key={index} className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-green-900 text-sm">{club.name}</p>
                  <p className="text-xs text-green-700">
                    {club.from} → {club.to}
                  </p>
                </div>
                <span className="text-xs text-green-600">{club.days}d ago</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}