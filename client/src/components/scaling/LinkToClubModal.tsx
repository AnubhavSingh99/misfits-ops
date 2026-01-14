import { useState, useEffect, useMemo } from 'react'
import { X, Link2, Search, Loader2, CheckCircle2, MapPin } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

// =====================================================
// LINK TO CLUB MODAL
// Manual matching modal for linking launch targets to clubs
// Features: Activity locked, city filter, same-city-only for "All Areas"
// =====================================================

interface LaunchInfo {
  id: number
  planned_club_name: string
  activity_name: string
  activity_id: number
  city_id: number
  city_name: string
  area_id: number
  area_name: string
}

interface MatchingClub {
  club_id: number
  club_uuid: string
  club_name: string
  city_name: string
  area_name: string
  is_same_area: boolean
  is_same_city: boolean
  event_count: number
  health_status: 'green' | 'yellow' | 'red' | 'gray'
  first_event_after_launch?: boolean
}

interface LinkToClubModalProps {
  isOpen: boolean
  onClose: () => void
  launch: LaunchInfo
  onLink: (data: {
    club_id: number
    club_uuid: string
    club_name: string
    transfer_targets: boolean
  }) => Promise<void>
}

export function LinkToClubModal({ isOpen, onClose, launch, onLink }: LinkToClubModalProps) {
  // Filter states
  const [cities, setCities] = useState<{ id: number; name: string }[]>([])
  const [areas, setAreas] = useState<{ id: number; name: string }[]>([])
  const [clubs, setClubs] = useState<MatchingClub[]>([])

  // Selected values
  const [selectedCityId, setSelectedCityId] = useState<number>(launch.city_id)
  const [selectedAreaId, setSelectedAreaId] = useState<number | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedClubId, setSelectedClubId] = useState<number | null>(null)
  const [transferTargets, setTransferTargets] = useState(true)

  // Loading states
  const [loadingCities, setLoadingCities] = useState(false)
  const [loadingAreas, setLoadingAreas] = useState(false)
  const [loadingClubs, setLoadingClubs] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch cities on mount
  useEffect(() => {
    if (!isOpen) return

    const fetchCities = async () => {
      setLoadingCities(true)
      try {
        const res = await fetch(`${API_BASE}/scaling-tasks/filters/cities?activity_ids=${launch.activity_id}`)
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
  }, [isOpen, launch.activity_id])

  // Fetch areas when city changes
  useEffect(() => {
    if (!isOpen || !selectedCityId) return

    const fetchAreas = async () => {
      setLoadingAreas(true)
      try {
        const res = await fetch(`${API_BASE}/scaling-tasks/filters/areas?city_ids=${selectedCityId}`)
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
    setSelectedAreaId('all') // Reset area when city changes
  }, [isOpen, selectedCityId])

  // Fetch matching clubs
  useEffect(() => {
    if (!isOpen) return

    const fetchClubs = async () => {
      setLoadingClubs(true)
      try {
        const params = new URLSearchParams({
          activity_name: launch.activity_name,
          city_id: String(selectedCityId)
        })
        if (selectedAreaId !== 'all') {
          params.append('area_id', String(selectedAreaId))
        }
        if (searchQuery) {
          params.append('search', searchQuery)
        }

        const res = await fetch(`${API_BASE}/targets/v2/launches/${launch.id}/matching-clubs?${params}`)
        const data = await res.json()
        if (data.success && data.clubs) {
          setClubs(data.clubs)
        }
      } catch (err) {
        console.error('Failed to fetch matching clubs:', err)
        // For now, use mock data if endpoint doesn't exist yet
        setClubs([])
      } finally {
        setLoadingClubs(false)
      }
    }

    const debounce = setTimeout(fetchClubs, 300)
    return () => clearTimeout(debounce)
  }, [isOpen, launch.id, launch.activity_name, selectedCityId, selectedAreaId, searchQuery])

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setSelectedCityId(launch.city_id)
      setSelectedAreaId('all')
      setSearchQuery('')
      setSelectedClubId(null)
      setTransferTargets(true)
      setError(null)
    }
  }, [isOpen, launch.city_id])

  // Filter and sort clubs
  const filteredClubs = useMemo(() => {
    return [...clubs].sort((a, b) => {
      // Same area first
      if (a.is_same_area && !b.is_same_area) return -1
      if (!a.is_same_area && b.is_same_area) return 1
      // Then same city
      if (a.is_same_city && !b.is_same_city) return -1
      if (!a.is_same_city && b.is_same_city) return 1
      // Then alphabetical
      return a.club_name.localeCompare(b.club_name)
    })
  }, [clubs])

  const selectedClub = useMemo(() => {
    return clubs.find(c => c.club_id === selectedClubId)
  }, [clubs, selectedClubId])

  const handleLink = async () => {
    if (!selectedClub) return

    setSaving(true)
    setError(null)
    try {
      await onLink({
        club_id: selectedClub.club_id,
        club_uuid: selectedClub.club_uuid,
        club_name: selectedClub.club_name,
        transfer_targets: transferTargets
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link club')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const healthColors = {
    green: 'bg-emerald-500',
    yellow: 'bg-amber-500',
    red: 'bg-red-500',
    gray: 'bg-gray-400'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-sky-50 to-indigo-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center">
              <Link2 size={20} className="text-sky-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Link to Existing Club</h3>
              <p className="text-sm text-gray-500 truncate max-w-[280px]">
                {launch.planned_club_name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/80 text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 space-y-3 flex-shrink-0">
          <div className="grid grid-cols-3 gap-3">
            {/* Activity (locked) */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Activity</label>
              <div className="px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-600 truncate">
                {launch.activity_name}
              </div>
            </div>

            {/* City */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
              <select
                value={selectedCityId}
                onChange={(e) => setSelectedCityId(Number(e.target.value))}
                disabled={loadingCities}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
                  focus:ring-2 focus:ring-sky-500 focus:border-transparent
                  disabled:bg-gray-100"
              >
                {cities.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Area */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Area</label>
              <select
                value={selectedAreaId}
                onChange={(e) => setSelectedAreaId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                disabled={loadingAreas}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
                  focus:ring-2 focus:ring-sky-500 focus:border-transparent
                  disabled:bg-gray-100"
              >
                <option value="all">All Areas</option>
                {areas.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search clubs by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg
                focus:ring-2 focus:ring-sky-500 focus:border-transparent
                placeholder:text-gray-400"
            />
          </div>
        </div>

        {/* Club List */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loadingClubs ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : filteredClubs.length === 0 ? (
            <div className="text-center py-12">
              <MapPin size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-gray-500 text-sm">No matching clubs found</p>
              <p className="text-gray-400 text-xs mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredClubs.map(club => (
                <button
                  key={club.club_id}
                  onClick={() => setSelectedClubId(club.club_id)}
                  className={`w-full p-3 rounded-lg border-2 text-left transition-all
                    ${selectedClubId === club.club_id
                      ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-200'
                      : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                    }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {/* Health dot */}
                        <div className={`w-2 h-2 rounded-full ${healthColors[club.health_status]}`} />
                        <span className="font-medium text-gray-900 truncate">
                          {club.club_name}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {club.city_name} • {club.area_name}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {club.is_same_area && (
                        <span className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide
                          bg-emerald-100 text-emerald-700 rounded">
                          Same Area
                        </span>
                      )}
                      {!club.is_same_area && club.is_same_city && (
                        <span className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide
                          bg-sky-100 text-sky-700 rounded">
                          Same City
                        </span>
                      )}
                      {selectedClubId === club.club_id && (
                        <CheckCircle2 size={18} className="text-sky-500" />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Transfer Option */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50 flex-shrink-0">
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={transferTargets}
              onChange={(e) => setTransferTargets(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-sky-600
                focus:ring-sky-500 focus:ring-offset-0"
            />
            <div>
              <span className="text-sm text-gray-700 group-hover:text-gray-900">
                Transfer targets to club
              </span>
              <span className="text-xs text-gray-400 ml-1">(recommended)</span>
            </div>
          </label>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-3 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex-shrink-0">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-white flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100
              rounded-lg transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleLink}
            disabled={saving || !selectedClubId}
            className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg
              font-medium transition-colors flex items-center gap-2 disabled:opacity-50
              disabled:cursor-not-allowed text-sm"
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Link2 size={16} />
            )}
            Link to Club
          </button>
        </div>
      </div>
    </div>
  )
}

export default LinkToClubModal
