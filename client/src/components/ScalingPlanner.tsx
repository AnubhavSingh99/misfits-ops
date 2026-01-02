import React, { useState, useEffect } from 'react'
import { Plus, Filter, Target, MapPin, Building2, TrendingUp, Users, ArrowUp, ArrowDown, Settings, Eye, User, Calendar, MessageSquare, CheckSquare, EyeOff, Clock, CheckCircle, AlertCircle, Play, ChevronDown, ChevronRight } from 'lucide-react'
import { getActivities, getCities } from '../services/api'
import ScalingTargets from './ScalingTargets'

// API URL constant for all functions to use
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001'

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
  id: number
  name: string
  poc_type: string
  activities: string[]
  cities: string[]
  team_name: string
  is_active: boolean
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
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  // Filter states
  const [selectedActivity, setSelectedActivity] = useState('All')
  const [selectedArea, setSelectedArea] = useState('All')
  const [selectedCity, setSelectedCity] = useState('All')
  const [selectedStatus, setSelectedStatus] = useState('All')
  const [selectedPOC, setSelectedPOC] = useState('All')
  const [selectedHealth, setSelectedHealth] = useState('All')
  const [viewMode, setViewMode] = useState<'clubs' | 'launch_tracking' | 'target_management'>('target_management')

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

  // State to store calculated metrics
  const [metrics, setMetrics] = useState({
    targetRevenue: 0,
    targetMeetups: 0,
    newClubsNeeded: 0,
    currentRevenue: 0,
    currentMeetups: 0,
    currentNewClubs: 0
  })

  // Calculate metrics from API data with timeout and duplicate call prevention
  const calculateMetrics = async () => {
    const operationId = 'calculateMetrics'

    // Prevent duplicate calls
    if (loadingTimeouts.has(operationId)) {
      console.log('⚠️ calculateMetrics already in progress, skipping...')
      return
    }

    setLoadingTimeouts(prev => new Set(prev).add(operationId))
    console.log('🔍 Starting calculateMetrics...')

    // Create abort controller for this operation
    const controller = new AbortController()
    setAbortControllers(prev => {
      const newMap = new Map(prev)
      newMap.set(operationId, controller)
      return newMap
    })

    // Set timeout for the entire operation
    const timeoutId = setTimeout(() => {
      console.log('⏰ calculateMetrics timeout, aborting...')
      controller.abort()
    }, 30000) // 30 second timeout

    try {

      // Get system state to match main dashboard's target revenue
      const { default: RealDataService } = await import('../services/realDataService')
      const systemState = await RealDataService.getSystemState()
      console.log('🔍 System state:', systemState)

      // Fetch existing clubs data from the scaling planner UI source
      console.log('🔍 Fetching clubs from scaling UI:', `${API_URL}/api/clubs`)
      let clubsData = null
      try {
        const clubsResponse = await fetch(`${API_URL}/api/clubs`, {
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000 // 15 second timeout for individual request
        })

        if (controller.signal.aborted) {
          throw new Error('Request was aborted')
        }

        clubsData = await clubsResponse.json()
        console.log('🔍 Clubs response (UI source):', clubsData)
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log('🛑 Clubs API request was aborted')
          return // Exit early on abort
        }
        console.error('❌ Clubs API failed:', error)
        clubsData = { success: false, error: error.message }
      }

      // Fetch planned launches data
      console.log('🔍 Fetching launches from:', `${API_URL}/api/scaling/planned-launches`)
      let launchesData = null
      try {
        const launchesResponse = await fetch(`${API_URL}/api/scaling/planned-launches`, {
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000 // 15 second timeout
        })

        if (controller.signal.aborted) {
          throw new Error('Request was aborted')
        }

        launchesData = await launchesResponse.json()
        console.log('🔍 Launches response:', launchesData)
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log('🛑 Launches API request was aborted')
          return // Exit early on abort
        }
        console.error('❌ Launches API failed:', error)
        launchesData = { success: false, error: error.message }
      }

      // Calculate metrics from real API data
      let currentRevenue = 0, currentMeetups = 0
      let targetRevenue = 0, targetMeetups = 0, newClubsNeeded = 0

      if (clubsData && clubsData.success && clubsData.clubs) {
        // Get current and target data from existing clubs (UI source should have ₹0 targets if not set)
        clubsData.clubs.forEach((club: any) => {
          currentRevenue += club.current_revenue || 0
          currentMeetups += club.current_meetups || 0
          targetRevenue += club.target_revenue || 0
          targetMeetups += club.target_meetups || 0
        })
        console.log('🔍 From existing clubs (UI source):', { currentRevenue, currentMeetups, targetRevenue, targetMeetups, clubCount: clubsData.clubs.length })
      } else {
        console.warn('⚠️  Clubs API failed, using planned launches only')
      }

      if (launchesData && launchesData.success) {
        // ADD planned launch targets to existing club targets
        launchesData.launches.forEach((launch: any) => {
          targetRevenue += launch.target_revenue_monthly_rupees || 0
          targetMeetups += launch.target_meetups_monthly || 0
          newClubsNeeded += launch.number_of_clubs || 0
        })
        console.log('🔍 Adding planned launches to existing targets:', {
          totalTargetRevenue: targetRevenue,
          totalTargetMeetups: targetMeetups,
          totalNewClubsNeeded: newClubsNeeded,
          launchCount: launchesData.launches.length
        })
      }

      // Final calculation: existing club targets + planned launch targets
      const finalTargetRevenue = targetRevenue  // Sum of existing + launches
      const finalTargetMeetups = targetMeetups   // Sum of existing + launches

      console.log('🔍 Using system state target revenue:', finalTargetRevenue)
      console.log('🔍 Using target meetups:', finalTargetMeetups)
      console.log('🔍 Current revenue from system state:', systemState.current_revenue || 0)
      console.log('🔍 Current meetups calculated:', currentMeetups)

      const finalMetrics = {
        targetRevenue: finalTargetRevenue,
        targetMeetups: finalTargetMeetups,
        newClubsNeeded,
        currentRevenue: systemState.current_revenue || 0,
        currentMeetups: systemState.active_meetups || currentMeetups,
        currentNewClubs: 0 // New clubs haven't been launched yet
      }

      console.log('🔍 Final calculated metrics:', finalMetrics)
      setMetrics(finalMetrics)
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('🛑 calculateMetrics was aborted')
        return // Don't update state on abort
      }
      console.error('❌ Error fetching metrics data:', error)
      setMetrics({
        targetRevenue: 0,
        targetMeetups: 0,
        newClubsNeeded: 0,
        currentRevenue: 0,
        currentMeetups: 0,
        currentNewClubs: 0
      })
    } finally {
      clearTimeout(timeoutId)
      setLoadingTimeouts(prev => {
        const newSet = new Set(prev)
        newSet.delete(operationId)
        return newSet
      })
      setAbortControllers(prev => {
        const newMap = new Map(prev)
        newMap.delete(operationId)
        return newMap
      })
    }
  }

  // Get metrics function for compatibility
  const getMetrics = () => metrics

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

  // Fetch POC data from POC management with timeout handling
  useEffect(() => {
    const fetchPOCData = async () => {
      const operationId = 'fetchPOCData'

      // Prevent duplicate calls
      if (loadingTimeouts.has(operationId)) {
        console.log('⚠️ fetchPOCData already in progress, skipping...')
        return
      }

      setLoadingTimeouts(prev => new Set(prev).add(operationId))
      setPocLoading(true)

      // Create abort controller
      const controller = new AbortController()
      setAbortControllers(prev => {
        const newMap = new Map(prev)
        newMap.set(operationId, controller)
        return newMap
      })

      // Set timeout
      const timeoutId = setTimeout(() => {
        console.log('⏰ fetchPOCData timeout, aborting...')
        controller.abort()
      }, 15000) // 15 second timeout

      // Fallback POC data - set immediately to ensure dropdown always has data
      const fallbackPOCs = [
        { id: 6, name: 'Chaitanya', poc_type: 'city_head', activities: [], cities: ['Gurgaon', 'Faridabad', 'Noida'], team_name: 'Team Blue', is_active: true },
        { id: 4, name: 'Saurabh', poc_type: 'activity_head', activities: [], cities: [], team_name: 'Team green', is_active: true }
      ]

      // Set fallback data FIRST to ensure dropdown always has options
      console.log('🔧 Setting initial fallback POC data...')
      setPocData(fallbackPOCs)

      try {
        console.log('🔍 API_URL value:', API_URL)
        const apiUrl = `${API_URL}/api/poc/list?_t=${Date.now()}`
        console.log('🔍 Full API URL:', apiUrl)
        console.log('🔍 Starting POC data fetch...')

        const response = await fetch(apiUrl, {
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' }
        })
        console.log('POC API response status:', response.status, response.statusText)

        if (response.ok) {
          const data = await response.json()
          console.log('Raw POC API response data:', data)

          // Filter only active POCs
          const activePOCs = data.filter((poc: POCData) => poc.is_active)
          if (activePOCs.length > 0) {
            setPocData(activePOCs)
            console.log('✅ Successfully fetched POC data:', activePOCs)
            console.log('✅ POC names:', activePOCs.map(p => p.name))
          } else {
            console.warn('No active POCs found, using fallback data')
            setPocData(fallbackPOCs)
          }
        } else {
          const errorData = await response.json()
          console.error('Failed to fetch POC data:', errorData.error)
          console.log('⚠️  Setting fallback POC data due to API error...')
          setPocData(fallbackPOCs)
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log('🛑 fetchPOCData was aborted')
          return // Don't update state on abort
        }
        console.error('❌ Error fetching POC data:', error)
        console.error('API URL used:', `${API_URL}/api/poc/list?_t=${Date.now()}`)
        console.log('⚠️  Setting fallback POC data due to fetch error...')
        setPocData(fallbackPOCs)
      } finally {
        clearTimeout(timeoutId)
        setPocLoading(false)
        setLoadingTimeouts(prev => {
          const newSet = new Set(prev)
          newSet.delete(operationId)
          return newSet
        })
        setAbortControllers(prev => {
          const newMap = new Map(prev)
          newMap.delete(operationId)
          return newMap
        })
      }
    }

    fetchPOCData()
  }, [])

  // Fetch cities from database on component mount with timeout
  useEffect(() => {
    const fetchCities = async () => {
      const operationId = 'fetchCities'

      // Prevent duplicate calls
      if (loadingTimeouts.has(operationId)) {
        console.log('⚠️ fetchCities already in progress, skipping...')
        return
      }

      setLoadingTimeouts(prev => new Set(prev).add(operationId))
      setCitiesLoading(true)

      const controller = new AbortController()
      setAbortControllers(prev => {
        const newMap = new Map(prev)
        newMap.set(operationId, controller)
        return newMap
      })

      const timeoutId = setTimeout(() => {
        console.log('⏰ fetchCities timeout, aborting...')
        controller.abort()
      }, 15000)

      try {
        const cities = await getCities()
        if (!controller.signal.aborted) {
          setDatabaseCities(cities)
          console.log('Fetched cities:', cities)
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log('🛑 fetchCities was aborted')
          return
        }
        console.error('Error fetching cities:', error)
      } finally {
        clearTimeout(timeoutId)
        setCitiesLoading(false)
        setLoadingTimeouts(prev => {
          const newSet = new Set(prev)
          newSet.delete(operationId)
          return newSet
        })
        setAbortControllers(prev => {
          const newMap = new Map(prev)
          newMap.delete(operationId)
          return newMap
        })
      }
    }

    fetchCities()
  }, [])

  // Fetch all areas from database on component mount with timeout
  useEffect(() => {
    const fetchAllAreas = async () => {
      const operationId = 'fetchAllAreas'

      // Prevent duplicate calls
      if (loadingTimeouts.has(operationId)) {
        console.log('⚠️ fetchAllAreas already in progress, skipping...')
        return
      }

      setLoadingTimeouts(prev => new Set(prev).add(operationId))
      setAreasLoading(true)

      const controller = new AbortController()
      setAbortControllers(prev => {
        const newMap = new Map(prev)
        newMap.set(operationId, controller)
        return newMap
      })

      const timeoutId = setTimeout(() => {
        console.log('⏰ fetchAllAreas timeout, aborting...')
        controller.abort()
      }, 15000)

      try {
        const response = await fetch(`${API_URL}/api/scaling/areas?_t=${Date.now()}`, {
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' }
        })

        if (controller.signal.aborted) {
          throw new Error('Request was aborted')
        }

        const data = await response.json()

        if (data.success) {
          if (!controller.signal.aborted) {
            setDatabaseAreas(data.areas)
            console.log('Fetched all areas:', data.areas)
          }
        } else {
          console.error('Failed to fetch areas:', data.error)
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log('🛑 fetchAllAreas was aborted')
          return
        }
        console.error('Error fetching areas:', error)
      } finally {
        clearTimeout(timeoutId)
        setAreasLoading(false)
        setLoadingTimeouts(prev => {
          const newSet = new Set(prev)
          newSet.delete(operationId)
          return newSet
        })
        setAbortControllers(prev => {
          const newMap = new Map(prev)
          newMap.delete(operationId)
          return newMap
        })
      }
    }

    fetchAllAreas()
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

  // Fetch real data from API with timeout and duplicate prevention
  useEffect(() => {
    const fetchData = async () => {
      const operationId = 'fetchMainData'

      // Prevent duplicate calls
      if (isLoadingData || loadingTimeouts.has(operationId)) {
        console.log('⚠️ fetchData already in progress, skipping...')
        return
      }

      setIsLoadingData(true)
      setLoadingTimeouts(prev => new Set(prev).add(operationId))
      setLoading(true)

      const controller = new AbortController()
      setAbortControllers(prev => {
        const newMap = new Map(prev)
        newMap.set(operationId, controller)
        return newMap
      })

      const timeoutId = setTimeout(() => {
        console.log('⏰ fetchData timeout, aborting...')
        controller.abort()
      }, 30000) // 30 second timeout for main data fetch

      try {
        // Fetch real clubs data from database
        const clubsResponse = await fetch(`${API_URL}/api/clubs`, {
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' }
        })

        if (controller.signal.aborted) {
          throw new Error('Request was aborted')
        }

        const clubsData = await clubsResponse.json()

        if (clubsData.success) {
          // Transform real club data to match our interface
          const transformedClubs: ClubData[] = clubsData.data.map((club: any) => {
            return addLaunchTrackingDefaults({
              id: club.id || club.uuid,
              name: club.name,
              activity: club.activity || 'Unknown',
              city: club.city || 'Unknown',
              area: club.area || 'Unknown',
              revenueType: club.recentEvents > 5 ? 'scaling' : 'old_stable',
              scalingStage: club.recentEvents > 10 ? 'scaling_picked_stage3' : 'scaling_picked_started',
              currentMeetups: club.recentEvents || 0,
              currentRevenue: club.recentRevenue || 0, // Using recentRevenue from API response
              targetMeetups: Math.max((club.recentEvents || 0) + 5, 10),
              targetRevenue: Math.max((club.recentRevenue || 0) + 50000, 200000),
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

          if (!controller.signal.aborted) {
            setClubs(transformedClubs)
          } else {
            console.log('🛑 Skipping setClubs due to abort')
            return
          }

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
            const totalCurrentRevenue = clubs.reduce((sum: number, club: ClubData) => sum + club.currentRevenue, 0)

            // Special handling for Badminton with user-specified targets
            let targetMeetups, plannedRevenue, newClubsNeeded
            if (group.activity === 'Badminton') {
              targetMeetups = 40  // User-specified target
              plannedRevenue = 170000  // User-specified revenue target
              newClubsNeeded = 4  // User-specified new clubs needed
            } else {
              targetMeetups = Math.max(totalCurrentMeetups * 1.2, 20)
              plannedRevenue = Math.round(targetMeetups * 4000) // More realistic ₹4K per meetup
              newClubsNeeded = Math.max(Math.round((targetMeetups - totalCurrentMeetups) / 8), 0)
            }

            return {
              id: `target-${index}`,
              activity: group.activity,
              city: group.city,
              area: group.area,
              targetMeetupsTotal: Math.round(targetMeetups),
              targetMeetupsExisting: totalCurrentMeetups,
              targetMeetupsNew: Math.round(targetMeetups - totalCurrentMeetups),
              plannedRevenue: plannedRevenue,
              currentRevenue: totalCurrentRevenue,
              currentMeetups: totalCurrentMeetups,
              existingClubs: clubs.filter((club: ClubData) => !club.isNewClub).length,
              newClubsNeeded: newClubsNeeded,
              status: totalCurrentMeetups >= targetMeetups * 0.8 ? 'on_track' :
                      totalCurrentMeetups >= targetMeetups * 0.6 ? 'at_risk' : 'behind',
              lastUpdated: new Date().toISOString().split('T')[0],
              poc: 'Chaitanya',
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

          if (!controller.signal.aborted) {
            setActivityTargets(generatedTargets)
          }
        } else {
          console.error('Failed to fetch clubs:', clubsData.error)
          // Fallback to empty data
          if (!controller.signal.aborted) {
            setClubs([])
            setActivityTargets([])
          }
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log('🛑 fetchData was aborted')
          return
        }
        console.error('Error fetching scaling data:', error)
        // Fallback to empty data
        setClubs([])
        setActivityTargets([])
      } finally {
        clearTimeout(timeoutId)
        setLoading(false)
        setIsLoadingData(false)
        setLastUpdated(new Date())
        setLoadingTimeouts(prev => {
          const newSet = new Set(prev)
          newSet.delete(operationId)
          return newSet
        })
        setAbortControllers(prev => {
          const newMap = new Map(prev)
          newMap.delete(operationId)
          return newMap
        })
      }
    }

    fetchData()
  }, [])

  // Separate useEffect for metrics calculation - only run once on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      calculateMetrics()
    }, 1000) // Small delay to prevent immediate duplicate calls

    return () => clearTimeout(timer)
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

  // State for API call management
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [loadingTimeouts, setLoadingTimeouts] = useState<Set<string>>(new Set())
  const [abortControllers, setAbortControllers] = useState<Map<string, AbortController>>(new Map())

  // Fetch activities from database with timeout
  useEffect(() => {
    const fetchActivities = async () => {
      const operationId = 'fetchActivities'

      // Prevent duplicate calls
      if (loadingTimeouts.has(operationId)) {
        console.log('⚠️ fetchActivities already in progress, skipping...')
        return
      }

      setLoadingTimeouts(prev => new Set(prev).add(operationId))

      const controller = new AbortController()
      setAbortControllers(prev => {
        const newMap = new Map(prev)
        newMap.set(operationId, controller)
        return newMap
      })

      const timeoutId = setTimeout(() => {
        console.log('⏰ fetchActivities timeout, aborting...')
        controller.abort()
      }, 15000)

      try {
        const activities = await getActivities()
        if (!controller.signal.aborted) {
          setDatabaseActivities(activities)
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log('🛑 fetchActivities was aborted')
          return
        }
        console.error('Error fetching activities:', error)
      } finally {
        clearTimeout(timeoutId)
        setLoadingTimeouts(prev => {
          const newSet = new Set(prev)
          newSet.delete(operationId)
          return newSet
        })
        setAbortControllers(prev => {
          const newMap = new Map(prev)
          newMap.delete(operationId)
          return newMap
        })
      }
    }

    fetchActivities()
  }, [])

  // Get filter options from production database and POC management
  const activities = [...new Set([
    ...activityTargets.map(t => t.activity),
    ...databaseActivities.map(a => a.name)
  ])]
  const areas = [...new Set(databaseAreas.map(a => a.name))]
  const cities = [...new Set(databaseCities.map(c => c.name))]
  const pocs = [...new Set(pocData.map(p => p.name))]

  // Debug POC data
  console.log('🔍 Current pocData state:', pocData)
  console.log('🔍 Extracted pocs for dropdown:', pocs)
  console.log('🔍 POC data length:', pocData.length)
  console.log('🔍 Raw POC names from pocData:', pocData.map(p => ({ id: p.id, name: p.name })))
  console.log('Extracted pocs array:', pocs)

  // Cleanup abort controllers on unmount
  useEffect(() => {
    return () => {
      // Abort all pending requests on unmount
      abortControllers.forEach((controller) => {
        controller.abort()
      })
      setAbortControllers(new Map())
      setLoadingTimeouts(new Set())
    }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading Misfits Operations...
          {loadingTimeouts.size > 0 && (
            <div className="text-sm text-gray-500 mt-2">
              Active operations: {Array.from(loadingTimeouts).join(', ')}
            </div>
          )}
        </div>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">

          <div className="bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setExpandedMetric(expandedMetric === 'revenue' ? null : 'revenue')}>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <TrendingUp className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Target Revenue</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ₹{(getMetrics().targetRevenue / 100000).toFixed(1)}L
                  </p>
                  <p className="text-xs text-gray-500">
                    {getMetrics().targetRevenue > 0
                      ? Math.round((getMetrics().currentRevenue / getMetrics().targetRevenue) * 100)
                      : 0}% complete
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
                  <p className="text-xs text-gray-500">
                    {getMetrics().targetMeetups > 0
                      ? Math.round((getMetrics().currentMeetups / getMetrics().targetMeetups) * 100)
                      : 0}% complete
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
                  <p className="text-xs text-gray-500">
                    {getMetrics().newClubsNeeded > 0
                      ? Math.round((getMetrics().currentNewClubs / getMetrics().newClubsNeeded) * 100)
                      : 0}% complete
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
                  onClick={() => setViewMode('target_management')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'target_management' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Target Management
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
        {viewMode === 'launch_tracking' ? (
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
        ) : viewMode === 'target_management' ? (
          /* Target Management View */
          <ScalingTargets />
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