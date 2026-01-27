import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Loader2, User, Calendar, ArrowRight, Clock, AlertCircle, Activity, Building2, MapPin, Home, Users, Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { TaskScope, StageKey, TaskAssignee, CreateScalingTaskRequest, LeaderRequirement, VenueRequirement } from '../../../../shared/types';
import { TEAMS, TEAM_KEYS, getTeamByMember, getTeamForClub, type TeamKey } from '../../../../shared/teamConfig';
import { RequirementSelector } from './RequirementSelector';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

// Filter option type for hierarchy dropdowns
interface FilterOption {
  id: number;
  name: string;
}

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

interface StageProgress {
  not_picked: number;
  started: number;
  stage_1: number;
  stage_2: number;
  stage_3: number;
  stage_4: number;
  realised: number;
}

interface CreateContext {
  task_scope: TaskScope;
  activity_id?: number;
  activity_name?: string;
  city_id?: number;
  city_name?: string;
  area_id?: number;
  area_name?: string;
  club_id?: number;
  club_name?: string;
  launch_id?: number;
  launch_name?: string;
  target_id?: number;
  progress_summary?: StageProgress;
}

interface ScalingTaskCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  context: CreateContext;
  defaultWeekStart?: string;
  prelinkedLeaderRequirement?: LeaderRequirement | null;
}

