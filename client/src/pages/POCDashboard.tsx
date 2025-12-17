import React, { useState, useEffect } from 'react'
import {
  User,
  Target,
  TrendingUp,
  Building2,
  ArrowUp,
  ArrowDown,
  Plus,
  Eye,
  EyeOff,
  Calendar,
  MessageSquare,
  CheckSquare
} from 'lucide-react'

// POC-centric interfaces
interface POCActivity {
  activity: string
  targetRevenue: number
  currentRevenue: number
  targetMeetups: number
  currentMeetups: number
  targetClubs: number
  currentClubs: number
  newClubsLaunched: number
  newClubsNeeded: number
  status: 'on_track' | 'at_risk' | 'behind'
  lastUpdated: string
}

interface ClubDetail {
  id: string
  name: string
  activity: string
  area: string
  city: string
  stage: 'realised' | 'picked_stage4' | 'picked_stage3' | 'picked_stage2' | 'picked_stage1' | 'picked_started' | 'not_picked'
  health: 'green' | 'yellow' | 'red'
  currentMeetups: number
  targetMeetups: number
  currentRevenue: number
  targetRevenue: number
  isNewClub: boolean
  launchDate?: string
  thisWeekTasks: string[]
  pastWOWActions: Array<{
    date: string
    tasks: string[]
    comment: string
    achievements: string[]
  }>
}

const STAGE_COLORS = {
  'not_picked': 'bg-gray-100 text-gray-600',
  'picked_started': 'bg-yellow-100 text-yellow-700',
  'picked_stage1': 'bg-orange-100 text-orange-700',
  'picked_stage2': 'bg-blue-100 text-blue-700',
  'picked_stage3': 'bg-purple-100 text-purple-700',
  'picked_stage4': 'bg-indigo-100 text-indigo-700',
  'realised': 'bg-green-100 text-green-700'
}

const HEALTH_COLORS = {
  'green': 'bg-green-100 text-green-700',
  'yellow': 'bg-yellow-100 text-yellow-700',
  'red': 'bg-red-100 text-red-700'
}

