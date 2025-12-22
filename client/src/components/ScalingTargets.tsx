import React, { useState, useEffect } from 'react'
import { Plus, Target, TrendingUp, Users, ChevronDown, ChevronRight, Calendar, MapPin, Settings, Edit2, Save, X, Filter } from 'lucide-react'

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

export default function ScalingTargets() {
  // State for activity-level data
  const [activities, setActivities] = useState<ActivityTarget[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Drill-down state
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null)
  const [clubs, setClubs] = useState<ClubTarget[]>([])
  const [newLaunches, setNewLaunches] = useState<NewClubLaunch[]>([])
  const [clubsLoading, setClubsLoading] = useState(false)

  // Editing state
  const [editingTarget, setEditingTarget] = useState<EditingTarget | null>(null)
  const [showNewLaunchForm, setShowNewLaunchForm] = useState<string | null>(null)

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

      // Load new club launches
      const launchesResponse = await fetch(`/api/targets/activities/${encodeURIComponent(activityName)}/new-launches`)
      const launchesData = await launchesResponse.json()

      if (clubsData.success) {
        setClubs(clubsData.existing_clubs)
      }

      if (launchesData.success) {
        setNewLaunches(launchesData.launch_plans)
      }

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

  const updateFilter = (key: keyof FilterOptions, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  useEffect(() => {
    loadActivities()
    loadFilterData()
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="text-sm text-gray-600">Target Meetups</div>
          <div className="text-2xl font-bold text-green-600">
            {filteredActivities.reduce((sum, a) => sum + a.total_target_meetups, 0)}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="text-sm text-gray-600">Target Revenue</div>
          <div className="text-2xl font-bold text-purple-600">
            ₹{(filteredActivities.reduce((sum, a) => sum + a.total_target_revenue_rupees, 0) / 1000).toFixed(0)}K
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Targets</th>
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
                        <EditableField
                          value={activity.target_meetups_new}
                          suffix=" meetups"
                          isEditing={editingTarget?.activityName === activity.activity_name && editingTarget?.field === 'target_meetups_new'}
                          onEdit={(value) => setEditingTarget({...editingTarget!, value})}
                          onStartEdit={() => startEditing(activity.activity_name, 'target_meetups_new', activity.target_meetups_new)}
                          onSave={saveEdit}
                          onCancel={cancelEdit}
                        />
                        <EditableField
                          value={activity.target_revenue_new_rupees}
                          prefix="₹"
                          suffix=""
                          format={(v) => Math.round(v).toLocaleString()}
                          isEditing={editingTarget?.activityName === activity.activity_name && editingTarget?.field === 'target_revenue_new_rupees'}
                          onEdit={(value) => setEditingTarget({...editingTarget!, value})}
                          onStartEdit={() => startEditing(activity.activity_name, 'target_revenue_new_rupees', activity.target_revenue_new_rupees)}
                          onSave={saveEdit}
                          onCancel={cancelEdit}
                        />
                      </div>
                    </td>

                    <td className="px-6 py-4 text-sm font-medium">
                      <div className="space-y-1">
                        <div className="text-green-600">{activity.total_target_meetups} meetups</div>
                        <div className="text-purple-600">₹{Math.round(activity.total_target_revenue_rupees).toLocaleString()}</div>
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
                          loading={clubsLoading}
                          onUpdateClub={updateClubTarget}
                          onRefresh={() => loadActivityDetails(activity.activity_name)}
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
  loading: boolean
  onUpdateClub: (clubId: string, field: string, value: number) => void
  onRefresh: () => void
}

function DrillDownView({ activityName, clubs, newLaunches, loading, onUpdateClub, onRefresh }: DrillDownViewProps) {
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
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
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
                    <td className="px-4 py-3">
                      <div className="text-xs">
                        <div className={`px-2 py-1 rounded-full inline-block ${
                          club.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {club.status}
                        </div>
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
          <h4 className="text-md font-medium text-gray-900">New Club Launches ({newLaunches.length})</h4>
          <button className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">
            + Plan New Launch
          </button>
        </div>
        {newLaunches.length > 0 ? (
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Planned Club</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Location</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Launch Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Targets</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {newLaunches.map((launch) => (
                  <tr key={launch.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm">{launch.planned_club_name || 'Unnamed Club'}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div>{launch.planned_city}, {launch.planned_area}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {launch.planned_launch_date ? new Date(launch.planned_launch_date).toLocaleDateString() : 'TBD'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div>{launch.target_meetups} meetups</div>
                      <div>₹{Math.round(launch.target_revenue_rupees).toLocaleString()}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        launch.launch_status === 'planned' ? 'bg-yellow-100 text-yellow-800' :
                        launch.launch_status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {launch.launch_status.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
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
          onChange={(e) => setEditValue(Number(e.target.value))}
          className="w-16 px-2 py-1 text-xs border rounded focus:ring-2 focus:ring-blue-500"
          autoFocus
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