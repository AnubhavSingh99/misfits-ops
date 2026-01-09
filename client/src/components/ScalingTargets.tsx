import React, { useState, useEffect } from 'react'
import { Plus, Target, TrendingUp, Users, ChevronDown, ChevronRight, Calendar, MapPin, Settings, Edit2, Save, X, Filter, Info, Activity, Zap, MessageCircle, Eye, Clock } from 'lucide-react'

const API_BASE = process.env.NODE_ENV === 'production' ? 'https://api.misfits.net.in' : 'http://localhost:5001'

// Types for the scaling targets system
interface ActivityTarget {
  activity_name: string
  activity_id: number

  // Current metrics from production
  current_meetups_week: number
  current_meetups_month: number
  current_revenue_rupees: number
  active_clubs_count: number
  total_events: number

  // Target metrics from local database
  target_meetups_existing: number
  target_revenue_existing_rupees: number
  target_meetups_new: number
  target_revenue_new_rupees: number
  total_target_meetups: number
  total_target_revenue_rupees: number

  targets_last_updated: string | null
}

interface ClubTarget {
  club_id: string
  club_pk: number
  club_name: string
  status: string
  city: string
  area: string

  // Current metrics
  current_meetups: number
  current_revenue_rupees: number
  total_events: number

  // Target data
  target_meetups: number
  target_revenue_rupees: number

  // New club tracking
  is_new_club: boolean
  launch_date: string | null
  created_at: string
  is_recently_created: boolean

  // Scaling stage
  scaling_stage?: 'not_picked' | 'picked_started' | 'picked_stage1' | 'picked_stage2' | 'picked_stage3' | 'picked_stage4' | 'realised'
}

interface NewClubLaunch {
  id: number
  activity_name: string
  planned_club_name: string | null
  planned_city: string | null
  planned_area: string | null
  planned_launch_date: string | null
  target_meetups: number
  target_revenue_rupees: number
  launch_status: string
  number_of_clubs: number
  launch_sequence?: number // Club 1, 2, 3, etc.
  total_launches?: number // Total planned in this batch
  launch_batch_id?: string // Groups related launches
  milestones: any
}

interface EditingTarget {
  activityName: string
  field: string
  value: number
}

interface FilterOptions {
  activity: string
  area: string
  city: string
  poc: string
  status: string
  dateFrom: string
  dateTo: string
}

interface WowComment {
  id: number
  club_type: 'existing' | 'planned'
  club_id: number
  activity_name: string
  club_name: string
  week_start: string
  week_label: string
  comment: string
  created_at: string
  updated_at?: string
  created_by: string
}

