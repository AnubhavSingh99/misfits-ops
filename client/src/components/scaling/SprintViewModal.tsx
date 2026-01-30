import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { X, Plus, ChevronDown, ChevronRight, Calendar, Loader2, Filter, Users, Activity, Building2, MapPin, Home } from 'lucide-react';
import { ScalingTaskTileV2 } from './ScalingTaskTileV2';
import { ScalingTaskCreateModal } from './ScalingTaskCreateModal';
import { ScalingTaskEditModal } from './ScalingTaskEditModal';
import { TaskCommentsPanel } from './TaskCommentsPanel';
import { MultiSelectDropdown } from '../ui/MultiSelectDropdown';
import type { ScalingTask, SprintWeek, HierarchyNode, TaskScope } from '../../../../shared/types';
import { TEAMS, TEAM_KEYS, getTeamByMember, type TeamKey } from '../../../../shared/teamConfig';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

// Hierarchy filter option type
interface FilterOption {
  id: number | null;
  name: string;
}

// Team options for filter - generated from team config
const TEAM_OPTIONS = [
  { value: 'all', label: 'All Teams', teamKey: null as TeamKey | null },
  ...TEAM_KEYS.map(key => ({
    value: key,
    label: TEAMS[key].name,
    teamKey: key as TeamKey
  }))
];

// Status options for filter
const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'not_started', label: 'Not Started', color: 'bg-red-500' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-amber-500' },
  { value: 'completed', label: 'Completed', color: 'bg-green-500' }
];

// Context with parent hierarchy info
interface HierarchyContext {
  task_scope: string;
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
}

interface SprintViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Hierarchy context for filtering tasks
  node: HierarchyNode;
  // Full context with parent hierarchy IDs
  context?: HierarchyContext;
}

