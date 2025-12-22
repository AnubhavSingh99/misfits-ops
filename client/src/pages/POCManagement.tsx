import React, { useState, useEffect } from 'react'
// Cache bust: 2024-12-18-14:00
import { Users, Star, TrendingUp, Building2, Plus, Edit, Save, X, Trash2, ChevronDown, ChevronUp, UserPlus } from 'lucide-react'
import { getActivities, getCities } from '../services/api'

interface Activity {
  id: string
  name: string
  clubCount: number
  activeClubs: number
  inactiveClubs: number
}

interface City {
  id: string
  name: string
  areas: Array<{id: string, name: string}>
  clubCount: number
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

interface POC {
  id: string
  name: string
  teamName: string
  teamMembers: TeamMember[]
  activities: string[]
}

interface CityHead {
  id: string
  pocId: string
  pocName: string
  city: string
  clubs: number
  revenue: number
  health: number
  healthStatus: 'green' | 'yellow' | 'red'
  isDualRole?: boolean
  dualRoleDescription?: string
}

const TEAMS = ['Phoenix', 'Rocket', 'Thunder']

function getActivityBadge(activity: string, activities: Activity[], onClick?: () => void) {
  const activityData = activities.find(a => a.name === activity)
  const isScale = activityData ? activityData.activeClubs >= 10 : false // Scale activities have 10+ clubs

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${
        isScale ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
      }`}
      onClick={onClick}
      title={onClick ? "Click to edit activities" : `${activity} - ${activityData ? `${activityData.activeClubs} clubs` : 'Activity'}`}
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
  const [activities, setActivities] = useState<Activity[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(true)
  const [cities, setCities] = useState<City[]>([])
  const [citiesLoading, setCitiesLoading] = useState(true)
  const [dataSource, setDataSource] = useState<'default' | 'database' | 'mock'>('default')
  const [editingActivity, setEditingActivity] = useState<string | null>(null)
  const [showAddActivityForm, setShowAddActivityForm] = useState(false)
  const [showActivitySelector, setShowActivitySelector] = useState<'scale' | 'long_tail' | null>(null)
  const [availableActivities, setAvailableActivities] = useState<Activity[]>([])
  const [newActivity, setNewActivity] = useState<{name: string, type: 'scale' | 'long_tail'}>({
    name: '',
    type: 'scale'
  })

  const [categorizedActivities, setCategorizedActivities] = useState<{
    scale: string[]
    long_tail: string[]
  }>({
    scale: [],
    long_tail: []
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

  const [cityHeads, setCityHeads] = useState<CityHead[]>([])
  const [pocs, setPocs] = useState<POC[]>([])
  const [showAddPOC, setShowAddPOC] = useState(false)
  const [newPOC, setNewPOC] = useState({
    name: '',
    teamName: '',
    teamMembers: [] as TeamMember[],
    activities: [] as string[]
  })

  const [showAddActivityHead, setShowAddActivityHead] = useState(false)
  const [showAddCityHead, setShowAddCityHead] = useState(false)
  const [editingCityHead, setEditingCityHead] = useState<string | null>(null)
  const [showTeamMembers, setShowTeamMembers] = useState<string | null>(null)
  const [showAddMember, setShowAddMember] = useState<string | null>(null)

  const [newCityHead, setNewCityHead] = useState({
    pocId: '',
    pocName: '',
    city: '',
    isDualRole: false,
    dualRoleDescription: ''
  })

  const [newMember, setNewMember] = useState({
    name: '',
    role: '',
    email: '',
    phone: ''
  })

  // POC Activity Mapping state and functions
  const [showPOCActivityMapping, setShowPOCActivityMapping] = useState(false)
  const [selectedPOCForActivities, setSelectedPOCForActivities] = useState<string | null>(null)

  // Fetch activities from API
  useEffect(() => {
    const fetchData = async () => {
      setActivitiesLoading(true)
      setCitiesLoading(true)
      setActivityHeadsLoading(true)

      try {
        // Fetch real data from scaling APIs
        const [activitiesData, citiesData] = await Promise.all([
          getActivities(),
          getCities()
        ])

        // Set real activities data
        setActivities(activitiesData)
        console.log('Activities loaded from database:', activitiesData)
        console.log('Number of activities loaded:', activitiesData.length)
        console.log('Activities with active clubs:', activitiesData.filter(a => a.activeClubs > 0).length)

        // Filter activities that have active clubs and can be added to POC management
        const eligibleActivities = activitiesData.filter(a => a.activeClubs > 0)
        setAvailableActivities(eligibleActivities)

        // Auto-categorize activities based on club count
        // Scale activities: 10+ clubs, Long tail activities: <10 clubs
        const autoScale = eligibleActivities.filter(a => a.activeClubs >= 10).map(a => a.name)
        const autoLongTail = eligibleActivities.filter(a => a.activeClubs < 10).map(a => a.name)

        console.log('🔥 AUTO-CATEGORIZING ACTIVITIES:', {
          totalActivities: eligibleActivities.length,
          scaleActivities: autoScale,
          longTailActivities: autoLongTail
        })

        setCategorizedActivities({
          scale: autoScale,
          long_tail: autoLongTail
        })

        // Set real cities data
        setCities(citiesData)
        console.log('Cities loaded from database:', citiesData)

        // Set default city for new city head form
        if (citiesData.length > 0) {
          setNewCityHead(prev => ({ ...prev, city: citiesData[0].name }))
        }

        setDataSource('database')

        // Load POCs from the database
        await loadPOCs()
      } catch (error) {
        console.error('Error fetching POC management data:', error)
        console.error('API Base URL being used:', import.meta.env.VITE_API_URL || 'http://localhost:5001/api')
        console.error('Full error details:', error)
        setDataSource('default')
      } finally {
        setActivitiesLoading(false)
        setCitiesLoading(false)
        setActivityHeadsLoading(false)
      }
    }

    fetchData()
  }, [])

  // Load POCs from database
  const loadPOCs = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/poc/list`)
      const data = await response.json()