export function POCDashboard() {
  // Filter states - POC-centric view
  const [selectedPOC, setSelectedPOC] = useState('Saurabh') // Default to Saurabh
  const [selectedActivities, setSelectedActivities] = useState<string[]>(['All'])
  const [selectedCity, setSelectedCity] = useState('All')
  const [selectedArea, setSelectedArea] = useState('All')
  const [showNewClubsOnly, setShowNewClubsOnly] = useState(false)
  const [expandedClub, setExpandedClub] = useState<string | null>(null)

  // Data states
  const [pocActivities, setPOCActivities] = useState<POCActivity[]>([])
  const [clubDetails, setClubDetails] = useState<ClubDetail[]>([])
  const [availablePOCs] = useState(['Saurabh', 'Priya', 'Amit', 'Kavya'])
  const [availableActivities, setAvailableActivities] = useState<string[]>([])
  const [availableCities, setAvailableCities] = useState<string[]>([])
  const [availableAreas, setAvailableAreas] = useState<string[]>([])

  // WOW task management
  const [newTaskText, setNewTaskText] = useState('')
  const [editingClub, setEditingClub] = useState<string | null>(null)

  // Mock data - replace with API calls
  useEffect(() => {
    const mockPOCActivities: POCActivity[] = [
      {
        activity: 'Hiking',
        targetRevenue: 750000, // ₹7.5L
        currentRevenue: 450000, // ₹4.5L
        targetMeetups: 25,
        currentMeetups: 15,
        targetClubs: 3,
        currentClubs: 2,
        newClubsLaunched: 1,
        newClubsNeeded: 1,
        status: 'on_track',
        lastUpdated: '2025-12-15'
      },
      {
        activity: 'Music',
        targetRevenue: 600000, // ₹6L
        currentRevenue: 200000, // ₹2L
        targetMeetups: 20,
        currentMeetups: 8,
        targetClubs: 2,
        currentClubs: 1,
        newClubsLaunched: 0,
        newClubsNeeded: 1,
        status: 'behind',
        lastUpdated: '2025-12-14'
      }
    ]

    const mockClubDetails: ClubDetail[] = [
      {
        id: '1',
        name: 'Bandra Hikers',
        activity: 'Hiking',
        area: 'Bandra',
        city: 'Mumbai',
        stage: 'realised',
        health: 'green',
        currentMeetups: 8,
        targetMeetups: 12,
        currentRevenue: 250000,
        targetRevenue: 400000,
        isNewClub: false,
        thisWeekTasks: [
          'Plan Christmas special trek',
          'Update equipment checklist',
          'Follow up with 5 potential members'
        ],
        pastWOWActions: [
          {
            date: '2025-12-08',
            tasks: ['Organized Lonavala trek', 'Equipment maintenance', 'Member recruitment'],
            comment: 'Great response to weekend trek. 12 new member inquiries.',
            achievements: ['Successfully conducted trek with 25 participants', 'Zero safety incidents']
          },
          {
            date: '2025-12-01',
            tasks: ['Route planning', 'Safety briefing prep', 'Vendor coordination'],
            comment: 'Preparation week. Focus on safety protocols.',
            achievements: ['Updated safety guidelines', 'Finalized new trek routes']
          }
        ]
      },
      {
        id: '2',
        name: 'Mumbai Trekkers',
        activity: 'Hiking',
        area: 'Andheri',
        city: 'Mumbai',
        stage: 'picked_stage3',
        health: 'yellow',
        currentMeetups: 4,
        targetMeetups: 8,
        currentRevenue: 150000,
        targetRevenue: 250000,
        isNewClub: true,
        launchDate: '2025-11-15',
        thisWeekTasks: [
          'Recruit assistant POC',
          'Marketing push for member acquisition',
          'Venue booking for next month'
        ],
        pastWOWActions: [
          {
            date: '2025-12-08',
            tasks: ['First official trek', 'Member onboarding', 'Feedback collection'],
            comment: 'Good start! 15 members joined the inaugural trek.',
            achievements: ['Successful club launch', 'Positive member feedback']
          }
        ]
      },
      {
        id: '3',
        name: 'Bandra Musicians',
        activity: 'Music',
        area: 'Bandra',
        city: 'Mumbai',
        stage: 'picked_stage2',
        health: 'red',
        currentMeetups: 3,
        targetMeetups: 10,
        currentRevenue: 75000,
        targetRevenue: 300000,
        isNewClub: true,
        launchDate: '2025-12-01',
        thisWeekTasks: [
          'Find music venue with proper acoustics',
          'Recruit experienced musicians as co-organizers',
          'Plan first jam session'
        ],
        pastWOWActions: [
          {
            date: '2025-12-08',
            tasks: ['Venue hunting', 'Musician recruitment', 'Equipment sourcing'],
            comment: 'Struggling with venue availability. Need acoustically suitable space.',
            achievements: ['Connected with 5 potential co-organizers']
          }
        ]
      }
    ]

    // Filter data by selected POC
    const filteredActivities = selectedPOC === 'Saurabh' ? mockPOCActivities : []
    const filteredClubs = selectedPOC === 'Saurabh' ? mockClubDetails : []

    setPOCActivities(filteredActivities)
    setClubDetails(filteredClubs)
    setAvailableActivities(['All', ...filteredActivities.map(a => a.activity)])

    // Extract unique cities and areas from clubs
    const cities = [...new Set(filteredClubs.map(club => club.city))]
    const areas = [...new Set(filteredClubs.map(club => club.area))]
    setAvailableCities(['All', ...cities])
    setAvailableAreas(['All', ...areas])
  }, [selectedPOC])

  // Calculate totals for POC
  const totalTargetRevenue = pocActivities.reduce((sum, a) => sum + a.targetRevenue, 0)
  const totalCurrentRevenue = pocActivities.reduce((sum, a) => sum + a.currentRevenue, 0)
  const totalTargetMeetups = pocActivities.reduce((sum, a) => sum + a.targetMeetups, 0)
  const totalCurrentMeetups = pocActivities.reduce((sum, a) => sum + a.currentMeetups, 0)
  const totalNewClubsLaunched = pocActivities.reduce((sum, a) => sum + a.newClubsLaunched, 0)
  const totalNewClubsNeeded = pocActivities.reduce((sum, a) => sum + a.newClubsNeeded, 0)

  // Filter clubs based on selections
  const filteredClubs = clubDetails.filter(club => {
    // Activity filter
    if (!selectedActivities.includes('All') && !selectedActivities.includes(club.activity)) {
      return false
    }

    // City filter
    if (selectedCity !== 'All' && club.city !== selectedCity) {
      return false
    }

    // Area filter
    if (selectedArea !== 'All' && club.area !== selectedArea) {
      return false
    }

    // New clubs only filter
    if (showNewClubsOnly && !club.isNewClub) {
      return false
    }

    return true
  })

  // Get available areas based on selected city
  const citySpecificAreas = selectedCity === 'All'
    ? availableAreas
    : ['All', ...new Set(clubDetails.filter(club => club.city === selectedCity).map(club => club.area))]

  // Add new WOW task
  const addTaskToClub = (clubId: string) => {
    if (newTaskText.trim()) {
      setClubDetails(clubs => clubs.map(club =>
        club.id === clubId
          ? { ...club, thisWeekTasks: [...club.thisWeekTasks, newTaskText.trim()] }
          : club
      ))
      setNewTaskText('')
      setEditingClub(null)
    }
  }

  const getHealthIcon = (health: string) => {
    switch(health) {
      case 'green': return <div className="w-3 h-3 rounded-full bg-green-500"></div>
      case 'yellow': return <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
      case 'red': return <div className="w-3 h-3 rounded-full bg-red-500"></div>
      default: return <div className="w-3 h-3 rounded-full bg-gray-400"></div>
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">POC Dashboard</h1>
          <p className="text-gray-600">
            Personal view of your scaling responsibilities and impact
          </p>
        </div>

        {/* POC Selector */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <User className="h-6 w-6 text-blue-600" />
              <select
                value={selectedPOC}
                onChange={(e) => setSelectedPOC(e.target.value)}
                className="border border-gray-300 rounded-md px-4 py-2 bg-white text-lg font-medium"
              >
                {availablePOCs.map(poc => (
                  <option key={poc} value={poc}>{poc}</option>
                ))}
              </select>
              <div className="flex items-center space-x-4 text-sm text-gray-500">
                <div className="flex items-center space-x-2">
                  <label>Activities:</label>
                  <select
                    multiple
                    value={selectedActivities}
                    onChange={(e) => {
                      const values = Array.from(e.target.selectedOptions, option => option.value)
                      setSelectedActivities(values.length ? values : ['All'])
                    }}
                    className="border border-gray-300 rounded px-2 py-1"
                  >
                    {availableActivities.map(activity => (
                      <option key={activity} value={activity}>{activity}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center space-x-2">
                  <label>City:</label>
                  <select
                    value={selectedCity}
                    onChange={(e) => {
                      setSelectedCity(e.target.value)
                      setSelectedArea('All') // Reset area when city changes
                    }}
                    className="border border-gray-300 rounded px-2 py-1"
                  >
                    {availableCities.map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center space-x-2">
                  <label>Area:</label>
                  <select
                    value={selectedArea}
                    onChange={(e) => setSelectedArea(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1"
                  >
                    {citySpecificAreas.map(area => (
                      <option key={area} value={area}>{area}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={showNewClubsOnly}
                  onChange={(e) => setShowNewClubsOnly(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-gray-600">Show new clubs only</span>
              </label>
            </div>
          </div>
        </div>

        {/* Total Impact Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Target className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Target Revenue</p>
                <p className="text-2xl font-bold text-gray-900">₹{(totalTargetRevenue / 100000).toFixed(1)}L</p>
                <p className="text-sm text-gray-500">Current: ₹{(totalCurrentRevenue / 100000).toFixed(1)}L</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Building2 className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Target Meetups</p>
                <p className="text-2xl font-bold text-gray-900">{totalTargetMeetups}</p>
                <p className="text-sm text-gray-500">Current: {totalCurrentMeetups}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <TrendingUp className="h-8 w-8 text-purple-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">New Clubs Launched</p>
                <p className="text-2xl font-bold text-gray-900">{totalNewClubsLaunched}</p>
                <p className="text-sm text-gray-500">Need: {totalNewClubsNeeded}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <CheckSquare className="h-8 w-8 text-orange-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Overall Progress</p>
                <p className="text-2xl font-bold text-gray-900">
                  {Math.round((totalCurrentRevenue / totalTargetRevenue) * 100)}%
                </p>
                <p className="text-sm text-gray-500">Revenue achieved</p>
              </div>
            </div>
          </div>
        </div>

        {/* Activity Breakdown */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Activity Targets</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activity</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue Progress</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Meetups Progress</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">New Clubs</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pocActivities.map((activity, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{activity.activity}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        ₹{(activity.currentRevenue / 100000).toFixed(1)}L / ₹{(activity.targetRevenue / 100000).toFixed(1)}L
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${Math.min(100, (activity.currentRevenue / activity.targetRevenue) * 100)}%` }}
                        ></div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{activity.currentMeetups} / {activity.targetMeetups}</div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                        <div
                          className="bg-green-600 h-2 rounded-full"
                          style={{ width: `${Math.min(100, (activity.currentMeetups / activity.targetMeetups) * 100)}%` }}
                        ></div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        Launched: {activity.newClubsLaunched}
                      </div>
                      <div className="text-xs text-gray-500">
                        Need: {activity.newClubsNeeded} more
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        activity.status === 'on_track' ? 'bg-green-100 text-green-700' :
                        activity.status === 'at_risk' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {activity.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Club Details */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Club Breakdown & WOW Tasks</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {filteredClubs.map((club) => (
              <div key={club.id} className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {getHealthIcon(club.health)}
                    <div>
                      <h4 className="text-lg font-medium text-gray-900">{club.name}</h4>
                      <p className="text-sm text-gray-500">
                        {club.activity} • {club.area}, {club.city}
                        {club.isNewClub && <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">NEW</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900">
                        {club.currentMeetups}/{club.targetMeetups} meetups
                      </div>
                      <div className="text-sm text-gray-500">
                        ₹{(club.currentRevenue / 1000).toFixed(0)}K / ₹{(club.targetRevenue / 1000).toFixed(0)}K
                      </div>
                    </div>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${STAGE_COLORS[club.stage]}`}>
                      {club.stage.replace('_', ' ')}
                    </span>
                    <button
                      onClick={() => setExpandedClub(expandedClub === club.id ? null : club.id)}
                      className="p-2 text-gray-400 hover:text-gray-600"
                    >
                      {expandedClub === club.id ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                {expandedClub === club.id && (
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* This Week Tasks */}
                    <div className="bg-blue-50 rounded-lg p-4">
                      <h5 className="font-medium text-gray-900 mb-3 flex items-center">
                        <Calendar className="h-4 w-4 mr-2" />
                        This Week's Tasks
                      </h5>
                      <ul className="space-y-2">
                        {club.thisWeekTasks.map((task, index) => (
                          <li key={index} className="flex items-center space-x-2">
                            <CheckSquare className="h-4 w-4 text-blue-600" />
                            <span className="text-sm text-gray-700">{task}</span>
                          </li>
                        ))}
                      </ul>

                      {editingClub === club.id ? (
                        <div className="mt-3 flex space-x-2">
                          <input
                            type="text"
                            value={newTaskText}
                            onChange={(e) => setNewTaskText(e.target.value)}
                            placeholder="Add new task..."
                            className="flex-1 border border-gray-300 rounded px-3 py-1 text-sm"
                            onKeyPress={(e) => e.key === 'Enter' && addTaskToClub(club.id)}
                          />
                          <button
                            onClick={() => addTaskToClub(club.id)}
                            className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                          >
                            Add
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingClub(club.id)}
                          className="mt-3 flex items-center space-x-1 text-blue-600 hover:text-blue-700 text-sm"
                        >
                          <Plus className="h-4 w-4" />
                          <span>Add Task</span>
                        </button>
                      )}
                    </div>

                    {/* Past WOW Actions */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h5 className="font-medium text-gray-900 mb-3 flex items-center">
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Past WOW Actions
                      </h5>
                      <div className="space-y-4">
                        {club.pastWOWActions.map((wow, index) => (
                          <div key={index} className="border-l-2 border-gray-300 pl-3">
                            <div className="text-xs text-gray-500 mb-1">{wow.date}</div>
                            <div className="text-sm text-gray-700 mb-2">{wow.comment}</div>
                            <div className="space-y-1">
                              {wow.achievements.map((achievement, aIndex) => (
                                <div key={aIndex} className="text-xs text-green-600">✓ {achievement}</div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}