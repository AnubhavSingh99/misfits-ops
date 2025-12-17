import React, { useState, useEffect } from 'react'
import { Plus, Filter, Target, MapPin, Building2, TrendingUp, Users, ArrowUp, ArrowDown, Settings, Eye, User, Calendar, MessageSquare, CheckSquare, EyeOff, Clock, CheckCircle, AlertCircle, Play } from 'lucide-react'

// Interfaces for the new scaling structure
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
  { value: 'not_picked', label: 'Not picked', color: 'bg-gray-100 text-gray-600' },
  { value: 'picked_started', label: 'Started', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'picked_stage1', label: 'Stage 1', color: 'bg-orange-100 text-orange-700' },
  { value: 'picked_stage2', label: 'Stage 2', color: 'bg-blue-100 text-blue-700' },
  { value: 'picked_stage3', label: 'Stage 3', color: 'bg-purple-100 text-purple-700' },
  { value: 'picked_stage4', label: 'Stage 4', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'realised', label: 'Realised', color: 'bg-green-100 text-green-700' },
  { value: 'regression_temp', label: 'Regression (Temp)', color: 'bg-red-100 text-red-600' },
  { value: 'regression_permanent', label: 'Regression (Permanent)', color: 'bg-red-200 text-red-800' }
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

export function NewScalingPlanner() {
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

  // Filter states
  const [selectedActivity, setSelectedActivity] = useState('All')
  const [selectedCity, setSelectedCity] = useState('All')
  const [selectedStatus, setSelectedStatus] = useState('All')
  const [selectedPOC, setSelectedPOC] = useState('All')
  const [selectedHealth, setSelectedHealth] = useState('All')
  const [viewMode, setViewMode] = useState<'targets' | 'clubs' | 'poc_dashboard' | 'launch_tracking'>('targets')

  // POC Dashboard states
  const [pocSelectedActivities, setPOCSelectedActivities] = useState<string[]>(['All'])
  const [pocSelectedArea, setPOCSelectedArea] = useState('All')
  const [showNewClubsOnly, setShowNewClubsOnly] = useState(false)
  const [expandedClub, setExpandedClub] = useState<string | null>(null)
  const [newTaskText, setNewTaskText] = useState('')
  const [editingClub, setEditingClub] = useState<string | null>(null)
  const [editingTarget, setEditingTarget] = useState<string | null>(null)

  // Metrics expansion states
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null)
  const [editingMetric, setEditingMetric] = useState<string | null>(null)

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

  // Fetch cities from database on component mount
  useEffect(() => {
    const fetchCities = async () => {
      setCitiesLoading(true)
      try {
        const response = await fetch('http://localhost:3001/api/scaling/cities')
        const data = await response.json()

        if (data.success) {
          setDatabaseCities(data.cities)
          console.log('Fetched cities:', data.cities)
        } else {
          console.error('Failed to fetch cities:', data.error)
        }
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

          const response = await fetch(`http://localhost:3001/api/scaling/areas/${selectedCityData.id}`)
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

  // Mock data for development - replace with API calls
  useEffect(() => {
    const mockTargets: ActivityAreaTarget[] = [
      {
        id: '1',
        activity: 'Hiking',
        city: 'Mumbai',
        area: 'Bandra',
        targetMeetupsTotal: 25,
        targetMeetupsExisting: 15,
        targetMeetupsNew: 10,
        plannedRevenue: 750000,
        currentRevenue: 400000,
        currentMeetups: 12,
        existingClubs: 2,
        newClubsNeeded: 1,
        status: 'on_track',
        lastUpdated: '2025-12-15',
        poc: 'Saurabh',
        weekOverWeekChange: {
          meetups: +2,
          revenue: +50000,
          healthScore: +5
        },
        actionsThisWeek: [
          'Schedule 2 new hiking events',
          'Follow up with potential new members',
          'Review venue bookings'
        ],
        wowComment: 'Good momentum this week with increased bookings'
      },
      {
        id: '2',
        activity: 'Football',
        city: 'Delhi',
        area: 'Gurgaon',
        targetMeetupsTotal: 30,
        targetMeetupsExisting: 18,
        targetMeetupsNew: 12,
        plannedRevenue: 900000,
        currentRevenue: 250000,
        currentMeetups: 8,
        existingClubs: 1,
        newClubsNeeded: 2,
        status: 'behind',
        lastUpdated: '2025-12-14',
        poc: 'Priya',
        weekOverWeekChange: {
          meetups: -1,
          revenue: -25000,
          healthScore: -3
        },
        actionsThisWeek: [
          'Recruit new POC for second club',
          'Address venue availability issues',
          'Marketing push for member acquisition'
        ],
        wowComment: 'Facing challenges with venue booking, working on solutions'
      }
    ]

    const mockClubsRaw = [
      {
        id: '1',
        name: 'Bandra Hikers',
        activity: 'Hiking',
        city: 'Mumbai',
        area: 'Bandra',
        revenueType: 'old_stable',
        scalingStage: 'realised',
        currentMeetups: 8,
        currentRevenue: 200000,
        targetMeetups: 12,
        targetRevenue: 400000,
        poc: 'Saurabh',
        areaTargetId: '1',
        health: 'green',
        healthScore: 85,
        capacityUtilization: 78,
        weekOverWeekChange: {
          meetups: +1,
          revenue: +25000,
          healthScore: +3
        },
        actionsThisWeek: [
          'Plan Christmas special hike',
          'Update equipment inventory',
          'Collect member feedback'
        ],
        wowComment: 'Excellent response to new routes introduced'
      },
      {
        id: '2',
        name: 'Mumbai Trekkers',
        activity: 'Hiking',
        city: 'Mumbai',
        area: 'Bandra',
        revenueType: 'scaling',
        scalingStage: 'picked_stage3',
        currentMeetups: 4,
        currentRevenue: 200000,
        targetMeetups: 13,
        targetRevenue: 350000,
        poc: 'Priya',
        areaTargetId: '1',
        health: 'yellow',
        healthScore: 65,
        capacityUtilization: 55,
        weekOverWeekChange: {
          meetups: 0,
          revenue: +15000,
          healthScore: +2
        },
        actionsThisWeek: [
          'Onboard new POC assistant',
          'Improve marketing strategy',
          'Address member retention issues'
        ],
        wowComment: 'New leadership structure showing positive results'
      },
      {
        id: '3',
        name: 'Gurgaon FC',
        activity: 'Football',
        city: 'Delhi',
        area: 'Gurgaon',
        revenueType: 'scaling',
        scalingStage: 'picked_stage2',
        currentMeetups: 3,
        currentRevenue: 150000,
        targetMeetups: 8,
        targetRevenue: 300000,
        poc: 'Priya',
        areaTargetId: '2',
        health: 'red',
        healthScore: 45,
        capacityUtilization: 35,
        weekOverWeekChange: {
          meetups: -1,
          revenue: -10000,
          healthScore: -5
        },
        actionsThisWeek: [
          'Find alternative venue options',
          'Recruit additional team members',
          'Review pricing strategy'
        ],
        wowComment: 'Venue issues impacting growth, exploring solutions'
      },
      {
        id: '4',
        name: 'New Andheri Runners',
        activity: 'Running',
        city: 'Mumbai',
        area: 'Andheri',
        revenueType: 'scaling',
        scalingStage: 'picked_started',
        currentMeetups: 0,
        currentRevenue: 0,
        targetMeetups: 10,
        targetRevenue: 250000,
        poc: 'Rahul',
        areaTargetId: '1',
        health: 'yellow',
        healthScore: 50,
        capacityUtilization: 0,
        weekOverWeekChange: {
          meetups: 0,
          revenue: 0,
          healthScore: 0
        },
        actionsThisWeek: [
          'Complete venue booking',
          'Schedule first event',
          'Finalize equipment procurement'
        ],
        wowComment: 'Preparing for launch next week',
        isNewClub: true,
        launchStatus: 'planned',
        plannedLaunchDate: '2025-12-22',
        launchMilestones: {
          pocAssigned: true,
          locationFound: false,
          firstEventScheduled: false,
          firstEventConducted: false,
          membersOnboarded: false
        }
      },
      {
        id: '5',
        name: 'Whitefield Cyclists',
        activity: 'Cycling',
        city: 'Bangalore',
        area: 'Whitefield',
        revenueType: 'scaling',
        scalingStage: 'picked_stage1',
        currentMeetups: 2,
        currentRevenue: 50000,
        targetMeetups: 8,
        targetRevenue: 200000,
        poc: 'Sneha',
        areaTargetId: '3',
        health: 'green',
        healthScore: 75,
        capacityUtilization: 25,
        weekOverWeekChange: {
          meetups: +2,
          revenue: +50000,
          healthScore: +15
        },
        actionsThisWeek: [
          'Scale up to regular schedule',
          'Recruit additional members',
          'Plan weekend long rides'
        ],
        wowComment: 'Successfully launched last week - great initial response!',
        isNewClub: true,
        launchStatus: 'launched',
        launchDate: '2025-12-08',
        plannedLaunchDate: '2025-12-08',
        launchMilestones: {
          pocAssigned: true,
          locationFound: true,
          firstEventScheduled: true,
          firstEventConducted: true,
          membersOnboarded: true
        }
      }
    ]

    // Apply launch tracking defaults to all clubs
    const mockClubs: ClubData[] = mockClubsRaw.map(club => addLaunchTrackingDefaults(club))

    setActivityTargets(mockTargets)
    setClubs(mockClubs)
    setLoading(false)
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

  const filteredTargets = activityTargets.filter(target => {
    if (selectedActivity !== 'All' && target.activity !== selectedActivity) return false
    if (selectedCity !== 'All' && target.city !== selectedCity) return false
    if (selectedStatus !== 'All' && target.status !== selectedStatus) return false
    if (selectedPOC !== 'All' && target.poc !== selectedPOC) return false
    return true
  })

  const filteredClubs = clubs.filter(club => {
    if (selectedActivity !== 'All' && club.activity !== selectedActivity) return false
    if (selectedCity !== 'All' && club.city !== selectedCity) return false
    if (selectedPOC !== 'All' && club.poc !== selectedPOC) return false
    if (selectedHealth !== 'All' && club.health !== selectedHealth) return false
    return true
  })

  const activities = [...new Set(activityTargets.map(t => t.activity))]
  const cities = [...new Set(activityTargets.map(t => t.city))]
  const pocs = [...new Set([...activityTargets.map(t => t.poc), ...clubs.map(c => c.poc)])]

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading New Scaling Planner...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">New Scaling Planner</h1>
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
            {expandedMetric === 'revenue' && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="space-y-2 text-sm">
                  {(selectedPOC === 'All' ? activityTargets : activityTargets.filter(target => target.poc === selectedPOC)).map((target, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>{target.activity} • {target.area}</span>
                      <span className="font-medium">₹{(target.plannedRevenue / 100000).toFixed(1)}L</span>
                    </div>
                  ))}
                  {selectedPOC !== 'All' && activityTargets.filter(target => target.poc === selectedPOC).length === 0 && (
                    <div className="text-gray-500 text-center py-2">No targets for {selectedPOC}</div>
                  )}
                  {(selectedPOC === 'All' ? activityTargets : activityTargets.filter(target => target.poc === selectedPOC)).length > 0 && (
                    <div className="pt-2 border-t border-gray-100 flex justify-between font-medium">
                      <span>Total {selectedPOC !== 'All' ? `for ${selectedPOC}` : ''}</span>
                      <span>₹{(getMetrics().targetRevenue / 100000).toFixed(1)}L</span>
                    </div>
                  )}
                </div>
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
            {expandedMetric === 'meetups' && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="space-y-2 text-sm">
                  {(selectedPOC === 'All' ? activityTargets : activityTargets.filter(target => target.poc === selectedPOC)).length > 0 && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Existing Clubs</div>
                        <div className="font-medium">{(selectedPOC === 'All' ? activityTargets : activityTargets.filter(target => target.poc === selectedPOC)).reduce((sum, t) => sum + t.targetMeetupsExisting, 0)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">New Clubs</div>
                        <div className="font-medium">{(selectedPOC === 'All' ? activityTargets : activityTargets.filter(target => target.poc === selectedPOC)).reduce((sum, t) => sum + t.targetMeetupsNew, 0)}</div>
                      </div>
                    </div>
                  )}
                  <div className="pt-2 border-t border-gray-100">
                    {(selectedPOC === 'All' ? activityTargets : activityTargets.filter(target => target.poc === selectedPOC)).map((target, idx) => (
                      <div key={idx} className="flex justify-between py-1">
                        <span>{target.activity} • {target.area}</span>
                        <span className="font-medium">{target.targetMeetupsTotal} ({target.targetMeetupsExisting}+{target.targetMeetupsNew})</span>
                      </div>
                    ))}
                    {selectedPOC !== 'All' && activityTargets.filter(target => target.poc === selectedPOC).length === 0 && (
                      <div className="text-gray-500 text-center py-2">No targets for {selectedPOC}</div>
                    )}
                  </div>
                </div>
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
            {expandedMetric === 'newclubs' && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="space-y-2 text-sm">
                  <div className="text-xs text-gray-500 mb-2">New Clubs by Activity & Area:</div>
                  {(selectedPOC === 'All' ? activityTargets : activityTargets.filter(target => target.poc === selectedPOC)).map((target, idx) => (
                    <div key={idx} className="flex justify-between py-1">
                      <span>{target.activity} • {target.area}, {target.city}</span>
                      <span className="font-medium bg-orange-100 text-orange-700 px-2 py-1 rounded text-xs">
                        {target.newClubsNeeded} new clubs
                      </span>
                    </div>
                  ))}
                  {selectedPOC !== 'All' && activityTargets.filter(target => target.poc === selectedPOC).length === 0 && (
                    <div className="text-gray-500 text-center py-2">No targets for {selectedPOC}</div>
                  )}
                  {(selectedPOC === 'All' ? activityTargets : activityTargets.filter(target => target.poc === selectedPOC)).length > 0 && (
                    <div className="pt-2 border-t border-gray-100 flex justify-between font-medium">
                      <span>Total Launch Required {selectedPOC !== 'All' ? `for ${selectedPOC}` : ''}</span>
                      <span>{getMetrics().newClubsNeeded} clubs</span>
                    </div>
                  )}
                </div>
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
                  Area Targets
                </button>
                <button
                  onClick={() => setViewMode('clubs')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'clubs' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Club Details
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
          /* Area Targets View */
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Activity & Location
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Meetup Targets
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Revenue Target
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Progress
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      New Clubs to Launch
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredTargets.map((target) => (
                    <tr key={target.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{target.activity}</div>
                          <div className="text-sm text-gray-500">
                            <MapPin className="h-3 w-3 inline mr-1" />
                            {target.area}, {target.city}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          <div>Total: {target.targetMeetupsTotal}</div>
                          <div className="text-xs text-gray-500">
                            Existing: {target.targetMeetupsExisting} | New: {target.targetMeetupsNew}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">₹{(target.plannedRevenue / 100000).toFixed(1)}L</div>
                        <div className="text-xs text-gray-500">Current: ₹{(target.currentRevenue / 100000).toFixed(1)}L</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${Math.min(100, (target.currentMeetups / target.targetMeetupsTotal) * 100)}%` }}
                          ></div>
                        </div>
                        <div className="text-xs text-gray-600">{target.currentMeetups}/{target.targetMeetupsTotal} meetups</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-700`}>
                          {target.newClubsNeeded} new clubs
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(target.status)}`}>
                          {target.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => setEditingTarget(target.id)}
                          className="text-blue-600 hover:text-blue-900 mr-4"
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                        <button className="text-gray-600 hover:text-gray-900">
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : viewMode === 'clubs' ? (
          /* Club Details View */
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

            {/* Current Status vs Target for New Clubs */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">New Club Performance vs Targets</h3>
                <p className="text-sm text-gray-500 mt-1">Track how new clubs are performing against their targets</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Club & Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Meetups Progress
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Revenue Progress
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Target Achievement
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Launch Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {clubs.filter(c => c.isNewClub).map((club) => {
                      const meetupProgress = club.targetMeetups > 0 ? (club.currentMeetups / club.targetMeetups) * 100 : 0
                      const revenueProgress = club.targetRevenue > 0 ? (club.currentRevenue / club.targetRevenue) * 100 : 0
                      const overallProgress = (meetupProgress + revenueProgress) / 2

                      return (
                        <tr key={club.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900">{club.name}</div>
                              <div className="text-sm text-gray-500">{club.activity} • {club.area}, {club.city}</div>
                              <span className={`mt-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                club.launchStatus === 'planned'
                                  ? 'bg-orange-100 text-orange-800'
                                  : club.launchStatus === 'launched'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}>
                                {club.launchStatus === 'planned' ? 'Planning' :
                                 club.launchStatus === 'launched' ? 'Launched' : club.launchStatus}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {club.currentMeetups}/{club.targetMeetups} meetups
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                              <div
                                className={`h-2 rounded-full ${
                                  meetupProgress >= 80 ? 'bg-green-500' :
                                  meetupProgress >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${Math.min(100, meetupProgress)}%` }}
                              />
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {meetupProgress.toFixed(0)}% achieved
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              ₹{(club.currentRevenue / 1000).toFixed(0)}K / ₹{(club.targetRevenue / 1000).toFixed(0)}K
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                              <div
                                className={`h-2 rounded-full ${
                                  revenueProgress >= 80 ? 'bg-green-500' :
                                  revenueProgress >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${Math.min(100, revenueProgress)}%` }}
                              />
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {revenueProgress.toFixed(0)}% achieved
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              overallProgress >= 80 ? 'bg-green-100 text-green-800' :
                              overallProgress >= 60 ? 'bg-yellow-100 text-yellow-800' :
                              overallProgress >= 40 ? 'bg-orange-100 text-orange-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {overallProgress.toFixed(0)}% Overall
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {overallProgress >= 80 ? 'On Track' :
                               overallProgress >= 60 ? 'Good Progress' :
                               overallProgress >= 40 ? 'Needs Attention' : 'Behind Target'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {club.launchStatus === 'planned'
                              ? club.plannedLaunchDate || 'Not set'
                              : club.launchDate || 'N/A'}
                          </td>
                        </tr>
                      )
                    })}
                    {clubs.filter(c => c.isNewClub).length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                          No new clubs to track
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Clubs to Launch Section */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Clubs Ready for Launch</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Club & Location
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Launch Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Milestones
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Planned Launch Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {getNewClubsToLaunch().map((club) => (
                      <tr key={club.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{club.name}</div>
                            <div className="text-sm text-gray-500">
                              <MapPin className="h-3 w-3 inline mr-1" />
                              {club.area}, {club.city} • {club.activity}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            club.launchStatus === 'planned'
                              ? 'bg-orange-100 text-orange-800'
                              : club.launchStatus === 'in_progress'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {club.launchStatus === 'planned' ? 'Ready to Launch' :
                             club.launchStatus === 'in_progress' ? 'Launch in Progress' : 'Launched'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex space-x-1">
                            {Object.entries(club.launchMilestones).map(([milestone, completed]) => (
                              <div
                                key={milestone}
                                className={`w-3 h-3 rounded-full ${
                                  completed ? 'bg-green-500' : 'bg-gray-300'
                                }`}
                                title={milestone}
                              />
                            ))}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {Object.values(club.launchMilestones).filter(Boolean).length}/{Object.keys(club.launchMilestones).length} completed
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {club.plannedLaunchDate || 'Not set'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => markClubAsLaunched(club.id)}
                            className="text-green-600 hover:text-green-900 mr-3"
                          >
                            Mark as Launched
                          </button>
                        </td>
                      </tr>
                    ))}
                    {getNewClubsToLaunch().length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                          No clubs ready for launch
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recently Launched Clubs Section */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Recently Launched Clubs</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Club & Location
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Launch Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Current Performance
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Health Score
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {getRecentlyLaunchedClubs().map((club) => (
                      <tr key={club.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{club.name}</div>
                            <div className="text-sm text-gray-500">
                              <MapPin className="h-3 w-3 inline mr-1" />
                              {club.area}, {club.city} • {club.activity}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {club.launchDate}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div>
                            <div>{club.currentMeetups} meetups</div>
                            <div className="text-gray-500">₹{(club.currentRevenue / 1000).toFixed(0)}K revenue</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className={`w-3 h-3 rounded-full mr-2 ${
                              club.health === 'green' ? 'bg-green-500' :
                              club.health === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'
                            }`} />
                            <span className="text-sm text-gray-900">{club.healthScore}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {getRecentlyLaunchedClubs().length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                          No recently launched clubs
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
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
      </div>
    </div>
  )
}