      if (data && Array.isArray(data)) {
        // Convert database POC structure to frontend format
        const pocList = data.map((poc: any) => ({
          id: poc.id.toString(),
          name: poc.name,
          teamName: poc.team_name || 'Operations Team',
          teamMembers: [], // TODO: Add team members handling
          activities: poc.activities || []
        }))

        setPocs(pocList)
        console.log('Loaded POCs from database:', pocList.length, 'records')

        // Convert to Activity Heads format for backward compatibility
        const activityHeadsList = data
          .filter((poc: any) => poc.poc_type === 'activity_head')
          .map((poc: any) => ({
            id: poc.id.toString(),
            name: poc.name,
            activities: poc.activities || [],
            team: poc.team_name || 'Phoenix',
            clubs: 0,
            revenue: 0,
            health: Math.floor(Math.random() * 30) + 70,
            healthStatus: 'green' as 'green' | 'yellow' | 'red',
            teamMembers: []
          }))

        setActivityHeads(activityHeadsList)

        // Convert to City Heads format
        const cityHeadsList = data
          .filter((poc: any) => poc.poc_type === 'city_head')
          .map((poc: any) => ({
            id: poc.id.toString(),
            pocId: poc.id.toString(),
            pocName: poc.name,
            city: poc.cities?.[0] || 'Unknown',
            clubs: Math.floor(Math.random() * 30) + 30,
            revenue: Math.floor(Math.random() * 1000000) + 500000,
            health: Math.floor(Math.random() * 30) + 70,
            healthStatus: 'green' as 'green' | 'yellow' | 'red'
          }))

        setCityHeads(cityHeadsList)
      }
    } catch (error) {
      console.error('Failed to load POCs from database:', error)
      // Continue with default/empty state if database is unavailable
    }
  }

  const addActivityHead = async () => {
    if (newActivityHead.name && newActivityHead.activities.length > 0) {
      try {
        // Save to database using the POC API
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/poc`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: newActivityHead.name,
            poc_type: 'activity_head',
            activities: newActivityHead.activities,
            team_name: newActivityHead.team,
            cities: []
          })
        })

        if (!response.ok) {
          throw new Error('Failed to save activity head to database')
        }

        const result = await response.json()

        const newHead: ActivityHead = {
          id: result.id || Date.now().toString(),
          name: newActivityHead.name,
          activities: newActivityHead.activities,
          team: newActivityHead.team,
          clubs: 0, // Will be calculated based on activities
          revenue: 0, // Will be calculated based on activities
          health: Math.floor(Math.random() * 30) + 70, // 70-100%
          healthStatus: 'green',
          teamMembers: []
        }

        // Update local state
        setActivityHeads([...activityHeads, newHead])
        setNewActivityHead({ name: '', activities: [], team: 'Phoenix' })

        // Also add to POC list for consistency
        const newPOC: POC = {
          id: result.id || Date.now().toString(),
          name: newActivityHead.name,
          teamName: newActivityHead.team,
          teamMembers: [],
          activities: newActivityHead.activities
        }
        setPocs([...pocs, newPOC])

        console.log('Activity head saved successfully')
      } catch (error) {
        console.error('Failed to save activity head:', error)
        alert('Failed to save activity head. Please try again.')
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
      const response = await fetch(`/api/database/activity-heads/${activityHeadId}/team-members`, {
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
      const response = await fetch(`/api/database/activity-heads/${activityHeadId}/team-members/${memberId}`, {
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
    if (newCityHead.pocId && newCityHead.pocName && newCityHead.city) {
      // Calculate total clubs and revenue for the city (mock data)
      const totalClubs = Math.floor(Math.random() * 30) + 30 // 30-60 clubs
      const totalRevenue = totalClubs * 10000 // ₹10k per club average

      const newHead: CityHead = {
        id: Date.now().toString(),
        pocId: newCityHead.pocId,
        pocName: newCityHead.pocName,
        city: newCityHead.city,
        clubs: totalClubs,
        revenue: totalRevenue,
        health: Math.floor(Math.random() * 30) + 70,
        healthStatus: 'green',
        isDualRole: newCityHead.isDualRole,
        dualRoleDescription: newCityHead.dualRoleDescription
      }

      setCityHeads([...cityHeads, newHead])
      setNewCityHead({ pocId: '', pocName: '', city: cities[0]?.name || '', isDualRole: false, dualRoleDescription: '' })
      setShowAddCityHead(false)
    }
  }

  const deleteActivityHead = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Activity Head? This action cannot be undone.')) {
      return
    }

    try {
      // Delete from database first
      const response = await fetch(`/api/database/activity-heads/${id}`, {
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
    setCategorizedActivities(prev => {
      // Remove from both categories first
      const newState = {
        scale: prev.scale.filter(name => name !== activityName),
        long_tail: prev.long_tail.filter(name => name !== activityName)
      }
      // Add to the new category
      newState[newType] = [...newState[newType], activityName]
      return newState
    })
  }

  const addActivityToCategory = (activityName: string, type: 'scale' | 'long_tail') => {
    setCategorizedActivities(prev => ({
      ...prev,
      [type]: [...prev[type], activityName]
    }))
    setShowActivitySelector(null)
  }

  const getUnassignedActivities = () => {
    const assignedActivities = [...categorizedActivities.scale, ...categorizedActivities.long_tail]
    return availableActivities.filter(activity => !assignedActivities.includes(activity.name))
  }

  // POC management functions
  const addPOC = async () => {
    if (newPOC.name && newPOC.teamName) {
      try {
        // Save to database using the POC API
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/poc`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: newPOC.name,
            poc_type: 'activity_head', // Default to activity head, can be changed
            activities: newPOC.activities,
            cities: [],
            team_name: newPOC.teamName
          })
        })

        if (!response.ok) {
          throw new Error('Failed to save POC to database')
        }

        const result = await response.json()

        const poc: POC = {
          id: result.id || Date.now().toString(),
          name: newPOC.name,
          teamName: newPOC.teamName,
          teamMembers: newPOC.teamMembers,
          activities: newPOC.activities
        }

        setPocs([...pocs, poc])
        setNewPOC({ name: '', teamName: '', teamMembers: [], activities: [] })
        setShowAddPOC(false)

        console.log('POC saved successfully')
      } catch (error) {
        console.error('Failed to save POC:', error)
        alert('Failed to save POC. Please try again.')
      }
    }
  }

  const deletePOC = (id: string) => {
    if (!confirm('Are you sure you want to delete this POC? This action cannot be undone.')) {
      return
    }
    setPocs(pocs.filter(poc => poc.id !== id))
  }

  const addPOCTeamMember = (pocId: string) => {
    if (!newMember.name || !newMember.role) {
      alert('Please fill in at least the name and role fields.')
      return
    }

    const newTeamMember: TeamMember = {
      id: Date.now().toString(),
      ...newMember
    }

    const updatedPocs = pocs.map(poc => {
      if (poc.id === pocId) {
        return {
          ...poc,
          teamMembers: [...poc.teamMembers, newTeamMember]
        }
      }
      return poc
    })

    setPocs(updatedPocs)
    setNewMember({ name: '', role: '', email: '', phone: '' })
    setShowAddMember(null)
  }

  const removePOCTeamMember = (pocId: string, memberId: string) => {
    if (!confirm('Are you sure you want to remove this team member?')) {
      return
    }

    const updatedPocs = pocs.map(poc => {
      if (poc.id === pocId) {
        return {
          ...poc,
          teamMembers: poc.teamMembers.filter(member => member.id !== memberId)
        }
      }
      return poc
    })
    setPocs(updatedPocs)
  }

  const addNewActivity = () => {
    if (!newActivity.name) return

    // Check if activity already exists in either category
    if (categorizedActivities.scale.includes(newActivity.name) ||
        categorizedActivities.long_tail.includes(newActivity.name)) {
      alert('Activity already categorized!')
      return
    }

    // Add to the selected category
    setCategorizedActivities(prev => ({
      ...prev,
      [newActivity.type]: [...prev[newActivity.type], newActivity.name]
    }))

    setNewActivity({ name: '', type: 'scale' })
    setShowAddActivityForm(false)
  }

  const deleteActivity = (activityName: string) => {
    setCategorizedActivities(prev => ({
      scale: prev.scale.filter(name => name !== activityName),
      long_tail: prev.long_tail.filter(name => name !== activityName)
    }))
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
      const response = await fetch(`/api/database/activity-heads/${id}`, {
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

  // POC Activity Mapping helper functions
  const getAvailableActivitiesForPOC = (pocId: string): string[] => {
    const assignedActivities = pocs.find(p => p.id === pocId)?.activities || []
    return [...categorizedActivities.scale, ...categorizedActivities.long_tail]
      .filter(activity => !assignedActivities.includes(activity))
  }

  const addActivityToPOC = (pocId: string, activityName: string) => {
    const updatedPocs = pocs.map(poc => {
      if (poc.id === pocId && !poc.activities.includes(activityName)) {
        return {
          ...poc,
          activities: [...poc.activities, activityName]
        }
      }
      return poc
    })
    setPocs(updatedPocs)
  }

  const removeActivityFromPOC = (pocId: string, activityName: string) => {
    const updatedPocs = pocs.map(poc => {
      if (poc.id === pocId) {
        return {
          ...poc,
          activities: poc.activities.filter(a => a !== activityName)
        }
      }
      return poc
    })
    setPocs(updatedPocs)
  }

  // Get categorized activities with their full data
  const scaleActivities = activities.filter(a => categorizedActivities.scale.includes(a.name))
  const longTailActivities = activities.filter(a => categorizedActivities.long_tail.includes(a.name))

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
                onClick={() => setShowActivitySelector('scale')}
                className="p-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                title="Add Activity to Scale"
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
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-500 rounded-lg">
                  <Star className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Long Tail Activities ({longTailActivities.length})</h3>
              </div>
              <button
                onClick={() => setShowActivitySelector('long_tail')}
                className="p-1 bg-gray-600 text-white rounded hover:bg-gray-700"
                title="Add Activity to Long Tail"
              >
                <Plus className="h-4 w-4" />
              </button>
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

        {/* Activity Selector Modal */}
        {showActivitySelector && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h2 className="text-lg font-semibold mb-4">
                Add Activity to {showActivitySelector === 'scale' ? 'Scale' : 'Long Tail'}
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Available Activities (with active public clubs):
                  </label>
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {getUnassignedActivities().length === 0 ? (
                      <p className="text-gray-500 text-sm">No unassigned activities available</p>
                    ) : (
                      getUnassignedActivities().map(activity => (
                        <button
                          key={activity.id}
                          onClick={() => addActivityToCategory(activity.name, showActivitySelector)}
                          className="w-full p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
                        >
                          <div className="font-medium text-gray-900">{activity.name}</div>
                          <div className="text-sm text-gray-600">
                            {activity.activeClubs} active clubs
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setShowActivitySelector(null)}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* POC Management */}
        <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                <Users className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">POCs</h2>
            </div>
            <button
              onClick={() => setShowAddPOC(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add POC
            </button>
          </div>

          {/* Add POC Form */}
          {showAddPOC && (
            <div className="mb-6 p-4 bg-purple-50 rounded-xl border border-purple-200">
              <h3 className="font-bold text-purple-900 mb-4">Add New POC</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">POC Name</label>
                  <input
                    type="text"
                    value={newPOC.name}
                    onChange={(e) => setNewPOC({...newPOC, name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    placeholder="Enter POC name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Team Name</label>
                  <input
                    type="text"
                    value={newPOC.teamName}
                    onChange={(e) => setNewPOC({...newPOC, teamName: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., Delhi Operations Team"
                  />
                </div>
              </div>

              {/* Team Members Section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-gray-900">Team Members ({newPOC.teamMembers.length})</h4>
                  <button
                    type="button"
                    onClick={() => setShowAddMember('new-poc')}
                    className="flex items-center gap-1 px-3 py-1 bg-purple-500 text-white rounded-md hover:bg-purple-600 text-sm"
                  >
                    <UserPlus className="h-4 w-4" />
                    Add Member
                  </button>
                </div>

                {/* Add Member Form for New POC */}
                {showAddMember === 'new-poc' && (
                  <div className="mb-4 p-3 bg-white rounded-lg border border-purple-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                        <input
                          type="text"
                          value={newMember.name}
                          onChange={(e) => setNewMember({...newMember, name: e.target.value})}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500"
                          placeholder="Full name"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                        <input
                          type="text"
                          value={newMember.role}
                          onChange={(e) => setNewMember({...newMember, role: e.target.value})}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500"
                          placeholder="Coordinator, Lead, etc."
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (!newMember.name || !newMember.role) {
                            alert('Please fill in at least the name and role fields.')
                            return
                          }

                          const newTeamMember: TeamMember = {
                            id: Date.now().toString(),
                            name: newMember.name,
                            role: newMember.role,
                            email: '',
                            phone: ''
                          }

                          setNewPOC({
                            ...newPOC,
                            teamMembers: [...newPOC.teamMembers, newTeamMember]
                          })
                          setNewMember({ name: '', role: '', email: '', phone: '' })
                          setShowAddMember(null)
                        }}
                        className="px-3 py-1 bg-purple-500 text-white rounded text-xs hover:bg-purple-600"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAddMember(null)}
                        className="px-3 py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Display Added Team Members */}
                {newPOC.teamMembers.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {newPOC.teamMembers.map((member) => (
                      <div key={member.id} className="bg-purple-50 rounded-lg border border-purple-200 p-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{member.name}</div>
                            <div className="text-xs text-purple-600">{member.role}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setNewPOC({
                                ...newPOC,
                                teamMembers: newPOC.teamMembers.filter(m => m.id !== member.id)
                              })
                            }}
                            className="text-red-400 hover:text-red-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 italic p-4 bg-gray-50 rounded-lg border border-gray-200">
                    No team members added yet. Click "Add Member" above to add team members to this POC.
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={addPOC}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
                >
                  <Save className="h-4 w-4" />
                  Save POC
                </button>
                <button
                  onClick={() => {
                    setShowAddPOC(false)
                    setNewPOC({ name: '', teamName: '', teamMembers: [], activities: [] })
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* POCs Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 rounded-lg">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">POC Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Team Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Team Members</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activities</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pocs.map((poc) => (
                  <React.Fragment key={poc.id}>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{poc.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{poc.teamName}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {poc.teamMembers.length} member{poc.teamMembers.length !== 1 ? 's' : ''}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {poc.activities.length > 0 ? (
                            poc.activities.map(activity => getActivityBadge(activity, activities))
                          ) : (
                            <span className="text-sm text-gray-500 italic">No activities assigned</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowTeamMembers(showTeamMembers === poc.id ? null : poc.id)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Manage Team Members"
                          >
                            <Users className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setShowAddMember(poc.id)}
                            className="text-green-600 hover:text-green-900"
                            title="Add Team Member"
                          >
                            <UserPlus className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deletePOC(poc.id)}
                            className="text-red-600 hover:text-red-900"
                            title="Delete POC"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* POC Team Members Section */}
                    {showTeamMembers === poc.id && (
                      <tr>
                        <td colSpan={5} className="px-6 py-4 bg-purple-50">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium text-gray-900">Team Members for {poc.name}</h4>
                            <button
                              onClick={() => setShowAddMember(poc.id)}
                              className="flex items-center gap-1 px-3 py-1 bg-purple-500 text-white rounded-md hover:bg-purple-600 text-xs"
                            >
                              <UserPlus className="h-3 w-3" />
                              Add Member
                            </button>
                          </div>

                          {/* Add Member Form */}
                          {showAddMember === poc.id && (
                            <div className="p-3 bg-white rounded-lg border border-purple-200">
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                                  <input
                                    type="text"
                                    value={newMember.name}
                                    onChange={(e) => setNewMember({...newMember, name: e.target.value})}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500"
                                    placeholder="Full name"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                                  <input
                                    type="text"
                                    value={newMember.role}
                                    onChange={(e) => setNewMember({...newMember, role: e.target.value})}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500"
                                    placeholder="Coordinator, Lead, etc."
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                                  <input
                                    type="email"
                                    value={newMember.email}
                                    onChange={(e) => setNewMember({...newMember, email: e.target.value})}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500"
                                    placeholder="email@misfits.com"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                                  <input
                                    type="tel"
                                    value={newMember.phone}
                                    onChange={(e) => setNewMember({...newMember, phone: e.target.value})}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500"
                                    placeholder="+91 9876543210"
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2 mt-3">
                                <button
                                  onClick={() => addPOCTeamMember(poc.id)}
                                  className="px-3 py-1 bg-purple-500 text-white rounded text-xs hover:bg-purple-600"
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

                          {/* POC Team Members List */}
                          {poc.teamMembers && poc.teamMembers.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {poc.teamMembers.map((member) => (
                                <div key={member.id} className="bg-white rounded-lg border border-purple-200 p-3">
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <div className="text-sm font-medium text-gray-900">{member.name}</div>
                                      <div className="text-xs text-purple-600">{member.role}</div>
                                      <div className="text-xs text-gray-500">{member.email}</div>
                                      <div className="text-xs text-gray-500">{member.phone}</div>
                                    </div>
                                    <button
                                      onClick={() => removePOCTeamMember(poc.id, member.id)}
                                      className="text-red-400 hover:text-red-600"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-500 italic">No team members added yet for this POC</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
                {pocs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                      No POCs added yet. Click "Add POC" to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* POC Activity Mapping Modal */}
          {showPOCActivityMapping && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
                <h2 className="text-lg font-semibold mb-4">Map Activities to POCs</h2>

                <div className="space-y-4">
                  {pocs.map((poc) => (
                    <div key={poc.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="font-medium text-gray-900">{poc.name}</h3>
                          <p className="text-sm text-gray-600">{poc.teamName}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedPOCForActivities(selectedPOCForActivities === poc.id ? null : poc.id)}
                            className="px-3 py-1 bg-indigo-500 text-white rounded text-sm hover:bg-indigo-600"
                          >
                            {selectedPOCForActivities === poc.id ? 'Cancel' : 'Assign Activities'}
                          </button>
                        </div>
                      </div>

                      {/* Current Activities */}
                      <div className="mb-3">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Current Activities ({poc.activities.length}):</h4>
                        <div className="flex flex-wrap gap-1">
                          {poc.activities.length > 0 ? (
                            poc.activities.map(activity => (
                              <span key={activity} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded">
                                {activity}
                                <button
                                  onClick={() => removeActivityFromPOC(poc.id, activity)}
                                  className="hover:text-purple-900"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-gray-500 italic">No activities assigned</span>
                          )}
                        </div>
                      </div>

                      {/* Available Activities to Assign */}
                      {selectedPOCForActivities === poc.id && (
                        <div className="border-t border-gray-200 pt-3">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Available Activities:</h4>
                          <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                            {getAvailableActivitiesForPOC(poc.id).length > 0 ? (
                              getAvailableActivitiesForPOC(poc.id).map(activity => {
                                const activityData = activities.find(a => a.name === activity)
                                const isScale = categorizedActivities.scale.includes(activity)
                                return (
                                  <button
                                    key={activity}
                                    onClick={() => addActivityToPOC(poc.id, activity)}
                                    className={`text-left p-2 rounded border hover:bg-gray-50 ${isScale ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`}
                                  >
                                    <div className="text-sm font-medium">
                                      {isScale ? '🚀' : '📝'} {activity}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {activityData?.activeClubs || 0} clubs
                                    </div>
                                  </button>
                                )
                              })
                            ) : (
                              <div className="col-span-2 text-sm text-gray-500 italic p-2">
                                All available activities are already assigned to this POC
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {pocs.length === 0 && (
                    <div className="text-center text-gray-500 py-8">
                      No POCs available. Please add POCs first before mapping activities.
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mt-6">
                  <button
                    onClick={() => {
                      setShowPOCActivityMapping(false)
                      setSelectedPOCForActivities(null)
                    }}
                    className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
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
                  <p className="text-xs text-gray-500 mb-2">Select activities one by one using the dropdown below</p>
                  <select
                    value=""
                    onChange={(e) => {
                      const selectedActivity = e.target.value;
                      if (selectedActivity && !newActivityHead.activities.includes(selectedActivity)) {
                        setNewActivityHead({
                          ...newActivityHead,
                          activities: [...newActivityHead.activities, selectedActivity]
                        });
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Select an activity to add...</option>
                    {activities
                      .filter(activity => activity.activeClubs > 0 && !newActivityHead.activities.includes(activity.name))
                      .map(activity => (
                        <option key={activity.id} value={activity.name}>
                          {activity.name} ({activity.clubCount} clubs, {activity.activeClubs} active)
                        </option>
                      ))}
                  </select>

                  {/* Selected Activities Display */}
                  {newActivityHead.activities.length > 0 && (
                    <div className="mt-2 p-2 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-700 mb-2">Selected Activities ({newActivityHead.activities.length}):</p>
                      <div className="flex flex-wrap gap-1">
                        {newActivityHead.activities.map((activity) => (
                          <span key={activity} className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-800 text-xs rounded">
                            {activity}
                            <button
                              onClick={() => setNewActivityHead({
                                ...newActivityHead,
                                activities: newActivityHead.activities.filter(a => a !== activity)
                              })}
                              className="hover:text-emerald-900"
                              type="button"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {activities.length === 0 && (
                    <p className="text-sm text-gray-500 mt-1">Loading activities...</p>
                  )}
                  {activities.length > 0 && activities.filter(a => a.activeClubs > 0).length === 0 && (
                    <p className="text-sm text-red-500 mt-1">No activities with active clubs found</p>
                  )}
                  {activities.length > 0 && (
                    <p className="text-sm text-gray-500 mt-1">
                      {activities.filter(a => a.activeClubs > 0).length} activities available
                    </p>
                  )}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">POC</label>
                  <select
                    value={newCityHead.pocId}
                    onChange={(e) => {
                      const selectedPOC = pocs.find(poc => poc.id === e.target.value)
                      setNewCityHead({
                        ...newCityHead,
                        pocId: e.target.value,
                        pocName: selectedPOC?.name || ''
                      })
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select POC...</option>
                    {pocs.map(poc => (
                      <option key={poc.id} value={poc.id}>
                        {poc.name} ({poc.teamName})
                      </option>
                    ))}
                  </select>
                  {pocs.length === 0 && (
                    <p className="text-sm text-gray-500 mt-1">No POCs available. Add POCs first.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <select
                    value={newCityHead.city}
                    onChange={(e) => setNewCityHead({...newCityHead, city: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {citiesLoading ? (
                      <option value="">Loading cities...</option>
                    ) : (
                      cities.map(city => (
                        <option key={city.id} value={city.name}>
                          {city.name} ({city.clubCount} clubs)
                        </option>
                      ))
                    )}
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">POC Name</th>
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
                        {head.pocName}
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
              {/* Debug info */}
              {process.env.NODE_ENV === 'development' && (
                <div className="mb-4 p-2 bg-gray-100 rounded text-xs">
                  Debug: {activities.length} total activities, {activities.filter(a => a.activeClubs > 0).length} with active clubs
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Activity</label>
                  <select
                    value={newActivity.name}
                    onChange={(e) => setNewActivity({...newActivity, name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">Select an activity...</option>
                    {activities
                      .filter(activity => activity.activeClubs > 0)
                      .map(activity => (
                        <option key={activity.id} value={activity.name}>
                          {activity.name} ({activity.clubCount} clubs, {activity.activeClubs} active)
                        </option>
                      ))}
                  </select>
                  {activities.length === 0 && (
                    <p className="text-sm text-gray-500 mt-1">Loading activities...</p>
                  )}
                  {activities.length > 0 && activities.filter(a => a.activeClubs > 0).length === 0 && (
                    <p className="text-sm text-red-500 mt-1">No activities with active clubs found</p>
                  )}
                  {activities.length > 0 && (
                    <p className="text-sm text-gray-500 mt-1">
                      Showing {activities.filter(a => a.activeClubs > 0).length} of {activities.length} activities
                    </p>
                  )}
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