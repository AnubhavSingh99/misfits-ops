import React, { useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Clock, MapPin, Users } from 'lucide-react'

export function WeeklyPlanner() {
  const [currentWeek, setCurrentWeek] = useState(48)

  const weekPlan = {
    weekStart: new Date(),
    goals: [
      'Fix all red clubs (3 remaining)',
      'Launch 5 new clubs',
      'Complete Delhi expansion review'
    ],
    insights: [
      'Batch venue visits on Tuesday - saves 3 hours',
      'Friday launches have 20% less attendance',
      'Mumbai needs more stable venue partnerships'
    ],
    days: [
      {
        day: 'Monday',
        date: 'Dec 6',
        focus: 'Foundation Day',
        blocks: [
          {
            time: '9:00 - 12:00',
            title: 'Morning Block',
            type: 'focus',
            tasks: [
              'Review all red clubs',
              'Approve week launches',
              'Team standup'
            ]
          },
          {
            time: '2:00 - 5:00',
            title: 'Afternoon Block',
            type: 'meetings',
            tasks: [
              'Call struggling leaders (3 calls)',
              'Review venue proposals'
            ]
          }
        ]
      },
      {
        day: 'Tuesday',
        date: 'Dec 7',
        focus: 'Field Day',
        blocks: [
          {
            time: '9:00 - 12:00',
            title: 'Venue Visits',
            type: 'field',
            tasks: [
              'South Mumbai venues (5 locations)',
              'Meet Rahul at Bandra'
            ]
          },
          {
            time: '2:00 - 5:00',
            title: 'Onboarding',
            type: 'meetings',
            tasks: [
              'New POC training (Priya & Amit)'
            ]
          }
        ]
      },
      {
        day: 'Wednesday',
        date: 'Dec 8',
        focus: 'Growth Day',
        blocks: [
          {
            time: '10:00 - 2:00',
            title: 'Strategic Review',
            type: 'focus',
            tasks: [
              'Stage 2 clubs review (8 ready)',
              'Marketing materials approval',
              'Mid-week health check'
            ]
          }
        ]
      }
    ]
  }

  const blockTypeColors = {
    focus: 'bg-blue-100 border-blue-300 text-blue-800',
    meetings: 'bg-purple-100 border-purple-300 text-purple-800',
    field: 'bg-green-100 border-green-300 text-green-800',
    admin: 'bg-gray-100 border-gray-300 text-gray-800'
  }

  return (
    <div className="space-y-6">
      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setCurrentWeek(currentWeek - 1)}
            className="p-2 hover:bg-gray-100 rounded-md"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-xl font-bold text-gray-900">Week {currentWeek} Smart Plan</h2>
          <button
            onClick={() => setCurrentWeek(currentWeek + 1)}
            className="p-2 hover:bg-gray-100 rounded-md"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <Calendar className="h-4 w-4" />
          <span>Dec 6 - Dec 12, 2024</span>
        </div>
      </div>

      {/* Week Goals & Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-800 mb-3">Week Goals</h3>
          <ul className="space-y-2">
            {weekPlan.goals.map((goal, index) => (
              <li key={index} className="text-sm text-blue-700 flex items-start">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mr-2 mt-2" />
                {goal}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h3 className="font-semibold text-purple-800 mb-3">AI Insights</h3>
          <ul className="space-y-2">
            {weekPlan.insights.map((insight, index) => (
              <li key={index} className="text-sm text-purple-700 flex items-start">
                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full mr-2 mt-2" />
                {insight}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Daily Schedule */}
      <div className="space-y-6">
        {weekPlan.days.map((day, dayIndex) => (
          <div key={dayIndex} className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{day.day}</h3>
                <p className="text-sm text-gray-500">{day.date} • {day.focus}</p>
              </div>
              <div className="text-sm text-gray-500">
                {day.blocks.length} block{day.blocks.length !== 1 ? 's' : ''}
              </div>
            </div>

            <div className="space-y-4">
              {day.blocks.map((block, blockIndex) => (
                <div
                  key={blockIndex}
                  className={`border rounded-lg p-4 ${blockTypeColors[block.type as keyof typeof blockTypeColors]}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4" />
                      <span className="font-medium">{block.time}</span>
                      <span className="text-sm opacity-75">• {block.title}</span>
                    </div>
                    <span className="text-xs px-2 py-1 bg-white rounded-md opacity-75 capitalize">
                      {block.type}
                    </span>
                  </div>

                  <ul className="space-y-1">
                    {block.tasks.map((task, taskIndex) => (
                      <li key={taskIndex} className="text-sm flex items-start">
                        <span className="w-1 h-1 bg-current rounded-full mr-2 mt-2" />
                        {task}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}