import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Loader2, User, Users, Building2, Plus, Link2 } from 'lucide-react';
import type { LeaderRequirement, ClubOrLaunch, ScalingTask, CreateRequirementRequest } from '../../../../shared/types';
import { getTeamForClub } from '../../../../shared/teamConfig';
import { TaskSelector } from './TaskSelector';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

interface LeaderRequirementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  context: {
    activity_id?: number;
    activity_name?: string;
    city_id?: number;
    city_name?: string;
    area_id?: number;
    area_name?: string;
    club_id?: number;
    club_name?: string;
  };
  existingRequirement?: LeaderRequirement; // For edit mode
}

export function LeaderRequirementModal({
  isOpen,
  onClose,
  onSaved,
  context,
  existingRequirement
}: LeaderRequirementModalProps) {
  const isEditMode = !!existingRequirement;

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [leadersRequired, setLeadersRequired] = useState(1);
  const [growthEffort, setGrowthEffort] = useState(false);
  const [platformEffort, setPlatformEffort] = useState(false);
  const [existingLeaderEffort, setExistingLeaderEffort] = useState(false);
  const [selectedClubId, setSelectedClubId] = useState<number | undefined>();
  const [selectedLaunchId, setSelectedLaunchId] = useState<number | undefined>();

  // Club/Launch selection
  const [clubsAndLaunches, setClubsAndLaunches] = useState<ClubOrLaunch[]>([]);
  const [loadingClubs, setLoadingClubs] = useState(false);

  // Task linking
  const [linkedTasks, setLinkedTasks] = useState<ScalingTask[]>([]);
  const linkedTasksRef = useRef<ScalingTask[]>([]);

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update ref when state changes
  const updateLinkedTasks = (tasks: ScalingTask[]) => {
    linkedTasksRef.current = tasks;
    setLinkedTasks(tasks);
  };

  // Generate default name from context
  const generateDefaultName = () => {
    const parts: string[] = [];
    if (context.activity_name) {
      const actShort = context.activity_name.length > 12
        ? context.activity_name.substring(0, 10)
        : context.activity_name;
      parts.push(actShort);
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
  };

  // Initialize form when modal opens or existingRequirement changes
  useEffect(() => {
    if (isOpen) {
      if (existingRequirement) {
        // Edit mode - populate from existing
        setName(existingRequirement.name || '');
        setDescription(existingRequirement.description || '');
        setLeadersRequired((existingRequirement as any).leaders_required || 1);
        setGrowthEffort(existingRequirement.growth_team_effort || false);
        setPlatformEffort(existingRequirement.platform_team_effort || false);
        setExistingLeaderEffort((existingRequirement as any).existing_leader_effort || false);
        setSelectedClubId(existingRequirement.club_id);
        setSelectedLaunchId((existingRequirement as any).launch_id);
        // TODO: Load linked tasks for edit mode
        setLinkedTasks([]);
      } else {
        // Create mode - set defaults
        setName(generateDefaultName());
        setDescription('');
        setLeadersRequired(1);
        setGrowthEffort(false);
        setPlatformEffort(false);
        setExistingLeaderEffort(false);
        setSelectedClubId(context.club_id);
        setSelectedLaunchId(undefined);
        setLinkedTasks([]);
      }
      setError(null);
      fetchClubsAndLaunches();
    }
  }, [isOpen, existingRequirement, context]);

  // Fetch clubs and launches for dropdown
  const fetchClubsAndLaunches = async () => {
    setLoadingClubs(true);
    try {
      const params = new URLSearchParams();
      if (context.activity_id) params.append('activity_id', String(context.activity_id));
      if (context.city_id) params.append('city_id', String(context.city_id));
      if (context.area_id) params.append('area_id', String(context.area_id));

      const response = await fetch(`${API_BASE}/requirements/clubs-and-launches?${params}`);
      const data = await response.json();
      if (data.success) {
        setClubsAndLaunches(data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch clubs and launches:', err);
    } finally {
      setLoadingClubs(false);
    }
  };

  // Get selected club/launch info
  const selectedItem = useMemo(() => {
    if (selectedClubId) {
      return clubsAndLaunches.find(c => c.type === 'club' && c.id === selectedClubId);
    }
    if (selectedLaunchId) {
      return clubsAndLaunches.find(c => c.type === 'launch' && c.id === selectedLaunchId);
    }
    return null;
  }, [selectedClubId, selectedLaunchId, clubsAndLaunches]);

  // Auto-detect team from context or selection
  const autoTeam = useMemo(() => {
    const activityName = selectedItem?.activity_name || context.activity_name || '';
    const cityName = selectedItem?.city_name || context.city_name || '';
    if (activityName && cityName) {
      return getTeamForClub(activityName, cityName);
    }
    return null;
  }, [selectedItem, context]);

  // Handle club/launch selection
  const handleClubLaunchChange = (value: string) => {
    if (!value) {
      setSelectedClubId(undefined);
      setSelectedLaunchId(undefined);
      return;
    }
    const [type, id] = value.split(':');
    if (type === 'club') {
      setSelectedClubId(parseInt(id));
      setSelectedLaunchId(undefined);
    } else if (type === 'launch') {
      setSelectedLaunchId(parseInt(id));
      setSelectedClubId(undefined);
    }
  };

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (!selectedClubId && !selectedLaunchId) {
      setError('Please select a club or launch. Every requirement must be linked to a club.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: CreateRequirementRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        activity_id: selectedItem?.activity_id || context.activity_id,
        activity_name: selectedItem?.activity_name || context.activity_name,
        city_id: selectedItem?.city_id || context.city_id,
        city_name: selectedItem?.city_name || context.city_name,
        area_id: selectedItem?.area_id || context.area_id,
        area_name: selectedItem?.area_name || context.area_name,
        club_id: selectedClubId,
        club_name: selectedItem?.name,
        launch_id: selectedLaunchId,
        growth_team_effort: growthEffort,
        platform_team_effort: platformEffort,
        existing_leader_effort: existingLeaderEffort,
        leaders_required: leadersRequired,
        team: autoTeam || undefined
      };

      let requirementId: number;

      if (isEditMode && existingRequirement) {
        // Update existing
        const response = await fetch(`${API_BASE}/requirements/leaders/${existingRequirement.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || 'Failed to update requirement');
        }
        requirementId = existingRequirement.id;
      } else {
        // Create new
        const response = await fetch(`${API_BASE}/requirements/leaders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || 'Failed to create requirement');
        }
        requirementId = data.requirement?.id;
      }

      // Link tasks (if any selected)
      if (requirementId && linkedTasksRef.current.length > 0) {
        for (const task of linkedTasksRef.current) {
          try {
            await fetch(`${API_BASE}/scaling-tasks/${task.id}/requirements/leaders/${requirementId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });
          } catch (err) {
            console.error(`Failed to link task ${task.id}:`, err);
          }
        }
      }

      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save requirement');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {isEditMode ? 'Edit Leader Requirement' : 'New Leader Requirement'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {/* Context Banner */}
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 text-sm">
            <div className="text-gray-500 mb-1">Context</div>
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
              {context.club_name && (
                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs">
                  {context.club_name}
                </span>
              )}
            </div>
            {autoTeam && (
              <div className="mt-2 text-xs text-gray-500">
                Team: <span className="font-medium capitalize">{autoTeam}</span> (auto-assigned)
              </div>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Error Message */}
            {error && (
              <div className="px-3 py-2 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">
                {error}
              </div>
            )}

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Premium Badminton Coach"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Requirements for the leader..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Club/Launch Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Building2 className="inline h-4 w-4 mr-1" />
                Club or Launch *
              </label>
              {loadingClubs ? (
                <div className="flex items-center gap-2 text-gray-500 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading clubs...
                </div>
              ) : (
                <select
                  value={selectedClubId ? `club:${selectedClubId}` : selectedLaunchId ? `launch:${selectedLaunchId}` : ''}
                  onChange={(e) => handleClubLaunchChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                >
                  <option value="">Select club or launch...</option>
                  {clubsAndLaunches.filter(c => c.type === 'club').length > 0 && (
                    <optgroup label="Existing Clubs">
                      {clubsAndLaunches.filter(c => c.type === 'club').map(club => (
                        <option key={`club:${club.id}`} value={`club:${club.id}`}>
                          {club.name} {club.area_name ? `(${club.area_name})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {clubsAndLaunches.filter(c => c.type === 'launch').length > 0 && (
                    <optgroup label="Planned Launches">
                      {clubsAndLaunches.filter(c => c.type === 'launch').map(launch => (
                        <option key={`launch:${launch.id}`} value={`launch:${launch.id}`}>
                          🚀 {launch.name} {launch.area_name ? `(${launch.area_name})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              )}
            </div>

            {/* Leaders Required */}
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                How many leaders are needed? This number rolls up in the hierarchy.
              </p>
            </div>

            {/* Effort Types */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Effort Required (who needs to work on this?)
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={growthEffort}
                    onChange={(e) => setGrowthEffort(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">Growth Team</span>
                  <span className="text-xs text-gray-400">(outreach, sourcing)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={platformEffort}
                    onChange={(e) => setPlatformEffort(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">Platform Team</span>
                  <span className="text-xs text-gray-400">(onboarding, training)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={existingLeaderEffort}
                    onChange={(e) => setExistingLeaderEffort(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">Existing Leader</span>
                  <span className="text-xs text-gray-400">(current leader finds/recruits)</span>
                </label>
              </div>
            </div>

            {/* Linked Tasks */}
            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2 mb-3">
                <Link2 className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Link to Tasks</span>
                <span className="text-xs text-gray-400">(optional)</span>
              </div>
              <TaskSelector
                context={{
                  activity_id: selectedItem?.activity_id || context.activity_id,
                  activity_name: selectedItem?.activity_name || context.activity_name,
                  city_id: selectedItem?.city_id || context.city_id,
                  city_name: selectedItem?.city_name || context.city_name,
                  area_id: selectedItem?.area_id || context.area_id,
                  area_name: selectedItem?.area_name || context.area_name,
                  club_id: selectedClubId || context.club_id,
                  club_name: selectedItem?.name || context.club_name
                }}
                selectedTasks={linkedTasks}
                onSelectionsChange={updateLinkedTasks}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !name.trim() || (!selectedClubId && !selectedLaunchId)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 transition-colors"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {isEditMode ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export default LeaderRequirementModal;
