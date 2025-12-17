import React from 'react'
import { Lightbulb, TrendingUp, AlertCircle, Calendar } from 'lucide-react'

export function SmartInsights() {
  const insights = [
    {
      type: 'opportunity',
      icon: <TrendingUp className="h-5 w-5 text-green-500" />,
      title: 'Scaling Opportunity',
      message: '5 clubs have high waitlist - can increase capacity',
      action: 'View Clubs',
      color: 'green'
    },
    {
      type: 'warning',
      icon: <AlertCircle className="h-5 w-5 text-orange-500" />,
      title: 'Venue Pattern',
      message: 'Mumbai venues failing - monsoon impact detected',
      action: 'Plan Ahead',
      color: 'orange'
    },
    {
      type: 'suggestion',
      icon: <Calendar className="h-5 w-5 text-blue-500" />,
      title: 'Batching Suggestion',
      message: 'Group 3 South Mumbai visits tomorrow - save 2 hours',
      action: 'Auto-Schedule',
      color: 'blue'
    },
    {
      type: 'insight',
      icon: <Lightbulb className="h-5 w-5 text-purple-500" />,
      title: 'AI Learning',
      message: 'Friday launches have 20% less attendance',
      action: 'Adjust Schedule',
      color: 'purple'
    }
  ]

  const weeklyPlan = {
    currentWeek: 48,
    completionRate: 87,
    upcomingFocus: [
      'Venue visits (Tuesday)',
      'Team reviews (Thursday)',
      'Week planning (Friday)'
    ]
  }

  return (
    <div className="space-y-6">
      {/* Smart Insights */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Lightbulb className="h-5 w-5 text-yellow-500 mr-2" />
          Smart Insights
        </h3>

        <div className="space-y-3">
          {insights.map((insight, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  {insight.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{insight.title}</p>
                  <p className="text-xs text-gray-600 mt-1">{insight.message}</p>
                  <button className={`text-xs font-medium mt-2 hover:underline ${
                    insight.color === 'green' ? 'text-green-600' :
                    insight.color === 'orange' ? 'text-orange-600' :
                    insight.color === 'blue' ? 'text-blue-600' :
                    'text-purple-600'
                  }`}>
                    {insight.action} →
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Week Progress */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Week Progress</h3>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Week {weeklyPlan.currentWeek} Completion</span>
            <span className="text-sm font-semibold text-gray-900">{weeklyPlan.completionRate}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${weeklyPlan.completionRate}%` }}
            />
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-gray-900 mb-2">Upcoming Focus</h4>
          <ul className="space-y-1">
            {weeklyPlan.upcomingFocus.map((item, index) => (
              <li key={index} className="text-sm text-gray-600 flex items-center">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mr-2" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <button className="w-full mt-4 px-3 py-2 bg-blue-50 text-blue-700 text-sm rounded-lg hover:bg-blue-100 transition-colors">
          View Full Week Plan
        </button>
      </div>
    </div>
  )
}