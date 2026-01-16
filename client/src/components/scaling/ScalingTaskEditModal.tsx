import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, User, ArrowRight, Users, Trash2, Link2 } from 'lucide-react';
import type { ScalingTask, StageKey, TaskAssignee, LeaderRequirement, VenueRequirement } from '../../../../shared/types';
import { TEAMS, TEAM_KEYS, getTeamByMember, getTeamForClub, type TeamKey } from '../../../../shared/teamConfig';
import { RequirementSelector } from './RequirementSelector';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

// Stage options - labels match MEETUP_STAGE_CONFIG in ScalingPlannerV2.tsx
const STAGES: { value: StageKey; label: string }[] = [
  { value: 'not_picked', label: 'Not Picked' },
  { value: 'started', label: 'Started' },
  { value: 'stage_1', label: 'Stage 1 - Leaders Found' },
  { value: 'stage_2', label: 'Stage 2 - Venue Found' },
  { value: 'stage_3', label: 'Stage 3 - Launch Ready' },
  { value: 'stage_4', label: 'Stage 4 - Regression' },
  { value: 'realised', label: 'Realised' }
];

// Status options
const STATUS_OPTIONS: { value: ScalingTask['status']; label: string; color: string }[] = [
  { value: 'not_started', label: 'Not Started', color: 'bg-red-500' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-amber-500' },
  { value: 'completed', label: 'Completed', color: 'bg-green-500' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-gray-400' }
];

interface ScalingTaskEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted?: () => void;
  task: ScalingTask;
}

export function ScalingTaskEditModal({
  isOpen,
  onClose,
  onUpdated,
  onDeleted,
  task
}: ScalingTaskEditModalProps) {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [assignees, setAssignees] = useState<TaskAssignee[]>([]);
  const [loadingAssignees, setLoadingAssignees] = useState(true);

  // Form state - initialized from task
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [sourceStage, setSourceStage] = useState<StageKey | ''>(task.source_stage || '');
  const [targetStage, setTargetStage] = useState<StageKey | ''>(task.target_stage || '');
  const [meetupsCount, setMeetupsCount] = useState<number>(task.meetups_count || 0);
  const [assigneeId, setAssigneeId] = useState<number | ''>(task.assigned_to_poc_id || '');
  const [status, setStatus] = useState<ScalingTask['status']>(task.status);

  // Team state - determined from task assignee or activity/city
  const [selectedTeam, setSelectedTeam] = useState<TeamKey | null>(() => {
    // Try to get team from assigned team lead
    if (task.assigned_team_lead) {
      const teamKey = getTeamByMember(task.assigned_team_lead);
      if (teamKey) return teamKey;
    }
    // Fall back to activity/city detection
    if (task.activity_name && task.city_name) {
      return getTeamForClub(task.activity_name, task.city_name);
    }
    return null;
  });
  const [teamManuallySet, setTeamManuallySet] = useState(false);

  // Requirements state
  const [selectedLeaderRequirements, setSelectedLeaderRequirements] = useState<LeaderRequirement[]>([]);
  const [selectedVenueRequirements, setSelectedVenueRequirements] = useState<VenueRequirement[]>([]);
  const [originalLeaderReqIds, setOriginalLeaderReqIds] = useState<number[]>([]);
  const [originalVenueReqIds, setOriginalVenueReqIds] = useState<number[]>([]);

  // Refs to track latest requirement selections (avoid stale closure in handleSubmit)
  const leaderReqRef = useRef<LeaderRequirement[]>([]);
  const venueReqRef = useRef<VenueRequirement[]>([]);

  // Update refs AND state together - this ensures refs are always current
  const updateLeaderRequirements = (reqs: LeaderRequirement[]) => {
    leaderReqRef.current = reqs;
    setSelectedLeaderRequirements(reqs);
  };
  const updateVenueRequirements = (reqs: VenueRequirement[]) => {
    venueReqRef.current = reqs;
    setSelectedVenueRequirements(reqs);
  };

  // Fetch assignees and linked requirements
  useEffect(() => {
    if (isOpen) {
      fetchAssignees();
      fetchLinkedRequirements();
    }
  }, [isOpen]);

  // Fetch existing linked requirements
  const fetchLinkedRequirements = async () => {
    try {
      const response = await fetch(`${API_BASE}/scaling-tasks/${task.id}`);
      const data = await response.json();
      if (data.success && data.task) {
        const leaders = data.task.linked_leader_requirements || [];
        const venues = data.task.linked_venue_requirements || [];
        updateLeaderRequirements(leaders);
        updateVenueRequirements(venues);
        // Store original IDs for comparison on save
        setOriginalLeaderReqIds(leaders.map((r: LeaderRequirement) => r.id));
        setOriginalVenueReqIds(venues.map((r: VenueRequirement) => r.id));
      }
    } catch (err) {
      console.error('Failed to fetch linked requirements:', err);
    }
  };

  const fetchAssignees = async () => {
    try {
      setLoadingAssignees(true);
      const response = await fetch(`${API_BASE}/scaling-tasks/assignees/list`);
      const data = await response.json();
      if (data.success) {
        setAssignees(data.assignees);
      }
    } catch (err) {
      console.error('Failed to fetch assignees:', err);
    } finally {
      setLoadingAssignees(false);
    }
  };

  // Get selected assignee details - handle both database POCs and hardcoded team members
  const selectedAssignee = useMemo(() => {
    if (!assigneeId) return null;

    // First check if it's a database POC
    const dbAssignee = assignees.find(a => a.id === assigneeId);
    if (dbAssignee) return dbAssignee;

    // For negative IDs, find the hardcoded team member
    if (typeof assigneeId === 'number' && assigneeId < 0 && selectedTeam) {
      const idx = Math.abs(assigneeId) - 1;
      const memberName = TEAMS[selectedTeam].members[idx];
      if (memberName) {
        return {
          id: assigneeId,
          name: memberName,
          team_lead: TEAMS[selectedTeam].lead
        } as TaskAssignee;
      }
    }
    return null;
  }, [assigneeId, assignees, selectedTeam]);

  // Group assignees by team using hardcoded config
  const assigneesByTeam = useMemo(() => {
    const grouped: Record<TeamKey, TaskAssignee[]> = {
      blue: [],
      green: [],
      yellow: []
    };
    const unassigned: TaskAssignee[] = [];

    assignees.forEach(assignee => {
      const teamKey = getTeamByMember(assignee.team_lead || assignee.name);
      if (teamKey) {
        grouped[teamKey].push(assignee);
      } else {
        unassigned.push(assignee);
      }
    });

    return { grouped, unassigned };
  }, [assignees]);

  // Handle manual team selection
  const handleTeamChange = (team: TeamKey) => {
    setSelectedTeam(team);
    setTeamManuallySet(true);
    setAssigneeId(''); // Reset assignee when team is manually changed
  };

  // Handle submit (update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        source_stage: sourceStage || null,
        target_stage: targetStage || null,
        meetups_count: meetupsCount,
        assigned_to_poc_id: assigneeId || null,
        assigned_to_name: selectedAssignee?.name || null,
        assigned_team_lead: selectedAssignee?.team_lead || null,
        status
      };

      const response = await fetch(`${API_BASE}/scaling-tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (data.success) {
        // Handle requirement linking/unlinking
        const linkingErrors: string[] = [];

        // Get current requirement IDs from refs (ensures we have latest values even if state hasn't updated)
        const currentLeaderIds = leaderReqRef.current.map(r => r.id).filter(id => id && typeof id === 'number');
        const currentVenueIds = venueReqRef.current.map(r => r.id).filter(id => id && typeof id === 'number');

        // Find requirements to add (in current but not in original)
        const leadersToAdd = currentLeaderIds.filter(id => !originalLeaderReqIds.includes(id));
        const venuesToAdd = currentVenueIds.filter(id => !originalVenueReqIds.includes(id));

        // Find requirements to remove (in original but not in current)
        const leadersToRemove = originalLeaderReqIds.filter(id => !currentLeaderIds.includes(id));
        const venuesToRemove = originalVenueReqIds.filter(id => !currentVenueIds.includes(id));

        // Add new leader requirements
        for (const reqId of leadersToAdd) {
          try {
            const linkResponse = await fetch(`${API_BASE}/scaling-tasks/${task.id}/requirements/leaders/${reqId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });
            const linkData = await linkResponse.json();
            if (!linkData.success) {
              linkingErrors.push(`Failed to link leader requirement ${reqId}`);
            }
          } catch (err) {
            linkingErrors.push(`Failed to link leader requirement ${reqId}`);
          }
        }

        // Remove unlinked leader requirements
        for (const reqId of leadersToRemove) {
          try {
            const unlinkResponse = await fetch(`${API_BASE}/scaling-tasks/${task.id}/requirements/leaders/${reqId}`, {
              method: 'DELETE'
            });
            const unlinkData = await unlinkResponse.json();
            if (!unlinkData.success) {
              linkingErrors.push(`Failed to unlink leader requirement ${reqId}`);
            }
          } catch (err) {
            linkingErrors.push(`Failed to unlink leader requirement ${reqId}`);
          }
        }

        // Add new venue requirements
        for (const reqId of venuesToAdd) {
          try {
            const linkResponse = await fetch(`${API_BASE}/scaling-tasks/${task.id}/requirements/venues/${reqId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });
            const linkData = await linkResponse.json();
            if (!linkData.success) {
              linkingErrors.push(`Failed to link venue requirement ${reqId}`);
            }
          } catch (err) {
            linkingErrors.push(`Failed to link venue requirement ${reqId}`);
          }
        }

        // Remove unlinked venue requirements
        for (const reqId of venuesToRemove) {
          try {
            const unlinkResponse = await fetch(`${API_BASE}/scaling-tasks/${task.id}/requirements/venues/${reqId}`, {
              method: 'DELETE'
            });
            const unlinkData = await unlinkResponse.json();
            if (!unlinkData.success) {
              linkingErrors.push(`Failed to unlink venue requirement ${reqId}`);
            }
          } catch (err) {
            linkingErrors.push(`Failed to unlink venue requirement ${reqId}`);
          }
        }

        // Show warning if there were linking errors
        if (linkingErrors.length > 0) {
          alert(`Task updated, but some requirement changes failed:\n\n${linkingErrors.join('\n')}`);
        }

        onUpdated();
      } else {
        alert(data.error || 'Failed to update task');
      }
    } catch (err) {
      console.error('Failed to update task:', err);
      alert('Failed to update task');
    } finally {
      setLoading(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch(`${API_BASE}/scaling-tasks/${task.id}`, {
        method: 'DELETE'
      });

      const data = await response.json();
      if (data.success) {
        onDeleted?.();
        onClose();
      } else {
        alert(data.error || 'Failed to delete task');
      }
    } catch (err) {
      console.error('Failed to delete task:', err);
      alert('Failed to delete task');
    } finally {
      setDeleting(false);
    }
  };

  // Build context display from task hierarchy
  const contextDisplay: string[] = [];
  if (task.activity_name) contextDisplay.push(task.activity_name);
  if (task.city_name) contextDisplay.push(task.city_name);
  if (task.area_name) contextDisplay.push(task.area_name);
  if (task.club_name) contextDisplay.push(task.club_name);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Edit Task</h2>
              {contextDisplay.length > 0 && (
                <p className="text-sm text-gray-500 mt-0.5">
                  {contextDisplay.join(' > ')}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <div className="flex items-center gap-2">
                {STATUS_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatus(option.value)}
                    className={`
                      px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-150
                      ${status === option.value
                        ? 'text-white shadow-sm'
                        : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                      }
                    `}
                    style={status === option.value ? { backgroundColor: option.value === 'not_started' ? '#ef4444' : option.value === 'in_progress' ? '#f59e0b' : option.value === 'completed' ? '#22c55e' : '#9ca3af' } : undefined}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter task title"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            {/* Description/Links */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description/Links
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter description or paste links (URLs will be clickable)"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Stage Transition */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Stage Transition
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={sourceStage}
                  onChange={(e) => setSourceStage(e.target.value as StageKey | '')}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">From...</option>
                  {STAGES.filter(s => s.value !== 'realised').map(stage => (
                    <option key={stage.value} value={stage.value}>
                      {stage.label}
                    </option>
                  ))}
                </select>
                <ArrowRight className="h-5 w-5 text-gray-400" />
                <select
                  value={targetStage}
                  onChange={(e) => setTargetStage(e.target.value as StageKey | '')}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">To...</option>
                  {STAGES.filter(s => s.value !== 'not_picked').map(stage => (
                    <option key={stage.value} value={stage.value}>
                      {stage.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Meetups Count */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Meetups to Move
              </label>
              <input
                type="number"
                min="0"
                value={meetupsCount}
                onChange={(e) => setMeetupsCount(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Team Assignment */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Users className="inline h-4 w-4 mr-1" />
                Team
              </label>
              <div className="flex items-center gap-2">
                {TEAM_KEYS.map(teamKey => {
                  const team = TEAMS[teamKey];
                  const isSelected = selectedTeam === teamKey;
                  return (
                    <button
                      key={teamKey}
                      type="button"
                      onClick={() => handleTeamChange(teamKey)}
                      className={`
                        px-4 py-2 text-sm font-medium rounded-lg transition-all duration-150
                        ${isSelected
                          ? 'text-white shadow-sm'
                          : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                        }
                      `}
                      style={isSelected ? { backgroundColor: team.color.accent } : undefined}
                    >
                      {team.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Assignee - filtered by selected team */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <User className="inline h-4 w-4 mr-1" />
                Assign To
                {selectedTeam && (
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    ({TEAMS[selectedTeam].name} Team members)
                  </span>
                )}
              </label>
              {loadingAssignees ? (
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading assignees...
                </div>
              ) : (
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value ? parseInt(e.target.value) : '')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select assignee...</option>
                  {selectedTeam ? (
                    // Show hardcoded team members from config
                    <>
                      {TEAMS[selectedTeam].members.map((memberName, idx) => {
                        // Try to find matching POC from database for ID, otherwise use negative index
                        const matchingPoc = assignees.find(a =>
                          a.name.toLowerCase() === memberName.toLowerCase() ||
                          (a.team_lead && a.team_lead.toLowerCase().includes(memberName.toLowerCase()))
                        );
                        const id = matchingPoc?.id || -(idx + 1);
                        return (
                          <option key={id} value={id}>
                            {memberName}
                          </option>
                        );
                      })}
                    </>
                  ) : (
                    // Show all teams grouped with hardcoded members
                    <>
                      {TEAM_KEYS.map(teamKey => {
                        const team = TEAMS[teamKey];
                        return (
                          <optgroup key={teamKey} label={`${team.name} Team`}>
                            {team.members.map((memberName, idx) => {
                              const matchingPoc = assignees.find(a =>
                                a.name.toLowerCase() === memberName.toLowerCase() ||
                                (a.team_lead && a.team_lead.toLowerCase().includes(memberName.toLowerCase()))
                              );
                              const id = matchingPoc?.id || -(idx + 1 + TEAM_KEYS.indexOf(teamKey) * 100);
                              return (
                                <option key={id} value={id}>
                                  {memberName}
                                </option>
                              );
                            })}
                          </optgroup>
                        );
                      })}
                    </>
                  )}
                </select>
              )}
            </div>

            {/* Linked Requirements Section */}
            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2 mb-3">
                <Link2 className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Linked Requirements</span>
                <span className="text-xs text-gray-400">(optional)</span>
              </div>

              {/* Leader Requirements */}
              <RequirementSelector
                type="leader"
                context={{
                  activity_id: task.activity_id,
                  activity_name: task.activity_name,
                  city_id: task.city_id,
                  city_name: task.city_name,
                  area_id: task.area_id,
                  area_name: task.area_name,
                  club_id: task.club_id,
                  club_name: task.club_name
                }}
                selectedRequirements={selectedLeaderRequirements}
                onSelectionsChange={(reqs) => updateLeaderRequirements(reqs as LeaderRequirement[])}
              />

              {/* Venue Requirements */}
              <RequirementSelector
                type="venue"
                context={{
                  activity_id: task.activity_id,
                  activity_name: task.activity_name,
                  city_id: task.city_id,
                  city_name: task.city_name,
                  area_id: task.area_id,
                  area_name: task.area_name,
                  club_id: task.club_id,
                  club_name: task.club_name
                }}
                selectedRequirements={selectedVenueRequirements}
                onSelectionsChange={(reqs) => updateVenueRequirements(reqs as VenueRequirement[])}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !title.trim()}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export default ScalingTaskEditModal;
