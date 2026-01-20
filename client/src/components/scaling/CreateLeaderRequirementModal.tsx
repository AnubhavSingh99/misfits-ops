import React, { useState, useEffect } from 'react';
import { User, X, Users, Loader2, Plus } from 'lucide-react';
import { getTeamForClub } from '../../../../shared/teamConfig';
import type { CreateRequirementRequest } from '../../../../shared/types';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const TEAM_COLORS: Record<string, { bg: string; text: string; light: string }> = {
  blue: { bg: 'bg-blue-500', text: 'text-blue-700', light: 'bg-blue-100' },
  green: { bg: 'bg-emerald-500', text: 'text-emerald-700', light: 'bg-emerald-100' },
  yellow: { bg: 'bg-amber-500', text: 'text-amber-700', light: 'bg-amber-100' }
};

// Context for pre-filling the modal from hierarchy
export interface CreateLeaderRequirementContext {
  activity_id?: number;
  activity_name?: string;
  city_id?: number;
  city_name?: string;
  area_id?: number;
  area_name?: string;
  club_id?: number;
  club_name?: string;
  launch_id?: number; // For launches
}

// Filter option type
interface FilterOption {
  id: number | string;
  name: string;
  is_launch?: boolean;
  launch_id?: number;
}

// Generate default name from context
function generateDefaultName(context: CreateLeaderRequirementContext): string {
  const parts: string[] = [];
  if (context.activity_name) {
    parts.push(context.activity_name.length > 12 ? context.activity_name.substring(0, 10) : context.activity_name);
  }
  if (context.city_name) {
    const cityAbbrev: Record<string, string> = {
      'Gurgaon': 'GGN', 'Gurugram': 'GGN', 'Noida': 'NOI', 'Delhi': 'DEL',
      'Faridabad': 'FBD', 'Ghaziabad': 'GZB', 'Bangalore': 'BLR', 'Mumbai': 'MUM',
      'Hyderabad': 'HYD', 'Chennai': 'CHN', 'Pune': 'PUN', 'Kolkata': 'KOL'
    };
    parts.push(cityAbbrev[context.city_name] || context.city_name.substring(0, 3).toUpperCase());
  }
  if (context.area_name) {
    parts.push(context.area_name);
  }
  return parts.join(' ') || 'New Leader';
}

