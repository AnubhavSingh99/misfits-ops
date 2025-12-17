import React, { useState, useEffect } from 'react'
import { Users, Star, TrendingUp, Building2, Plus, Edit, Save, X, Trash2, ChevronDown, ChevronUp, UserPlus } from 'lucide-react'

interface Activity {
  name: string
  type: 'scale' | 'long_tail'
  clubs: number
  revenue: number
}

interface TeamMember {
  id: string
  name: string
  role: string
  email: string
  phone: string
}

interface ActivityHead {
  id: string
  name: string
  activities: string[]
  team: string
  clubs: number
  revenue: number
  health: number
  healthStatus: 'green' | 'yellow' | 'red'
  teamMembers: TeamMember[]
}

interface CityHead {
  id: string
  name: string
  city: string
  allActivities: boolean
  clubs: number
  revenue: number
  health: number
  healthStatus: 'green' | 'yellow' | 'red'
  isDualRole?: boolean
  dualRoleDescription?: string
}

// Default activities (fallback)
const DEFAULT_ACTIVITIES: Activity[] = [
  { name: 'Running', type: 'scale', clubs: 45, revenue: 450000 },
  { name: 'Photography', type: 'scale', clubs: 38, revenue: 380000 },
  { name: 'Books', type: 'scale', clubs: 32, revenue: 320000 },
  { name: 'Music', type: 'scale', clubs: 28, revenue: 280000 },
  { name: 'Art', type: 'scale', clubs: 25, revenue: 250000 },
  { name: 'Cycling', type: 'scale', clubs: 22, revenue: 220000 },
  { name: 'Dance', type: 'scale', clubs: 20, revenue: 200000 },
  { name: 'Sports', type: 'scale', clubs: 18, revenue: 180000 },
  { name: 'Fitness', type: 'scale', clubs: 15, revenue: 150000 },
  { name: 'Tech Talks', type: 'scale', clubs: 12, revenue: 120000 },
  { name: 'Poetry', type: 'scale', clubs: 10, revenue: 100000 },
  { name: 'Business', type: 'scale', clubs: 8, revenue: 80000 },
  { name: 'Cooking', type: 'scale', clubs: 7, revenue: 70000 },
  // Long tail activities
  { name: 'Gardening', type: 'long_tail', clubs: 5, revenue: 25000 },
  { name: 'Chess', type: 'long_tail', clubs: 4, revenue: 20000 },
  { name: 'Yoga', type: 'long_tail', clubs: 3, revenue: 15000 },
  { name: 'Meditation', type: 'long_tail', clubs: 3, revenue: 15000 },
  { name: 'Board Games', type: 'long_tail', clubs: 2, revenue: 10000 },
]

const CITIES = ['Mumbai', 'Delhi', 'Bangalore', 'Pune']
const TEAMS = ['Phoenix', 'Rocket', 'Thunder']

