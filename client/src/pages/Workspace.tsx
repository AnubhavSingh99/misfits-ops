import React, { useState } from 'react'
import { Plus, Pin, Search, Calendar, StickyNote, CheckSquare } from 'lucide-react'
import { PersonalTodos } from '../components/PersonalTodos'
import { ClubNotes } from '../components/ClubNotes'
import { QuickCapture } from '../components/QuickCapture'
import { WeeklyPlanner } from '../components/WeeklyPlanner'

export function Workspace() {
  const [activeTab, setActiveTab] = useState<'overview' | 'notes' | 'planner'>('overview')

  const tabs = [
    { id: 'overview', label: 'Overview', icon: CheckSquare },
    { id: 'notes', label: 'Club Notes', icon: StickyNote },
    { id: 'planner', label: 'Week Planner', icon: Calendar }
  ]

  const pinnedNotes = [
    {
      id: '1',
      title: 'Mumbai Strategy',
      content: 'Focus on South Mumbai, venues expensive but high demand. Consider premium pricing for central locations.',
      updatedAt: new Date()
    },
    {
      id: '2',
      title: 'Q4 Goals',
      content: '₹60L target, need 20 new clubs, 15 in pipeline. Priority cities: Pune, Bangalore expansion.',
      updatedAt: new Date()
    }
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Workspace</h1>
          <p className="text-gray-600 mt-1">Your personal command center for operations</p>
        </div>
        <div className="flex items-center space-x-3">
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2">
            <Plus className="h-4 w-4" />
            <span>Quick Add</span>
          </button>
        </div>
      </div>

      {/* Quick Capture */}
      <QuickCapture />

      {/* Pinned Notes */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Pin className="h-5 w-5 text-yellow-600" />
          <h2 className="text-lg font-semibold text-yellow-800">Pinned Notes</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pinnedNotes.map((note) => (
            <div key={note.id} className="bg-white rounded-lg p-4 border border-yellow-300">
              <h3 className="font-medium text-gray-900 mb-2">{note.title}</h3>
              <p className="text-sm text-gray-600 line-clamp-3">{note.content}</p>
              <p className="text-xs text-gray-500 mt-2">
                Updated {note.updatedAt.toLocaleDateString('en-IN')}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors ${
                    isActive
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && <WorkspaceOverview />}
          {activeTab === 'notes' && <ClubNotes />}
          {activeTab === 'planner' && <WeeklyPlanner />}
        </div>
      </div>
    </div>
  )
}

function WorkspaceOverview() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Personal Todos</h3>
        <PersonalTodos />
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
        <div className="space-y-3">
          <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
            <div className="w-2 h-2 bg-blue-500 rounded-full mt-2" />
            <div>
              <p className="text-sm text-gray-900">Added note to Mumbai Photography #3</p>
              <p className="text-xs text-gray-500">2 hours ago</p>
            </div>
          </div>
          <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
            <div className="w-2 h-2 bg-green-500 rounded-full mt-2" />
            <div>
              <p className="text-sm text-gray-900">Completed week planning for Week 48</p>
              <p className="text-xs text-gray-500">Yesterday</p>
            </div>
          </div>
          <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
            <div className="w-2 h-2 bg-purple-500 rounded-full mt-2" />
            <div>
              <p className="text-sm text-gray-900">Created reminder for investor call</p>
              <p className="text-xs text-gray-500">2 days ago</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}