import { useState, useEffect, useMemo } from 'react'
import { X, MapPin, Loader2, Target } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

// Types
interface ExpandClubModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: ExpandClubTargetData) => Promise<void>
  context: {
    activity_id?: number
    activity_name?: string
    city_id?: number
    city_name?: string
    area_id?: number
    area_name?: string
    club_id?: number
    club_name?: string
  }
  // Optional: Pre-fill values when duplicating an existing target
  existingTarget?: {
    target_meetups: number
    meetup_cost: number
    meetup_capacity: number
    name?: string
    day_type_id?: number | null
  } | null
}

export interface ExpandClubTargetData {
  club_id: number
  area_id: number
  target_meetups: number
  target_revenue: number
  meetup_cost: number
  meetup_capacity: number
  day_type_id?: number | null
  name?: string
}

interface FilterOption {
  id: number
  name: string
}

interface ClubOption {
  club_pk: number
  club_name: string
  activity_id: number
  activity_name: string
  city_id: number
  city_name: string
  area_id: number
  area_name: string
}

interface DayType {
  id: number
  name: string
}

export function ExpandClubModal({ isOpen, onClose, onSave, context, existingTarget }: ExpandClubModalProps) {
  // Filter states
  const [activities, setActivities] = useState<FilterOption[]>([])
  const [cities, setCities] = useState<FilterOption[]>([])
  const [areas, setAreas] = useState<FilterOption[]>([])
  const [clubs, setClubs] = useState<ClubOption[]>([])
  const [dayTypes, setDayTypes] = useState<DayType[]>([])

  // Selected values - these are production IDs (using scaling-tasks/filters API)
  const [selectedActivityId, setSelectedActivityId] = useState<number | undefined>(context?.activity_id)
  const [selectedCityId, setSelectedCityId] = useState<number | undefined>(context?.city_id)
  const [selectedAreaId, setSelectedAreaId] = useState<number | undefined>(context?.area_id)
  const [selectedClubId, setSelectedClubId] = useState<number | undefined>(context?.club_id)

  // Form fields
  const [targetMeetups, setTargetMeetups] = useState(1)
  const [meetupCost, setMeetupCost] = useState(200)
  const [meetupCapacity, setMeetupCapacity] = useState(15)
  const [targetName, setTargetName] = useState('')
  const [selectedDayTypeId, setSelectedDayTypeId] = useState<number | null>(null)

  // Loading states
  const [loadingActivities, setLoadingActivities] = useState(false)
  const [loadingCities, setLoadingCities] = useState(false)
  const [loadingAreas, setLoadingAreas] = useState(false)
  const [loadingClubs, setLoadingClubs] = useState(false)
  const [loadingDayTypes, setLoadingDayTypes] = useState(false)
  const [loadingDefaults, setLoadingDefaults] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Calculate revenue
  const calculatedRevenue = useMemo(() => {
    return targetMeetups * meetupCost * meetupCapacity
  }, [targetMeetups, meetupCost, meetupCapacity])

  // Get selected club object
  const selectedClub = useMemo(() => {
    return clubs.find(c => c.club_pk === selectedClubId)
  }, [clubs, selectedClubId])

  // Fetch activities on mount
  useEffect(() => {
    if (!isOpen) return

    const fetchActivities = async () => {
      setLoadingActivities(true)
      try {
        const res = await fetch(`${API_BASE}/scaling/activities`)
        const data = await res.json()
        if (data.success && data.activities) {
          setActivities(data.activities.map((a: any) => ({
            id: Number(a.id),
            name: a.name
          })))
        }
      } catch (err) {
        console.error('Failed to fetch activities:', err)
      } finally {
        setLoadingActivities(false)
      }
    }

    const fetchDayTypes = async () => {
      setLoadingDayTypes(true)
      try {
        const res = await fetch(`${API_BASE}/targets/dimensions/day_type`)
        const data = await res.json()
        if (data.success && data.values) {
          setDayTypes(data.values)
        }
      } catch (err) {
        console.error('Failed to fetch day types:', err)
      } finally {
        setLoadingDayTypes(false)
      }
    }

    fetchActivities()
    fetchDayTypes()
  }, [isOpen])

  // Fetch cities (filtered by activity if selected) - uses production IDs
  useEffect(() => {
    if (!isOpen) return

    const fetchCities = async () => {
      setLoadingCities(true)
      try {
        // include_all=true to show ALL cities, not just those with active clubs for this activity
        // This is needed because we're expanding to new areas where the club doesn't exist yet
        const params = selectedActivityId ? `?activity_ids=${selectedActivityId}&include_all=true` : '?include_all=true'
        const res = await fetch(`${API_BASE}/scaling-tasks/filters/cities${params}`)
        const data = await res.json()
        if (data.success && data.options) {
          setCities(data.options)
        }
      } catch (err) {
        console.error('Failed to fetch cities:', err)
      } finally {
        setLoadingCities(false)
      }
    }

    fetchCities()
  }, [isOpen, selectedActivityId])

  // Fetch areas (filtered by city only) - allows selecting ANY area in the city for expansion
  useEffect(() => {
    if (!isOpen) return

    if (!selectedCityId) {
      setAreas([])
      return
    }

    const fetchAreas = async () => {
      setLoadingAreas(true)
      try {
        // Only filter by city - show ALL areas in the city for expansion target (include_all=true)
        const res = await fetch(`${API_BASE}/scaling-tasks/filters/areas?city_ids=${selectedCityId}&include_all=true`)
        const data = await res.json()
        if (data.success && data.options) {
          setAreas(data.options)
        }
      } catch (err) {
        console.error('Failed to fetch areas:', err)
      } finally {
        setLoadingAreas(false)
      }
    }

    fetchAreas()
  }, [isOpen, selectedCityId])

  // Fetch clubs (filtered by activity ONLY) - NOT by city or area
  // This is for "expand existing club to new area/city" - an existing club can expand anywhere
  // e.g., Dropshot Society (Noida) can have expansion target in Ghaziabad
  useEffect(() => {
    if (!isOpen) return

    if (!selectedActivityId) {
      setClubs([])
      return
    }

    const fetchClubs = async () => {
      setLoadingClubs(true)
      try {
        const params = new URLSearchParams()
        params.append('activity_ids', String(selectedActivityId))
        // NOTE: NOT filtering by city or area - clubs should be visible for expansion to ANY location

        const res = await fetch(`${API_BASE}/scaling-tasks/filters/clubs?${params}`)
        const data = await res.json()
        if (data.success && data.options) {
          // Map to ClubOption format
          setClubs(data.options.map((c: any) => ({
            club_pk: c.id,
            club_name: c.name,
            activity_id: selectedActivityId,
            activity_name: '',
            city_id: selectedCityId || 0,
            city_name: '',
            area_id: 0, // Club's original area - not relevant for expansion
            area_name: ''
          })))
        }
      } catch (err) {
        console.error('Failed to fetch clubs:', err)
      } finally {
        setLoadingClubs(false)
      }
    }

    fetchClubs()
  }, [isOpen, selectedActivityId]) // Only depends on activity - clubs can expand to any city/area

  // Fetch meetup defaults when club changes
  useEffect(() => {
    if (!selectedClub) return

    const fetchDefaults = async () => {
      setLoadingDefaults(true)
      try {
        const params = new URLSearchParams()
        if (selectedClub.activity_name) params.append('activity', selectedClub.activity_name)
        if (selectedClub.city_name) params.append('city', selectedClub.city_name)
        if (selectedClub.area_name) params.append('area', selectedClub.area_name)

        const res = await fetch(`${API_BASE}/targets/meetup-defaults?${params}`)
        const data = await res.json()
        if (data.success) {
          if (data.meetup_cost !== null) setMeetupCost(data.meetup_cost)
          if (data.meetup_capacity !== null) setMeetupCapacity(data.meetup_capacity)
        }
      } catch (err) {
        console.error('Failed to fetch meetup defaults:', err)
      } finally {
        setLoadingDefaults(false)
      }
    }

    fetchDefaults()
  }, [selectedClub])

  // Initialize when modal opens - directly from context (no resolution needed)
  useEffect(() => {
    if (isOpen && context) {
      // Set selections directly from context (using production IDs)
      setSelectedActivityId(context.activity_id)
      setSelectedCityId(context.city_id)
      setSelectedAreaId(context.area_id)
      setSelectedClubId(context.club_id)

      // If duplicating an existing target, pre-fill form values
      if (existingTarget) {
        setTargetMeetups(existingTarget.target_meetups)
        setMeetupCost(existingTarget.meetup_cost)
        setMeetupCapacity(existingTarget.meetup_capacity)
        setTargetName(existingTarget.name || '')
        setSelectedDayTypeId(existingTarget.day_type_id || null)
      } else {
        // Reset form fields to defaults
        setTargetMeetups(1)
        setMeetupCost(200)
        setMeetupCapacity(15)
        setTargetName('')
        setSelectedDayTypeId(null)
      }
      setError(null)
    }
  }, [isOpen, context, existingTarget])

  // Handlers for cascading changes
  const handleActivityChange = (id: number | undefined) => {
    setSelectedActivityId(id)
    setSelectedCityId(undefined)
    setSelectedAreaId(undefined)
    setSelectedClubId(undefined)
  }

  const handleCityChange = (id: number | undefined) => {
    setSelectedCityId(id)
    setSelectedAreaId(undefined)
    setSelectedClubId(undefined)
  }

  // All required fields: Club, Area, Target Meetups, Cost, Capacity
  const canSave = selectedClubId && selectedAreaId && targetMeetups > 0 && meetupCost > 0 && meetupCapacity > 0

  const handleSave = async () => {
    if (!canSave) {
      const missing: string[] = []
      if (!selectedClubId) missing.push('Club')
      if (!selectedAreaId) missing.push('Area')
      if (targetMeetups <= 0) missing.push('Target Meetups')
      if (meetupCost <= 0) missing.push('Cost')
      if (meetupCapacity <= 0) missing.push('Capacity')
      setError(`Required: ${missing.join(', ')}`)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onSave({
        club_id: selectedClubId,
        area_id: selectedAreaId,
        target_meetups: targetMeetups,
        target_revenue: calculatedRevenue,
        meetup_cost: meetupCost,
        meetup_capacity: meetupCapacity,
        day_type_id: selectedDayTypeId,
        name: targetName.trim() || undefined
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save target')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b border-gray-200 ${existingTarget ? 'bg-violet-50' : 'bg-emerald-50'} flex-shrink-0`}>
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <MapPin size={20} className={existingTarget ? 'text-violet-600' : 'text-emerald-600'} />
              {existingTarget ? 'Duplicate Target' : 'Expand Club Target'}
            </h3>
            <p className="text-sm text-gray-500">
              {existingTarget ? 'Create similar target with pre-filled values' : 'Add target for existing club in new area'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Select Club Section - Compact 2-column grid */}
          <div className="px-5 pt-4 pb-3">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {/* Activity Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Activity</label>
                <select
                  value={selectedActivityId || ''}
                  onChange={(e) => handleActivityChange(e.target.value ? parseInt(e.target.value) : undefined)}
                  disabled={loadingActivities}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md text-gray-900
                    focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-50"
                >
                  <option value="">Select</option>
                  {activities.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              {/* City Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                <select
                  value={selectedCityId || ''}
                  onChange={(e) => handleCityChange(e.target.value ? parseInt(e.target.value) : undefined)}
                  disabled={loadingCities}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md text-gray-900
                    focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-50"
                >
                  <option value="">Select</option>
                  {cities.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Area Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Area <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedAreaId || ''}
                  onChange={(e) => setSelectedAreaId(e.target.value ? parseInt(e.target.value) : undefined)}
                  disabled={loadingAreas}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md text-gray-900
                    focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-50"
                >
                  <option value="">{selectedCityId ? 'Select' : 'Select city first'}</option>
                  {areas.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              {/* Club Selector */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Club <span className="text-red-500">*</span></label>
                <select
                  value={selectedClubId || ''}
                  onChange={(e) => setSelectedClubId(e.target.value ? parseInt(e.target.value) : undefined)}
                  disabled={loadingClubs}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md text-gray-900
                    focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-50"
                >
                  <option value="">Select</option>
                  {clubs.map(c => (
                    <option key={c.club_pk} value={c.club_pk}>{c.club_name}</option>
                  ))}
                </select>
              </div>
            </div>
            {clubs.length === 0 && !loadingClubs && selectedActivityId && (
              <p className="text-xs text-amber-600 mt-2">No clubs found for selected filters</p>
            )}
          </div>

          {/* Target Details Section */}
          <div className="px-6 pb-4 space-y-3">
            {/* Section Divider */}
            <div className="flex items-center gap-3 text-xs text-gray-400 uppercase tracking-wider">
              <div className="flex-1 h-px bg-gray-200" />
              <span>Target Details</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Day Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Day Type <span className="text-gray-400 font-normal">(for revenue matching)</span>
              </label>
              <select
                value={selectedDayTypeId || ''}
                onChange={(e) => setSelectedDayTypeId(e.target.value ? parseInt(e.target.value) : null)}
                disabled={loadingDayTypes}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900
                  focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-gray-100"
              >
                <option value="">All Days</option>
                {dayTypes.map(dt => (
                  <option key={dt.id} value={dt.id}>{dt.name}</option>
                ))}
              </select>
              <p className="text-xs text-amber-600 mt-1">
                Primary matching: Revenue is matched to targets based on day type.
              </p>
            </div>

            {/* Target Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Target Name <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g., Weekend Slots, Evening Meetups"
                value={targetName}
                onChange={(e) => setTargetName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-400
                  focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Fallback matching: When day type doesn't match, revenue is matched by comparing this name with meetup titles. Use a distinctive name that appears in your meetup titles.
              </p>
            </div>

            {/* Target Meetups */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Meetups <span className="text-red-500">*</span></label>
              <input
                type="number"
                min="1"
                value={targetMeetups}
                onChange={(e) => setTargetMeetups(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900
                  focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            {/* Cost & Capacity */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cost/Meetup (₹) <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min="0"
                  value={meetupCost}
                  onChange={(e) => setMeetupCost(parseInt(e.target.value) || 0)}
                  disabled={loadingDefaults}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900
                    focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Capacity <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min="1"
                  value={meetupCapacity}
                  onChange={(e) => setMeetupCapacity(parseInt(e.target.value) || 1)}
                  disabled={loadingDefaults}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900
                    focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-gray-100"
                />
              </div>
            </div>

            {/* Calculated Revenue */}
            <div className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
              <label className="block text-xs font-medium text-gray-500 mb-1">Calculated Revenue</label>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-gray-900">
                  ₹{calculatedRevenue >= 100000 ? `${(calculatedRevenue / 100000).toFixed(1)}L` : `${(calculatedRevenue / 1000).toFixed(1)}K`}
                </span>
                <span className="text-xs text-gray-400">
                  ({targetMeetups} × ₹{meetupCost} × {meetupCapacity})
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex-shrink-0">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg
              font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Target size={18} />}
            Add Target
          </button>
        </div>
      </div>
    </div>
  )
}

export default ExpandClubModal