export default function ScalingTargets() {
  // State for activity-level data
  const [activities, setActivities] = useState<ActivityTarget[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Drill-down state
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null)
  const [clubs, setClubs] = useState<ClubTarget[]>([])
  const [newLaunches, setNewLaunches] = useState<NewClubLaunch[]>([])
  const [loadingNewLaunches, setLoadingNewLaunches] = useState(false)
  const [showNewLaunchModal, setShowNewLaunchModal] = useState(false)
  const [expandedLaunchGroups, setExpandedLaunchGroups] = useState<Set<string>>(new Set())
  const [newLaunchForm, setNewLaunchForm] = useState({
    activity_name: '',
    planned_city_id: '',
    planned_city_name: '',
    planned_area_id: '',
    planned_area_name: '',
    number_of_clubs: 1,
    target_meetups: 0,
    target_revenue_rupees: 0
  })
  const [cities, setCities] = useState<Array<{id: number, name: string, state: string}>>([])
  const [areas, setAreas] = useState<Array<{id: number, name: string}>>([])
  const [loadingCities, setLoadingCities] = useState(false)
  const [loadingAreas, setLoadingAreas] = useState(false)
  const [clubsLoading, setClubsLoading] = useState(false)

  // Editing state
  const [editingTarget, setEditingTarget] = useState<EditingTarget | null>(null)
  const [showNewLaunchForm, setShowNewLaunchForm] = useState<string | null>(null)

  // Edit planned launch modal state
  const [showEditLaunchModal, setShowEditLaunchModal] = useState(false)
  const [editingLaunch, setEditingLaunch] = useState<NewClubLaunch | null>(null)
  const [editLaunchForm, setEditLaunchForm] = useState({
    city_name: '',
    area_name: '',
    target_launch_date: '',
    target_meetups_monthly: 0,
    target_revenue_monthly_rupees: 0,
    launch_status: 'not_picked',
    notes: ''
  })

  // Filter state
  const [filters, setFilters] = useState<FilterOptions>({
    activity: '',
    area: '',
    city: '',
    poc: '',
    status: '',
    dateFrom: '',
    dateTo: ''
  })

  // WoW comments state
  const [showWowModal, setShowWowModal] = useState(false)
  const [wowClubData, setWowClubData] = useState<{
    clubType: 'existing' | 'planned'
    clubId: number
    clubName: string
    activityName: string
  } | null>(null)
  const [wowComments, setWowComments] = useState<WowComment[]>([])
  const [newWowComment, setNewWowComment] = useState('')
  const [selectedWeekStart, setSelectedWeekStart] = useState('')
  const [filterData, setFilterData] = useState<{
    activities: string[]
    areas: string[]
    cities: string[]
    pocs: string[]
    statuses: string[]
  }>({
    activities: [],
    areas: [],
    cities: [],
    pocs: [],
    statuses: []
  })


  // Load activity-level targets
  const loadActivities = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/targets/activities')
      const data = await response.json()

      if (data.success) {
        setActivities(data.activities)
        // Extract filter options from the data
        const activities = [...new Set(data.activities.map((a: ActivityTarget) => a.activity_name))]
        setFilterData(prev => ({
          ...prev,
          activities,
          statuses: ['ACTIVE', 'INACTIVE']
        }))
      } else {
        setError(data.error || 'Failed to load activities')
      }
    } catch (err) {
      setError('Failed to connect to server')
      console.error('Error loading activities:', err)
    } finally {
      setLoading(false)
    }
  }

  // Load filter data from clubs
  const loadFilterData = async () => {
    try {
      const response = await fetch('/api/targets/filter-options')
      const data = await response.json()

      if (data.success) {
        setFilterData(data.filters)
      }
    } catch (err) {
      console.error('Error loading filter data:', err)
    }
  }

  // Load club-level details for an activity
  const loadActivityDetails = async (activityName: string) => {
    try {
      setClubsLoading(true)

      // Load existing clubs
      const clubsResponse = await fetch(`/api/targets/activities/${encodeURIComponent(activityName)}/clubs`)
      const clubsData = await clubsResponse.json()

      if (clubsData.success) {
        setClubs(clubsData.existing_clubs)
      }

      // Load planned launches for this activity
      await loadPlannedLaunches(activityName)

    } catch (err) {
      console.error('Error loading activity details:', err)
    } finally {
      setClubsLoading(false)
    }
  }

  // Update activity-level targets
  const updateActivityTarget = async (activityName: string, field: string, value: number) => {
    try {
      const activity = activities.find(a => a.activity_name === activityName)
      if (!activity) return

      const payload = {
        target_meetups_existing: activity.target_meetups_existing,
        target_revenue_existing_rupees: activity.target_revenue_existing_rupees,
        target_meetups_new: activity.target_meetups_new,
        target_revenue_new_rupees: activity.target_revenue_new_rupees,
        [field]: value
      }

      const response = await fetch(`/api/targets/activities/${encodeURIComponent(activityName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (data.success) {
        // Reload activities to get updated totals
        await loadActivities()
      } else {
        alert('Failed to update target: ' + data.error)
      }
    } catch (err) {
      alert('Failed to update target')
      console.error('Error updating target:', err)
    }
  }

  // Update club-level targets
  const updateClubTarget = async (clubId: string, field: string, value: number) => {
    try {
      const club = clubs.find(c => c.club_id === clubId)
      if (!club || !selectedActivity) return

      const payload = {
        club_name: club.club_name,
        activity_name: selectedActivity,
        target_meetups: field === 'target_meetups' ? value : club.target_meetups,
        target_revenue_rupees: field === 'target_revenue_rupees' ? value : club.target_revenue_rupees,
        is_new_club: club.is_new_club
      }

      const response = await fetch(`/api/targets/clubs/${clubId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (data.success) {
        // Reload both activities and club details to update calculations
        await Promise.all([
          loadActivities(),
          loadActivityDetails(selectedActivity)
        ])
      }
    } catch (err) {
      console.error('Error updating club target:', err)
    }
  }

  // Filter functions
  const applyFilters = (activityList: ActivityTarget[]) => {
    return activityList.filter(activity => {
      if (filters.activity && activity.activity_name !== filters.activity) return false
      // Add more filter logic as needed
      return true
    })
  }

  const resetFilters = () => {
    setFilters({
      activity: '',
      area: '',
      city: '',
      poc: '',
      status: '',
      dateFrom: '',
      dateTo: ''
    })
  }

  // Group launches by city + area + activity for progress tracking
  const groupedLaunches = () => {
    const groups: { [key: string]: {
      city: string,
      area: string,
      activity: string,
      total_planned: number,
      launched_count: number,
      target_launch_date: string | null,
      target_meetups_total: number,
      target_revenue_total: number,
      launches: NewClubLaunch[],
      overall_status: string
    }} = {}

    newLaunches.forEach(launch => {
      const key = `${launch.planned_city}_${launch.planned_area}_${launch.activity_name}`

      if (!groups[key]) {
        groups[key] = {
          city: launch.planned_city || '',
          area: launch.planned_area || '',
          activity: launch.activity_name,
          total_planned: 0,
          launched_count: 0,
          target_launch_date: launch.planned_launch_date,
          target_meetups_total: 0,
          target_revenue_total: 0,
          launches: [],
          overall_status: 'not_picked'
        }
      }

      groups[key].total_planned += 1
      groups[key].target_meetups_total += launch.target_meetups
      groups[key].target_revenue_total += launch.target_revenue_rupees
      groups[key].launches.push(launch)

      // Count launched clubs (stage 3 or realised status)
      if (launch.launch_status === 'picked_stage3' || launch.launch_status === 'realised') {
        groups[key].launched_count += 1
      }

      // Update overall status (if any club is launched, show progress)
      if (launch.launch_status === 'picked_stage3' || launch.launch_status === 'realised') {
        groups[key].overall_status = 'in_progress'
      }
    })

    return Object.values(groups)
  }

  // Calculate planned launch totals for each activity
  const calculatePlannedLaunchTotals = (activityName: string) => {
    const activityLaunches = newLaunches.filter(launch => launch.activity_name === activityName)
    return {
      meetups: activityLaunches.reduce((sum, launch) => sum + launch.target_meetups, 0),
      revenue: activityLaunches.reduce((sum, launch) => sum + launch.target_revenue_rupees, 0)
    }
  }

  const loadCities = async () => {
    try {
      setLoadingCities(true)
      const response = await fetch(`${API_BASE}/api/scaling/cities`)
      const data = await response.json()
      if (data.success) {
        setCities(data.cities.map(city => ({
          id: parseInt(city.id),
          name: city.name,
          state: city.state
        })))
      }
    } catch (error) {
      console.error('Failed to fetch cities:', error)
    } finally {
      setLoadingCities(false)
    }
  }

  const loadAreas = async (cityId: string) => {
    if (!cityId) {
      setAreas([])
      return
    }

    try {
      setLoadingAreas(true)
      const response = await fetch(`${API_BASE}/api/scaling/areas/${cityId}`)
      const data = await response.json()
      if (data.success) {
        setAreas(data.areas.map(area => ({
          id: parseInt(area.id),
          name: area.name
        })))
      }
    } catch (error) {
      console.error('Failed to fetch areas:', error)
      setAreas([])
    } finally {
      setLoadingAreas(false)
    }
  }

  // Load planned launches from API
  const loadPlannedLaunches = async (activityName?: string) => {
    try {
      setLoadingNewLaunches(true)
      const endpoint = activityName
        ? `${API_BASE}/api/scaling/planned-launches/activity/${encodeURIComponent(activityName)}`
        : `${API_BASE}/api/scaling/planned-launches`

      const response = await fetch(endpoint)
      const data = await response.json()

      if (data.success) {
        const launches = activityName ? data.launches : data.launches
        setNewLaunches(launches.map(launch => ({
          id: launch.id,
          activity_name: launch.activity_name,
          planned_club_name: `${launch.city_name} ${launch.activity_name} Club`,
          planned_city: launch.city_name,
          planned_area: launch.area_name,
          planned_launch_date: launch.target_launch_date,
          target_meetups: launch.target_meetups_monthly,
          target_revenue_rupees: launch.target_revenue_monthly_rupees,
          launch_status: launch.launch_status,
          number_of_clubs: launch.number_of_clubs,
          launch_sequence: launch.launch_sequence,
          total_launches: launch.total_launches,
          launch_batch_id: launch.launch_batch_id,
          milestones: {}
        })))
      }
    } catch (error) {
      console.error('Failed to fetch planned launches:', error)
    } finally {
      setLoadingNewLaunches(false)
    }
  }

  // Delete planned launch
  const deletePlannedLaunch = async (launchId: number) => {
    try {
      const response = await fetch(`${API_BASE}/api/scaling/planned-launches/${launchId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        console.log('Launch deleted successfully:', data.deleted_launch)

        // Reload planned launches
        if (selectedActivity) {
          await loadPlannedLaunches(selectedActivity)
        } else {
          await loadPlannedLaunches()
        }
      } else {
        throw new Error(data.error || 'Failed to delete launch plan')
      }
    } catch (error) {
      console.error('Error deleting launch plan:', error)
      alert('Failed to delete launch plan: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  // Update planned launch
  const updatePlannedLaunch = async (launchId: number, updates: Partial<any>) => {
    try {
      const response = await fetch(`${API_BASE}/api/scaling/planned-launches/${launchId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      })

      const data = await response.json()

      if (data.success) {
        console.log('Launch updated successfully:', data.launch)

        // Reload planned launches
        if (selectedActivity) {
          await loadPlannedLaunches(selectedActivity)
        } else {
          await loadPlannedLaunches()
        }
      } else {
        throw new Error(data.error || 'Failed to update launch plan')
      }
    } catch (error) {
      console.error('Error updating launch plan:', error)
      alert('Failed to update launch plan: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  const handleNewLaunchSubmit = async () => {
    try {
      // Validate required fields
      if (!newLaunchForm.activity_name || !newLaunchForm.planned_city_id || !newLaunchForm.planned_area_id ||
          !newLaunchForm.target_meetups || !newLaunchForm.target_revenue_rupees) {
        alert('Please fill in all required fields')
        return
      }

      // Save scroll position before refresh
      const scrollY = window.scrollY

      // Create new planned launch via API
      const payload = {
        activity_name: newLaunchForm.activity_name,
        city_id: parseInt(newLaunchForm.planned_city_id),
        city_name: newLaunchForm.planned_city_name,
        area_id: parseInt(newLaunchForm.planned_area_id),
        area_name: newLaunchForm.planned_area_name,
        number_of_clubs: newLaunchForm.number_of_clubs,
        target_launch_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
        target_meetups_monthly: newLaunchForm.target_meetups,
        target_revenue_monthly_rupees: newLaunchForm.target_revenue_rupees,
        launch_status: 'not_picked',
        notes: ''
      }

      const response = await fetch(`${API_BASE}/api/scaling/planned-launches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (data.success) {
        console.log('New launch created successfully:', data.launch)

        // Reset form and close modal first (before async refresh)
        setNewLaunchForm({
          activity_name: '',
          planned_city_id: '',
          planned_city_name: '',
          planned_area_id: '',
          planned_area_name: '',
          number_of_clubs: 1,
          target_meetups: 0,
          target_revenue_rupees: 0
        })
        setAreas([])
        setShowNewLaunchModal(false)

        // Reload all data to update totals - activities + planned launches
        await Promise.all([
          loadActivities(),
          selectedActivity ? loadPlannedLaunches(selectedActivity) : loadPlannedLaunches()
        ])

        // Restore scroll position after refresh
        requestAnimationFrame(() => {
          window.scrollTo(0, scrollY)
        })

        console.log(`Created new club launch plan for ${newLaunchForm.activity_name} in ${newLaunchForm.planned_city_name}`)
      } else {
        throw new Error(data.error || 'Failed to create launch plan')
      }
    } catch (error) {
      console.error('Error creating launch plan:', error)
      alert('Failed to create launch plan: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  // Edit launch functions
  const openEditModal = (launch: NewClubLaunch) => {
    setEditingLaunch(launch)
    setEditLaunchForm({
      city_name: launch.planned_city || '',
      area_name: launch.planned_area || '',
      target_launch_date: launch.planned_launch_date || '',
      target_meetups_monthly: launch.target_meetups || 0,
      target_revenue_monthly_rupees: launch.target_revenue_rupees || 0,
      launch_status: launch.launch_status || 'not_picked',
      notes: launch.notes || ''
    })
    setShowEditLaunchModal(true)
  }

  const handleEditLaunchSubmit = async () => {
    if (!editingLaunch) return

    // Save scroll position before refresh
    const scrollY = window.scrollY

    try {
      // Find all launches in the same batch (same city, area, and activity)
      const batchLaunches = newLaunches.filter(launch =>
        launch.planned_city === editingLaunch.planned_city &&
        launch.planned_area === editingLaunch.planned_area &&
        launch.activity_name === editingLaunch.activity_name
      )

      // Update all launches in the batch
      const updatePromises = batchLaunches.map(launch =>
        fetch(`${API_BASE}/api/scaling/planned-launches/${launch.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            city_name: editLaunchForm.city_name,
            area_name: editLaunchForm.area_name,
            target_launch_date: editLaunchForm.target_launch_date,
            target_meetups_monthly: editLaunchForm.target_meetups_monthly,
            target_revenue_monthly_rupees: editLaunchForm.target_revenue_monthly_rupees,
            launch_status: editLaunchForm.launch_status,
            notes: editLaunchForm.notes
          })
        })
      )

      const responses = await Promise.all(updatePromises)

      // Check if all updates were successful
      const allSuccessful = responses.every(response => response.ok)

      if (allSuccessful) {
        // Check if status has changed to picked_stage3 or realised for automatic transition
        const transitionStatuses = ['picked_stage3', 'realised']
        if (transitionStatuses.includes(editLaunchForm.launch_status)) {
          // Transition all launches in the batch that have the new status to existing clubs
          for (const launch of batchLaunches) {
            try {
              const transitionResponse = await fetch(`${API_BASE}/api/scaling/transition-to-existing`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  plannedLaunchId: launch.id
                })
              })

              if (transitionResponse.ok) {
                console.log(`Successfully transitioned planned launch ${launch.id} to existing club`)
              } else {
                const errorData = await transitionResponse.json()
                console.error(`Failed to transition launch ${launch.id}:`, errorData)
              }
            } catch (transitionError) {
              console.error(`Error transitioning launch ${launch.id}:`, transitionError)
            }
          }
        }

        setShowEditLaunchModal(false)
        setEditingLaunch(null)
        setEditLaunchForm({
          city_name: '',
          area_name: '',
          target_launch_date: '',
          target_meetups_monthly: 0,
          target_revenue_monthly_rupees: 0,
          launch_status: 'not_picked',
          notes: ''
        })
        // Reload all data to update totals - activities + planned launches
        await Promise.all([
          loadActivities(),
          selectedActivity ? loadPlannedLaunches(selectedActivity) : loadPlannedLaunches()
        ])

        // Restore scroll position after refresh
        requestAnimationFrame(() => {
          window.scrollTo(0, scrollY)
        })

        console.log(`Successfully updated ${batchLaunches.length} launches in batch`)
      } else {
        throw new Error('Failed to update some launches in the batch')
      }
    } catch (error) {
      console.error('Error updating launch batch:', error)
      alert('Failed to update launch batch: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  const updateFilter = (key: keyof FilterOptions, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  useEffect(() => {
    loadActivities()
    loadFilterData()
    loadCities()
    loadPlannedLaunches() // Load all planned launches initially
  }, [])

  // Handle activity drill-down
  const handleActivityClick = (activityName: string) => {
    if (selectedActivity === activityName) {
      setSelectedActivity(null)
    } else {
      setSelectedActivity(activityName)
      loadActivityDetails(activityName)
    }
  }

  // Handle launch group expand/collapse
  const handleLaunchGroupClick = (groupKey: string) => {
    const newExpanded = new Set(expandedLaunchGroups)
    if (newExpanded.has(groupKey)) {
      newExpanded.delete(groupKey)
    } else {
      newExpanded.add(groupKey)
    }
    setExpandedLaunchGroups(newExpanded)
  }

  // Editing handlers
  const startEditing = (activityName: string, field: string, currentValue: number) => {
    setEditingTarget({ activityName, field, value: currentValue })
  }

  const saveEdit = async () => {
    if (!editingTarget) return

    await updateActivityTarget(editingTarget.activityName, editingTarget.field, editingTarget.value)
    setEditingTarget(null)
  }

  const cancelEdit = () => {
    setEditingTarget(null)
  }

  // WoW comment functions
  const openWowModal = async (clubType: 'existing' | 'planned', clubId: number, clubName: string, activityName: string) => {
    setWowClubData({ clubType, clubId, clubName, activityName })
    setShowWowModal(true)
    setSelectedWeekStart(getCurrentWeekStart())

    // Load existing comments
    try {
      const response = await fetch(`${API_BASE}/api/scaling/wow-comments/${clubType}/${clubId}`)
      if (response.ok) {
        const data = await response.json()
        setWowComments(data.comments || [])
      }
    } catch (error) {
      console.error('Failed to load WoW comments:', error)
    }
  }

  const addWowComment = async () => {
    if (!wowClubData || !newWowComment.trim() || !selectedWeekStart) return

    try {
      const response = await fetch(`${API_BASE}/api/scaling/wow-comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          club_type: wowClubData.clubType,
          club_id: wowClubData.clubId,
          week_start: selectedWeekStart,
          comment: newWowComment.trim(),
          activity_name: wowClubData.activityName,
          club_name: wowClubData.clubName
        })
      })

      if (response.ok) {
        const data = await response.json()
        setWowComments(prev => [data.comment, ...prev])
        setNewWowComment('')
        console.log('WoW comment added successfully')
      } else {
        throw new Error('Failed to add comment')
      }
    } catch (error) {
      console.error('Failed to add WoW comment:', error)
      alert('Failed to add comment. Please try again.')
    }
  }

  const getCurrentWeekStart = () => {
    const today = new Date()
    const dayOfWeek = today.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const wednesday = new Date(today)

    // Calculate days since Wednesday (3 = Wednesday)
    // If today is Wed(3) = 0 days, Thu(4) = -1 days, Fri(5) = -2 days, Sat(6) = -3 days
    // If today is Sun(0) = 3 days, Mon(1) = 4 days, Tue(2) = 5 days back to Wednesday
    let daysSinceWednesday
    if (dayOfWeek >= 3) {
      daysSinceWednesday = dayOfWeek - 3 // Wed=0, Thu=1, Fri=2, Sat=3
    } else {
      daysSinceWednesday = dayOfWeek + 4 // Sun=4, Mon=5, Tue=6
    }

    wednesday.setDate(today.getDate() - daysSinceWednesday)
    return wednesday.toISOString().split('T')[0]
  }

  const closeWowModal = () => {
    setShowWowModal(false)
    setWowClubData(null)
    setWowComments([])
    setNewWowComment('')
    setSelectedWeekStart('')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading scaling targets...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="text-red-800">{error}</div>
        <button
          onClick={loadActivities}
          className="mt-2 text-sm text-red-600 hover:text-red-800"
        >
          Try Again
        </button>
      </div>
    )
  }

  // Apply filters to activities
  const filteredActivities = applyFilters(activities)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Scaling Targets Dashboard</h1>
        <p className="text-gray-600">Set and track growth targets for activities, broken down by existing clubs and new club launches</p>
      </div>

      {/* Filter Section */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Filter className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
          </div>
          <button
            onClick={resetFilters}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Reset All
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Activity</label>
            <select
              value={filters.activity}
              onChange={(e) => updateFilter('activity', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Activities</option>
              {filterData.activities.map(activity => (
                <option key={activity} value={activity}>{activity}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Area</label>
            <select
              value={filters.area}
              onChange={(e) => updateFilter('area', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Areas</option>
              {filterData.areas.map(area => (
                <option key={area} value={area}>{area}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <select
              value={filters.city}
              onChange={(e) => updateFilter('city', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Cities</option>
              {filterData.cities.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">POC</label>
            <select
              value={filters.poc}
              onChange={(e) => updateFilter('poc', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All POCs</option>
              {filterData.pocs.map(poc => (
                <option key={poc} value={poc}>{poc}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => updateFilter('status', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Status</option>
              {filterData.statuses.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => updateFilter('dateFrom', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => updateFilter('dateTo', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {Object.values(filters).some(filter => filter !== '') && (
          <div className="mt-3 text-sm text-gray-600">
            Showing {filteredActivities.length} of {activities.length} activities
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="text-sm text-gray-600">Total Activities</div>
          <div className="text-2xl font-bold text-gray-900">{filteredActivities.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="text-sm text-gray-600">Active Clubs</div>
          <div className="text-2xl font-bold text-blue-600">
            {filteredActivities.reduce((sum, a) => sum + a.active_clubs_count, 0)}
          </div>
        </div>
      </div>

      {/* Activity-Level Targets Table */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Activity-Level Targets</h2>
          <p className="text-sm text-gray-600 mt-1">Click an activity to drill down into club-level details</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Metrics</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Existing Clubs Targets</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">New Clubs Targets</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredActivities.map((activity) => (
                <React.Fragment key={activity.activity_name}>
                  {/* Activity Row */}
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <button
                          onClick={() => handleActivityClick(activity.activity_name)}
                          className="flex items-center space-x-2 text-left"
                        >
                          {selectedActivity === activity.activity_name ? (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          )}
                          <div>
                            <div className="text-sm font-medium text-gray-900">{activity.activity_name}</div>
                            <div className="text-sm text-gray-500">{activity.active_clubs_count} active clubs</div>
                          </div>
                        </button>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-sm">
                      <div className="space-y-1">
                        <div>{activity.current_meetups_month} meetups/month</div>
                        <div>₹{Math.round(activity.current_revenue_rupees).toLocaleString()}</div>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-sm">
                      <div className="space-y-1">
                        <EditableField
                          value={activity.target_meetups_existing}
                          suffix=" meetups"
                          isEditing={editingTarget?.activityName === activity.activity_name && editingTarget?.field === 'target_meetups_existing'}
                          onEdit={(value) => setEditingTarget({...editingTarget!, value})}
                          onStartEdit={() => startEditing(activity.activity_name, 'target_meetups_existing', activity.target_meetups_existing)}
                          onSave={saveEdit}
                          onCancel={cancelEdit}
                        />
                        <EditableField
                          value={activity.target_revenue_existing_rupees}
                          prefix="₹"
                          suffix=""
                          format={(v) => Math.round(v).toLocaleString()}
                          isEditing={editingTarget?.activityName === activity.activity_name && editingTarget?.field === 'target_revenue_existing_rupees'}
                          onEdit={(value) => setEditingTarget({...editingTarget!, value})}
                          onStartEdit={() => startEditing(activity.activity_name, 'target_revenue_existing_rupees', activity.target_revenue_existing_rupees)}
                          onSave={saveEdit}
                          onCancel={cancelEdit}
                        />
                      </div>
                    </td>

                    <td className="px-6 py-4 text-sm">
                      <div className="space-y-1">
                        {(() => {
                          const plannedTotals = calculatePlannedLaunchTotals(activity.activity_name)
                          return (
                            <>
                              <div className="text-green-600 font-medium">
                                {plannedTotals.meetups} meetups
                              </div>
                              <div className="text-green-600 font-medium">
                                ₹{Math.round(plannedTotals.revenue).toLocaleString()}
                              </div>
                            </>
                          )
                        })()}
                      </div>
                    </td>


                    <td className="px-6 py-4">
                      {activity.targets_last_updated && (
                        <div className="text-xs text-gray-500">
                          Updated {new Date(activity.targets_last_updated).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* Drill-down Content */}
                  {selectedActivity === activity.activity_name && (
                    <tr>
                      <td colSpan={6} className="px-6 py-6 bg-gray-50">
                        <DrillDownView
                          activityName={activity.activity_name}
                          clubs={clubs}
                          newLaunches={newLaunches}
                          groupedLaunches={groupedLaunches()}
                          expandedLaunchGroups={expandedLaunchGroups}
                          onLaunchGroupClick={handleLaunchGroupClick}
                          loading={clubsLoading}
                          onUpdateClub={updateClubTarget}
                          onRefresh={() => loadActivityDetails(activity.activity_name)}
                          onOpenNewLaunchModal={() => {
                            setNewLaunchForm(prev => ({
                              ...prev,
                              activity_name: activity.activity_name
                            }))
                            setShowNewLaunchModal(true)
                            loadCities()
                          }}
                          onOpenWowModal={openWowModal}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Club Launch Modal */}
      {showNewLaunchModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-full">
            <h3 className="text-lg font-semibold mb-4">Plan New Club Launch</h3>
            <form onSubmit={(e) => {
              e.preventDefault()
              handleNewLaunchSubmit()
            }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Activity</label>
                  <select
                    value={newLaunchForm.activity_name}
                    onChange={(e) => setNewLaunchForm(prev => ({ ...prev, activity_name: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Activity</option>
                    {activities.map(activity => (
                      <option key={activity.activity_name} value={activity.activity_name}>
                        {activity.activity_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <select
                    value={newLaunchForm.planned_city_id}
                    onChange={(e) => {
                      const selectedCity = cities.find(city => city.id.toString() === e.target.value)
                      setNewLaunchForm(prev => ({
                        ...prev,
                        planned_city_id: e.target.value,
                        planned_city_name: selectedCity?.name || '',
                        planned_area_id: '',
                        planned_area_name: ''
                      }))
                      loadAreas(e.target.value)
                    }}
                    required
                    disabled={loadingCities}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">
                      {loadingCities ? 'Loading cities...' : 'Select City'}
                    </option>
                    {cities.map(city => (
                      <option key={city.id} value={city.id}>
                        {city.name}, {city.state}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Area</label>
                  <select
                    value={newLaunchForm.planned_area_id}
                    onChange={(e) => {
                      const selectedArea = areas.find(area => area.id.toString() === e.target.value)
                      setNewLaunchForm(prev => ({
                        ...prev,
                        planned_area_id: e.target.value,
                        planned_area_name: selectedArea?.name || ''
                      }))
                    }}
                    required
                    disabled={!newLaunchForm.planned_city_id || loadingAreas}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">
                      {!newLaunchForm.planned_city_id
                        ? 'Select city first'
                        : loadingAreas
                        ? 'Loading areas...'
                        : 'Select Area'
                      }
                    </option>
                    {areas.map(area => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Number of Clubs</label>
                  <input
                    type="number"
                    min="0"
                    value={newLaunchForm.number_of_clubs}
                    onChange={(e) => setNewLaunchForm(prev => ({ ...prev, number_of_clubs: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Meetups (per club per month)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g., 8"
                    value={newLaunchForm.target_meetups === 0 ? '' : newLaunchForm.target_meetups}
                    onChange={(e) => setNewLaunchForm(prev => ({ ...prev, target_meetups: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Revenue (₹ per club per month)</label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    placeholder="e.g., 30000"
                    value={newLaunchForm.target_revenue_rupees === 0 ? '' : newLaunchForm.target_revenue_rupees}
                    onChange={(e) => setNewLaunchForm(prev => ({ ...prev, target_revenue_rupees: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowNewLaunchModal(false)}
                  className="px-4 py-2 text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700"
                >
                  Create Launch Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Launch Modal */}
      {showEditLaunchModal && editingLaunch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Edit Club Launch</h3>
            <form onSubmit={(e) => {
              e.preventDefault()
              handleEditLaunchSubmit()
            }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Activity</label>
                  <input
                    type="text"
                    value={editingLaunch.activity_name}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Activity cannot be changed</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    value={editLaunchForm.city_name}
                    onChange={(e) => setEditLaunchForm(prev => ({ ...prev, city_name: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Area</label>
                  <input
                    type="text"
                    value={editLaunchForm.area_name}
                    onChange={(e) => setEditLaunchForm(prev => ({ ...prev, area_name: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Launch Date</label>
                  <input
                    type="date"
                    value={editLaunchForm.target_launch_date}
                    onChange={(e) => setEditLaunchForm(prev => ({ ...prev, target_launch_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Meetups Target</label>
                  <input
                    type="number"
                    value={editLaunchForm.target_meetups_monthly}
                    onChange={(e) => setEditLaunchForm(prev => ({ ...prev, target_meetups_monthly: parseInt(e.target.value) || 0 }))}
                    required
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Revenue Target (₹)</label>
                  <input
                    type="number"
                    value={editLaunchForm.target_revenue_monthly_rupees}
                    onChange={(e) => setEditLaunchForm(prev => ({ ...prev, target_revenue_monthly_rupees: parseInt(e.target.value) || 0 }))}
                    required
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Launch Status</label>
                  <select
                    value={editLaunchForm.launch_status}
                    onChange={(e) => setEditLaunchForm(prev => ({ ...prev, launch_status: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="not_picked">Not Picked</option>
                    <option value="picked_started">Picked & Started</option>
                    <option value="picked_stage1">Picked - Stage 1</option>
                    <option value="picked_stage2">Picked - Stage 2</option>
                    <option value="picked_stage3">Picked - Stage 3 (Launched)</option>
                    <option value="picked_stage4">Picked - Stage 4</option>
                    <option value="realised">Realised</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={editLaunchForm.notes}
                    onChange={(e) => setEditLaunchForm(prev => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    placeholder="Add any notes about this launch plan..."
                  />
                </div>
              </div>

              <div className="flex items-center space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditLaunchModal(false)
                    setEditingLaunch(null)
                    setEditLaunchForm({
                      city_name: '',
                      area_name: '',
                      target_launch_date: '',
                      target_meetups_monthly: 0,
                      target_revenue_monthly_rupees: 0,
                      launch_status: 'not_picked',
                      notes: ''
                    })
                  }}
                  className="px-4 py-2 text-gray-600 bg-gray-200 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Update Launch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WoW Comments Modal */}
      {showWowModal && wowClubData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  WoW Comments - {wowClubData.clubName}
                </h2>
                <button
                  onClick={closeWowModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm text-gray-600">{wowClubData.activityName} • {wowClubData.clubType === 'existing' ? 'Existing Club' : 'Planned Launch'}</p>
            </div>

            <div className="p-6 overflow-y-auto max-h-96">
              {/* Add New Comment */}
              <div className="mb-6">
                <div className="flex items-center space-x-2 mb-3">
                  <MessageCircle className="h-4 w-4 text-blue-600" />
                  <h3 className="font-medium text-gray-900">Add Weekly Comment</h3>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Week Starting</label>
                    <input
                      type="date"
                      value={selectedWeekStart}
                      onChange={(e) => setSelectedWeekStart(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Comment</label>
                    <textarea
                      value={newWowComment}
                      onChange={(e) => setNewWowComment(e.target.value)}
                      rows={3}
                      placeholder="Add your weekly observations, progress updates, challenges, or achievements..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <button
                    onClick={addWowComment}
                    disabled={!newWowComment.trim() || !selectedWeekStart}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    Add Comment
                  </button>
                </div>
              </div>

              {/* Comments List */}
              <div>
                <div className="flex items-center space-x-2 mb-4">
                  <Clock className="h-4 w-4 text-gray-600" />
                  <h3 className="font-medium text-gray-900">Comment History ({wowComments.length})</h3>
                </div>

                {wowComments.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <MessageCircle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p>No comments yet</p>
                    <p className="text-sm">Add your first weekly comment above</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {wowComments.map((comment) => (
                      <div key={comment.id} className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <div className="text-sm font-medium text-gray-900">
                              {comment.week_label}
                            </div>
                            <div className="text-xs text-gray-500">
                              {new Date(comment.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="text-xs text-gray-500">
                            by {comment.created_by}
                          </div>
                        </div>
                        <p className="text-gray-700 whitespace-pre-wrap">{comment.comment}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <div className="flex justify-end">
                <button
                  onClick={closeWowModal}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Editable field component
interface EditableFieldProps {
  value: number
  prefix?: string
  suffix?: string
  format?: (value: number) => string
  isEditing: boolean
  onEdit: (value: number) => void
  onStartEdit: () => void
  onSave: () => void
  onCancel: () => void
}

function EditableField({
  value,
  prefix = '',
  suffix = '',
  format = (v) => v.toString(),
  isEditing,
  onEdit,
  onStartEdit,
  onSave,
  onCancel
}: EditableFieldProps) {
  if (isEditing) {
    return (
      <div className="flex items-center space-x-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onEdit(Number(e.target.value))}
          className="w-20 px-2 py-1 text-xs border rounded focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
        <button onClick={onSave} className="text-green-600 hover:text-green-800">
          <Save className="h-3 w-3" />
        </button>
        <button onClick={onCancel} className="text-red-600 hover:text-red-800">
          <X className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={onStartEdit}
      className="flex items-center space-x-1 hover:bg-blue-50 px-1 py-0.5 rounded group"
    >
      <span>{prefix}{format(value)}{suffix}</span>
      <Edit2 className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100" />
    </button>
  )
}

// Drill-down view component
interface DrillDownViewProps {
  activityName: string
  clubs: ClubTarget[]
  newLaunches: NewClubLaunch[]
  groupedLaunches: any[]
  expandedLaunchGroups: Set<string>
  onLaunchGroupClick: (groupKey: string) => void
  loading: boolean
  onUpdateClub: (clubId: string, field: string, value: number) => void
  onRefresh: () => void
  onOpenNewLaunchModal: () => void
  onOpenWowModal: (clubType: 'existing' | 'planned', clubId: number, clubName: string, activityName: string) => void
}

function DrillDownView({ activityName, clubs, newLaunches, groupedLaunches, expandedLaunchGroups, onLaunchGroupClick, loading, onUpdateClub, onRefresh, onOpenNewLaunchModal, onOpenWowModal }: DrillDownViewProps) {
  if (loading) {
    return <div className="text-center py-8 text-gray-600">Loading club details...</div>
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">{activityName} - Detailed View</h3>

      {/* Existing Clubs Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-md font-medium text-gray-900">Existing Clubs ({clubs.length})</h4>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                // Set default targets for all clubs without targets
                clubs.forEach(club => {
                  if (club.target_meetups === 0) {
                    onUpdateClub(club.club_id, 'target_meetups', Math.max(club.current_meetups + 2, 4))
                  }
                  if (club.target_revenue_rupees === 0) {
                    onUpdateClub(club.club_id, 'target_revenue_rupees', Math.max(club.current_revenue_rupees * 1.2, 10000))
                  }
                })
              }}
              className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100"
            >
              Set Default Targets
            </button>
            <span className="text-xs text-gray-500">
              Current: {clubs.reduce((sum, c) => sum + c.current_meetups, 0)} meetups,
              ₹{Math.round(clubs.reduce((sum, c) => sum + c.current_revenue_rupees, 0)).toLocaleString()}
            </span>
          </div>
        </div>
        {clubs.length > 0 ? (
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Club</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Current</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                    Targets
                    <span className="text-gray-400 font-normal"> (click to edit)</span>
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Health</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Target % Completion</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 flex items-center space-x-1">
                    <span>Status</span>
                    <button
                      className="text-gray-400 hover:text-gray-600"
                      title="Not picked | Started: Process & discussions started | Stage 1: New leaders selected & aligned | Stage 2: Venue Aligned | Stage 3: New leader onboarded, operations launched | Stage 4: All done, revenue not realised yet | Realised: Revenue achieved"
                    >
                      <Info className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Club Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">WoW Comments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {clubs.map((club) => (
                  <tr key={club.club_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-sm">{club.club_name}</div>
                        <div className="text-xs text-gray-500">{club.city}, {club.area}</div>
                        {club.is_new_club && (
                          <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">
                            New Club
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div>{club.current_meetups} meetups</div>
                      <div>₹{Math.round(club.current_revenue_rupees).toLocaleString()}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <ClubEditableField
                            value={club.target_meetups}
                            suffix=" meetups"
                            onSave={(value) => onUpdateClub(club.club_id, 'target_meetups', value)}
                          />
                          <span className="text-xs text-gray-400">per month</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <ClubEditableField
                            value={club.target_revenue_rupees}
                            prefix="₹"
                            format={(v) => Math.round(v).toLocaleString()}
                            onSave={(value) => onUpdateClub(club.club_id, 'target_revenue_rupees', value)}
                          />
                          <span className="text-xs text-gray-400">per month</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          Click to edit →
                        </div>
                      </div>
                    </td>

                    {/* Health Column */}
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center space-x-1">
                        {(() => {
                          const meetupHealth = club.target_meetups > 0 ? (club.current_meetups / club.target_meetups) * 100 : 0;
                          const revenueHealth = club.target_revenue_rupees > 0 ? (club.current_revenue_rupees / club.target_revenue_rupees) * 100 : 0;
                          // If no targets set but has revenue, consider it somewhat healthy
                          const overallHealth = club.target_meetups === 0 && club.target_revenue_rupees === 0
                            ? (club.current_revenue_rupees > 0 ? 60 : 0)
                            : (meetupHealth + revenueHealth) / 2;

                          if (overallHealth >= 70) {
                            return <><span className="text-green-600">🟢</span> <span className="text-xs text-green-700 font-medium">Green</span></>;
                          } else if (overallHealth >= 30) {
                            return <><span className="text-yellow-600">🟡</span> <span className="text-xs text-yellow-700 font-medium">Yellow</span></>;
                          } else {
                            return <><span className="text-red-600">🔴</span> <span className="text-xs text-red-700 font-medium">Red</span></>;
                          }
                        })()}
                      </div>
                    </td>

                    {/* Target % Completion Column */}
                    <td className="px-4 py-3 text-sm">
                      <div className="space-y-1">
                        <div className="text-xs">
                          <span className="text-gray-600">Meetups:</span>
                          <span className="ml-1 font-medium">
                            {club.target_meetups > 0 ? Math.round((club.current_meetups / club.target_meetups) * 100) : 0}%
                          </span>
                        </div>
                        <div className="text-xs">
                          <span className="text-gray-600">Revenue:</span>
                          <span className="ml-1 font-medium">
                            {club.target_revenue_rupees > 0 ? Math.round((club.current_revenue_rupees / club.target_revenue_rupees) * 100) : 0}%
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Status Column (Launch Stage) */}
                    <td className="px-4 py-3 text-sm">
                      {(() => {
                        const getStageLabel = (stage: string) => {
                          switch (stage) {
                            case 'not_picked': return 'Not picked';
                            case 'picked_started': return 'Started';
                            case 'picked_stage1': return 'Stage 1';
                            case 'picked_stage2': return 'Stage 2';
                            case 'picked_stage3': return 'Stage 3';
                            case 'picked_stage4': return 'Stage 4';
                            case 'realised': return 'Realised';
                            default: return 'Not picked';
                          }
                        };

                        const getStageColor = (stage: string) => {
                          switch (stage) {
                            case 'realised': return 'bg-green-100 text-green-800';
                            case 'picked_stage4': return 'bg-blue-100 text-blue-800';
                            case 'picked_stage3': return 'bg-purple-100 text-purple-800';
                            case 'picked_stage2': return 'bg-yellow-100 text-yellow-800';
                            case 'picked_stage1': return 'bg-orange-100 text-orange-800';
                            case 'picked_started': return 'bg-cyan-100 text-cyan-800';
                            case 'not_picked':
                            default: return 'bg-gray-100 text-gray-800';
                          }
                        };

                        const currentStage = club.scaling_stage || 'not_picked';

                        return (
                          <select
                            value={currentStage}
                            onChange={(e) => {
                              // Handle stage update - you can add API call here
                              const newStage = e.target.value as typeof club.scaling_stage;
                              console.log(`Updating club ${club.club_id} to stage: ${newStage}`);
                              // onUpdateClub(club.club_id, 'scaling_stage', newStage);
                            }}
                            className={`px-2 py-1 rounded text-xs border-none outline-none ${getStageColor(currentStage)}`}
                          >
                            <option value="not_picked">Not picked</option>
                            <option value="picked_started">Started</option>
                            <option value="picked_stage1">Stage 1</option>
                            <option value="picked_stage2">Stage 2</option>
                            <option value="picked_stage3">Stage 3</option>
                            <option value="picked_stage4">Stage 4</option>
                            <option value="realised">Realised</option>
                          </select>
                        );
                      })()}
                    </td>

                    {/* Club Status Column (moved from Status) */}
                    <td className="px-4 py-3">
                      <div className="text-xs">
                        <div className={`px-2 py-1 rounded-full inline-block ${
                          club.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {club.status}
                        </div>
                      </div>
                    </td>

                    {/* WoW Comments Column */}
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => onOpenWowModal('existing', parseInt(club.club_id), club.club_name, activityName)}
                          className="flex items-center space-x-1 px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                          title="Add WoW Comment"
                        >
                          <MessageCircle className="h-3 w-3" />
                          <span>Add</span>
                        </button>
                        <button
                          onClick={() => onOpenWowModal('existing', parseInt(club.club_id), club.club_name, activityName)}
                          className="flex items-center space-x-1 px-2 py-1 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-100"
                          title="View WoW Comments"
                        >
                          <Eye className="h-3 w-3" />
                          <span>View</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">No existing clubs found</div>
        )}
      </div>

      {/* New Club Launch Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-md font-medium text-gray-900">New Club Launches ({groupedLaunches.length} groups)</h4>
          <button
            onClick={onOpenNewLaunchModal}
            className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
          >
            + Plan New Launch
          </button>
        </div>
        {newLaunches.length > 0 ? (
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Location</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Progress</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Target Launch Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Targets</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Actions</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">WoW Comments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {groupedLaunches.map((group, index) => {
                  const groupKey = `${group.city}_${group.area}_${group.activity}`
                  const isExpanded = expandedLaunchGroups.has(groupKey)

                  return (
                    <React.Fragment key={groupKey}>
                      {/* Summary Row */}
                      <tr className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center">
                            <button
                              onClick={() => onLaunchGroupClick(groupKey)}
                              className="flex items-center space-x-2 text-left"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-gray-400" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-gray-400" />
                              )}
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {group.city}, {group.area}
                                </div>
                                <div className="text-sm text-gray-500">
                                  {group.total_planned} clubs planned
                                </div>
                              </div>
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div>
                            <span className="font-medium">
                              {group.launched_count}/{group.total_planned} launched
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {Math.round((group.launched_count / group.total_planned) * 100)}% complete
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <input
                            type="date"
                            value={group.target_launch_date || ''}
                            onChange={(e) => {
                              // Update launch date for all clubs in the group
                              group.launches.forEach(launch => {
                                updatePlannedLaunch(launch.id, { target_launch_date: e.target.value })
                              })
                            }}
                            className="px-2 py-1 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div>{group.target_meetups_total} meetups/month total</div>
                          <div>₹{Math.round(group.target_revenue_total).toLocaleString()}/month total</div>
                          <div className="text-xs text-gray-500 mt-1">
                            Per club: {Math.round(group.target_meetups_total / group.total_planned)} meetups,
                            ₹{Math.round(group.target_revenue_total / group.total_planned).toLocaleString()}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center space-x-2">
                            <button
                              className="text-blue-600 hover:text-blue-800 text-xs"
                              onClick={() => {
                                // Edit the first launch in the group (they share the same data)
                                const firstLaunch = group.launches[0]
                                if (firstLaunch) {
                                  openEditModal(firstLaunch)
                                }
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="text-red-600 hover:text-red-800 text-xs"
                              onClick={() => {
                                if (confirm(`Are you sure you want to delete all ${group.total_planned} planned launches for ${group.activity} in ${group.city}, ${group.area}?`)) {
                                  // Delete all launches in this group
                                  group.launches.forEach(launch => {
                                    deletePlannedLaunch(launch.id)
                                  })
                                }
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>

                        {/* WoW Comments Column for Planned Launches */}
                        <td className="px-4 py-3">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => onOpenWowModal('planned', group.launches[0].id, `${group.activity} - ${group.city}, ${group.area}`, group.activity)}
                              className="flex items-center space-x-1 px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                              title="Add WoW Comment"
                            >
                              <MessageCircle className="h-3 w-3" />
                              <span>Add</span>
                            </button>
                            <button
                              onClick={() => onOpenWowModal('planned', group.launches[0].id, `${group.activity} - ${group.city}, ${group.area}`, group.activity)}
                              className="flex items-center space-x-1 px-2 py-1 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-100"
                              title="View WoW Comments"
                            >
                              <Eye className="h-3 w-3" />
                              <span>View</span>
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Detail Row */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="px-4 py-4 bg-gray-50">
                            <div className="space-y-3">
                              <h6 className="text-sm font-medium text-gray-900">Individual Club Status</h6>
                              <div className="bg-white rounded-lg border overflow-hidden">
                                <table className="w-full">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      {/* Individual club status columns for this group only */}
                                      {group.launches.map((_, i) => (
                                        <th key={`club-${i + 1}`} className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                                          Club {i + 1} Status
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    <tr>
                                      {/* Individual club status columns */}
                                      {group.launches.map((club, i) => (
                                        <td key={`club-${i + 1}-status`} className="px-4 py-3 text-sm">
                                          <select
                                            value={club.launch_status || 'not_picked'}
                                            onChange={(e) => {
                                              // Update individual club status
                                              updatePlannedLaunch(club.id, { launch_status: e.target.value })
                                            }}
                                            className={`px-2 py-1 rounded text-xs border-none outline-none w-full ${(() => {
                                              const status = club.launch_status || 'not_picked'
                                              switch (status) {
                                                case 'realised': return 'bg-green-100 text-green-800';
                                                case 'picked_stage4': return 'bg-blue-100 text-blue-800';
                                                case 'picked_stage3': return 'bg-purple-100 text-purple-800';
                                                case 'picked_stage2': return 'bg-yellow-100 text-yellow-800';
                                                case 'picked_stage1': return 'bg-orange-100 text-orange-800';
                                                case 'picked_started': return 'bg-cyan-100 text-cyan-800';
                                                case 'not_picked':
                                                default: return 'bg-gray-100 text-gray-800';
                                              }
                                            })()}`}
                                          >
                                            <option value="not_picked">Not picked</option>
                                            <option value="picked_started">Started</option>
                                            <option value="picked_stage1">Stage 1</option>
                                            <option value="picked_stage2">Stage 2</option>
                                            <option value="picked_stage3">Stage 3</option>
                                            <option value="picked_stage4">Stage 4</option>
                                            <option value="realised">Realised</option>
                                          </select>
                                        </td>
                                      ))}
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
            <div>No new club launches planned</div>
            <button className="mt-2 text-sm text-blue-600 hover:text-blue-800">
              Plan your first launch →
            </button>
          </div>
        )}
      </div>

    </div>
  )
}

// Simplified club editable field
interface ClubEditableFieldProps {
  value: number
  prefix?: string
  suffix?: string
  format?: (value: number) => string
  onSave: (value: number) => void
}

function ClubEditableField({ value, prefix = '', suffix = '', format = (v) => v.toString(), onSave }: ClubEditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)

  const handleSave = () => {
    onSave(editValue)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditValue(value)
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div className="flex items-center space-x-1">
        <input
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(parseInt(e.target.value) || 0)}
          className="w-16 px-2 py-1 text-xs border rounded focus:ring-2 focus:ring-blue-500"
          autoFocus
          onFocus={(e) => e.target.select()}
        />
        <button onClick={handleSave} className="text-green-600 hover:text-green-800">
          <Save className="h-3 w-3" />
        </button>
        <button onClick={handleCancel} className="text-red-600 hover:text-red-800">
          <X className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setIsEditing(true)}
      className="flex items-center space-x-1 hover:bg-blue-50 px-1 py-0.5 rounded group"
    >
      <span>{prefix}{format(value)}{suffix}</span>
      <Edit2 className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100" />
    </button>
  )
}