interface CreateLeaderRequirementModalProps {
  isOpen: boolean;
  context: CreateLeaderRequirementContext;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateLeaderRequirementModal({
  isOpen,
  context,
  onClose,
  onCreated
}: CreateLeaderRequirementModalProps) {
  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [growthEffort, setGrowthEffort] = useState(false);
  const [platformEffort, setPlatformEffort] = useState(false);
  const [existingLeaderEffort, setExistingLeaderEffort] = useState(false);
  const [leadersRequired, setLeadersRequired] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hierarchy selection state
  const [selectedActivityId, setSelectedActivityId] = useState<number | undefined>(context.activity_id);
  const [selectedActivityName, setSelectedActivityName] = useState<string | undefined>(context.activity_name);
  const [selectedCityId, setSelectedCityId] = useState<number | undefined>(context.city_id);
  const [selectedCityName, setSelectedCityName] = useState<string | undefined>(context.city_name);
  const [selectedAreaId, setSelectedAreaId] = useState<number | undefined>(context.area_id);
  const [selectedAreaName, setSelectedAreaName] = useState<string | undefined>(context.area_name);
  const [selectedClubId, setSelectedClubId] = useState<number | undefined>(context.club_id);
  const [selectedClubName, setSelectedClubName] = useState<string | undefined>(context.club_name);
  const [selectedLaunchId, setSelectedLaunchId] = useState<number | undefined>(undefined);
  const [isLaunchSelected, setIsLaunchSelected] = useState(false);

  // Filter options
  const [activities, setActivities] = useState<FilterOption[]>([]);
  const [cities, setCities] = useState<FilterOption[]>([]);
  const [areas, setAreas] = useState<FilterOption[]>([]);
  const [clubs, setClubs] = useState<FilterOption[]>([]);

  // Calculate team from selection
  const team = selectedActivityName && selectedCityName
    ? getTeamForClub(selectedActivityName, selectedCityName)
    : undefined;

  // Generate name from current selection
  const generateName = () => {
    const parts: string[] = [];
    if (selectedActivityName) {
      parts.push(selectedActivityName.length > 12 ? selectedActivityName.substring(0, 10) : selectedActivityName);
    }
    if (selectedCityName) {
      const cityAbbrev: Record<string, string> = {
        'Gurgaon': 'GGN', 'Gurugram': 'GGN', 'Noida': 'NOI', 'Delhi': 'DEL',
        'Faridabad': 'FBD', 'Ghaziabad': 'GZB', 'Bangalore': 'BLR', 'Mumbai': 'MUM',
        'Hyderabad': 'HYD', 'Chennai': 'CHN', 'Pune': 'PUN', 'Kolkata': 'KOL'
      };
      parts.push(cityAbbrev[selectedCityName] || selectedCityName.substring(0, 3).toUpperCase());
    }
    if (selectedAreaName) {
      parts.push(selectedAreaName);
    }
    return parts.join(' ');
  };

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedActivityId(context.activity_id);
      setSelectedActivityName(context.activity_name);
      setSelectedCityId(context.city_id);
      setSelectedCityName(context.city_name);
      setSelectedAreaId(context.area_id);
      setSelectedAreaName(context.area_name);
      setSelectedClubId(context.launch_id ? undefined : context.club_id);
      setSelectedClubName(context.club_name);
      setSelectedLaunchId(context.launch_id);
      setIsLaunchSelected(!!context.launch_id);
      setName(generateDefaultName(context));
      setDescription('');
      setGrowthEffort(false);
      setPlatformEffort(false);
      setExistingLeaderEffort(false);
      setLeadersRequired(1);
      setError(null);
    }
  }, [isOpen, context]);

  // Fetch activities on mount
  useEffect(() => {
    if (!isOpen) return;
    const fetchActivities = async () => {
      try {
        const res = await fetch(`${API_BASE}/scaling-tasks/filters/activities`);
        const data = await res.json();
        if (data.success) setActivities(data.options || []);
      } catch (err) {
        console.error('Failed to fetch activities:', err);
      }
    };
    fetchActivities();
  }, [isOpen]);

  // Fetch all cities on mount
  useEffect(() => {
    if (!isOpen) return;
    const fetchCities = async () => {
      try {
        const res = await fetch(`${API_BASE}/scaling-tasks/filters/cities`);
        const data = await res.json();
        if (data.success) setCities(data.options || []);
      } catch (err) {
        console.error('Failed to fetch cities:', err);
      }
    };
    fetchCities();
  }, [isOpen]);

  // Fetch areas when city changes
  useEffect(() => {
    if (!isOpen) return;
    if (selectedCityId) {
      const fetchAreas = async () => {
        try {
          // include_all=true to show areas without active clubs (for launches)
          const res = await fetch(`${API_BASE}/scaling-tasks/filters/areas?city_ids=${selectedCityId}&include_all=true`);
          const data = await res.json();
          if (data.success) setAreas(data.options || []);
        } catch (err) {
          console.error('Failed to fetch areas:', err);
        }
      };
      fetchAreas();
    } else {
      setAreas([]);
    }
  }, [isOpen, selectedCityId]);

  // Fetch clubs and launches when area changes
  useEffect(() => {
    if (!isOpen) return;
    if (selectedActivityId && selectedCityId && selectedAreaId) {
      const fetchClubsAndLaunches = async () => {
        try {
          // Use the original endpoint which already handles both clubs and launches
          const res = await fetch(`${API_BASE}/scaling-tasks/filters/clubs?activity_ids=${selectedActivityId}&city_ids=${selectedCityId}&area_ids=${selectedAreaId}`);
          const data = await res.json();
          if (data.success) {
            setClubs(data.options || []);
          }
        } catch (err) {
          console.error('Failed to fetch clubs and launches:', err);
        }
      };
      fetchClubsAndLaunches();
    } else {
      setClubs([]);
    }
  }, [isOpen, selectedActivityId, selectedCityId, selectedAreaId]);

  // Update default name when selection changes
  useEffect(() => {
    if (!name || name === generateDefaultName(context)) {
      setName(generateName());
    }
  }, [selectedActivityName, selectedCityName, selectedAreaName]);

  const handleActivityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value ? parseInt(e.target.value) : undefined;
    const activity = activities.find(a => String(a.id) === e.target.value);
    setSelectedActivityId(id);
    setSelectedActivityName(activity?.name);
    // Reset cascading selections
    setSelectedCityId(undefined);
    setSelectedCityName(undefined);
    setSelectedAreaId(undefined);
    setSelectedAreaName(undefined);
    setSelectedClubId(undefined);
    setSelectedClubName(undefined);
  };

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value ? parseInt(e.target.value) : undefined;
    const city = cities.find(c => String(c.id) === e.target.value);
    setSelectedCityId(id);
    setSelectedCityName(city?.name);
    // Reset cascading selections
    setSelectedAreaId(undefined);
    setSelectedAreaName(undefined);
    setSelectedClubId(undefined);
    setSelectedClubName(undefined);
  };

  const handleAreaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value ? parseInt(e.target.value) : undefined;
    const area = areas.find(a => String(a.id) === e.target.value);
    setSelectedAreaId(id);
    setSelectedAreaName(area?.name);
    // Reset club/launch selection
    setSelectedClubId(undefined);
    setSelectedClubName(undefined);
    setSelectedLaunchId(undefined);
    setIsLaunchSelected(false);
  };

  const handleClubChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const club = clubs.find(c => String(c.id) === value);

    if (club?.is_launch) {
      // It's a launch
      setSelectedClubId(undefined);
      setSelectedLaunchId(club.launch_id);
      setIsLaunchSelected(true);
      setSelectedClubName(club.name.replace('🚀 ', '')); // Remove emoji for display
    } else if (value) {
      // It's a regular club
      setSelectedClubId(parseInt(value));
      setSelectedLaunchId(undefined);
      setIsLaunchSelected(false);
      setSelectedClubName(club?.name);
    } else {
      // Nothing selected
      setSelectedClubId(undefined);
      setSelectedLaunchId(undefined);
      setIsLaunchSelected(false);
      setSelectedClubName(undefined);
    }
  };

  const isValid = name.trim() && selectedActivityId && selectedCityId && selectedAreaId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setSubmitting(true);
    setError(null);

    try {
      const payload: CreateRequirementRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        activity_id: selectedActivityId,
        activity_name: selectedActivityName,
        city_id: selectedCityId,
        city_name: selectedCityName,
        area_id: selectedAreaId,
        area_name: selectedAreaName,
        club_id: isLaunchSelected ? undefined : selectedClubId,
        club_name: selectedClubName,
        launch_id: isLaunchSelected ? selectedLaunchId : undefined,
        growth_team_effort: growthEffort,
        platform_team_effort: platformEffort,
        existing_leader_effort: existingLeaderEffort,
        leaders_required: leadersRequired,
        team
      };

      const response = await fetch(`${API_BASE}/requirements/leaders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to create requirement');
      }

      onCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to create requirement');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4 text-center">
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

        <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all w-full max-w-lg">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-500 to-violet-600 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <User className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white">New Leader Requirement</h3>
              </div>
              <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                <X className="h-5 w-5 text-white" />
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Error Message */}
            {error && (
              <div className="px-3 py-2 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">
                {error}
              </div>
            )}

            {/* Hierarchy Selection */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Activity *</label>
                <select
                  value={selectedActivityId || ''}
                  onChange={handleActivityChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                >
                  <option value="">Select Activity</option>
                  {activities.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">City *</label>
                <select
                  value={selectedCityId || ''}
                  onChange={handleCityChange}
                  disabled={!selectedActivityId}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">Select City</option>
                  {cities.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Area *</label>
                <select
                  value={selectedAreaId || ''}
                  onChange={handleAreaChange}
                  disabled={!selectedCityId}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">Select Area</option>
                  {areas.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Club / Launch *</label>
                <select
                  value={isLaunchSelected ? `launch_${selectedLaunchId}` : (selectedClubId || '')}
                  onChange={handleClubChange}
                  disabled={!selectedAreaId || (selectedAreaId && clubs.length === 0)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed ${selectedAreaId && clubs.length === 0 ? 'border-amber-300 text-amber-600' : 'border-gray-300'}`}
                >
                  {selectedAreaId && clubs.length === 0 ? (
                    <option value="">No clubs, add a launch first</option>
                  ) : (
                    <>
                      <option value="">Select Club</option>
                      {clubs.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </>
                  )}
                </select>
              </div>
            </div>

            {/* Team Badge (auto-calculated) */}
            {team && (
              <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                <span className="text-xs text-gray-500">Team:</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase
                  ${TEAM_COLORS[team]?.light || 'bg-gray-100'} ${TEAM_COLORS[team]?.text || 'text-gray-700'}`}>
                  {team}
                </span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Leader requirement name..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Additional details..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm resize-none"
              />
            </div>

            {/* Leaders Required */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Users className="inline h-4 w-4 mr-1" />
                Leaders Required
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={leadersRequired}
                onChange={(e) => setLeadersRequired(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">How many leaders are needed?</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Effort Required</label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={growthEffort}
                    onChange={(e) => setGrowthEffort(e.target.checked)}
                    className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500"
                  />
                  <span className="text-sm text-gray-600">Growth Team</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={platformEffort}
                    onChange={(e) => setPlatformEffort(e.target.checked)}
                    className="w-4 h-4 text-cyan-600 border-gray-300 rounded focus:ring-cyan-500"
                  />
                  <span className="text-sm text-gray-600">Platform Team</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={existingLeaderEffort}
                    onChange={(e) => setExistingLeaderEffort(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                  />
                  <span className="text-sm text-gray-600">Existing Leader</span>
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isValid || submitting}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Create
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default CreateLeaderRequirementModal;
