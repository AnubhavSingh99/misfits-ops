import React, { useState, useEffect } from 'react'
import { Plus, Filter, Target, MapPin, Building2, TrendingUp, Users, ArrowUp, ArrowDown, Settings, Eye, User, Calendar, MessageSquare, CheckSquare, EyeOff, Clock, CheckCircle, AlertCircle, Play, ChevronDown, ChevronRight } from 'lucide-react'
import { getActivities, getCities } from '../services/api'

// Interfaces for the scaling structure
interface WOWHistoryEntry {
  date: string
  tasks: string[]
  comment: string
  achievements: string[]
  challenges: string[]
}

interface ActivityAreaTarget {
  id: string
  activity: string
  city: string
  area: string
  targetMeetupsTotal: number
  targetMeetupsExisting: number
  targetMeetupsNew: number
  plannedRevenue: number // in rupees
  currentRevenue: number
  currentMeetups: number
  existingClubs: number
  newClubsNeeded: number
  status: 'on_track' | 'at_risk' | 'behind'
  lastUpdated: string
  poc: string
  weekOverWeekChange: {
    meetups: number
    revenue: number
    healthScore: number
  }
  actionsThisWeek: string[]
  wowComment: string
  wowHistory: WOWHistoryEntry[]
}

interface ClubData {
  id: string
  name: string
  activity: string
  city: string
  area: string
  revenueType: 'old_stable' | 'scaling'
  scalingStage: 'realised' | 'regression_temp' | 'regression_permanent' | 'picked_stage4' | 'picked_stage3' | 'picked_stage2' | 'picked_stage1' | 'picked_started' | 'not_picked'
  currentMeetups: number
  currentRevenue: number
  targetMeetups: number
  targetRevenue: number
  poc: string
  areaTargetId: string
  health: 'green' | 'yellow' | 'red'
  healthScore: number
  weekOverWeekChange: {
    meetups: number
    revenue: number
    healthScore: number
  }
  actionsThisWeek: string[]
  wowComment: string
  capacityUtilization: number
  wowHistory: WOWHistoryEntry[]
  // New club launch tracking
  isNewClub: boolean
  launchStatus: 'planned' | 'in_progress' | 'launched' | 'active'
  launchDate?: string
  plannedLaunchDate?: string
  launchMilestones: {
    pocAssigned: boolean
    locationFound: boolean
    firstEventScheduled: boolean
    firstEventConducted: boolean
    membersOnboarded: boolean
  }
}

const SCALING_STAGES = [
  // Old Stable Revenue
  { value: 'old_stable_realised', label: 'Old Stable - Realised', color: 'bg-green-100 text-green-800', category: 'old_stable' },
  { value: 'old_stable_regression_temp', label: 'Old Stable - Regression (Temp)', color: 'bg-yellow-100 text-yellow-700', category: 'old_stable' },
  { value: 'old_stable_regression_permanent', label: 'Old Stable - Regression (Permanent)', color: 'bg-red-100 text-red-700', category: 'old_stable' },

  // Scaling Revenue
  { value: 'scaling_realised', label: 'Scaling - Realised', color: 'bg-green-100 text-green-700', category: 'scaling' },
  { value: 'scaling_picked_stage4', label: 'Scaling - Picked Stage 4', color: 'bg-indigo-100 text-indigo-700', category: 'scaling' },
  { value: 'scaling_picked_stage3', label: 'Scaling - Picked Stage 3', color: 'bg-purple-100 text-purple-700', category: 'scaling' },
  { value: 'scaling_picked_stage2', label: 'Scaling - Picked Stage 2', color: 'bg-blue-100 text-blue-700', category: 'scaling' },
  { value: 'scaling_picked_stage1', label: 'Scaling - Picked Stage 1', color: 'bg-orange-100 text-orange-700', category: 'scaling' },
  { value: 'scaling_picked_started', label: 'Scaling - Picked Started', color: 'bg-yellow-100 text-yellow-700', category: 'scaling' },
  { value: 'scaling_not_picked', label: 'Scaling - Not Picked', color: 'bg-gray-100 text-gray-600', category: 'scaling' }
]

// Types for database cities and areas
interface DatabaseCity {
  id: number
  name: string
  state: string
}

interface DatabaseArea {
  id: number
  name: string
  city_name: string
  postal_code?: number
  coordinates: {
    lat?: number
    lng?: number
  }
}

// POC type for POC management integration
interface POCData {
  id: string
  name: string
  activities: string[]
  areas: string[]
  cities: string[]
}