export function ScalingTaskCreateModal({
  isOpen,
  onClose,
  onCreated,
  context,
  defaultWeekStart,
  prelinkedLeaderRequirement
}: ScalingTaskCreateModalProps) {
  const [loading, setLoading] = useState(false);
  const [assignees, setAssignees] = useState<TaskAssignee[]>([]);
  const [loadingAssignees, setLoadingAssignees] = useState(true);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceStage, setSourceStage] = useState<StageKey | ''>('');
  const [targetStage, setTargetStage] = useState<StageKey | ''>('');
  const [meetupsCount, setMeetupsCount] = useState<number>(0);
  const [assigneeId, setAssigneeId] = useState<number | ''>('');
  const [weekStart, setWeekStart] = useState(defaultWeekStart || getThisMonday());
  const [dueDate, setDueDate] = useState<string>('');

  // Hierarchy selection state (pre-populated from context)
  const [selectedActivityId, setSelectedActivityId] = useState<number | undefined>(context.activity_id);
  const [selectedActivityName, setSelectedActivityName] = useState<string | undefined>(context.activity_name);
  const [selectedCityId, setSelectedCityId] = useState<number | undefined>(context.city_id);
  const [selectedCityName, setSelectedCityName] = useState<string | undefined>(context.city_name);
  const [selectedAreaId, setSelectedAreaId] = useState<number | undefined>(context.area_id);
  const [selectedAreaName, setSelectedAreaName] = useState<string | undefined>(context.area_name);
  const [selectedClubId, setSelectedClubId] = useState<number | undefined>(context.club_id);
  const [selectedClubName, setSelectedClubName] = useState<string | undefined>(context.club_name);

  // Hierarchy options (fetched from API)
  const [activities, setActivities] = useState<FilterOption[]>([]);
  const [cities, setCities] = useState<FilterOption[]>([]);
  const [areas, setAreas] = useState<FilterOption[]>([]);
  const [clubs, setClubs] = useState<FilterOption[]>([]);

  // Team state - auto-detected from activity + city, but can be manually overridden
  const [selectedTeam, setSelectedTeam] = useState<TeamKey | null>(null);
  const [teamManuallySet, setTeamManuallySet] = useState(false);

  // Requirements state
  const [selectedLeaderRequirements, setSelectedLeaderRequirements] = useState<LeaderRequirement[]>([]);
  const [selectedVenueRequirements, setSelectedVenueRequirements] = useState<VenueRequirement[]>([]);

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

  // Auto-add prelinked requirement when modal opens
  useEffect(() => {
    if (isOpen && prelinkedLeaderRequirement) {
      // Add to selected requirements if not already present
      updateLeaderRequirements([prelinkedLeaderRequirement]);
    }
  }, [isOpen, prelinkedLeaderRequirement]);

  // Auto-sync activity dropdown with context name when context has name but no ID
  // This prevents tasks from being created with activity_name but no activity_id
  useEffect(() => {
    if (isOpen && context.activity_name && !selectedActivityId && activities.length > 0) {
      const matched = activities.find(
        a => a.name?.toLowerCase() === context.activity_name?.toLowerCase()
      );
      if (matched?.id) {
        setSelectedActivityId(matched.id);
        setSelectedActivityName(matched.name);
      }
    }
  }, [isOpen, context.activity_name, selectedActivityId, activities]);

  // SINGLE SOURCE OF TRUTH for week dates
  // Week starts on Monday (0 = Monday, 6 = Sunday)
  const WEEK_START_DAY = 1; // Monday (using JS getDay() where 0=Sunday, 1=Monday)

  // Helper to get Monday of current week (local timezone)
  function getThisMonday(): string {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday being 0
    d.setDate(diff);
    // Use local date formatting to avoid timezone shifts
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const dayOfMonth = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${dayOfMonth}`;
  }

  // Helper to get Monday of next week (local timezone)
  function getNextMonday(): string {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? 1 : 8 - day + 1); // Next Monday
    d.setDate(diff);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const dayOfMonth = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${dayOfMonth}`;
  }

  // Helper to get Sunday of a given week (end of week) - local timezone
  function getSundayOfWeek(mondayStr: string): string {
    const [year, month, day] = mondayStr.split('-').map(Number);
    const d = new Date(year, month - 1, day + 6); // Monday + 6 = Sunday
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayOfMonth = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dayOfMonth}`;
  }

  // Quick select next week
  const selectNextWeek = () => {
    const nextMonday = getNextMonday();
    setWeekStart(nextMonday);
    setDueDate(getSundayOfWeek(nextMonday));
  };

  // Quick select this week
  const selectThisWeek = () => {
    const thisMonday = getThisMonday();
    setWeekStart(thisMonday);
    setDueDate(getSundayOfWeek(thisMonday));
  };

  // Helper to find the stage with highest meetup count and its next stage
  function findBestStageTransition(progress: StageProgress): { source: StageKey; target: StageKey; count: number } | null {
    // Stage order for transitions (excluding 'realised' as source since it's the final stage)
    const stageOrder: StageKey[] = ['not_picked', 'started', 'stage_1', 'stage_2', 'stage_3', 'stage_4'];
    const nextStage: Record<StageKey, StageKey> = {
      'not_picked': 'started',
      'started': 'stage_1',
      'stage_1': 'stage_2',
      'stage_2': 'stage_3',
      'stage_3': 'stage_4',
      'stage_4': 'realised',
      'realised': 'realised' // No transition from realised
    };

    let maxCount = 0;
    let bestSource: StageKey | null = null;

    // Find stage with highest meetup count
    for (const stage of stageOrder) {
      const count = progress[stage] || 0;
      if (count > maxCount) {
        maxCount = count;
        bestSource = stage;
      }
    }

    if (bestSource && maxCount > 0) {
      return {
        source: bestSource,
        target: nextStage[bestSource],
        count: maxCount
      };
    }
    return null;
  }

  // Pre-fill stage transition and due date from context
  useEffect(() => {
    if (isOpen && context.progress_summary) {
      const transition = findBestStageTransition(context.progress_summary);
      if (transition) {
        setSourceStage(transition.source);
        setTargetStage(transition.target);
        setMeetupsCount(transition.count);
      }
    }
  }, [isOpen, context.progress_summary]);

  // Update meetups count when source stage changes (based on progress_summary)
  useEffect(() => {
    if (sourceStage && context.progress_summary) {
      const count = context.progress_summary[sourceStage as keyof StageProgress] || 0;
      setMeetupsCount(count);
    }
  }, [sourceStage, context.progress_summary]);

  // Pre-fill due date when weekStart changes
  useEffect(() => {
    if (weekStart && !dueDate) {
      setDueDate(getSundayOfWeek(weekStart));
    }
  }, [weekStart]);

  // Fetch assignees and hierarchy options
  useEffect(() => {
    if (isOpen) {
      fetchAssignees();
      fetchHierarchyOptions();
    }
  }, [isOpen]);

  // Fetch hierarchy options with cascading
  const fetchHierarchyOptions = async () => {
    try {
      // Fetch activities
      const actRes = await fetch(`${API_BASE}/scaling-tasks/filters/activities`);
      const actData = await actRes.json();
      if (actData.success) setActivities(actData.options || []);

      // Fetch cities (filtered by selected activity)
      if (selectedActivityId) {
        const cityRes = await fetch(`${API_BASE}/scaling-tasks/filters/cities?activity_ids=${selectedActivityId}`);
        const cityData = await cityRes.json();
        if (cityData.success) setCities(cityData.options || []);
      }

      // Fetch areas (filtered by selected activity and city)
      if (selectedActivityId && selectedCityId) {
        const areaRes = await fetch(`${API_BASE}/scaling-tasks/filters/areas?activity_ids=${selectedActivityId}&city_ids=${selectedCityId}`);
        const areaData = await areaRes.json();
        if (areaData.success) setAreas(areaData.options || []);
      }

      // Fetch clubs (filtered by selected activity, city, and area)
      if (selectedActivityId) {
        const params = new URLSearchParams();
        params.append('activity_ids', String(selectedActivityId));
        if (selectedCityId) params.append('city_ids', String(selectedCityId));
        if (selectedAreaId) params.append('area_ids', String(selectedAreaId));
        const clubRes = await fetch(`${API_BASE}/scaling-tasks/filters/clubs?${params}`);
        const clubData = await clubRes.json();
        if (clubData.success) setClubs(clubData.options || []);
      }
    } catch (err) {
      console.error('Failed to fetch hierarchy options:', err);
    }
  };

  // Re-fetch cascading options when selections change
  useEffect(() => {
    if (isOpen) {
      fetchHierarchyOptions();
    }
  }, [selectedActivityId, selectedCityId, selectedAreaId]);

  // Reset child selections when parent changes
  const handleActivityChange = (id: number | undefined, name: string | undefined) => {
    setSelectedActivityId(id);
    setSelectedActivityName(name);
    setSelectedCityId(undefined);
    setSelectedCityName(undefined);
    setSelectedAreaId(undefined);
    setSelectedAreaName(undefined);
    setSelectedClubId(undefined);
    setSelectedClubName(undefined);
    setCities([]);
    setAreas([]);
    setClubs([]);
  };

  const handleCityChange = (id: number | undefined, name: string | undefined) => {
    setSelectedCityId(id);
    setSelectedCityName(name);
    setSelectedAreaId(undefined);
    setSelectedAreaName(undefined);
    setSelectedClubId(undefined);
    setSelectedClubName(undefined);
    setAreas([]);
    setClubs([]);
  };

  const handleAreaChange = (id: number | undefined, name: string | undefined) => {
    setSelectedAreaId(id);
    setSelectedAreaName(name);
    setSelectedClubId(undefined);
    setSelectedClubName(undefined);
    setClubs([]);
  };

  const handleClubChange = (id: number | undefined, name: string | undefined) => {
    setSelectedClubId(id);
    setSelectedClubName(name);
  };

  // Auto-detect team based on activity + city selection
  useEffect(() => {
    if (teamManuallySet) return; // Don't override if manually set

    const activityName = selectedActivityName || context.activity_name || '';
    const cityName = selectedCityName || context.city_name || '';

    if (activityName && cityName) {
      const detectedTeam = getTeamForClub(activityName, cityName);
      setSelectedTeam(detectedTeam);
      // Reset assignee when team changes to ensure they pick from correct team
      setAssigneeId('');
    }
  }, [selectedActivityName, selectedCityName, context.activity_name, context.city_name, teamManuallySet]);

  // Handle manual team selection
  const handleTeamChange = (team: TeamKey) => {
    setSelectedTeam(team);
    setTeamManuallySet(true);
    setAssigneeId(''); // Reset assignee when team is manually changed
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

  // Auto-suggest POC based on activity
  useEffect(() => {
    if (context.activity_name && !assigneeId) {
      autoSuggestPOC();
    }
  }, [context.activity_name]);

  const autoSuggestPOC = async () => {
    if (!context.activity_name) return;
    try {
      const response = await fetch(`${API_BASE}/scaling-tasks/auto-assign/${encodeURIComponent(context.activity_name)}`);
      const data = await response.json();
      if (data.success && data.suggested) {
        setAssigneeId(data.suggested.id);
      }
    } catch (err) {
      console.error('Failed to auto-suggest POC:', err);
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
      // Determine team from the assignee's team_lead or their name
      const teamKey = getTeamByMember(assignee.team_lead || assignee.name);
      if (teamKey) {
        grouped[teamKey].push(assignee);
      } else {
        unassigned.push(assignee);
      }
    });

    return { grouped, unassigned };
  }, [assignees]);

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('=== TASK CREATION DEBUG ===');
    console.log('Title:', title);
    console.log('Selected Leader Requirements:', selectedLeaderRequirements);
    console.log('Selected Venue Requirements:', selectedVenueRequirements);

    if (!title.trim()) {
      console.log('Title is empty, returning early');
      return;
    }

    setLoading(true);
    console.log('Starting task creation...');
    try {
      // Validate activity selection - prevent tasks with invalid activity names
      const finalActivityName = selectedActivityName || context.activity_name;
      let finalActivityId = selectedActivityId || context.activity_id;

      // Block fake activity names (UI rollup labels, not real activities)
      if (finalActivityName?.toLowerCase() === 'all data' ||
          finalActivityName?.toLowerCase() === 'filtered data') {
        alert('Please select a specific activity. "All Data" is not a valid activity for tasks.');
        setLoading(false);
        return;
      }

      // Auto-resolve activity_id if we have name but no ID
      if (finalActivityName && !finalActivityId) {
        const matched = activities.find(
          a => a.name?.toLowerCase() === finalActivityName?.toLowerCase()
        );
        if (matched?.id) {
          finalActivityId = matched.id;
        } else {
          alert('Please select a valid activity from the dropdown.');
          setLoading(false);
          return;
        }
      }

      // Determine task scope based on most specific selection
      let taskScope: TaskScope = context.task_scope;
      if (selectedClubId) taskScope = 'club';
      else if (selectedAreaId) taskScope = 'area';
      else if (selectedCityId) taskScope = 'city';
      else if (finalActivityId) taskScope = 'activity';

      const payload: CreateScalingTaskRequest = {
        task_scope: taskScope,
        activity_id: finalActivityId,
        activity_name: finalActivityName,
        city_id: selectedCityId || context.city_id,
        city_name: selectedCityName || context.city_name,
        area_id: selectedAreaId || context.area_id,
        area_name: selectedAreaName || context.area_name,
        club_id: selectedClubId || context.club_id,
        club_name: selectedClubName || context.club_name || context.launch_name,
        launch_id: context.launch_id,
        launch_name: context.launch_name,
        target_id: context.target_id,
        title: title.trim(),
        description: description.trim() || undefined,
        source_stage: sourceStage || undefined,
        target_stage: targetStage || undefined,
        meetups_count: meetupsCount,
        assigned_to_poc_id: assigneeId || undefined,
        assigned_to_name: selectedAssignee?.name,
        assigned_team_lead: selectedAssignee?.team_lead,
        week_start: weekStart,
        due_date: dueDate || undefined,
        created_by: 'Operations'
      };

      console.log('Payload:', JSON.stringify(payload, null, 2));
      const response = await fetch(`${API_BASE}/scaling-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      console.log('Response status:', response.status);

      const data = await response.json();
      console.log('Response data:', data);
      if (data.success && data.task) {
        const taskId = data.task.id;
        const linkingErrors: string[] = [];

        // Link selected leader requirements (use ref for latest values)
        for (const req of leaderReqRef.current) {
          // Skip requirements without valid IDs
          if (!req.id || typeof req.id !== 'number') {
            console.warn('Skipping leader requirement with invalid ID:', req);
            linkingErrors.push(`Leader "${req.name}" has invalid ID`);
            continue;
          }
          try {
            const linkResponse = await fetch(`${API_BASE}/scaling-tasks/${taskId}/requirements/leaders/${req.id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });
            const linkData = await linkResponse.json();
            if (!linkData.success) {
              console.error('Failed to link leader requirement:', linkData.error);
              linkingErrors.push(`Failed to link leader "${req.name}": ${linkData.error}`);
            }
          } catch (err) {
            console.error('Failed to link leader requirement:', err);
            linkingErrors.push(`Failed to link leader "${req.name}"`);
          }
        }

        // Link selected venue requirements (use ref for latest values)
        for (const req of venueReqRef.current) {
          // Skip requirements without valid IDs
          if (!req.id || typeof req.id !== 'number') {
            console.warn('Skipping venue requirement with invalid ID:', req);
            linkingErrors.push(`Venue "${req.name}" has invalid ID`);
            continue;
          }
          try {
            const linkResponse = await fetch(`${API_BASE}/scaling-tasks/${taskId}/requirements/venues/${req.id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });
            const linkData = await linkResponse.json();
            if (!linkData.success) {
              console.error('Failed to link venue requirement:', linkData.error);
              linkingErrors.push(`Failed to link venue "${req.name}": ${linkData.error}`);
            }
          } catch (err) {
            console.error('Failed to link venue requirement:', err);
            linkingErrors.push(`Failed to link venue "${req.name}"`);
          }
        }

        // Show warning if some requirements couldn't be linked
        if (linkingErrors.length > 0) {
          console.warn('Some requirements could not be linked:', linkingErrors);
          alert(`Task created successfully, but some requirements could not be linked:\n\n${linkingErrors.join('\n')}`);
        }

        onCreated();
      } else {
        // Show specific error message based on the error type
        const errorMessage = data.error || 'Failed to create task';
        const details = data.details || '';

        // Check for common error scenarios and provide user-friendly messages
        if (errorMessage.toLowerCase().includes('target') || details.toLowerCase().includes('target')) {
          alert('Cannot create task: No target exists for this club/activity. Please create a target first in the Scaling Targets dashboard.');
        } else if (errorMessage.toLowerCase().includes('foreign key') || errorMessage.toLowerCase().includes('constraint')) {
          alert('Cannot create task: Missing required data. Please ensure you have selected an activity, city, or club with valid targets.');
        } else {
          alert(`Task creation failed: ${errorMessage}${details ? `\n\nDetails: ${details}` : ''}`);
        }
      }
    } catch (err) {
      console.error('Failed to create task:', err);
      alert('Failed to create task: Unable to connect to server. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Build context display
  const contextDisplay: string[] = [];
  if (context.activity_name) contextDisplay.push(context.activity_name);
  if (context.city_name) contextDisplay.push(context.city_name);
  if (context.area_name) contextDisplay.push(context.area_name);
  // Show club name or launch name (launches are new clubs being planned)
  if (context.club_name) contextDisplay.push(context.club_name);
  else if (context.launch_name) contextDisplay.push(`🚀 ${context.launch_name}`);

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
              <h2 className="text-lg font-bold text-gray-900">Create Task</h2>
              {/* Show launch name if this is for a new club launch */}
              {context.launch_name && (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-sm text-gray-500">for</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-orange-100 to-amber-100 text-orange-700 border border-orange-200">
                    🚀 {context.launch_name}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {/* Hierarchy Tags Section */}
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex flex-wrap gap-2">
              {/* Activity Tag Dropdown */}
              <div className="relative inline-flex items-center">
                <Activity className="absolute left-2 h-3 w-3 text-purple-500 pointer-events-none z-10" />
                <select
                  value={selectedActivityId || ''}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : undefined;
                    const name = activities.find(a => a.id === id)?.name;
                    handleActivityChange(id, name);
                  }}
                  className="pl-7 pr-6 py-1 text-xs font-medium rounded-full border-2 appearance-none cursor-pointer transition-colors
                    bg-purple-100 border-purple-200 text-purple-800 hover:bg-purple-150 focus:ring-2 focus:ring-purple-300 focus:outline-none"
                >
                  <option value="">Select Activity</option>
                  {activities.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <span className="absolute right-2 pointer-events-none text-purple-500">▾</span>
              </div>

              {/* City Tag Dropdown */}
              <div className="relative inline-flex items-center">
                <Building2 className="absolute left-2 h-3 w-3 text-blue-500 pointer-events-none z-10" />
                <select
                  value={selectedCityId || ''}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : undefined;
                    const name = cities.find(c => c.id === id)?.name;
                    handleCityChange(id, name);
                  }}
                  disabled={!selectedActivityId || cities.length === 0}
                  className="pl-7 pr-6 py-1 text-xs font-medium rounded-full border-2 appearance-none cursor-pointer transition-colors
                    bg-blue-100 border-blue-200 text-blue-800 hover:bg-blue-150 focus:ring-2 focus:ring-blue-300 focus:outline-none
                    disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">Select City</option>
                  {cities.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <span className="absolute right-2 pointer-events-none text-blue-500">▾</span>
              </div>

              {/* Area Tag Dropdown */}
              <div className="relative inline-flex items-center">
                <MapPin className="absolute left-2 h-3 w-3 text-emerald-500 pointer-events-none z-10" />
                <select
                  value={selectedAreaId || ''}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : undefined;
                    const name = areas.find(a => a.id === id)?.name;
                    handleAreaChange(id, name);
                  }}
                  disabled={!selectedCityId || areas.length === 0}
                  className="pl-7 pr-6 py-1 text-xs font-medium rounded-full border-2 appearance-none cursor-pointer transition-colors
                    bg-emerald-100 border-emerald-200 text-emerald-800 hover:bg-emerald-150 focus:ring-2 focus:ring-emerald-300 focus:outline-none
                    disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">Select Area</option>
                  {areas.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <span className="absolute right-2 pointer-events-none text-emerald-500">▾</span>
              </div>

              {/* Club Tag Dropdown */}
              <div className="relative inline-flex items-center">
                <Home className="absolute left-2 h-3 w-3 text-orange-500 pointer-events-none z-10" />
                <select
                  value={selectedClubId || ''}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : undefined;
                    const name = clubs.find(c => c.id === id)?.name;
                    handleClubChange(id, name);
                  }}
                  disabled={!selectedActivityId || clubs.length === 0}
                  className="pl-7 pr-6 py-1 text-xs font-medium rounded-full border-2 appearance-none cursor-pointer transition-colors
                    bg-orange-100 border-orange-200 text-orange-800 hover:bg-orange-150 focus:ring-2 focus:ring-orange-300 focus:outline-none
                    disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">Select Club</option>
                  {clubs.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <span className="absolute right-2 pointer-events-none text-orange-500">▾</span>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
                {selectedTeam && !teamManuallySet && (
                  <span className="ml-2 text-xs font-normal text-gray-500">(Auto-detected)</span>
                )}
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

            {/* Assignee - filtered by selected team, using hardcoded team members */}
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
                    // Show hardcoded team members from config for selected team
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

            {/* Week and Due Date */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Calendar className="inline h-4 w-4 mr-1" />
                    Week Starting (Monday)
                  </label>
                  <input
                    type="date"
                    value={weekStart}
                    onChange={(e) => {
                      setWeekStart(e.target.value);
                      // Auto-update due date to Sunday of selected week
                      if (e.target.value) {
                        setDueDate(getSundayOfWeek(e.target.value));
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Clock className="inline h-4 w-4 mr-1" />
                    Due Date (Sunday)
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              {/* Quick Week Selection */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Quick select:</span>
                <button
                  type="button"
                  onClick={selectThisWeek}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                    weekStart === getThisMonday()
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  This Week
                </button>
                <button
                  type="button"
                  onClick={selectNextWeek}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                    weekStart === getNextMonday()
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Next Week
                </button>
              </div>
            </div>

            {/* Linked Requirements Section */}
            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2 mb-3">
                <Link2 className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Linked Requirements</span>
                <span className="text-xs text-gray-400">(optional)</span>
              </div>

              <div className="space-y-4">
                <RequirementSelector
                  type="leader"
                  context={{
                    activity_id: selectedActivityId || context.activity_id,
                    activity_name: selectedActivityName || context.activity_name,
                    city_id: selectedCityId || context.city_id,
                    city_name: selectedCityName || context.city_name,
                    area_id: selectedAreaId || context.area_id,
                    area_name: selectedAreaName || context.area_name,
                    club_id: selectedClubId || context.club_id,
                    club_name: selectedClubName || context.club_name,
                    launch_id: context.launch_id,
                    target_id: context.target_id
                  }}
                  selectedRequirements={selectedLeaderRequirements}
                  onSelectionsChange={(reqs) => updateLeaderRequirements(reqs as LeaderRequirement[])}
                />

                <RequirementSelector
                  type="venue"
                  context={{
                    activity_id: selectedActivityId || context.activity_id,
                    activity_name: selectedActivityName || context.activity_name,
                    city_id: selectedCityId || context.city_id,
                    city_name: selectedCityName || context.city_name,
                    area_id: selectedAreaId || context.area_id,
                    area_name: selectedAreaName || context.area_name,
                    club_id: selectedClubId || context.club_id,
                    club_name: selectedClubName || context.club_name,
                    launch_id: context.launch_id,
                    target_id: context.target_id
                  }}
                  selectedRequirements={selectedVenueRequirements}
                  onSelectionsChange={(reqs) => updateVenueRequirements(reqs as VenueRequirement[])}
                />
              </div>
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
                disabled={loading || !title.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Task
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export default ScalingTaskCreateModal;
