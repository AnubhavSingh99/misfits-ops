import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, X, User, MapPin, ChevronDown, Check, Loader2, Users, Calendar, Sun } from 'lucide-react';
import type { LeaderRequirement, VenueRequirement, CreateRequirementRequest, TimeOfDay } from '../../../../shared/types';
import { TIME_OF_DAY_OPTIONS } from '../../../../shared/types';
import { getTeamForClub } from '../../../../shared/teamConfig';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

interface RequirementSelectorProps {
  type: 'leader' | 'venue';
  context: {
    activity_id?: number;
    activity_name?: string;
    city_id?: number;
    city_name?: string;
    area_id?: number;
    area_name?: string;
    club_id?: number;
    club_name?: string;
    launch_id?: number;
    target_id?: number;
  };
  selectedRequirements: (LeaderRequirement | VenueRequirement)[];
  onSelectionsChange: (requirements: (LeaderRequirement | VenueRequirement)[]) => void;
}

export function RequirementSelector({
  type,
  context,
  selectedRequirements,
  onSelectionsChange
}: RequirementSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<(LeaderRequirement | VenueRequirement)[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Use ref to track latest selectedRequirements to avoid stale closure issues
  // Update synchronously on every render (not in useEffect) to ensure it's always current
  const selectedReqRef = useRef(selectedRequirements);
  selectedReqRef.current = selectedRequirements;

  const typeLabel = type === 'leader' ? 'Leader' : 'Venue';
  const typeIcon = type === 'leader' ? User : MapPin;
  const TypeIcon = typeIcon;

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search requirements
  useEffect(() => {
    const searchRequirements = async () => {
      if (!showDropdown) return;

      setIsSearching(true);
      try {
        const params = new URLSearchParams();
        if (searchQuery) params.append('q', searchQuery);
        if (context.club_id) params.append('club_id', String(context.club_id));
        if (context.activity_id) params.append('activity_id', String(context.activity_id));
        if (context.city_id) params.append('city_id', String(context.city_id));
        if (context.area_id) params.append('area_id', String(context.area_id));
        params.append('limit', '15');

        const endpoint = type === 'leader' ? 'leaders' : 'venues';
        const response = await fetch(`${API_BASE}/requirements/${endpoint}/search?${params}`);
        const data = await response.json();
        if (data.success) {
          // Filter to ensure only requirements with valid numeric IDs are displayed
          const validRequirements = (data.requirements || []).filter(
            (r: LeaderRequirement | VenueRequirement) => r.id && typeof r.id === 'number'
          );
          setSearchResults(validRequirements);
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchRequirements, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, showDropdown, type, context]);

  // Toggle selection
  const toggleSelection = (req: LeaderRequirement | VenueRequirement) => {
    // Validate requirement has valid ID
    if (!req.id || typeof req.id !== 'number') {
      console.error('Cannot select requirement with invalid ID:', req);
      return;
    }
    const isSelected = selectedRequirements.some(r => r.id === req.id);
    if (isSelected) {
      onSelectionsChange(selectedRequirements.filter(r => r.id !== req.id));
    } else {
      onSelectionsChange([...selectedRequirements, req]);
    }
  };

  // Remove selected requirement
  const removeSelection = (reqId: number) => {
    onSelectionsChange(selectedRequirements.filter(r => r.id !== reqId));
  };

  // Create new requirement
  const handleCreateRequirement = async (data: CreateRequirementRequest) => {
    try {
      const endpoint = type === 'leader' ? 'leaders' : 'venues';
      const response = await fetch(`${API_BASE}/requirements/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (result.success && result.requirement) {
        // Validate that the requirement has a valid ID before adding
        if (!result.requirement.id || typeof result.requirement.id !== 'number') {
          console.error('Created requirement has invalid ID:', result.requirement);
          alert(`Requirement created but has invalid ID. Please refresh and try again.`);
          return;
        }
        // Add newly created requirement to selections
        // Use ref to get latest selections to avoid stale closure issues
        onSelectionsChange([...selectedReqRef.current, result.requirement]);
        setShowCreateModal(false);
      } else {
        console.error('Failed to create requirement:', result.error);
        alert(`Failed to create requirement: ${result.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Failed to create requirement:', err);
      alert('Failed to create requirement. Please try again.');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      // Venue requirement statuses (matching VenueRequirementsDashboard)
      'not_picked': 'bg-slate-50 text-slate-600',
      'picked': 'bg-blue-50 text-blue-700',
      'venue_aligned': 'bg-teal-50 text-teal-700',
      'leader_approval': 'bg-purple-50 text-purple-700',
      'done': 'bg-emerald-50 text-emerald-700',
      'deprioritised': 'bg-amber-50 text-amber-700',
      // Leader requirement statuses
      'in_progress': 'bg-blue-50 text-blue-700'
    };
    return styles[status] || styles['not_picked'];
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        <TypeIcon className="inline h-4 w-4 mr-1" />
        {typeLabel} Requirements
      </label>

      {/* Selected Requirements */}
      {selectedRequirements.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedRequirements.map(req => (
            <div
              key={req.id}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium
                ${type === 'leader' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-teal-50 text-teal-700 border border-teal-200'}`}
            >
              <TypeIcon className="h-3 w-3" />
              <span className="max-w-[150px] truncate">{req.name || 'Unnamed'}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${getStatusBadge(req.status || 'not_picked')}`}>
                {(req.status || 'not_picked').replace('_', ' ')}
              </span>
              <button
                type="button"
                onClick={() => removeSelection(req.id)}
                className="p-0.5 hover:bg-white/50 rounded-full"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search/Add Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setShowDropdown(true)}
              placeholder={`Search ${typeLabel.toLowerCase()} requirements...`}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-1
              ${type === 'leader'
                ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                : 'bg-teal-100 text-teal-700 hover:bg-teal-200'
              }`}
          >
            <Plus className="h-4 w-4" />
            New
          </button>
        </div>

        {/* Dropdown Results */}
        {showDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
            {isSearching ? (
              <div className="p-4 text-center text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                Searching...
              </div>
            ) : searchResults.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                No {typeLabel.toLowerCase()} requirements found.
                <button
                  type="button"
                  onClick={() => {
                    setShowDropdown(false);
                    setShowCreateModal(true);
                  }}
                  className="block mx-auto mt-2 text-blue-600 hover:underline"
                >
                  Create new {typeLabel.toLowerCase()} requirement
                </button>
              </div>
            ) : (
              <div className="py-1">
                {searchResults.map(req => {
                  const isSelected = selectedRequirements.some(r => r.id === req.id);
                  return (
                    <button
                      key={req.id}
                      type="button"
                      onClick={() => toggleSelection(req)}
                      className={`w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2
                        ${isSelected ? 'bg-blue-50' : ''}`}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center
                        ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}
                      >
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{req.name}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {[req.activity_name, req.city_name, req.area_name].filter(Boolean).join(' > ')}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadge(req.status || 'not_picked')}`}>
                        {(req.status || 'not_picked').replace('_', ' ')}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Modal - rendered via Portal to avoid nested form issues */}
      {showCreateModal && createPortal(
        <CreateRequirementModal
          type={type}
          context={context}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateRequirement}
        />,
        document.body
      )}
    </div>
  );
}

// Create Requirement Modal
interface CreateRequirementModalProps {
  type: 'leader' | 'venue';
  context: {
    activity_id?: number;
    activity_name?: string;
    city_id?: number;
    city_name?: string;
    area_id?: number;
    area_name?: string;
    club_id?: number;
    club_name?: string;
    launch_id?: number;
    target_id?: number;
  };
  onClose: () => void;
  onCreate: (data: CreateRequirementRequest) => void;
}

function CreateRequirementModal({ type, context, onClose, onCreate }: CreateRequirementModalProps) {
  // Generate default name from context hierarchy
  // Format: "Club/Launch/Expansion Name - Area Name"
  const generateDefaultName = () => {
    // If a club/launch/expansion is selected, use "ClubName - AreaName" format
    if (context.club_name) {
      if (context.area_name) {
        return `${context.club_name} - ${context.area_name}`;
      }
      return context.club_name;
    }

    // Otherwise, generate from activity/city/area
    const parts: string[] = [];
    if (context.activity_name) {
      // Shorten activity name if too long
      const actShort = context.activity_name.length > 12
        ? context.activity_name.substring(0, 10)
        : context.activity_name;
      parts.push(actShort);
    }
    if (context.city_name) {
      // Use common abbreviations for cities
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
    return parts.join(' ') || '';
  };

  const [name, setName] = useState(generateDefaultName());
  const [description, setDescription] = useState('');
  const [growthEffort, setGrowthEffort] = useState(false);
  const [platformEffort, setPlatformEffort] = useState(false);
  const [existingLeaderEffort, setExistingLeaderEffort] = useState(false);
  const [leadersRequired, setLeadersRequired] = useState(1);
  const [creating, setCreating] = useState(false);

  // Venue-specific scheduling fields
  const [dayTypeId, setDayTypeId] = useState<number | undefined>(undefined);
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<TimeOfDay[]>([]);
  const [amenitiesRequired, setAmenitiesRequired] = useState('');
  const [dayTypes, setDayTypes] = useState<{ id: number; name: string }[]>([]);

  // Fetch day types for venue requirements
  useEffect(() => {
    if (type === 'venue') {
      const fetchDayTypes = async () => {
        try {
          const res = await fetch(`${API_BASE}/requirements/venues/day-types`);
          const data = await res.json();
          if (data.success) setDayTypes(data.day_types || []);
        } catch (err) {
          console.error('Failed to fetch day types:', err);
        }
      };
      fetchDayTypes();
    }
  }, [type]);

  const toggleTimeSlot = (slot: TimeOfDay) => {
    setSelectedTimeSlots(prev =>
      prev.includes(slot)
        ? prev.filter(s => s !== slot)
        : [...prev, slot]
    );
  };

  const typeLabel = type === 'leader' ? 'Leader' : 'Venue';
  const autoTeam = context.activity_name && context.city_name
    ? getTeamForClub(context.activity_name, context.city_name)
    : null;

  // Validation: venue requires day_type and time_of_day
  const isVenueValid = type !== 'venue' || (dayTypeId && selectedTimeSlots.length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!isVenueValid) return;

    setCreating(true);
    await onCreate({
      name: name.trim(),
      description: description.trim() || undefined,
      activity_id: context.activity_id,
      activity_name: context.activity_name,
      city_id: context.city_id,
      city_name: context.city_name,
      area_id: context.area_id,
      area_name: context.area_name,
      club_id: context.club_id,
      club_name: context.club_name,
      launch_id: context.launch_id,
      target_id: context.target_id,
      growth_team_effort: growthEffort,
      platform_team_effort: platformEffort,
      existing_leader_effort: type === 'leader' ? existingLeaderEffort : undefined,
      leaders_required: type === 'leader' ? leadersRequired : undefined,
      // Venue-specific fields
      day_type_id: type === 'venue' ? dayTypeId : undefined,
      time_of_day: type === 'venue' ? selectedTimeSlots : undefined,
      amenities_required: type === 'venue' ? (amenitiesRequired.trim() || undefined) : undefined,
      team: autoTeam || undefined
    });
    setCreating(false);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <h3 className="text-base font-bold text-gray-900">
              New {typeLabel} Requirement
            </h3>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {/* Context Banner */}
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 text-sm">
            <div className="text-gray-500 mb-1">Context (inherited from task)</div>
            <div className="flex flex-wrap gap-1.5">
              {context.activity_name && (
                <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs">
                  {context.activity_name}
                </span>
              )}
              {context.city_name && (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                  {context.city_name}
                </span>
              )}
              {context.area_name && (
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs">
                  {context.area_name}
                </span>
              )}
              {context.club_name && !context.launch_id && !context.target_id && (
                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs">
                  {context.club_name}
                </span>
              )}
              {context.launch_id && (
                <span className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full text-xs">
                  🚀 Launch: {context.club_name || `#${context.launch_id}`}
                </span>
              )}
              {context.target_id && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs">
                  📍 Expansion: {context.club_name || `Target #${context.target_id}`}
                </span>
              )}
            </div>
            {autoTeam && (
              <div className="mt-2 text-xs text-gray-500">
                Team: <span className="font-medium capitalize">{autoTeam}</span> (auto-assigned)
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={type === 'leader' ? 'e.g., Premium Coach' : 'e.g., Court Booking'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={type === 'leader' ? 'Requirements for the leader...' : 'Venue requirements...'}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Leaders Required - Only for leader type */}
            {type === 'leader' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Users className="inline h-4 w-4 mr-1" />
                  Leaders Required
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={leadersRequired}
                  onChange={(e) => setLeadersRequired(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">How many leaders are needed?</p>
              </div>
            )}

            {/* Venue-specific scheduling fields */}
            {type === 'venue' && (
              <>
                {/* Day Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Calendar className="inline h-4 w-4 mr-1" />
                    Day Type *
                  </label>
                  <select
                    value={dayTypeId || ''}
                    onChange={(e) => setDayTypeId(e.target.value ? parseInt(e.target.value) : undefined)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white
                      ${!dayTypeId ? 'border-gray-300' : 'border-teal-300'}`}
                  >
                    <option value="">Select Day Type</option>
                    {dayTypes.map(dt => (
                      <option key={dt.id} value={dt.id}>{dt.name}</option>
                    ))}
                  </select>
                </div>

                {/* Time of Day */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Sun className="inline h-4 w-4 mr-1" />
                    Time of Day *
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {TIME_OF_DAY_OPTIONS.map(option => {
                      const isSelected = selectedTimeSlots.includes(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => toggleTimeSlot(option.value)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border
                            ${isSelected
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                            }`}
                        >
                          {option.icon} {option.label}
                        </button>
                      );
                    })}
                  </div>
                  {selectedTimeSlots.length === 0 && (
                    <p className="mt-1 text-xs text-gray-500">Select at least one time slot</p>
                  )}
                </div>

                {/* Amenities */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amenities Required (Optional)</label>
                  <textarea
                    value={amenitiesRequired}
                    onChange={(e) => setAmenitiesRequired(e.target.value)}
                    rows={2}
                    placeholder="e.g., Parking, AC, Changing rooms..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm resize-none"
                  />
                </div>
              </>
            )}

            {/* Effort Required - Only for leader type */}
            {type === 'leader' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Effort Required</label>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={growthEffort}
                      onChange={(e) => setGrowthEffort(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                    />
                    <span className="text-sm text-gray-700">Growth Team</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={platformEffort}
                      onChange={(e) => setPlatformEffort(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                    />
                    <span className="text-sm text-gray-700">Platform Team</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={existingLeaderEffort}
                      onChange={(e) => setExistingLeaderEffort(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-sm text-gray-700">Existing Leader</span>
                  </label>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !name.trim() || !isVenueValid}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-white rounded-lg
                  ${type === 'leader'
                    ? 'bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300'
                    : 'bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300'
                  }`}
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Create & Link
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export default RequirementSelector;