export default function ScalingPlanner() {
  // State for activity-area targets
  const [activityTargets, setActivityTargets] = useState<ActivityAreaTarget[]>([])
  const [clubs, setClubs] = useState<ClubData[]>([])
  const [loading, setLoading] = useState(true)

  // State for database cities and areas
  const [databaseCities, setDatabaseCities] = useState<DatabaseCity[]>([])
  const [databaseAreas, setDatabaseAreas] = useState<DatabaseArea[]>([])
  const [availableAreas, setAvailableAreas] = useState<DatabaseArea[]>([])
  const [citiesLoading, setCitiesLoading] = useState(false)
  const [areasLoading, setAreasLoading] = useState(false)

  // State for POC data from POC management
  const [pocData, setPocData] = useState<POCData[]>([])
  const [pocLoading, setPocLoading] = useState(false)

  // Filter states
  const [selectedActivity, setSelectedActivity] = useState('All')
  const [selectedArea, setSelectedArea] = useState('All')
  const [selectedCity, setSelectedCity] = useState('All')
  const [selectedStatus, setSelectedStatus] = useState('All')
  const [selectedPOC, setSelectedPOC] = useState('All')
  const [selectedHealth, setSelectedHealth] = useState('All')
  const [viewMode, setViewMode] = useState<'targets' | 'clubs' | 'poc_dashboard' | 'launch_tracking'>('targets')

  // Expandable rows state
  const [expandedActivity, setExpandedActivity] = useState<string | null>(null)
  const [expandedClubComments, setExpandedClubComments] = useState<string | null>(null)
  const [newComment, setNewComment] = useState('')
  const [editingComment, setEditingComment] = useState<string | null>(null)

  // POC Dashboard states
  const [pocSelectedActivities, setPOCSelectedActivities] = useState<string[]>(['All'])
  const [pocSelectedArea, setPOCSelectedArea] = useState('All')
  const [showNewClubsOnly, setShowNewClubsOnly] = useState(false)
  const [expandedClub, setExpandedClub] = useState<string | null>(null)
  const [newTaskText, setNewTaskText] = useState('')
  const [editingClub, setEditingClub] = useState<string | null>(null)
  const [editingTarget, setEditingTarget] = useState<string | null>(null)
  const [showNewClubForm, setShowNewClubForm] = useState(false)
  const [newClub, setNewClub] = useState({
    name: '',
    activity: '',
    city: '',
    area: '',
    targetMeetups: 0,
    targetRevenue: 0,
    targetAttendees: 0,
    launchDate: ''
  })
  const [editingClubTarget, setEditingClubTarget] = useState<{clubId: string, field: 'meetups' | 'revenue'} | null>(null)
  const [editingValue, setEditingValue] = useState('')

  // Metrics expansion states
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null)
  const [editingMetric, setEditingMetric] = useState<string | null>(null)

  // Save club target edits to API
  const handleSaveClubTarget = async (clubId: string, field: 'meetups' | 'revenue', value: string) => {
    try {
      const numValue = parseInt(value) || 0
      const updateData: any = {
        activity_name: 'Hiking' // You might need to get this from the current context
      }

      if (field === 'meetups') {
        updateData.target_meetups = numValue
      } else {
        updateData.target_revenue = numValue * 1000 // Convert from K to actual value
      }

      const response = await fetch(`/api/scaling/club/${clubId}/targets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      })

      if (response.ok) {
        // Update local state or refresh data
        console.log(`Updated ${field} for club ${clubId} to ${numValue}`)
      }
    } catch (error) {
      console.error(`Failed to update club ${field}:`, error)
    }

    setEditingClubTarget(null)
    setEditingValue('')
  }

  // Create new targets for overall metrics adjustments
  const handleAddMetricTarget = (type: string) => {
    // Simple way to adjust overall metrics by creating a new target
    const newTarget: ActivityAreaTarget = {
      id: `metric-adjustment-${Date.now()}`,
      activity: 'Adjustment',
      city: 'Global',
      area: 'Global',
      targetMeetupsTotal: type === 'meetups' ? 10 : 0,
      targetMeetupsExisting: 0,
      targetMeetupsNew: type === 'meetups' ? 10 : 0,
      plannedRevenue: type === 'revenue' ? 100000 : 0,
      currentRevenue: 0,
      currentMeetups: 0,
      existingClubs: 0,
      newClubsNeeded: type === 'newclubs' ? 1 : 0,
      status: 'on_track',
      lastUpdated: new Date().toISOString().split('T')[0],
      poc: selectedPOC === 'All' ? 'Admin' : selectedPOC,
      weekOverWeekChange: {
        meetups: 0,
        revenue: 0,
        healthScore: 0
      },
      actionsThisWeek: [],
      wowComment: `Metric adjustment for ${type}`,
      wowHistory: []
    }

    setActivityTargets([...activityTargets, newTarget])
    setEditingMetric(null)
  }

  // Calculate metrics dynamically from targets, filtered by selected POC
  const getMetrics = () => {
    // Filter targets by selected POC if not 'All'
    const filteredTargetsForMetrics = selectedPOC === 'All'
      ? activityTargets
      : activityTargets.filter(target => target.poc === selectedPOC)

    const totalTargets = filteredTargetsForMetrics.length
    const targetRevenue = filteredTargetsForMetrics.reduce((sum, target) => sum + target.plannedRevenue, 0)
    const targetMeetups = filteredTargetsForMetrics.reduce((sum, target) => sum + target.targetMeetupsTotal, 0)
    const newClubsNeeded = filteredTargetsForMetrics.reduce((sum, target) => sum + target.newClubsNeeded, 0)

    return {
      totalTargets,
      targetRevenue,
      targetMeetups,
      newClubsNeeded
    }
  }

  // Form state for new targets
  const [showNewTargetForm, setShowNewTargetForm] = useState(false)
  const [selectedFormCity, setSelectedFormCity] = useState<string>('')
  const [newTarget, setNewTarget] = useState({
    activity: '',
    city: '',
    area: '',
    targetMeetupsTotal: 20,
    targetMeetupsExisting: 12,
    targetMeetupsNew: 8,
    plannedRevenue: 600000 // 6 lakh in rupees
  })

  // Fetch POC data from POC management
  useEffect(() => {
    const fetchPOCData = async () => {
      setPocLoading(true)
      try {
        // Replace with actual POC management API call
        const response = await fetch(`${API_URL}/api/poc`)
        const data = await response.json()

        if (response.ok) {
          setPocData(data)
          console.log('Fetched POC data:', data)
        } else {
          console.error('Failed to fetch POC data:', data.error)
        }
      } catch (error) {
        console.error('Error fetching POC data:', error)
      } finally {
        setPocLoading(false)
      }
    }

    fetchPOCData()
  }, [])

  // Fetch cities from database on component mount
  useEffect(() => {
    const fetchCities = async () => {
      setCitiesLoading(true)
      try {
        const cities = await getCities()
        setDatabaseCities(cities)
        console.log('Fetched cities:', cities)
      } catch (error) {
        console.error('Error fetching cities:', error)
      } finally {
        setCitiesLoading(false)
      }
    }

    fetchCities()
  }, [])

  // Fetch areas when selected form city changes
  useEffect(() => {
    if (selectedFormCity && selectedFormCity !== '') {
      const fetchAreas = async () => {
        setAreasLoading(true)
        try {
          const selectedCityData = databaseCities.find(city => city.name === selectedFormCity)
          if (!selectedCityData) return

          const response = await fetch(`${API_URL}/api/scaling/areas/${selectedCityData.id}`)
          const data = await response.json()

          if (data.success) {
            setAvailableAreas(data.areas)
            console.log(`Fetched areas for ${selectedFormCity}:`, data.areas)
          } else {
            console.error('Failed to fetch areas:', data.error)
            setAvailableAreas([])
          }
        } catch (error) {
          console.error('Error fetching areas:', error)
          setAvailableAreas([])
        } finally {
          setAreasLoading(false)
        }
      }

      fetchAreas()
    } else {
      setAvailableAreas([])
    }
  }, [selectedFormCity, databaseCities])

  // Handle city selection in form
  const handleCityChange = (cityName: string) => {
    setSelectedFormCity(cityName)
    setNewTarget({
      ...newTarget,
      city: cityName,
      area: '' // Reset area when city changes
    })
  }

  // Handle area selection in form
  const handleAreaChange = (areaName: string) => {
    setNewTarget({
      ...newTarget,
      area: areaName
    })
  }

  // Helper function to provide default launch tracking fields for existing clubs
  const addLaunchTrackingDefaults = (club: any): ClubData => {
    return {
      ...club,
      isNewClub: club.isNewClub || false,
      launchStatus: club.launchStatus || 'active',
      launchDate: club.launchDate,
      plannedLaunchDate: club.plannedLaunchDate,
      launchMilestones: club.launchMilestones || {
        pocAssigned: true,
        locationFound: true,
        firstEventScheduled: true,
        firstEventConducted: true,
        membersOnboarded: true
      },
      wowHistory: club.wowHistory || []
    }
  }

  // Function to mark a club as launched
  const markClubAsLaunched = (clubId: string) => {
    setClubs(clubs.map(club =>
      club.id === clubId
        ? {
            ...club,
            launchStatus: 'launched' as const,
            launchDate: new Date().toISOString().split('T')[0],
            launchMilestones: {
              pocAssigned: true,
              locationFound: true,
              firstEventScheduled: true,
              firstEventConducted: true,
              membersOnboarded: true
            }
          }
        : club
    ))
  }

  // WoW Comments functions
  const handleAddComment = async (clubId: string) => {
    if (!newComment.trim()) return

    try {
      // Find the club to get meetup ID (assuming club ID maps to meetup ID)
      const club = clubs.find(c => c.id === clubId)
      if (!club) return

      // Call the WoW API to add the comment
      await fetch(`${API_URL}/api/wow/comment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meetup_id: clubId, // Using club ID as meetup ID for now
          comment: newComment.trim(),
          action_taken: '', // Could be extended later
          blocker: '',
          next_steps: ''
        }),
      })

      // Create local entry for immediate UI update
      const newWowEntry: WOWHistoryEntry = {
        date: new Date().toISOString().split('T')[0],
        tasks: [],
        comment: newComment.trim(),
        achievements: [],
        challenges: []
      }

      setClubs(clubs.map(club =>
        club.id === clubId
          ? {
              ...club,
              wowComment: newComment.trim(),
              wowHistory: [newWowEntry, ...club.wowHistory]
            }
          : club
      ))

      setNewComment('')
    } catch (error) {
      console.error('Error adding WoW comment:', error)
      // Still update the UI locally even if API call fails
      const newWowEntry: WOWHistoryEntry = {
        date: new Date().toISOString().split('T')[0],
        tasks: [],
        comment: newComment.trim(),
        achievements: [],
        challenges: []
      }

      setClubs(clubs.map(club =>
        club.id === clubId
          ? {
              ...club,
              wowComment: newComment.trim(),
              wowHistory: [newWowEntry, ...club.wowHistory]
            }
          : club
      ))

      setNewComment('')
    }
  }

  const toggleClubComments = (clubId: string) => {
    setExpandedClubComments(expandedClubComments === clubId ? null : clubId)
  }

  // Get new clubs that need to be launched
  const getNewClubsToLaunch = () => {
    return clubs.filter(club => club.isNewClub && club.launchStatus === 'planned')
  }

  // Get launched clubs (recently launched within 30 days)
  const getRecentlyLaunchedClubs = () => {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    return clubs.filter(club =>
      club.launchStatus === 'launched' &&
      club.launchDate &&
      new Date(club.launchDate) >= thirtyDaysAgo
    )
  }

  // Fetch real data from API
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        // Fetch real clubs data from database
        const clubsResponse = await fetch(`${API_URL}/api/scaling/clubs?status=ACTIVE`)
        const clubsData = await clubsResponse.json()

        if (clubsData.success) {
          // Transform real club data to match our interface
          const transformedClubs: ClubData[] = clubsData.clubs.map((club: any) => {
            return addLaunchTrackingDefaults({
              id: club.id || club.uuid,
              name: club.name,
              activity: club.activity || 'Unknown',
              city: club.city || 'Unknown',
              area: club.area || 'Unknown',
              revenueType: club.recentEvents > 5 ? 'scaling' : 'old_stable',
              scalingStage: club.recentEvents > 10 ? 'scaling_picked_stage3' : 'scaling_picked_started',
              currentMeetups: club.recentEvents || 0,
              currentRevenue: club.current_revenue || 0,
              targetMeetups: Math.max((club.recentEvents || 0) + 5, 10),
              targetRevenue: Math.max((club.current_revenue || 0) + 50000, 200000),
              poc: 'Unassigned', // TODO: Map from POC data when available
              areaTargetId: '1',
              health: club.recentEvents > 5 ? 'green' : club.recentEvents > 2 ? 'yellow' : 'red',
              healthScore: Math.min(club.recentEvents * 10 + 50, 100),
              capacityUtilization: club.capacity_utilization || 0,
              weekOverWeekChange: {
                meetups: 0,
                revenue: 0,
                healthScore: 0
              },
              actionsThisWeek: [
                'Review current performance',
                'Plan scaling activities',
                'Engage with community'
              ],
              wowComment: 'Recently imported from database',
              isNewClub: club.status === 'new',
              launchStatus: club.recentEvents > 0 ? 'active' : 'planned'
            })
          })

          setClubs(transformedClubs)

          // Create activity targets based on real clubs data
          const activityGroups = transformedClubs.reduce((groups: any, club) => {
            const key = `${club.activity}-${club.city}-${club.area}`
            if (!groups[key]) {
              groups[key] = {
                activity: club.activity,
                city: club.city,
                area: club.area,
                clubs: []
              }
            }
            groups[key].clubs.push(club)
            return groups
          }, {})

          const generatedTargets: ActivityAreaTarget[] = Object.values(activityGroups).map((group: any, index) => {
            const clubs = group.clubs
            const totalCurrentMeetups = clubs.reduce((sum: number, club: ClubData) => sum + club.currentMeetups, 0)
            const targetMeetups = Math.max(totalCurrentMeetups * 1.5, 20)

            return {
              id: `target-${index}`,
              activity: group.activity,
              city: group.city,
              area: group.area,
              targetMeetupsTotal: Math.round(targetMeetups),
              targetMeetupsExisting: totalCurrentMeetups,
              targetMeetupsNew: Math.round(targetMeetups - totalCurrentMeetups),
              plannedRevenue: Math.round(targetMeetups * 25000), // Estimate ₹25K per meetup
              currentRevenue: clubs.reduce((sum: number, club: ClubData) => sum + club.currentRevenue, 0),
              currentMeetups: totalCurrentMeetups,
              existingClubs: clubs.filter((club: ClubData) => !club.isNewClub).length,
              newClubsNeeded: Math.max(Math.round((targetMeetups - totalCurrentMeetups) / 5), 0),
              status: totalCurrentMeetups >= targetMeetups * 0.8 ? 'on_track' :
                      totalCurrentMeetups >= targetMeetups * 0.6 ? 'at_risk' : 'behind',
              lastUpdated: new Date().toISOString().split('T')[0],
              poc: 'Unassigned',
              weekOverWeekChange: {
                meetups: 0,
                revenue: 0,
                healthScore: 0
              },
              actionsThisWeek: [
                `Scale ${group.activity} in ${group.area}`,
                'Engage with existing clubs',
                'Plan new club launches'
              ],
              wowComment: `Generated from ${clubs.length} existing clubs`,
              wowHistory: []
            }
          })

          setActivityTargets(generatedTargets)
        } else {
          console.error('Failed to fetch clubs:', clubsData.error)
          // Fallback to empty data
          setClubs([])
          setActivityTargets([])
        }
      } catch (error) {
        console.error('Error fetching scaling data:', error)
        // Fallback to empty data
        setClubs([])
        setActivityTargets([])
      } finally {
        setLoading(false)
        setLastUpdated(new Date())
      }
    }

    fetchData()
  }, [])

  const handleCreateTarget = () => {
    const target: ActivityAreaTarget = {
      id: Date.now().toString(),
      ...newTarget,
      currentRevenue: 0,
      currentMeetups: 0,
      existingClubs: 0,
      newClubsNeeded: Math.ceil(newTarget.targetMeetupsNew / 5), // Estimate 5 meetups per new club
      status: 'on_track',
      lastUpdated: new Date().toISOString().split('T')[0],
      poc: selectedPOC === 'All' ? 'Saurabh' : selectedPOC, // Default POC assignment
      weekOverWeekChange: {
        meetups: 0,
        revenue: 0,
        healthScore: 0
      },
      actionsThisWeek: [],
      wowComment: '',
      wowHistory: []
    }

    setActivityTargets([...activityTargets, target])
    setShowNewTargetForm(false)
    setNewTarget({
      activity: '',
      city: '',
      area: '',
      targetMeetupsTotal: 20,
      targetMeetupsExisting: 12,
      targetMeetupsNew: 8,
      plannedRevenue: 600000
    })
  }

  const handleUpdateTarget = (targetId: string, updatedFields: Partial<ActivityAreaTarget>) => {
    setActivityTargets(activityTargets.map(target =>
      target.id === targetId
        ? {
            ...target,
            ...updatedFields,
            lastUpdated: new Date().toISOString().split('T')[0],
            newClubsNeeded: updatedFields.targetMeetupsNew
              ? Math.ceil(updatedFields.targetMeetupsNew / 5)
              : target.newClubsNeeded
          }
        : target
    ))
  }

  const handleStageUpdate = (clubId: string, newStage: string) => {
    setClubs(clubs.map(club =>
      club.id === clubId
        ? { ...club, scalingStage: newStage as ClubData['scalingStage'] }
        : club
    ))
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on_track': return 'bg-green-100 text-green-700'
      case 'at_risk': return 'bg-yellow-100 text-yellow-700'
      case 'behind': return 'bg-red-100 text-red-700'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  const getStageInfo = (stage: string) => {
    return SCALING_STAGES.find(s => s.value === stage) || SCALING_STAGES[0]
  }

  // Apply filters and connect POC data
  const filteredTargets = activityTargets.filter(target => {
    if (selectedActivity !== 'All' && target.activity !== selectedActivity) return false
    if (selectedArea !== 'All' && target.area !== selectedArea) return false
    if (selectedCity !== 'All' && target.city !== selectedCity) return false
    if (selectedStatus !== 'All' && target.status !== selectedStatus) return false
    if (selectedPOC !== 'All' && target.poc !== selectedPOC) return false
    return true
  })

  const filteredClubs = clubs.filter(club => {
    if (selectedActivity !== 'All' && club.activity !== selectedActivity) return false
    if (selectedArea !== 'All' && club.area !== selectedArea) return false
    if (selectedCity !== 'All' && club.city !== selectedCity) return false
    if (selectedPOC !== 'All' && club.poc !== selectedPOC) return false
    if (selectedHealth !== 'All' && club.health !== selectedHealth) return false
    return true
  })

  // State for real activities from database
  const [databaseActivities, setDatabaseActivities] = useState<any[]>([])

  // Fetch activities from database
  useEffect(() => {
    const fetchActivities = async () => {
      try {
        const activities = await getActivities()
        setDatabaseActivities(activities)
      } catch (error) {
        console.error('Error fetching activities:', error)
      }
    }

    fetchActivities()
  }, [])

  // Get filter options from both activity targets, clubs, POC data, and database
  const activities = [...new Set([
    ...activityTargets.map(t => t.activity),
    ...databaseActivities.map(a => a.name)
  ])]
  const areas = [...new Set(activityTargets.map(t => t.area))]
  const cities = [...new Set(activityTargets.map(t => t.city))]
  const pocs = [...new Set([...activityTargets.map(t => t.poc), ...clubs.map(c => c.poc), ...pocData.map(p => p.name)])]

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading Scaling Planner...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Scaling Planner</h1>
          <p className="text-gray-600">
            Activity-Area level planning with 60L revenue targets and stage tracking
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setExpandedMetric(expandedMetric === 'targets' ? null : 'targets')}>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Target className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Targets</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {getMetrics().totalTargets}
                  </p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setEditingMetric(editingMetric === 'targets' ? null : 'targets')
                }}
                className="h-5 w-5 text-gray-400 hover:text-blue-600 transition-colors"
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>
            {editingMetric === 'targets' && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600 mb-3">
                  {selectedPOC !== 'All' ? `Add new target for ${selectedPOC}` : 'Add global target adjustment'}
                </div>
                <button
                  onClick={() => setShowNewTargetForm(true)}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 text-sm"
                >
                  + Add New Target
                </button>
              </div>
            )}
            {expandedMetric === 'targets' && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="space-y-2 text-sm">
                  {(selectedPOC === 'All' ? activityTargets : activityTargets.filter(target => target.poc === selectedPOC)).map((target, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>{target.activity} • {target.area}</span>
                      <span className="font-medium">{selectedPOC === 'All' ? `Target ${idx + 1}` : target.poc}</span>
                    </div>
                  ))}
                  {selectedPOC !== 'All' && activityTargets.filter(target => target.poc === selectedPOC).length === 0 && (
                    <div className="text-gray-500 text-center py-2">No targets for {selectedPOC}</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setExpandedMetric(expandedMetric === 'revenue' ? null : 'revenue')}>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <TrendingUp className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Target Revenue</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ₹{(getMetrics().targetRevenue / 100000).toFixed(1)}L
                  </p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setEditingMetric(editingMetric === 'revenue' ? null : 'revenue')
                }}
                className="h-5 w-5 text-gray-400 hover:text-blue-600 transition-colors"
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>
            {editingMetric === 'revenue' && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600 mb-3">
                  {selectedPOC !== 'All' ? `Add revenue adjustment for ${selectedPOC}` : 'Add global revenue adjustment'}
                </div>
                <button
                  onClick={() => handleAddMetricTarget('revenue')}
                  className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 text-sm"
                >
                  + Add Revenue Target (₹1L)
                </button>
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setExpandedMetric(expandedMetric === 'meetups' ? null : 'meetups')}>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Building2 className="h-8 w-8 text-purple-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Target Meetups</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {getMetrics().targetMeetups}
                  </p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setEditingMetric(editingMetric === 'meetups' ? null : 'meetups')
                }}
                className="h-5 w-5 text-gray-400 hover:text-blue-600 transition-colors"
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>
            {editingMetric === 'meetups' && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600 mb-3">
                  {selectedPOC !== 'All' ? `Add meetup adjustment for ${selectedPOC}` : 'Add global meetup adjustment'}
                </div>
                <button
                  onClick={() => handleAddMetricTarget('meetups')}
                  className="w-full bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 text-sm"
                >
                  + Add 10 Meetup Target
                </button>
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setExpandedMetric(expandedMetric === 'newclubs' ? null : 'newclubs')}>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Users className="h-8 w-8 text-orange-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">New Clubs Needed</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {getMetrics().newClubsNeeded}
                  </p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setEditingMetric(editingMetric === 'newclubs' ? null : 'newclubs')
                }}
                className="h-5 w-5 text-gray-400 hover:text-blue-600 transition-colors"
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>
            {editingMetric === 'newclubs' && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600 mb-3">
                  {selectedPOC !== 'All' ? `Add new club target for ${selectedPOC}` : 'Add global new club adjustment'}
                </div>
                <button
                  onClick={() => handleAddMetricTarget('newclubs')}
                  className="w-full bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 text-sm"
                >
                  + Add 1 New Club Target
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('targets')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'targets' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Scale Sheet
                </button>
                <button
                  onClick={() => setViewMode('clubs')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'clubs' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  WoW View
                </button>
                <button
                  onClick={() => setViewMode('poc_dashboard')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'poc_dashboard' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  POC Dashboard
                </button>
                <button
                  onClick={() => setViewMode('launch_tracking')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'launch_tracking' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Launch Tracking
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-4 flex-wrap">
              <select
                value={selectedActivity}
                onChange={(e) => setSelectedActivity(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 bg-white text-sm"
              >
                <option value="All">All Activities</option>
                {activities.map(activity => (
                  <option key={activity} value={activity}>{activity}</option>
                ))}
              </select>

              <select
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 bg-white text-sm"
              >
                <option value="All">All Areas</option>
                {areas.map(area => (
                  <option key={area} value={area}>{area}</option>
                ))}
              </select>

              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 bg-white text-sm"
              >
                <option value="All">All Cities</option>
                {cities.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>

              <select
                value={selectedPOC}
                onChange={(e) => setSelectedPOC(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 bg-white text-sm"
              >
                <option value="All">All POCs</option>
                {pocs.map(poc => (
                  <option key={poc} value={poc}>{poc}</option>
                ))}
              </select>

              {viewMode === 'clubs' && (
                <select
                  value={selectedHealth}
                  onChange={(e) => setSelectedHealth(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 bg-white text-sm"
                >
                  <option value="All">All Health</option>
                  <option value="green">Green</option>
                  <option value="yellow">Yellow</option>
                  <option value="red">Red</option>
                </select>
              )}

              {viewMode === 'targets' && (
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 bg-white text-sm"
                >
                  <option value="All">All Status</option>
                  <option value="on_track">On Track</option>
                  <option value="at_risk">At Risk</option>
                  <option value="behind">Behind</option>
                </select>
              )}

              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <input
                  type="date"
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="Start Date"
                />
                <input
                  type="date"
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="End Date"
                />
              </div>

              <button
                onClick={() => setShowNewTargetForm(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center space-x-2 text-sm"
              >
                <Plus className="h-4 w-4" />
                <span>New Target</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content based on view mode */}
        {viewMode === 'targets' ? (
          /* Scale Sheet View - Expandable Activity Rows */
          <div className="space-y-4">
            {filteredTargets.map((target) => {
              const targetClubs = filteredClubs.filter(club =>
                club.activity === target.activity &&
                club.city === target.city &&
                club.area === target.area
              )

              return (
                <div key={target.id} className="bg-white rounded-lg shadow overflow-hidden">
                  {/* Activity Header Row */}
                  <div
                    onClick={() => setExpandedActivity(expandedActivity === target.id ? null : target.id)}
                    className="flex items-center justify-between p-6 cursor-pointer hover:bg-gray-50 border-b border-gray-100"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center">
                        {expandedActivity === target.id ? (
                          <ChevronDown className="h-5 w-5 text-gray-500" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-gray-500" />
                        )}
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-gray-900">{target.activity}</div>
                        <div className="text-sm text-gray-500 flex items-center space-x-2">
                          <MapPin className="h-3 w-3" />
                          <span>{target.area}, {target.city}</span>
                          <span>•</span>
                          <span>POC: {target.poc}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-8">
                      <div className="text-center">
                        <div className="text-xs text-gray-500">Meetup Target</div>
                        <div className="text-lg font-semibold text-gray-900">
                          {target.currentMeetups} → {target.targetMeetupsTotal}
                        </div>
                        <div className="text-xs text-gray-500">
                          Growth: +{target.targetMeetupsTotal - target.currentMeetups}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-gray-500">Existing Clubs</div>
                        <div className="text-lg font-semibold text-green-600">{target.targetMeetupsExisting}</div>
                        <div className="text-xs text-gray-500">meetups target</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-gray-500">New Clubs</div>
                        <div className="text-lg font-semibold text-blue-600">{target.targetMeetupsNew}</div>
                        <div className="text-xs text-gray-500">meetups target</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-gray-500">Revenue Target</div>
                        <div className="text-lg font-semibold text-gray-900">₹{(target.plannedRevenue / 100000).toFixed(1)}L</div>
                        <div className="text-xs text-gray-500">
                          Existing: ₹{((target.plannedRevenue * 0.6) / 100000).toFixed(1)}L | New: ₹{((target.plannedRevenue * 0.4) / 100000).toFixed(1)}L
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-gray-500">Status</div>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(target.status)}`}>
                          {target.status.replace('_', ' ')}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingTarget(target.id)
                        }}
                        className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                      >
                        <Settings className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Club Details */}
                  {expandedActivity === target.id && (
                    <div className="p-6 bg-gray-50 space-y-6">
                      {/* Existing Clubs Section */}
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-lg font-semibold text-gray-900">
                            Existing Clubs in {target.activity} - {target.area}, {target.city}
                          </h4>
                          <span className="text-sm text-gray-500">
                            {targetClubs.filter(c => !c.isNewClub || c.launchStatus === 'launched' || c.launchStatus === 'active').length} clubs
                          </span>
                        </div>

                        <div className="bg-white rounded-lg shadow overflow-hidden">
                          <div className="grid grid-cols-9 gap-4 px-6 py-3 bg-gray-100 text-xs font-medium text-gray-700 uppercase tracking-wider">
                            <div>Health</div>
                            <div>Club Name</div>
                            <div>Current Meetups</div>
                            <div>Target Meetups</div>
                            <div>Target Revenue</div>
                            <div>Target Attendees</div>
                            <div>Status</div>
                            <div>Scaling Stage</div>
                            <div>Actions</div>
                          </div>

                          <div className="divide-y divide-gray-100">
                            {targetClubs
                              .filter(club => !club.isNewClub || club.launchStatus === 'launched' || club.launchStatus === 'active')
                              .map((club) => (
                              <React.Fragment key={club.id}>
                                <div className="grid grid-cols-9 gap-4 px-6 py-4 hover:bg-gray-50">
                                  {/* Health Traffic Light */}
                                  <div className="flex items-center">
                                    <div className={`w-4 h-4 rounded-full ${
                                      club.health === 'green' ? 'bg-green-500' :
                                      club.health === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'
                                    }`} title={`Health: ${club.health} (${club.healthScore}%)`} />
                                  </div>

                                  {/* Club Name with Type and New Club Indicator */}
                                  <div className="flex items-center space-x-2">
                                    <Building2 className={`h-4 w-4 ${club.revenueType === 'old_stable' ? 'text-green-500' : 'text-blue-500'}`} />
                                    <div className="flex flex-col">
                                      <span className="font-medium text-gray-900">{club.name}</span>
                                      <span className={`text-xs ${
                                        club.revenueType === 'old_stable'
                                          ? 'text-green-600'
                                          : 'text-blue-600'
                                      }`}>
                                        {club.revenueType === 'old_stable' ? 'Old Stable' : 'Scaling'}
                                      </span>
                                    </div>
                                    {club.isNewClub && club.launchStatus === 'launched' && (
                                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                                        New
                                      </span>
                                    )}
                                  </div>

                                  <div className="text-gray-900">{club.currentMeetups}</div>
                                  <div className="font-semibold text-green-600 flex items-center space-x-2">
                                    {editingClubTarget?.clubId === club.id && editingClubTarget?.field === 'meetups' ? (
                                      <div className="flex items-center space-x-1">
                                        <input
                                          type="number"
                                          value={editingValue}
                                          onChange={(e) => setEditingValue(e.target.value)}
                                          onBlur={() => handleSaveClubTarget(club.id, 'meetups', editingValue)}
                                          onKeyPress={(e) => {
                                            if (e.key === 'Enter') {
                                              handleSaveClubTarget(club.id, 'meetups', editingValue)
                                            }
                                          }}
                                          className="w-16 px-1 py-0 border border-gray-300 rounded text-sm"
                                          autoFocus
                                        />
                                        <button
                                          onClick={() => handleSaveClubTarget(club.id, 'meetups', editingValue)}
                                          className="text-green-600 hover:text-green-800"
                                        >
                                          <CheckCircle className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center space-x-1">
                                        <span>{club.targetMeetups}</span>
                                        <button
                                          onClick={() => {
                                            setEditingClubTarget({clubId: club.id, field: 'meetups'})
                                            setEditingValue(club.targetMeetups.toString())
                                          }}
                                          className="text-gray-400 hover:text-green-600 transition-colors"
                                          title="Edit target meetups"
                                        >
                                          <Edit className="h-3 w-3" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-gray-600">
                                    {editingClubTarget?.clubId === club.id && editingClubTarget?.field === 'revenue' ? (
                                      <div className="flex items-center">
                                        <span className="mr-1">₹</span>
                                        <input
                                          type="number"
                                          value={editingValue}
                                          onChange={(e) => setEditingValue(e.target.value)}
                                          onBlur={() => handleSaveClubTarget(club.id, 'revenue', editingValue)}
                                          onKeyPress={(e) => {
                                            if (e.key === 'Enter') {
                                              handleSaveClubTarget(club.id, 'revenue', editingValue)
                                            }
                                          }}
                                          className="w-12 px-1 py-0 border border-gray-300 rounded text-sm"
                                          autoFocus
                                        />
                                        <span className="ml-1">K</span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center space-x-1">
                                        <span>₹{(club.targetRevenue/1000).toFixed(0)}K</span>
                                        <button
                                          onClick={() => {
                                            setEditingClubTarget({clubId: club.id, field: 'revenue'})
                                            setEditingValue((club.targetRevenue/1000).toFixed(0))
                                          }}
                                          className="text-gray-400 hover:text-green-600 transition-colors"
                                          title="Edit target revenue"
                                        >
                                          <Edit className="h-3 w-3" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-gray-600">
                                    {club.isNewClub && club.launchStatus === 'planned' ? 'TBD' : '50-80'}
                                  </div>
                                  <div>
                                    <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">
                                      {club.launchStatus === 'launched' ? 'Active' : 'Active'}
                                    </span>
                                  </div>
                                  <div>
                                    <select
                                      value={club.scalingStage}
                                      onChange={(e) => handleStageUpdate(club.id, e.target.value)}
                                      className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white w-full"
                                    >
                                      {SCALING_STAGES.map(stage => (
                                        <option key={stage.value} value={stage.value}>
                                          {stage.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="flex space-x-2">
                                    <button
                                      onClick={() => toggleClubComments(club.id)}
                                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                      title={expandedClubComments === club.id ? 'Hide WoW Comments' : 'Show WoW Comments'}
                                    >
                                      <MessageSquare className="h-3 w-3" />
                                    </button>
                                    <button
                                      onClick={() => setEditingClub(club.id)}
                                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                    >
                                      <Settings className="h-3 w-3" />
                                    </button>
                                    <button className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                                      <Eye className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>

                                {/* WoW Comments Expansion */}
                                {expandedClubComments === club.id && (
                                  <div className="px-6 py-4 bg-blue-50 border-t border-blue-200">
                                    <div className="space-y-4">
                                      {/* Add New Comment */}
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                          Add WoW Comment & Tasks for {club.name}
                                        </label>
                                        <div className="flex space-x-2">
                                          <textarea
                                            value={newComment}
                                            onChange={(e) => setNewComment(e.target.value)}
                                            placeholder="Add week comments, tasks, and notes..."
                                            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
                                            rows={3}
                                          />
                                          <button
                                            onClick={() => handleAddComment(club.id)}
                                            disabled={!newComment.trim()}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                          >
                                            Add
                                          </button>
                                        </div>
                                      </div>

                                      {/* WoW History */}
                                      <div>
                                        <h5 className="text-sm font-medium text-gray-700 mb-2">
                                          WoW Comment History - {club.name}
                                        </h5>
                                        {club.wowHistory && club.wowHistory.length > 0 ? (
                                          <div className="space-y-3 max-h-40 overflow-y-auto">
                                            {club.wowHistory.map((entry, index) => (
                                              <div key={index} className="bg-white rounded-lg p-3 border border-gray-200">
                                                <div className="flex items-center justify-between mb-2">
                                                  <span className="text-xs font-medium text-gray-500">{entry.date}</span>
                                                  <span className="text-xs text-blue-600">Week {index + 1}</span>
                                                </div>
                                                <p className="text-sm text-gray-700">{entry.comment}</p>
                                                {entry.tasks && entry.tasks.length > 0 && (
                                                  <div className="mt-2">
                                                    <div className="text-xs font-medium text-gray-600 mb-1">Tasks:</div>
                                                    <ul className="text-xs text-gray-600 list-disc list-inside">
                                                      {entry.tasks.map((task, taskIndex) => (
                                                        <li key={taskIndex}>{task}</li>
                                                      ))}
                                                    </ul>
                                                  </div>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <div className="text-center py-4 text-gray-500 text-sm bg-white rounded-lg border border-gray-200">
                                            No WoW comments yet. Add the first comment above.
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </React.Fragment>
                            ))}

                            {targetClubs.filter(c => !c.isNewClub || c.launchStatus === 'launched' || c.launchStatus === 'active').length === 0 && (
                              <div className="px-6 py-8 text-center text-gray-500">
                                No existing clubs found for this activity.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* New Clubs to Launch Section */}
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-lg font-semibold text-gray-900">
                            New Clubs to Launch
                          </h4>
                          <div className="flex items-center space-x-4">
                            <span className="text-sm text-gray-500">
                              {targetClubs.filter(c => c.isNewClub && c.launchStatus === 'planned').length} clubs to be launched
                            </span>
                            <button
                              onClick={() => setShowNewClubForm(true)}
                              className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                            >
                              <Plus className="h-3 w-3" />
                              <span>Add New Club</span>
                            </button>
                          </div>
                        </div>

                        <div className="bg-white rounded-lg shadow overflow-hidden">
                          <div className="grid grid-cols-9 gap-4 px-6 py-3 bg-orange-50 text-xs font-medium text-gray-700 uppercase tracking-wider">
                            <div>Status</div>
                            <div>Club Name</div>
                            <div>Launch Date</div>
                            <div>Target Meetups</div>
                            <div>Target Revenue</div>
                            <div>Target Attendees</div>
                            <div>Progress</div>
                            <div>Scaling Stage</div>
                            <div>Actions</div>
                          </div>

                          <div className="divide-y divide-gray-100">
                            {targetClubs
                              .filter(club => club.isNewClub && club.launchStatus === 'planned')
                              .map((club) => (
                              <React.Fragment key={club.id}>
                                <div className="grid grid-cols-9 gap-4 px-6 py-4 hover:bg-gray-50">
                                  {/* Launch Status */}
                                  <div className="flex items-center">
                                    <div className="w-4 h-4 rounded-full bg-orange-500" title="Planned for launch" />
                                  </div>

                                  <div className="flex items-center space-x-2">
                                    <Building2 className="h-4 w-4 text-orange-500" />
                                    <span className="font-medium text-gray-900">{club.name}</span>
                                  </div>

                                  <div className="text-sm text-gray-600">
                                    {club.plannedLaunchDate || 'TBD'}
                                  </div>
                                  <div className="font-semibold text-blue-600">{club.targetMeetups}</div>
                                  <div className="text-gray-600">₹{(club.targetRevenue/1000).toFixed(0)}K</div>
                                  <div className="text-gray-600">TBD</div>
                                  <div>
                                    <div className="flex items-center space-x-1">
                                      <div className="w-20 bg-gray-200 rounded-full h-2">
                                        <div className="bg-orange-600 h-2 rounded-full w-1/4"></div>
                                      </div>
                                      <span className="text-xs text-gray-500">25%</span>
                                    </div>
                                  </div>
                                  <div>
                                    <select
                                      value={club.scalingStage}
                                      onChange={(e) => handleStageUpdate(club.id, e.target.value)}
                                      className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white"
                                    >
                                      {SCALING_STAGES.map(stage => (
                                        <option key={stage.value} value={stage.value}>
                                          {stage.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="flex space-x-2">
                                    <button
                                      onClick={() => toggleClubComments(club.id)}
                                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                      title={expandedClubComments === club.id ? 'Hide WoW Comments' : 'Show WoW Comments'}
                                    >
                                      <MessageSquare className="h-3 w-3" />
                                    </button>
                                    <button
                                      onClick={() => markClubAsLaunched(club.id)}
                                      className="p-1 text-orange-600 hover:text-orange-800 transition-colors"
                                      title="Mark as Launched"
                                    >
                                      <Play className="h-3 w-3" />
                                    </button>
                                    <button
                                      onClick={() => setEditingClub(club.id)}
                                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                    >
                                      <Settings className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>

                                {/* WoW Comments Expansion for New Club Launches */}
                                {expandedClubComments === club.id && (
                                  <div className="px-6 py-4 bg-orange-50 border-t border-orange-200">
                                    <div className="space-y-4">
                                      {/* Add New Comment */}
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                          Add Launch Planning Comments & Tasks for {club.name}
                                        </label>
                                        <div className="flex space-x-2">
                                          <textarea
                                            value={newComment}
                                            onChange={(e) => setNewComment(e.target.value)}
                                            placeholder="Add launch planning comments, tasks, and progress notes..."
                                            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
                                            rows={3}
                                          />
                                          <button
                                            onClick={() => handleAddComment(club.id)}
                                            disabled={!newComment.trim()}
                                            className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                          >
                                            Add
                                          </button>
                                        </div>
                                      </div>

                                      {/* Launch Planning History */}
                                      <div>
                                        <h5 className="text-sm font-medium text-gray-700 mb-2">
                                          Launch Planning History - {club.name}
                                        </h5>
                                        {club.wowHistory && club.wowHistory.length > 0 ? (
                                          <div className="space-y-3 max-h-40 overflow-y-auto">
                                            {club.wowHistory.map((entry, index) => (
                                              <div key={index} className="bg-white rounded-lg p-3 border border-orange-200">
                                                <div className="flex items-center justify-between mb-2">
                                                  <span className="text-xs font-medium text-gray-500">{entry.date}</span>
                                                  <span className="text-xs text-orange-600">Planning Update {index + 1}</span>
                                                </div>
                                                <p className="text-sm text-gray-700">{entry.comment}</p>
                                                {entry.tasks && entry.tasks.length > 0 && (
                                                  <div className="mt-2">
                                                    <div className="text-xs font-medium text-gray-600 mb-1">Launch Tasks:</div>
                                                    <ul className="text-xs text-gray-600 list-disc list-inside">
                                                      {entry.tasks.map((task, taskIndex) => (
                                                        <li key={taskIndex}>{task}</li>
                                                      ))}
                                                    </ul>
                                                  </div>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <div className="text-center py-4 text-gray-500 text-sm bg-white rounded-lg border border-orange-200">
                                            No launch planning comments yet. Add planning notes and tasks above.
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </React.Fragment>
                            ))}

                            {targetClubs.filter(c => c.isNewClub && c.launchStatus === 'planned').length === 0 && (
                              <div className="px-6 py-8 text-center text-gray-500">
                                No new clubs planned for launch. Click "Add New Club" to plan a launch.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {filteredTargets.length === 0 && (
              <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                No activity targets found matching your filters.
              </div>
            )}
          </div>
        ) : viewMode === 'clubs' ? (
          /* WoW View */
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Club & Location
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Revenue Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Scaling Stage
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Current Progress
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      POC
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Update Stage
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredClubs.map((club) => {
                    const stageInfo = getStageInfo(club.scalingStage)
                    return (
                      <tr key={club.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{club.name}</div>
                            <div className="text-sm text-gray-500">
                              {club.activity} • {club.area}, {club.city}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            club.revenueType === 'old_stable' ? 'bg-gray-100 text-gray-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {club.revenueType === 'old_stable' ? 'Old Stable' : 'Scaling'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${stageInfo.color}`}>
                            {stageInfo.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {club.currentMeetups}/{club.targetMeetups} meetups
                          </div>
                          <div className="text-sm text-gray-500">
                            ₹{(club.currentRevenue / 1000).toFixed(0)}K / ₹{(club.targetRevenue / 1000).toFixed(0)}K
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {club.poc}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <select
                            value={club.scalingStage}
                            onChange={(e) => handleStageUpdate(club.id, e.target.value)}
                            className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white"
                          >
                            {SCALING_STAGES.map(stage => (
                              <option key={stage.value} value={stage.value}>
                                {stage.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : viewMode === 'poc_dashboard' ? (
          /* POC Dashboard View - Placeholder for now */
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">POC Dashboard</h3>
            <p className="text-gray-600">POC Dashboard functionality coming soon...</p>
          </div>
        ) : viewMode === 'launch_tracking' ? (
          /* Launch Tracking View */
          <div className="space-y-6">
            {/* Summary Cards for Launch Tracking */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <Clock className="h-8 w-8 text-orange-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Clubs to Launch</p>
                    <p className="text-2xl font-bold text-gray-900">{getNewClubsToLaunch().length}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <Play className="h-8 w-8 text-blue-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Recently Launched</p>
                    <p className="text-2xl font-bold text-gray-900">{getRecentlyLaunchedClubs().length}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total New Clubs</p>
                    <p className="text-2xl font-bold text-gray-900">{clubs.filter(c => c.isNewClub).length}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <Target className="h-8 w-8 text-purple-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">New Club Target Progress</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {clubs.filter(c => c.isNewClub).length}/{getMetrics().newClubsNeeded}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Edit Target Modal */}
        {editingTarget && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
              {(() => {
                const target = activityTargets.find(t => t.id === editingTarget)
                if (!target) return null

                return (
                  <>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      Edit Target: {target.activity} • {target.area}, {target.city}
                    </h3>

                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Total Meetups</label>
                          <input
                            type="number"
                            defaultValue={target.targetMeetupsTotal}
                            onChange={(e) => {
                              const newTotal = parseInt(e.target.value)
                              handleUpdateTarget(target.id, {
                                targetMeetupsTotal: newTotal,
                                targetMeetupsNew: Math.max(0, newTotal - target.targetMeetupsExisting)
                              })
                            }}
                            className="w-full border border-gray-300 rounded-md px-3 py-2"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Existing</label>
                          <input
                            type="number"
                            defaultValue={target.targetMeetupsExisting}
                            onChange={(e) => {
                              const newExisting = parseInt(e.target.value)
                              handleUpdateTarget(target.id, {
                                targetMeetupsExisting: newExisting,
                                targetMeetupsNew: Math.max(0, target.targetMeetupsTotal - newExisting)
                              })
                            }}
                            className="w-full border border-gray-300 rounded-md px-3 py-2"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">New</label>
                          <input
                            type="number"
                            defaultValue={target.targetMeetupsNew}
                            onChange={(e) => {
                              const newCount = parseInt(e.target.value)
                              handleUpdateTarget(target.id, {
                                targetMeetupsNew: newCount,
                                targetMeetupsTotal: target.targetMeetupsExisting + newCount
                              })
                            }}
                            className="w-full border border-gray-300 rounded-md px-3 py-2"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Planned Revenue (₹)</label>
                        <input
                          type="number"
                          defaultValue={target.plannedRevenue}
                          onChange={(e) => handleUpdateTarget(target.id, { plannedRevenue: parseInt(e.target.value) })}
                          className="w-full border border-gray-300 rounded-md px-3 py-2"
                          placeholder="600000"
                        />
                        <p className="text-xs text-gray-500 mt-1">₹{(target.plannedRevenue / 100000).toFixed(1)} Lakh</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">POC</label>
                        <select
                          value={target.poc}
                          onChange={(e) => handleUpdateTarget(target.id, { poc: e.target.value })}
                          className="w-full border border-gray-300 rounded-md px-3 py-2 bg-white"
                        >
                          {pocs.map(poc => (
                            <option key={poc} value={poc}>{poc}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex space-x-3 mt-6">
                      <button
                        onClick={() => setEditingTarget(null)}
                        className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
                      >
                        Save Changes
                      </button>
                      <button
                        onClick={() => setEditingTarget(null)}
                        className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        )}

        {/* New Target Modal */}
        {showNewTargetForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Area Target</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Activity</label>
                  <input
                    type="text"
                    value={newTarget.activity}
                    onChange={(e) => setNewTarget({...newTarget, activity: e.target.value})}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="e.g., Hiking"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                    <select
                      value={selectedFormCity}
                      onChange={(e) => handleCityChange(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 bg-white"
                      disabled={citiesLoading}
                    >
                      <option value="">
                        {citiesLoading ? 'Loading cities...' : 'Select a city'}
                      </option>
                      {databaseCities.map(city => (
                        <option key={city.id} value={city.name}>
                          {city.name}
                          {city.state && ` (${city.state})`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Area</label>
                    <select
                      value={newTarget.area}
                      onChange={(e) => handleAreaChange(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 bg-white"
                      disabled={!selectedFormCity || areasLoading}
                    >
                      <option value="">
                        {!selectedFormCity ? 'Select a city first' :
                         areasLoading ? 'Loading areas...' :
                         availableAreas.length === 0 ? 'No areas available' :
                         'Select an area'}
                      </option>
                      {availableAreas.map(area => (
                        <option key={area.id} value={area.name}>
                          {area.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Total Meetups</label>
                    <input
                      type="number"
                      value={newTarget.targetMeetupsTotal}
                      onChange={(e) => setNewTarget({...newTarget, targetMeetupsTotal: parseInt(e.target.value)})}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Existing</label>
                    <input
                      type="number"
                      value={newTarget.targetMeetupsExisting}
                      onChange={(e) => setNewTarget({...newTarget, targetMeetupsExisting: parseInt(e.target.value)})}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">New</label>
                    <input
                      type="number"
                      value={newTarget.targetMeetupsNew}
                      onChange={(e) => setNewTarget({...newTarget, targetMeetupsNew: parseInt(e.target.value)})}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Planned Revenue (₹)</label>
                  <input
                    type="number"
                    value={newTarget.plannedRevenue}
                    onChange={(e) => setNewTarget({...newTarget, plannedRevenue: parseInt(e.target.value)})}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="600000"
                  />
                  <p className="text-xs text-gray-500 mt-1">₹{(newTarget.plannedRevenue / 100000).toFixed(1)} Lakh</p>
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  onClick={handleCreateTarget}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
                >
                  Create Target
                </button>
                <button
                  onClick={() => setShowNewTargetForm(false)}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* New Club Launch Form Modal */}
        {showNewClubForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Add New Club Launch</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Club Name</label>
                  <input
                    type="text"
                    value={newClub.name}
                    onChange={(e) => setNewClub({...newClub, name: e.target.value})}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="e.g., Delhi Hikers"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Activity</label>
                  <input
                    type="text"
                    value={newClub.activity}
                    onChange={(e) => setNewClub({...newClub, activity: e.target.value})}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="e.g., Hiking"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                    <input
                      type="text"
                      value={newClub.city}
                      onChange={(e) => setNewClub({...newClub, city: e.target.value})}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                      placeholder="e.g., Delhi"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Area</label>
                    <input
                      type="text"
                      value={newClub.area}
                      onChange={(e) => setNewClub({...newClub, area: e.target.value})}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                      placeholder="e.g., CP"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Launch Date</label>
                  <input
                    type="date"
                    value={newClub.launchDate}
                    onChange={(e) => setNewClub({...newClub, launchDate: e.target.value})}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Target Meetups</label>
                    <input
                      type="number"
                      value={newClub.targetMeetups}
                      onChange={(e) => setNewClub({...newClub, targetMeetups: parseInt(e.target.value) || 0})}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                      placeholder="10"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Target Revenue (₹)</label>
                    <input
                      type="number"
                      value={newClub.targetRevenue}
                      onChange={(e) => setNewClub({...newClub, targetRevenue: parseInt(e.target.value) || 0})}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                      placeholder="50000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Target Attendees</label>
                    <input
                      type="number"
                      value={newClub.targetAttendees}
                      onChange={(e) => setNewClub({...newClub, targetAttendees: parseInt(e.target.value) || 0})}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                      placeholder="50"
                    />
                  </div>
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  onClick={async () => {
                    try {
                      const response = await fetch('/api/scaling/new-club-launch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newClub)
                      })

                      if (response.ok) {
                        // Reset form and close modal
                        setNewClub({ name: '', activity: '', city: '', area: '', targetMeetups: 0, targetRevenue: 0, targetAttendees: 0, launchDate: '' })
                        setShowNewClubForm(false)
                        // Refresh data here if needed
                      }
                    } catch (error) {
                      console.error('Failed to add new club:', error)
                    }
                  }}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
                >
                  Add Club Launch
                </button>
                <button
                  onClick={() => setShowNewClubForm(false)}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}