function getActivityBadge(activity: string, activities: Activity[], onClick?: () => void) {
  const activityData = activities.find(a => a.name === activity)
  const isScale = activityData?.type === 'scale'

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${
        isScale ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
      }`}
      onClick={onClick}
      title={onClick ? "Click to edit activities" : `${activity} - ${isScale ? 'Scale Activity' : 'Long Tail Activity'}`}
    >
      {activity} {isScale ? '🚀' : '📝'}
    </span>
  )
}

function getHealthBadge(health: number, status: 'green' | 'yellow' | 'red') {
  const color = status === 'green' ? 'bg-green-100 text-green-800' :
                status === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'

  const emoji = status === 'green' ? '🟢' : status === 'yellow' ? '🟡' : '🔴'

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {emoji} {health}%
    </span>
  )
}

function formatRevenue(amount: number) {
  return `₹${(amount / 100000).toFixed(1)}L`
}

export function POCManagement() {
  const [activities, setActivities] = useState<Activity[]>(DEFAULT_ACTIVITIES)
  const [activitiesLoading, setActivitiesLoading] = useState(false)
  const [dataSource, setDataSource] = useState<'default' | 'database' | 'mock'>('default')
  const [editingActivity, setEditingActivity] = useState<string | null>(null)
  const [showAddActivityForm, setShowAddActivityForm] = useState(false)
  const [newActivity, setNewActivity] = useState<Omit<Activity, 'clubs' | 'revenue'>>({
    name: '',
    type: 'scale'
  })
  const [editingActivityHead, setEditingActivityHead] = useState<string | null>(null)
  const [showAddActivityHeadForm, setShowAddActivityHeadForm] = useState(false)
  const [newActivityHead, setNewActivityHead] = useState({
    name: '',
    activities: [] as string[],
    team: 'Phoenix'
  })

  const [activityHeads, setActivityHeads] = useState<ActivityHead[]>([])
  const [activityHeadsLoading, setActivityHeadsLoading] = useState(true)

  const [cityHeads, setCityHeads] = useState<CityHead[]>([
    { id: '1', name: 'Priya', city: 'Mumbai', allActivities: true, clubs: 50, revenue: 500000, health: 72, healthStatus: 'green', isDualRole: true, dualRoleDescription: 'Also Photography Head' },
    { id: '2', name: 'Rakesh', city: 'Delhi', allActivities: true, clubs: 45, revenue: 450000, health: 70, healthStatus: 'green' },
    { id: '3', name: 'Sunita', city: 'Bangalore', allActivities: true, clubs: 40, revenue: 400000, health: 75, healthStatus: 'green' },
  ])

  const [showAddActivityHead, setShowAddActivityHead] = useState(false)
  const [showAddCityHead, setShowAddCityHead] = useState(false)
  const [editingCityHead, setEditingCityHead] = useState<string | null>(null)
  const [showTeamMembers, setShowTeamMembers] = useState<string | null>(null)
  const [showAddMember, setShowAddMember] = useState<string | null>(null)

  const [newCityHead, setNewCityHead] = useState({
    name: '',
    city: 'Mumbai',
    isDualRole: false,
    dualRoleDescription: ''
  })

  const [newMember, setNewMember] = useState({
    name: '',
    role: '',
    email: '',
    phone: ''
  })

  // Fetch activities from API
  useEffect(() => {
    const fetchData = async () => {
      setActivitiesLoading(true)
      setActivityHeadsLoading(true)
      try {
        // Fetch both activity heads and activities list
        const [activityHeadsResponse, activitiesResponse] = await Promise.all([
          fetch('http://localhost:3001/api/database/activity-heads'),
          fetch('http://localhost:3001/api/database/activities')
        ])

        const activityHeadsData = await activityHeadsResponse.json()
        const activitiesData = await activitiesResponse.json()

        // Process activity heads
        if (activityHeadsData.success && activityHeadsData.data) {
          setActivityHeads(activityHeadsData.data)
          setDataSource(activityHeadsData.source === 'database' ? 'database' : 'mock')
          console.log(`Activity heads loaded from ${activityHeadsData.source}:`, activityHeadsData.data)
        } else {
          console.warn('Failed to fetch activity heads, using defaults')
        }

        // Process activities list for dropdown
        if (activitiesData.success && activitiesData.data) {
          const formattedActivities = activitiesData.data.map(activity => ({
            name: activity.name,
            type: activity.clubCount >= 10 ? 'scale' as const : 'long_tail' as const,
            clubs: activity.clubCount,
            revenue: activity.revenue * 100 // Convert back to cents for consistency
          }))
          setActivities(formattedActivities)
          console.log('Activities list loaded from database:', formattedActivities)
        } else {
          console.warn('Failed to fetch activities list, using defaults')
          setActivities(DEFAULT_ACTIVITIES)
        }
      } catch (error) {
        console.warn('Error fetching data:', error)
        setDataSource('default')
        setActivities(DEFAULT_ACTIVITIES)
      } finally {
        setActivitiesLoading(false)
        setActivityHeadsLoading(false)
      }
    }

    fetchData()
  }, [])

  // Load Activity Heads from database
  const loadActivityHeads = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/database/activity-heads')
      const result = await response.json()

      if (result.success && result.data.heads) {
        // Update local state with saved Activity Heads from database
        const savedHeads = result.data.heads
        const processedHeads: ActivityHead[] = savedHeads.map((head: any) => {
          const totalClubs = head.activities.reduce((sum: number, activity: string) => {
            const activityData = activities.find(a => a.name === activity)
            return sum + (activityData?.clubs || 0)
          }, 0)

          const totalRevenue = head.activities.reduce((sum: number, activity: string) => {
            const activityData = activities.find(a => a.name === activity)
            return sum + (activityData?.revenue || 0)
          }, 0)

          return {
            id: head.id,
            name: head.name,
            activities: head.activities,
            team: head.team || 'Phoenix',
            clubs: totalClubs,
            revenue: totalRevenue,
            health: Math.floor(Math.random() * 30) + 70, // 70-100%
            healthStatus: 'green' as 'green' | 'yellow' | 'red',
            teamMembers: []
          }
        })

        setActivityHeads(processedHeads)
        console.log('Loaded Activity Heads from database:', savedHeads.length, 'records')
      }
    } catch (error) {
      console.error('Failed to load Activity Heads from database:', error)
      // Continue with default/empty state if database is unavailable
    }
  }

  const addActivityHead = async () => {
    if (newActivityHead.name && newActivityHead.activities.length > 0) {
      const totalClubs = newActivityHead.activities.reduce((sum, activity) => {
        const activityData = activities.find(a => a.name === activity)
        return sum + (activityData?.clubs || 0)
      }, 0)

      const totalRevenue = newActivityHead.activities.reduce((sum, activity) => {
        const activityData = activities.find(a => a.name === activity)
        return sum + (activityData?.revenue || 0)
      }, 0)

      try {
        // Save to database first
        const response = await fetch('/api/database/activity-heads', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: newActivityHead.name,
            activities: newActivityHead.activities,
            team: newActivityHead.team,
            updated_by: 'operations_team'
          })
        })

        if (!response.ok) {
          throw new Error('Failed to save activity head to database')
        }

        const result = await response.json()
        if (!result.success) {
          throw new Error(result.error || 'Failed to save activity head')
        }

        const newHead: ActivityHead = {
          id: result.data.id || Date.now().toString(),
          ...newActivityHead,
          clubs: totalClubs,
          revenue: totalRevenue,
          health: Math.floor(Math.random() * 30) + 70, // 70-100%
          healthStatus: 'green',
          teamMembers: []
        }

        // Update local state only after successful database save
        setActivityHeads([...activityHeads, newHead])
        setNewActivityHead({ name: '', activities: [], team: 'Phoenix' })
        console.log('Activity head saved successfully:', result.message)
      } catch (error) {
        console.error('Failed to save activity head:', error)
        // Still update local state for offline functionality
        const newHead: ActivityHead = {
          id: Date.now().toString(),
          ...newActivityHead,
          clubs: totalClubs,
          revenue: totalRevenue,
          health: Math.floor(Math.random() * 30) + 70, // 70-100%
          healthStatus: 'green',
          teamMembers: []
        }

        setActivityHeads([...activityHeads, newHead])
        setNewActivityHead({ name: '', activities: [], team: 'Phoenix' })
      }
      setShowAddActivityHead(false)
    }
  }

  const addTeamMember = async (activityHeadId: string) => {
    if (!newMember.name || !newMember.role) {
      alert('Please fill in at least the name and role fields.')
      return
    }

    const newTeamMember: TeamMember = {
      id: Date.now().toString(),
      ...newMember
    }

    // Update local state immediately
    const updatedHeads = activityHeads.map(head => {
      if (head.id === activityHeadId) {
        return {
          ...head,
          teamMembers: [...head.teamMembers, newTeamMember]
        }
      }
      return head
    })

    setActivityHeads(updatedHeads)
    setNewMember({ name: '', role: '', email: '', phone: '' })
    setShowAddMember(null)

    // Save team member to database
    try {
      const response = await fetch(`http://localhost:3001/api/database/activity-heads/${activityHeadId}/team-members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...newTeamMember,
          updated_by: 'operations_team'
        })
      })

      if (!response.ok) {
        throw new Error('Failed to save team member to database')
      }

      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to save team member')
      }

      console.log('Team member saved successfully:', result.message)
    } catch (error) {
      console.error('Failed to save team member:', error)
      // Local state is already updated for offline functionality
    }
  }

  const removeTeamMember = async (activityHeadId: string, memberId: string) => {
    if (!confirm('Are you sure you want to remove this team member?')) {
      return
    }

    // Update local state immediately
    const updatedHeads = activityHeads.map(head => {
      if (head.id === activityHeadId) {
        return {
          ...head,
          teamMembers: head.teamMembers.filter(member => member.id !== memberId)
        }
      }
      return head
    })
    setActivityHeads(updatedHeads)

    // Remove from database
    try {
      const response = await fetch(`http://localhost:3001/api/database/activity-heads/${activityHeadId}/team-members/${memberId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to remove team member from database')
      }

      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to remove team member')
      }

      console.log('Team member removed successfully:', result.message)
    } catch (error) {
      console.error('Failed to remove team member:', error)
      // Local state is already updated for offline functionality
    }
  }

  const addCityHead = () => {
    if (newCityHead.name && newCityHead.city) {
      // Calculate total clubs and revenue for the city (mock data)
      const totalClubs = Math.floor(Math.random() * 30) + 30 // 30-60 clubs
      const totalRevenue = totalClubs * 10000 // ₹10k per club average

      const newHead: CityHead = {
        id: Date.now().toString(),
        ...newCityHead,
        allActivities: true,
        clubs: totalClubs,
        revenue: totalRevenue,
        health: Math.floor(Math.random() * 30) + 70,
        healthStatus: 'green'
      }

      setCityHeads([...cityHeads, newHead])
      setNewCityHead({ name: '', city: 'Mumbai', isDualRole: false, dualRoleDescription: '' })
      setShowAddCityHead(false)
    }
  }

  const deleteActivityHead = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Activity Head? This action cannot be undone.')) {
      return
    }

    try {
      // Delete from database first
      const response = await fetch(`http://localhost:3001/api/database/activity-heads/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete activity head from database')
      }

      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete activity head')
      }

      // Update local state only after successful database deletion
      setActivityHeads(activityHeads.filter(head => head.id !== id))
      console.log('Activity head deleted successfully:', result.message)
    } catch (error) {
      console.error('Failed to delete activity head:', error)
      // Still update local state for offline functionality
      setActivityHeads(activityHeads.filter(head => head.id !== id))
    }
  }

  const deleteCityHead = (id: string) => {
    if (!confirm('Are you sure you want to delete this City Head? This action cannot be undone.')) {
      return
    }
    setCityHeads(cityHeads.filter(head => head.id !== id))
  }

  // Activity management functions
  const updateActivityType = (activityName: string, newType: 'scale' | 'long_tail') => {
    setActivities(activities.map(activity =>
      activity.name === activityName ? { ...activity, type: newType } : activity
    ))
  }

  const addNewActivity = () => {
    if (!newActivity.name) return

    const activity: Activity = {
      ...newActivity,
      clubs: 0,
      revenue: 0
    }

    setActivities([...activities, activity])
    setNewActivity({ name: '', type: 'scale' })
    setShowAddActivityForm(false)
  }

  const deleteActivity = (activityName: string) => {
    setActivities(activities.filter(activity => activity.name !== activityName))
  }

  // Activity Head management functions
  const updateActivityHead = async (id: string, field: string, value: any) => {
    // Update local state immediately for responsive UI
    const updatedHeads = activityHeads.map(head =>
      head.id === id ? { ...head, [field]: value } : head
    )
    setActivityHeads(updatedHeads)

    // Save to database
    try {
      const response = await fetch(`http://localhost:3001/api/database/activity-heads/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          [field]: value,
          updated_by: 'operations_team'
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update activity head in database')
      }

      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to update activity head')
      }

      console.log('Activity head updated successfully:', result.message)
    } catch (error) {
      console.error('Failed to update activity head:', error)
      // Local state is already updated for offline functionality
    }
  }

  const addNewActivityHead = () => {
    if (!newActivityHead.name) return

    const newHead: ActivityHead = {
      id: Date.now().toString(),
      name: newActivityHead.name,
      activities: newActivityHead.activities,
      team: newActivityHead.team,
      clubs: 0, // Will be calculated based on activities
      revenue: 0, // Will be calculated based on activities
      health: 75, // Default health
      healthStatus: 'green',
      teamMembers: []
    }

    setActivityHeads([...activityHeads, newHead])
    setNewActivityHead({ name: '', activities: [], team: 'Phoenix' })
    setShowAddActivityHeadForm(false)
  }

  const scaleActivities = activities.filter(a => a.type === 'scale')
  const longTailActivities = activities.filter(a => a.type === 'long_tail')

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg">
              <Users className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">POC Management</h1>
            <div className="ml-auto">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                dataSource === 'database' ? 'bg-green-100 text-green-800' :
                dataSource === 'mock' ? 'bg-blue-100 text-blue-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {activitiesLoading ? 'Loading...' :
                 dataSource === 'database' ? '🟢 Database' :
                 dataSource === 'mock' ? '🔄 Mock Data' : '📝 Default'}
              </span>
            </div>
          </div>
          <p className="text-gray-600">
            Manage Activity Heads (vertical ownership) and City Heads (horizontal ownership)
          </p>
        </div>

        {/* Activities Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Scale Activities */}
          <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Scale Activities ({scaleActivities.length})</h3>
              </div>
              <button
                onClick={() => setShowAddActivityForm(true)}
                className="p-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                title="Add New Activity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {scaleActivities.map(activity => (
                <div key={activity.name} className="p-3 bg-blue-50 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-blue-600">🚀</span>
                      <div className="font-medium text-blue-900">{activity.name}</div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => updateActivityType(activity.name, 'long_tail')}
                        className="p-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600"
                        title="Move to Long Tail"
                      >
                        ↓ LT
                      </button>
                      <button
                        onClick={() => deleteActivity(activity.name)}
                        className="p-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                        title="Delete Activity"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-blue-600">{activity.clubs} clubs • ₹{(activity.revenue/1000).toFixed(0)}K</div>
                  <div className="text-xs text-blue-500 mt-1">Scale Activity - High Growth Potential</div>
                </div>
              ))}
            </div>
          </div>

          {/* Long Tail Activities */}
          <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-gray-500 rounded-lg">
                <Star className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Long Tail Activities ({longTailActivities.length})</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {longTailActivities.map(activity => (
                <div key={activity.name} className="p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">📝</span>
                      <div className="font-medium text-gray-900">{activity.name}</div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => updateActivityType(activity.name, 'scale')}
                        className="p-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                        title="Move to Scale"
                      >
                        ↑ SC
                      </button>
                      <button
                        onClick={() => deleteActivity(activity.name)}
                        className="p-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                        title="Delete Activity"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-gray-600">{activity.clubs} clubs • ₹{(activity.revenue/1000).toFixed(0)}K</div>
                  <div className="text-xs text-gray-500 mt-1">Long Tail - Specialized/Niche Activity</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Activity Heads */}
        <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg">
                <Star className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Activity Heads</h2>
            </div>
            <button
              onClick={() => setShowAddActivityHead(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Activity Head
            </button>
          </div>

          {/* Add Activity Head Form */}
          {showAddActivityHead && (
            <div className="mb-6 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
              <h3 className="font-bold text-emerald-900 mb-4">Add New Activity Head</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={newActivityHead.name}
                    onChange={(e) => setNewActivityHead({...newActivityHead, name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    placeholder="Enter name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
                  <select
                    value={newActivityHead.team}
                    onChange={(e) => setNewActivityHead({...newActivityHead, team: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  >
                    {TEAMS.map(team => (
                      <option key={team} value={team}>{team}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Activities</label>
                  <p className="text-xs text-gray-500 mb-2">Hold Ctrl/Cmd to select multiple activities</p>
                  <select
                    multiple
                    value={newActivityHead.activities}
                    onChange={(e) => setNewActivityHead({...newActivityHead, activities: Array.from(e.target.selectedOptions, option => option.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 h-24"
                  >
                    <optgroup label="🚀 Scale Activities (High Growth)">
                      {scaleActivities.map(activity => (
                        <option key={activity.name} value={activity.name}>
                          {activity.name} ({activity.clubs} clubs, ₹{(activity.revenue/1000).toFixed(0)}K)
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="📝 Long Tail Activities (Specialized)">
                      {longTailActivities.map(activity => (
                        <option key={activity.name} value={activity.name}>
                          {activity.name} ({activity.clubs} clubs, ₹{(activity.revenue/1000).toFixed(0)}K)
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={addActivityHead}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
                >
                  <Save className="h-4 w-4" />
                  Save
                </button>
                <button
                  onClick={() => setShowAddActivityHead(false)}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Activity Heads Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 rounded-lg">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activities</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Team</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clubs</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Health</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {activityHeads.map((head) => (
                  <React.Fragment key={head.id}>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {editingActivityHead === head.id ? (
                            <input
                              type="text"
                              value={head.name}
                              onChange={(e) => updateActivityHead(head.id, 'name', e.target.value)}
                              className="font-medium text-gray-900 bg-transparent border-b border-gray-300 focus:border-blue-500 focus:outline-none"
                              onBlur={() => setEditingActivityHead(null)}
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') setEditingActivityHead(null)
                              }}
                              autoFocus
                            />
                          ) : (
                            <div
                              className="font-medium text-gray-900 cursor-pointer hover:text-blue-600"
                              onClick={() => setEditingActivityHead(head.id)}
                              title="Click to edit name"
                            >
                              {head.name}
                            </div>
                          )}
                          <button
                            onClick={() => setShowTeamMembers(showTeamMembers === head.id ? null : head.id)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            {showTeamMembers === head.id ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                          <span className="text-xs text-gray-500">
                            ({head.teamMembers.length} team)
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {editingActivityHead === head.id ? (
                          <select
                            multiple
                            value={head.activities}
                            onChange={(e) => updateActivityHead(head.id, 'activities', Array.from(e.target.selectedOptions, option => option.value))}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white h-24"
                            onBlur={() => setEditingActivityHead(null)}
                          >
                            <optgroup label="🚀 Scale Activities">
                              {scaleActivities.map(activity => (
                                <option key={activity.name} value={activity.name}>
                                  {activity.name} ({activity.clubs} clubs)
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="📝 Long Tail Activities">
                              {longTailActivities.map(activity => (
                                <option key={activity.name} value={activity.name}>
                                  {activity.name} ({activity.clubs} clubs)
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        ) : (
                          <div
                            className="flex flex-wrap gap-1 cursor-pointer p-1 rounded hover:bg-gray-50"
                            title="Click to edit activities"
                          >
                            {head.activities.map(activity => getActivityBadge(activity, activities, () => setEditingActivityHead(head.id)))}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingActivityHead === head.id ? (
                          <select
                            value={head.team}
                            onChange={(e) => updateActivityHead(head.id, 'team', e.target.value)}
                            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                            onBlur={() => setEditingActivityHead(null)}
                          >
                            <option value="Phoenix">Phoenix</option>
                            <option value="Rocket">Rocket</option>
                            <option value="Thunder">Thunder</option>
                          </select>
                        ) : (
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 ${
                              head.team === 'Phoenix' ? 'bg-orange-100 text-orange-800' :
                              head.team === 'Rocket' ? 'bg-blue-100 text-blue-800' :
                              'bg-purple-100 text-purple-800'
                            }`}
                            onClick={() => setEditingActivityHead(head.id)}
                            title="Click to edit team"
                          >
                            {head.team}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {head.clubs}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatRevenue(head.revenue)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getHealthBadge(head.health, head.healthStatus)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingActivityHead(head.id)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deleteActivityHead(head.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setShowAddMember(head.id)}
                            className="text-green-600 hover:text-green-900"
                          >
                            <UserPlus className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Team Members Section */}
                    {showTeamMembers === head.id && (
                      <tr>
                        <td colSpan={7} className="px-6 py-4 bg-gray-50">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-medium text-gray-900">Team Members</h4>
                              <button
                                onClick={() => setShowAddMember(head.id)}
                                className="flex items-center gap-1 px-3 py-1 bg-green-500 text-white rounded-md hover:bg-green-600 text-xs"
                              >
                                <UserPlus className="h-3 w-3" />
                                Add Member
                              </button>
                            </div>

                            {/* Add Member Form */}
                            {showAddMember === head.id && (
                              <div className="p-3 bg-white rounded-lg border border-gray-200">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                                    <input
                                      type="text"
                                      value={newMember.name}
                                      onChange={(e) => setNewMember({...newMember, name: e.target.value})}
                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-green-500"
                                      placeholder="Full name"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                                    <input
                                      type="text"
                                      value={newMember.role}
                                      onChange={(e) => setNewMember({...newMember, role: e.target.value})}
                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-green-500"
                                      placeholder="Coordinator, Lead, etc."
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                                    <input
                                      type="email"
                                      value={newMember.email}
                                      onChange={(e) => setNewMember({...newMember, email: e.target.value})}
                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-green-500"
                                      placeholder="email@misfits.com"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                                    <input
                                      type="tel"
                                      value={newMember.phone}
                                      onChange={(e) => setNewMember({...newMember, phone: e.target.value})}
                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-green-500"
                                      placeholder="+91 9876543210"
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-2 mt-3">
                                  <button
                                    onClick={() => addTeamMember(head.id)}
                                    className="px-3 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
                                  >
                                    Add
                                  </button>
                                  <button
                                    onClick={() => setShowAddMember(null)}
                                    className="px-3 py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Team Members List */}
                            {head.teamMembers.length > 0 ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {head.teamMembers.map((member) => (
                                  <div key={member.id} className="bg-white rounded-lg border border-gray-200 p-3">
                                    <div className="flex items-start justify-between">
                                      <div>
                                        <div className="text-sm font-medium text-gray-900">{member.name}</div>
                                        <div className="text-xs text-gray-600">{member.role}</div>
                                        <div className="text-xs text-gray-500">{member.email}</div>
                                        <div className="text-xs text-gray-500">{member.phone}</div>
                                      </div>
                                      <button
                                        onClick={() => removeTeamMember(head.id, member.id)}
                                        className="text-red-400 hover:text-red-600"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500 italic">No team members added yet</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* City Heads */}
        <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">City Heads</h2>
            </div>
            <button
              onClick={() => setShowAddCityHead(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add City Head
            </button>
          </div>

          {/* Add City Head Form */}
          {showAddCityHead && (
            <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
              <h3 className="font-bold text-blue-900 mb-4">Add New City Head</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={newCityHead.name}
                    onChange={(e) => setNewCityHead({...newCityHead, name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <select
                    value={newCityHead.city}
                    onChange={(e) => setNewCityHead({...newCityHead, city: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {CITIES.map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dual Role</label>
                  <input
                    type="checkbox"
                    checked={newCityHead.isDualRole}
                    onChange={(e) => setNewCityHead({...newCityHead, isDualRole: e.target.checked})}
                    className="mt-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dual Role Description</label>
                  <input
                    type="text"
                    value={newCityHead.dualRoleDescription}
                    onChange={(e) => setNewCityHead({...newCityHead, dualRoleDescription: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Also Photography Head"
                    disabled={!newCityHead.isDualRole}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={addCityHead}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  <Save className="h-4 w-4" />
                  Save
                </button>
                <button
                  onClick={() => setShowAddCityHead(false)}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* City Heads Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 rounded-lg">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">City</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">All Activities</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clubs</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Health</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {cityHeads.map((head) => (
                  <tr key={head.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900">
                        {head.name}
                        {head.isDualRole && <span className="text-xs text-purple-600 ml-1">*</span>}
                      </div>
                      {head.isDualRole && (
                        <div className="text-xs text-purple-600">{head.dualRoleDescription}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {head.city}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      Yes
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {head.clubs}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatRevenue(head.revenue)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getHealthBadge(head.health, head.healthStatus)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingCityHead(head.id)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteCityHead(head.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add Activity Modal */}
        {showAddActivityForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h2 className="text-lg font-semibold mb-4">Add New Activity</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Activity Name</label>
                  <input
                    type="text"
                    value={newActivity.name}
                    onChange={(e) => setNewActivity({...newActivity, name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="e.g., Hiking"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Activity Type</label>
                  <select
                    value={newActivity.type}
                    onChange={(e) => setNewActivity({...newActivity, type: e.target.value as 'scale' | 'long_tail'})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="scale">Scale Activity</option>
                    <option value="long_tail">Long Tail Activity</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={addNewActivity}
                    disabled={!newActivity.name}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    Add Activity
                  </button>
                  <button
                    onClick={() => {
                      setShowAddActivityForm(false)
                      setNewActivity({ name: '', type: 'scale' })
                    }}
                    className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}