export function SprintViewModal({ isOpen, onClose, node, context }: SprintViewModalProps) {
  const [weeks, setWeeks] = useState<SprintWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ScalingTask | null>(null);
  const [showCommentsPanel, setShowCommentsPanel] = useState(false);
  const [editingTask, setEditingTask] = useState<ScalingTask | null>(null);

  // Multi-select state
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // Scroll position preservation
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollPosition = useRef<number>(0);

  // Older tasks state (tasks scheduled before the sprint window)
  const [olderTasks, setOlderTasks] = useState<{
    groupedByWeek: Record<string, ScalingTask[]>;
    sortedWeeks: string[];
    totalCount: number;
  } | null>(null);
  const [showOlderTasks, setShowOlderTasks] = useState(false);

  // Filter state
  const [teamFilter, setTeamFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [memberFilter, setMemberFilter] = useState<string | null>(null);

  // Hierarchy filter state - now supports multi-select (arrays)
  const [activityFilters, setActivityFilters] = useState<number[]>([]);
  const [cityFilters, setCityFilters] = useState<number[]>([]);
  const [areaFilters, setAreaFilters] = useState<number[]>([]);
  const [clubFilters, setClubFilters] = useState<number[]>([]);

  // Track if we've initialized filters from context (to avoid re-setting after user changes)
  const [filtersInitialized, setFiltersInitialized] = useState(false);
  const [initialFetchDone, setInitialFetchDone] = useState(false);

  // Reset filters and selection when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFiltersInitialized(false);
      setInitialFetchDone(false);
      setActivityFilters([]);
      setCityFilters([]);
      setAreaFilters([]);
      setClubFilters([]);
      setTeamFilter('all');
      setStatusFilter('all');
      setMemberFilter(null);
      setSelectedTaskIds(new Set());
    }
  }, [isOpen]);

  // Hierarchy filter options
  const [activities, setActivities] = useState<FilterOption[]>([]);
  const [cities, setCities] = useState<FilterOption[]>([]);
  const [areas, setAreas] = useState<FilterOption[]>([]);
  const [clubs, setClubs] = useState<FilterOption[]>([]);

  // Team members for filter
  const [members, setMembers] = useState<{ id: number; name: string; team_lead?: string }[]>([]);

  // Initial fetch - only runs once when modal opens
  useEffect(() => {
    const fetchInitialOptions = async () => {
      if (initialFetchDone) return;

      try {
        // Fetch all filter options in parallel for speed
        const [actRes, cityRes, areaRes, clubRes, membersRes] = await Promise.all([
          fetch(`${API_BASE}/scaling-tasks/filters/activities`),
          fetch(`${API_BASE}/scaling-tasks/filters/cities`),
          fetch(`${API_BASE}/scaling-tasks/filters/areas`),
          fetch(`${API_BASE}/scaling-tasks/filters/clubs`),
          fetch(`${API_BASE}/scaling-tasks/assignees/list`)
        ]);

        const [actData, cityData, areaData, clubData, membersData] = await Promise.all([
          actRes.json(),
          cityRes.json(),
          areaRes.json(),
          clubRes.json(),
          membersRes.json()
        ]);

        const actOptions = actData.success ? (actData.options || []) : [];
        const cityOptions = cityData.success ? (cityData.options || []) : [];
        const areaOptions = areaData.success ? (areaData.options || []) : [];
        const clubOptions = clubData.success ? (clubData.options || []) : [];

        // Batch all state updates together to prevent multiple re-renders
        setActivities(actOptions);
        setCities(cityOptions);
        setAreas(areaOptions);
        setClubs(clubOptions);
        if (membersData.success) setMembers(membersData.assignees || []);

        // Initialize filters from context using IDs directly (like TaskListTooltip does)
        // This ensures consistency with summary counts which use the same IDs
        if (context) {
          // Use IDs directly from context - this is the correct approach
          // Previously we matched by name which could fail for tasks with mismatched IDs
          if (context.activity_id) setActivityFilters([context.activity_id]);
          if (context.city_id) setCityFilters([context.city_id]);
          if (context.area_id) setAreaFilters([context.area_id]);
          if (context.club_id) setClubFilters([context.club_id]);
        }

        setInitialFetchDone(true);
        setFiltersInitialized(true);
      } catch (err) {
        console.error('Failed to fetch filter options:', err);
        setFiltersInitialized(true); // Still mark as initialized to allow sprints to fetch
      }
    };

    if (isOpen && !initialFetchDone) {
      fetchInitialOptions();
    }
  }, [isOpen, initialFetchDone, context]);

  // Update cascading filter options when parent filters change (after initial fetch)
  useEffect(() => {
    if (!initialFetchDone || !isOpen) return;

    const updateCascadingFilters = async () => {
      try {
        // Only update child filter options based on parent selections
        const cityParams = activityFilters.length > 0 ? `?activity_ids=${activityFilters.join(',')}` : '';
        const cityRes = await fetch(`${API_BASE}/scaling-tasks/filters/cities${cityParams}`);
        const cityData = await cityRes.json();
        if (cityData.success) setCities(cityData.options || []);

        const areaParams = new URLSearchParams();
        if (activityFilters.length > 0) areaParams.append('activity_ids', activityFilters.join(','));
        if (cityFilters.length > 0) areaParams.append('city_ids', cityFilters.join(','));
        const areaRes = await fetch(`${API_BASE}/scaling-tasks/filters/areas?${areaParams}`);
        const areaData = await areaRes.json();
        if (areaData.success) setAreas(areaData.options || []);

        const clubParams = new URLSearchParams();
        if (activityFilters.length > 0) clubParams.append('activity_ids', activityFilters.join(','));
        if (cityFilters.length > 0) clubParams.append('city_ids', cityFilters.join(','));
        if (areaFilters.length > 0) clubParams.append('area_ids', areaFilters.join(','));
        const clubRes = await fetch(`${API_BASE}/scaling-tasks/filters/clubs?${clubParams}`);
        const clubData = await clubRes.json();
        if (clubData.success) setClubs(clubData.options || []);
      } catch (err) {
        console.error('Failed to update cascading filters:', err);
      }
    };

    // Debounce to prevent rapid re-fetches
    const timeoutId = setTimeout(updateCascadingFilters, 150);
    return () => clearTimeout(timeoutId);
  }, [activityFilters, cityFilters, areaFilters, initialFetchDone, isOpen]);

  // Reset child filters when parent changes (for multi-select, clear children when parent is emptied)
  useEffect(() => {
    if (activityFilters.length === 0) {
      setCityFilters([]);
      setAreaFilters([]);
      setClubFilters([]);
    }
  }, [activityFilters]);

  useEffect(() => {
    if (cityFilters.length === 0) {
      setAreaFilters([]);
      setClubFilters([]);
    }
  }, [cityFilters]);

  useEffect(() => {
    if (areaFilters.length === 0) {
      setClubFilters([]);
    }
  }, [areaFilters]);

  // Filter tasks based on team, member, and status
  const filterTasks = useCallback((tasks: ScalingTask[]): ScalingTask[] => {
    return tasks.filter(task => {
      // Team filter - check if assigned team lead belongs to selected team
      if (teamFilter !== 'all') {
        const teamLead = task.assigned_team_lead || '';
        const memberTeam = getTeamByMember(teamLead);
        if (memberTeam !== teamFilter) return false;
      }
      // Member filter - compare by name
      if (memberFilter !== null) {
        if (task.assigned_to_name !== memberFilter) return false;
      }
      // Status filter
      if (statusFilter !== 'all') {
        if (task.status !== statusFilter) return false;
      }
      return true;
    });
  }, [teamFilter, memberFilter, statusFilter]);

  // Apply filters to weeks and sort tasks (completed at bottom, preserve manual order for others)
  const filteredWeeks = useMemo(() => {
    return weeks.map(week => {
      const filtered = filterTasks(week.tasks);
      // Separate completed from non-completed, preserving original order within each group
      const nonCompleted = filtered.filter(t => t.status !== 'completed');
      const completed = filtered.filter(t => t.status === 'completed');
      // Non-completed tasks keep their manual drag order, completed go to bottom
      const sorted = [...nonCompleted, ...completed];

      return {
        ...week,
        tasks: sorted,
        summary: {
          not_started: filtered.filter(t => t.status === 'not_started').length,
          in_progress: filtered.filter(t => t.status === 'in_progress').length,
          completed: filtered.filter(t => t.status === 'completed').length
        }
      };
    });
  }, [weeks, filterTasks]);

  // Fetch sprints data
  const fetchSprints = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Build query params based on hierarchy filters (support multi-select)
      const params = new URLSearchParams();
      if (activityFilters.length > 0) params.append('activity_ids', activityFilters.join(','));
      if (cityFilters.length > 0) params.append('city_ids', cityFilters.join(','));
      if (areaFilters.length > 0) params.append('area_ids', areaFilters.join(','));
      if (clubFilters.length > 0) params.append('club_ids', clubFilters.join(','));
      if (node.launch_id) params.append('launch_id', String(node.launch_id));
      params.append('weeks_count', '5');

      const response = await fetch(`${API_BASE}/scaling-tasks/sprints?${params}`);
      const data = await response.json();

      if (data.success) {
        setWeeks(data.weeks);
        // Set older tasks if present
        if (data.olderTasks) {
          setOlderTasks(data.olderTasks);
        } else {
          setOlderTasks(null);
        }
        // Auto-expand current week ONLY on initial load (when no weeks are expanded yet)
        // This preserves user's expanded state during status changes, duplicates, etc.
        setExpandedWeeks(prev => {
          if (prev.size === 0) {
            const currentWeek = data.weeks.find((w: SprintWeek) => w.is_current);
            if (currentWeek) {
              return new Set([currentWeek.week_start]);
            }
          }
          return prev;
        });
      } else {
        setError(data.error || 'Failed to fetch sprints');
      }
    } catch (err) {
      setError('Failed to fetch sprints');
      console.error('Error fetching sprints:', err);
    } finally {
      setLoading(false);
      // Restore scroll position after data loads
      requestAnimationFrame(() => {
        if (scrollContainerRef.current && savedScrollPosition.current > 0) {
          scrollContainerRef.current.scrollTop = savedScrollPosition.current;
        }
      });
    }
  }, [activityFilters, cityFilters, areaFilters, clubFilters, node.launch_id]);

  useEffect(() => {
    // Only fetch sprints after filters have been initialized from context
    // This prevents fetching with empty filters and then re-fetching with correct filters
    if (isOpen && filtersInitialized) {
      fetchSprints();
    }
  }, [isOpen, fetchSprints, filtersInitialized]);

  // Helper to save scroll position before refetching data
  const saveScrollPosition = useCallback(() => {
    if (scrollContainerRef.current) {
      savedScrollPosition.current = scrollContainerRef.current.scrollTop;
    }
  }, []);

  // Fetch sprints while preserving scroll position
  const fetchSprintsPreserveScroll = useCallback(() => {
    saveScrollPosition();
    fetchSprints();
  }, [saveScrollPosition, fetchSprints]);

  // Toggle week expansion
  const toggleWeek = (weekStart: string) => {
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(weekStart)) {
        next.delete(weekStart);
      } else {
        next.add(weekStart);
      }
      return next;
    });
  };

  // Handle task status change
  const handleStatusChange = async (task: ScalingTask, newStatus: ScalingTask['status']) => {
    try {
      const response = await fetch(`${API_BASE}/scaling-tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        fetchSprintsPreserveScroll();
      }
    } catch (err) {
      console.error('Failed to update task status:', err);
    }
  };

  // Handle move task to a different week with optimistic update
  const handleMoveToWeek = async (taskId: number, weekStart: string) => {
    // Find the task
    let movedTask: ScalingTask | null = null;

    // Optimistic update - move task locally first
    setWeeks(prevWeeks => {
      // First pass: find and remove from source week
      const newWeeks = prevWeeks.map(week => {
        const taskIndex = week.tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
          movedTask = { ...week.tasks[taskIndex], week_start: weekStart };
          const newTasks = [...week.tasks];
          newTasks.splice(taskIndex, 1);
          return { ...week, tasks: newTasks };
        }
        return week;
      });

      // Second pass: add to destination week
      if (movedTask) {
        return newWeeks.map(week => {
          if (week.week_start === weekStart) {
            return { ...week, tasks: [...week.tasks, movedTask!] };
          }
          return week;
        });
      }
      return newWeeks;
    });

    // Also check olderTasks if task wasn't found in weeks
    if (!movedTask && olderTasks) {
      for (const weekKey of Object.keys(olderTasks.groupedByWeek)) {
        const tasks = olderTasks.groupedByWeek[weekKey];
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          movedTask = { ...task, week_start: weekStart };
          // Remove from older tasks
          setOlderTasks(prev => {
            if (!prev) return prev;
            const newGrouped = { ...prev.groupedByWeek };
            newGrouped[weekKey] = tasks.filter(t => t.id !== taskId);
            if (newGrouped[weekKey].length === 0) {
              delete newGrouped[weekKey];
            }
            return {
              ...prev,
              groupedByWeek: newGrouped,
              totalCount: prev.totalCount - 1
            };
          });
          // Add to destination week
          setWeeks(prevWeeks => prevWeeks.map(week => {
            if (week.week_start === weekStart) {
              return { ...week, tasks: [...week.tasks, movedTask!] };
            }
            return week;
          }));
          break;
        }
      }
    }

    // Send to backend
    try {
      const response = await fetch(`${API_BASE}/scaling-tasks/${taskId}/duplicate-to-week`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start: weekStart })
      });

      if (!response.ok) {
        // Revert on failure
        fetchSprintsPreserveScroll();
      }
    } catch (err) {
      console.error('Failed to move task:', err);
      fetchSprintsPreserveScroll();
    }
  };

  // Handle task creation
  const handleTaskCreated = () => {
    setShowCreateModal(false);
    fetchSprintsPreserveScroll();
  };

  // View comments
  const handleViewComments = (task: ScalingTask) => {
    setSelectedTask(task);
    setShowCommentsPanel(true);
  };

  // Edit task
  const handleEditTask = (task: ScalingTask) => {
    setEditingTask(task);
  };

  // Handle task updated
  const handleTaskUpdated = () => {
    setEditingTask(null);
    fetchSprintsPreserveScroll();
  };

  // Handle task deleted
  const handleTaskDeleted = () => {
    setEditingTask(null);
    fetchSprintsPreserveScroll();
  };

  // Handle drag end for reordering tasks within same week OR moving between weeks
  const handleDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;

    // Dropped outside a droppable area
    if (!destination) return;

    // draggableId format: task-{id}-{week_start}
    const taskId = parseInt(draggableId.split('-')[1]);
    const sourceWeek = source.droppableId.replace('week-', '').replace('older-', '');
    const destWeek = destination.droppableId.replace('week-', '').replace('older-', '');

    // Same week = reorder only
    if (source.droppableId === destination.droppableId) {
      // No change in position
      if (source.index === destination.index) return;

      // Optimistic update - reorder locally first
      setWeeks(prevWeeks => {
        const newWeeks = prevWeeks.map(week => {
          if (week.week_start !== sourceWeek) return week;

          const newTasks = [...week.tasks];
          const [movedTask] = newTasks.splice(source.index, 1);
          newTasks.splice(destination.index, 0, movedTask);

          return { ...week, tasks: newTasks };
        });
        return newWeeks;
      });

      // Send to backend
      try {
        const response = await fetch(`${API_BASE}/scaling-tasks/${taskId}/reorder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_week: sourceWeek,
            dest_week: sourceWeek,
            new_position: destination.index
          })
        });

        if (!response.ok) {
          // Revert on failure
          fetchSprintsPreserveScroll();
        }
      } catch (err) {
        console.error('Failed to reorder task:', err);
        fetchSprintsPreserveScroll();
      }
    } else {
      // Different week = MOVE task with optimistic update
      // Find the task being moved
      let movedTask: ScalingTask | null = null;

      // Optimistic update - move task locally first
      setWeeks(prevWeeks => {
        const newWeeks = prevWeeks.map(week => {
          if (week.week_start === sourceWeek) {
            // Remove from source week
            const taskIndex = week.tasks.findIndex(t => t.id === taskId);
            if (taskIndex !== -1) {
              movedTask = { ...week.tasks[taskIndex], week_start: destWeek };
              const newTasks = [...week.tasks];
              newTasks.splice(taskIndex, 1);
              return { ...week, tasks: newTasks };
            }
          }
          return week;
        });

        // Add to destination week
        if (movedTask) {
          return newWeeks.map(week => {
            if (week.week_start === destWeek) {
              return { ...week, tasks: [...week.tasks, movedTask!] };
            }
            return week;
          });
        }
        return newWeeks;
      });

      // Send to backend
      try {
        const response = await fetch(`${API_BASE}/scaling-tasks/${taskId}/duplicate-to-week`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ week_start: destWeek })
        });

        if (!response.ok) {
          // Revert on failure
          fetchSprintsPreserveScroll();
        }
      } catch (err) {
        console.error('Failed to move task:', err);
        fetchSprintsPreserveScroll();
      }
    }
  };

  // Multi-select helper functions
  const toggleTaskSelection = useCallback((taskId: number) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedTaskIds(new Set());
  }, []);

  // Bulk move tasks to a week with optimistic update
  const handleBulkMoveToWeek = async (weekStart: string) => {
    if (selectedTaskIds.size === 0) return;
    setBulkActionLoading(true);

    const taskIdsToMove = Array.from(selectedTaskIds);
    const movedTasks: ScalingTask[] = [];

    // Optimistic update - move tasks locally first
    setWeeks(prevWeeks => {
      // First pass: find and remove tasks from their source weeks
      const newWeeks = prevWeeks.map(week => {
        const tasksToKeep: ScalingTask[] = [];
        week.tasks.forEach(task => {
          if (taskIdsToMove.includes(task.id)) {
            movedTasks.push({ ...task, week_start: weekStart });
          } else {
            tasksToKeep.push(task);
          }
        });
        if (tasksToKeep.length !== week.tasks.length) {
          return { ...week, tasks: tasksToKeep };
        }
        return week;
      });

      // Second pass: add moved tasks to destination week
      return newWeeks.map(week => {
        if (week.week_start === weekStart) {
          return { ...week, tasks: [...week.tasks, ...movedTasks] };
        }
        return week;
      });
    });

    clearSelection();

    // Send to backend
    try {
      const results = await Promise.all(
        taskIdsToMove.map(taskId =>
          fetch(`${API_BASE}/scaling-tasks/${taskId}/duplicate-to-week`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ week_start: weekStart })
          })
        )
      );

      // If any failed, refresh to get correct state
      if (results.some(r => !r.ok)) {
        fetchSprintsPreserveScroll();
      }
    } catch (err) {
      console.error('Failed to bulk move tasks to week:', err);
      fetchSprintsPreserveScroll();
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Bulk status change
  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedTaskIds.size === 0) return;
    saveScrollPosition();
    setBulkActionLoading(true);
    try {
      // Process in parallel for speed
      await Promise.all(
        Array.from(selectedTaskIds).map(taskId =>
          fetch(`${API_BASE}/scaling-tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
          })
        )
      );
      clearSelection();
      fetchSprints();
    } catch (err) {
      console.error('Failed to bulk update status:', err);
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Get context for task creation - uses the passed context which has all hierarchy names
  const getCreateContext = () => {
    // For launches, use node.name as club_name since it's the planned club name
    const isLaunch = node.type === 'launch';
    const clubName = isLaunch
      ? node.name
      : (context.club_name || (node.type === 'club' ? node.name : undefined));

    return {
      task_scope: node.type as TaskScope,
      activity_id: context.activity_id || node.activity_id,
      activity_name: context.activity_name || (node.type === 'activity' ? node.name : undefined),
      city_id: context.city_id || node.city_id,
      city_name: context.city_name || (node.type === 'city' ? node.name : undefined),
      area_id: context.area_id || node.area_id,
      area_name: context.area_name || (node.type === 'area' ? node.name : undefined),
      club_id: node.club_id,
      club_name: clubName,
      launch_id: node.launch_id,
      launch_name: isLaunch ? node.name : undefined
    };
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-4 bg-white rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-gray-900">Sprint Tasks</h2>
              {/* Total count including older tasks */}
              {weeks.length > 0 && (
                <span className="px-3 py-1 text-sm font-medium bg-blue-100 text-blue-700 rounded-full">
                  {weeks.reduce((sum, w) => sum + w.tasks.length, 0) + (olderTasks?.totalCount || 0)} total
                </span>
              )}
              {olderTasks && olderTasks.totalCount > 0 && (
                <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">
                  {olderTasks.totalCount} overdue
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Task
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
          </div>

          {/* Hierarchy Filters Row - Multi-select dropdowns */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            {/* Activity Filter */}
            <MultiSelectDropdown
              label="Activity"
              options={activities.filter(a => a.id !== null).map(a => ({ id: a.id!, name: a.name }))}
              selected={activityFilters}
              onChange={setActivityFilters}
              icon={<Activity className="h-3.5 w-3.5" />}
              compact
            />

            {/* City Filter */}
            <MultiSelectDropdown
              label="City"
              options={cities.filter(c => c.id !== null).map(c => ({ id: c.id!, name: c.name }))}
              selected={cityFilters}
              onChange={setCityFilters}
              icon={<Building2 className="h-3.5 w-3.5" />}
              compact
            />

            {/* Area Filter */}
            <MultiSelectDropdown
              label="Area"
              options={areas.filter(a => a.id !== null).map(a => ({ id: a.id!, name: a.name }))}
              selected={areaFilters}
              onChange={setAreaFilters}
              icon={<MapPin className="h-3.5 w-3.5" />}
              compact
            />

            {/* Club Filter */}
            <MultiSelectDropdown
              label="Club"
              options={clubs.filter(c => c.id !== null).map(c => ({ id: c.id!, name: c.name }))}
              selected={clubFilters}
              onChange={setClubFilters}
              icon={<Home className="h-3.5 w-3.5" />}
              compact
            />

            {/* Clear Filters Button */}
            {(activityFilters.length > 0 || cityFilters.length > 0 || areaFilters.length > 0 || clubFilters.length > 0) && (
              <button
                onClick={() => {
                  setActivityFilters([]);
                  setCityFilters([]);
                  setAreaFilters([]);
                  setClubFilters([]);
                }}
                className="text-xs text-gray-500 hover:text-red-500 underline ml-2"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Team and Status Filters Row */}
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-600">Team:</span>
              <div className="flex items-center gap-1">
                {TEAM_OPTIONS.map(option => {
                  const isActive = teamFilter === option.value;
                  const teamConfig = option.teamKey ? TEAMS[option.teamKey] : null;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setTeamFilter(option.value)}
                      className={`
                        px-3 py-1 text-xs font-medium rounded-full transition-colors
                        ${isActive
                          ? option.value === 'all'
                            ? 'bg-gray-800 text-white'
                            : `${teamConfig?.color.bg.replace('50', '600')} text-white`
                          : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                        }
                      `}
                      style={isActive && teamConfig ? { backgroundColor: teamConfig.color.accent } : undefined}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-4 w-px bg-gray-300" />

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-600">Status:</span>
              <div className="flex items-center gap-1">
                {STATUS_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    onClick={() => setStatusFilter(option.value)}
                    className={`
                      px-3 py-1 text-xs font-medium rounded-full transition-colors
                      ${statusFilter === option.value
                        ? option.value === 'all'
                          ? 'bg-gray-800 text-white'
                          : option.value === 'not_started'
                            ? 'bg-red-500 text-white'
                            : option.value === 'in_progress'
                              ? 'bg-amber-500 text-white'
                              : 'bg-green-500 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                      }
                    `}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-4 w-px bg-gray-300" />

            {/* Member Filter */}
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-600">Member:</span>
              <select
                value={memberFilter || ''}
                onChange={(e) => setMemberFilter(e.target.value || null)}
                className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Members</option>
                {members.map(m => (
                  <option key={m.id} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Content */}
        <div
          ref={scrollContainerRef}
          className={`flex-1 overflow-y-auto p-6 ${selectedTaskIds.size > 0 ? 'pb-24' : ''}`}
        >
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <span className="ml-2 text-gray-600">Loading sprints...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-500">
              {error}
            </div>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <div className="space-y-4">
                {/* Older Tasks Section - tasks scheduled before the sprint window */}
                {olderTasks && olderTasks.totalCount > 0 && (
                  <div className="border border-orange-300 rounded-xl overflow-hidden bg-orange-50">
                    <button
                      onClick={() => setShowOlderTasks(!showOlderTasks)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-orange-100 hover:bg-orange-150 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {showOlderTasks ? (
                          <ChevronDown className="h-5 w-5 text-orange-600" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-orange-600" />
                        )}
                        <span className="font-semibold text-orange-800">
                          Older Tasks
                        </span>
                        <span className="px-2 py-0.5 text-xs font-medium bg-orange-200 text-orange-800 rounded-full">
                          {olderTasks.totalCount} overdue
                        </span>
                      </div>
                      <span className="text-xs text-orange-600">
                        Tasks from past weeks that are still open
                      </span>
                    </button>

                    {showOlderTasks && (
                      <div className="p-3 space-y-2">
                        {/* Flat consolidated list of all older tasks */}
                        {(() => {
                          // Collect all tasks from all weeks, filter and deduplicate
                          const allOlderTasks: ScalingTask[] = [];
                          const seenTaskIds = new Set<number>();
                          olderTasks.sortedWeeks.forEach((weekStart) => {
                            const weekTasks = olderTasks.groupedByWeek[weekStart] || [];
                            weekTasks.forEach((task: ScalingTask) => {
                              // Skip if already added (task can exist in multiple weeks)
                              if (seenTaskIds.has(task.id)) return;
                              // Apply filters
                              if (teamFilter !== 'all' && task.assigned_team_lead !== teamFilter) return;
                              if (statusFilter !== 'all' && task.status !== statusFilter) return;
                              if (memberFilter && task.assigned_to_name !== memberFilter) return;
                              seenTaskIds.add(task.id);
                              allOlderTasks.push(task);
                            });
                          });

                          // Sort: completed at bottom
                          const nonCompleted = allOlderTasks.filter(t => t.status !== 'completed');
                          const completed = allOlderTasks.filter(t => t.status === 'completed');
                          const sortedTasks = [...nonCompleted, ...completed];

                          if (sortedTasks.length === 0) {
                            return (
                              <div className="text-center py-4 text-sm text-orange-600">
                                No tasks match current filters
                              </div>
                            );
                          }

                          return sortedTasks.map((task: ScalingTask) => (
                            <ScalingTaskTileV2
                              key={task.id}
                              task={task}
                              onEdit={handleEditTask}
                              weeks={weeks.map(w => ({
                                week_start: w.week_start,
                                week_end: w.week_end,
                                is_current: w.is_current
                              }))}
                              onMoveToWeek={handleMoveToWeek}
                              onViewComments={handleViewComments}
                              onStatusChange={handleStatusChange}
                              showCheckbox={true}
                              isSelected={selectedTaskIds.has(task.id)}
                              onToggleSelect={toggleTaskSelection}
                            />
                          ));
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {filteredWeeks.map((week) => (
                  <div
                    key={week.week_start}
                    className={`
                      border rounded-xl overflow-hidden
                      ${week.is_current ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-200'}
                    `}
                  >
                    {/* Week Header */}
                    <button
                      onClick={() => toggleWeek(week.week_start)}
                      className={`
                        w-full flex items-center justify-between px-4 py-3
                        ${week.is_current ? 'bg-blue-50' : 'bg-gray-50'}
                        hover:bg-opacity-80 transition-colors
                      `}
                    >
                      <div className="flex items-center gap-3">
                        {expandedWeeks.has(week.week_start) ? (
                          <ChevronDown className="h-5 w-5 text-gray-500" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-gray-500" />
                        )}
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span className="font-semibold text-gray-900">
                          {week.week_label}
                        </span>
                        {week.is_current && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                            Current
                          </span>
                        )}
                      </div>

                      {/* Summary badges */}
                      <div className="flex items-center gap-2">
                        {week.summary.not_started > 0 && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                            {week.summary.not_started}
                          </span>
                        )}
                        {week.summary.in_progress > 0 && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                            {week.summary.in_progress}
                          </span>
                        )}
                        {week.summary.completed > 0 && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                            {week.summary.completed}
                          </span>
                        )}
                        <span className="text-xs text-gray-500 ml-1">
                          {week.tasks.length} task{week.tasks.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </button>

                    {/* Week Tasks */}
                    {expandedWeeks.has(week.week_start) && (
                      <Droppable droppableId={`week-${week.week_start}`}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`p-4 space-y-2 min-h-[60px] transition-colors ${
                              snapshot.isDraggingOver ? 'bg-blue-50/50' : ''
                            }`}
                          >
                            {week.tasks.length === 0 ? (
                              <div className="text-center py-8 text-gray-500">
                                <p>No tasks for this week</p>
                                <button
                                  onClick={() => setShowCreateModal(true)}
                                  className="mt-2 text-blue-600 hover:text-blue-700 text-sm"
                                >
                                  + Add a task
                                </button>
                              </div>
                            ) : (
                              <>
                                {week.tasks.map((task, index) => (
                                  <Draggable
                                    key={`${task.id}-${week.week_start}`}
                                    draggableId={`task-${task.id}-${week.week_start}`}
                                    index={index}
                                  >
                                    {(dragProvided, dragSnapshot) => (
                                      <div
                                        ref={dragProvided.innerRef}
                                        {...dragProvided.draggableProps}
                                      >
                                        <ScalingTaskTileV2
                                          task={task}
                                          onEdit={handleEditTask}
                                          weeks={weeks.map(w => ({
                                            week_start: w.week_start,
                                            week_end: w.week_end,
                                            is_current: w.is_current
                                          }))}
                                          onMoveToWeek={handleMoveToWeek}
                                          onViewComments={handleViewComments}
                                          onStatusChange={handleStatusChange}
                                          isDragging={dragSnapshot.isDragging}
                                          dragHandleProps={dragProvided.dragHandleProps}
                                          showCheckbox={true}
                                          isSelected={selectedTaskIds.has(task.id)}
                                          onToggleSelect={toggleTaskSelection}
                                        />
                                      </div>
                                    )}
                                  </Draggable>
                                ))}
                              </>
                            )}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    )}
                  </div>
                ))}

                {weeks.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <p>No sprint data available</p>
                  </div>
                )}
              </div>
            </DragDropContext>
          )}
        </div>

        {/* Floating Action Bar for Multi-Select */}
        {selectedTaskIds.size > 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
            <div className="
              flex items-center gap-2
              px-2 py-2
              bg-gray-900/95 backdrop-blur-sm
              border border-gray-700/50
              rounded-xl
              shadow-2xl shadow-gray-900/30
              animate-in slide-in-from-bottom-4 fade-in duration-300
            ">
              {/* Selection Count */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-lg">
                <span className="
                  w-6 h-6
                  bg-blue-500 text-white
                  text-xs font-bold
                  rounded-full
                  flex items-center justify-center
                  ring-2 ring-blue-400/30
                ">
                  {selectedTaskIds.size}
                </span>
                <span className="text-sm font-medium text-gray-200">
                  selected
                </span>
              </div>

              <div className="w-px h-6 bg-gray-700" />

              {/* Move to Week Dropdown */}
              <div className="relative group">
                <button
                  disabled={bulkActionLoading}
                  className="
                    flex items-center gap-2 px-3 py-2
                    bg-blue-500 hover:bg-blue-400
                    text-white text-sm font-medium
                    rounded-lg
                    transition-all duration-150
                    disabled:opacity-50 disabled:cursor-not-allowed
                  "
                >
                  <Calendar className="h-4 w-4" />
                  <span>Move to Week</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </button>
                {/* Dropdown */}
                <div className="
                  absolute bottom-full left-0 mb-2
                  opacity-0 invisible
                  group-hover:opacity-100 group-hover:visible
                  transition-all duration-150
                  transform translate-y-1 group-hover:translate-y-0
                ">
                  <div className="
                    bg-white rounded-xl
                    border border-gray-200
                    shadow-xl shadow-gray-200/50
                    py-1.5 min-w-[220px]
                    overflow-hidden
                  ">
                    <div className="px-3 py-1.5 border-b border-gray-100">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        Select Week
                      </span>
                    </div>
                    {weeks.map(week => (
                      <button
                        key={week.week_start}
                        onClick={() => handleBulkMoveToWeek(week.week_start)}
                        className={`
                          w-full flex items-center gap-3 px-3 py-2.5
                          text-sm transition-colors duration-100
                          ${week.is_current
                            ? 'bg-blue-50/50 hover:bg-blue-50'
                            : 'hover:bg-gray-50'
                          }
                        `}
                      >
                        <span className={`
                          w-8 h-8 rounded-lg flex items-center justify-center
                          ${week.is_current
                            ? 'bg-blue-100 text-blue-600'
                            : 'bg-gray-100 text-gray-500'
                          }
                        `}>
                          <Calendar className="h-4 w-4" />
                        </span>
                        <div className="flex-1 text-left">
                          <div className="font-medium text-gray-800">
                            {new Date(week.week_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {' – '}
                            {new Date(week.week_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </div>
                          {week.is_current && (
                            <div className="text-[10px] font-medium text-blue-600 mt-0.5">
                              Current Week
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Status Dropdown */}
              <div className="relative group">
                <button
                  disabled={bulkActionLoading}
                  className="
                    flex items-center gap-2 px-3 py-2
                    bg-white/10 hover:bg-white/20
                    text-gray-200 text-sm font-medium
                    rounded-lg
                    transition-all duration-150
                    disabled:opacity-50 disabled:cursor-not-allowed
                  "
                >
                  <span className="text-gray-400">Set Status</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </button>
                {/* Dropdown */}
                <div className="
                  absolute bottom-full left-0 mb-2
                  opacity-0 invisible
                  group-hover:opacity-100 group-hover:visible
                  transition-all duration-150
                  transform translate-y-1 group-hover:translate-y-0
                ">
                  <div className="
                    bg-white rounded-xl
                    border border-gray-200
                    shadow-xl shadow-gray-200/50
                    py-1.5 min-w-[180px]
                    overflow-hidden
                  ">
                    <div className="px-3 py-1.5 border-b border-gray-100">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        Change Status
                      </span>
                    </div>
                    <button
                      onClick={() => handleBulkStatusChange('not_started')}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-red-50 transition-colors"
                    >
                      <span className="w-3 h-3 rounded-full bg-gradient-to-br from-red-400 to-red-600 ring-2 ring-red-100" />
                      <span className="font-medium text-gray-700">Not Started</span>
                    </button>
                    <button
                      onClick={() => handleBulkStatusChange('in_progress')}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-amber-50 transition-colors"
                    >
                      <span className="w-3 h-3 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 ring-2 ring-amber-100" />
                      <span className="font-medium text-gray-700">In Progress</span>
                    </button>
                    <button
                      onClick={() => handleBulkStatusChange('completed')}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-green-50 transition-colors"
                    >
                      <span className="w-3 h-3 rounded-full bg-gradient-to-br from-green-400 to-green-600 ring-2 ring-green-100" />
                      <span className="font-medium text-gray-700">Completed</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="w-px h-6 bg-gray-700" />

              {/* Clear Selection */}
              <button
                onClick={clearSelection}
                className="
                  flex items-center justify-center
                  w-8 h-8
                  text-gray-400 hover:text-white
                  hover:bg-white/10
                  rounded-lg
                  transition-colors duration-150
                "
                title="Clear selection"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Loading Overlay */}
              {bulkActionLoading && (
                <div className="absolute inset-0 bg-gray-900/90 backdrop-blur-sm flex items-center justify-center rounded-xl">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                  <span className="ml-2 text-sm text-gray-300">Processing...</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Task Modal */}
      {showCreateModal && (
        <ScalingTaskCreateModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleTaskCreated}
          context={getCreateContext()}
          defaultWeekStart={weeks.find(w => w.is_current)?.week_start}
        />
      )}

      {/* Comments Panel */}
      {showCommentsPanel && selectedTask && (
        <TaskCommentsPanel
          isOpen={showCommentsPanel}
          onClose={() => {
            setShowCommentsPanel(false);
            setSelectedTask(null);
          }}
          task={selectedTask}
          onCommentAdded={fetchSprints}
        />
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <ScalingTaskEditModal
          isOpen={!!editingTask}
          onClose={() => setEditingTask(null)}
          onUpdated={handleTaskUpdated}
          onDeleted={handleTaskDeleted}
          task={editingTask}
        />
      )}
    </>
  );
}

export default SprintViewModal;
