import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Loader2,
  User,
  Check,
  ChevronDown,
  ChevronRight,
  Activity,
  Building2,
  MapPin,
  Home,
  Users,
  ListTodo,
  Zap,
  Settings,
  UserPlus,
  Plus
} from 'lucide-react';
import type { LeaderRequirement, HierarchyNode, RequirementStatus, ScalingTask } from '../../../../shared/types';
import { TEAMS, getTeamByMember, type TeamKey } from '../../../../shared/teamConfig';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

// Status options with full styling
const REQUIREMENT_STATUS_OPTIONS = [
  {
    value: 'not_picked',
    label: 'Not Picked',
    dot: 'bg-gray-400',
    bg: 'bg-gray-50',
    text: 'text-gray-600',
    hover: 'hover:bg-gray-100',
    border: 'border-gray-200'
  },
  {
    value: 'deprioritised',
    label: 'Deprioritised',
    dot: 'bg-orange-500',
    bg: 'bg-orange-50',
    text: 'text-orange-600',
    hover: 'hover:bg-orange-100',
    border: 'border-orange-200'
  },
  {
    value: 'in_progress',
    label: 'In Progress',
    dot: 'bg-blue-500',
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    hover: 'hover:bg-blue-100',
    border: 'border-blue-200'
  },
  {
    value: 'done',
    label: 'Done',
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    hover: 'hover:bg-emerald-100',
    border: 'border-emerald-200'
  }
];

// Get team accent color
function getTeamAccent(team: string | null | undefined): string {
  if (!team) return '#94a3b8';
  const teamKey = team as TeamKey;
  return TEAMS[teamKey]?.color.accent || '#94a3b8';
}

// Compact Requirement Tile for Tooltip
function CompactRequirementTile({
  requirement,
  onStatusChange,
  canChangeStatus,
  onCreateTask
}: {
  requirement: LeaderRequirement & {
    leaders_required?: number;
    existing_leader_effort?: boolean;
    linked_tasks?: ScalingTask[];
  };
  onStatusChange?: (req: LeaderRequirement, newStatus: RequirementStatus) => void;
  canChangeStatus: boolean;
  onCreateTask?: (requirement: LeaderRequirement) => void;
}) {
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [tasksExpanded, setTasksExpanded] = useState(false);

  const statusButtonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

  const currentStatus = REQUIREMENT_STATUS_OPTIONS.find(s => s.value === requirement.status) || REQUIREMENT_STATUS_OPTIONS[0];
  const accentColor = getTeamAccent(requirement.team);

  const leadersRequired = requirement.leaders_required || 1;
  const linkedTasks = requirement.linked_tasks || [];

  // Update dropdown position
  useEffect(() => {
    if (statusDropdownOpen && statusButtonRef.current) {
      const rect = statusButtonRef.current.getBoundingClientRect();
      setDropdownPosition({ top: rect.bottom + 4, left: rect.right - 130 });
    }
  }, [statusDropdownOpen]);

  // Close status dropdown on outside click
  useEffect(() => {
    if (!statusDropdownOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (statusButtonRef.current?.contains(target)) return;
      const dropdown = document.getElementById(`req-status-dropdown-${requirement.id}`);
      if (dropdown?.contains(target)) return;
      setStatusDropdownOpen(false);
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [statusDropdownOpen, requirement.id]);

  const handleStatusClick = (newStatus: RequirementStatus) => {
    if (onStatusChange) {
      onStatusChange(requirement, newStatus);
    }
    setStatusDropdownOpen(false);
  };

  return (
    <div
      className={`relative rounded-lg border bg-white overflow-hidden transition-all duration-150 hover:shadow-md ${currentStatus.border}`}
      style={{ borderLeftWidth: '3px', borderLeftColor: accentColor }}
    >
      {/* Main Row */}
      <div className="relative">
        {/* Grid Layout */}
        <div className="relative grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-2 px-3 py-2.5">
          {/* Col 1: Leaders Required Badge */}
          <div className="flex items-center gap-1.5 w-[50px]">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-bold">
              <Users className="h-3 w-3" />
              {leadersRequired}
            </span>
          </div>

          {/* Col 2: Name + Description + Effort Badges */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-gray-900 text-xs truncate">{requirement.name}</h4>
              {requirement.club_name && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-orange-100 text-orange-700 whitespace-nowrap max-w-[100px]">
                  <Home className="h-2.5 w-2.5 flex-shrink-0" />
                  <span className="truncate">{requirement.club_name}</span>
                </span>
              )}
            </div>
            {/* Effort Badges Row */}
            <div className="flex items-center gap-1.5 mt-1 flex-nowrap overflow-hidden">
              {requirement.growth_team_effort && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-violet-100 text-violet-700 whitespace-nowrap">
                  <Zap className="h-2.5 w-2.5" />
                  Growth
                </span>
              )}
              {requirement.platform_team_effort && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-sky-100 text-sky-700 whitespace-nowrap">
                  <Settings className="h-2.5 w-2.5" />
                  Platform
                </span>
              )}
              {requirement.existing_leader_effort && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-100 text-emerald-700 whitespace-nowrap">
                  <UserPlus className="h-2.5 w-2.5" />
                  Existing
                </span>
              )}
              {linkedTasks.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setTasksExpanded(!tasksExpanded);
                  }}
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium whitespace-nowrap transition-colors ${
                    tasksExpanded
                      ? 'bg-slate-200 text-slate-700'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <ListTodo className="h-2.5 w-2.5" />
                  {linkedTasks.length} task{linkedTasks.length !== 1 ? 's' : ''}
                  <ChevronRight className={`h-2.5 w-2.5 transition-transform ${tasksExpanded ? 'rotate-90' : ''}`} />
                </button>
              )}
            </div>
          </div>

          {/* Col 3: Status Dropdown */}
          <div className="w-[100px]">
            <button
              ref={statusButtonRef}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (canChangeStatus && onStatusChange) setStatusDropdownOpen(!statusDropdownOpen);
              }}
              className={`w-full flex items-center justify-between gap-1 px-2 py-1.5 rounded text-[10px] font-semibold transition-all border ${currentStatus.bg} ${currentStatus.text} ${currentStatus.border} ${canChangeStatus && onStatusChange ? 'cursor-pointer hover:shadow-sm' : 'cursor-default'}`}
            >
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${currentStatus.dot} ${requirement.status === 'in_progress' ? 'animate-pulse' : ''}`} />
                <span className="truncate">{currentStatus.label}</span>
              </span>
              {canChangeStatus && onStatusChange && <ChevronDown className={`h-3 w-3 transition-transform ${statusDropdownOpen ? 'rotate-180' : ''}`} />}
            </button>
          </div>

          {/* Col 4: Create Task Button */}
          <div className="w-6 flex justify-center">
            {onCreateTask && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateTask(requirement);
                }}
                className="p-1 rounded text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                title="Create Task for this Requirement"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Col 5: Team Badge */}
          <div className="w-7 flex justify-center">
            {requirement.team ? (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                style={{ backgroundColor: accentColor }}
                title={`${requirement.team.charAt(0).toUpperCase() + requirement.team.slice(1)} Team`}
              >
                {requirement.team[0].toUpperCase()}
              </div>
            ) : (
              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[9px] text-gray-400">
                --
              </div>
            )}
          </div>

          {/* Status Dropdown Portal */}
          {statusDropdownOpen && createPortal(
            <div
              id={`req-status-dropdown-${requirement.id}`}
              className="fixed bg-white rounded-lg shadow-2xl border border-gray-200 py-1 min-w-[120px] animate-in fade-in slide-in-from-top-2 duration-150"
              style={{ top: dropdownPosition.top, left: dropdownPosition.left, zIndex: 99999 }}
            >
              {REQUIREMENT_STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    handleStatusClick(option.value as RequirementStatus);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-left ${option.hover} transition-colors ${requirement.status === option.value ? `${option.bg} ${option.text}` : 'text-gray-700'}`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${option.dot}`} />
                  <span className="flex-1">{option.label}</span>
                  {requirement.status === option.value && <Check className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>,
            document.body
          )}
        </div>
      </div>

      {/* Linked Tasks Expansion */}
      {tasksExpanded && linkedTasks.length > 0 && (
        <div className="border-t border-gray-100 bg-slate-50/50 px-3 py-2">
          <div className="space-y-1">
            {linkedTasks.map(task => (
              <div
                key={task.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white border border-gray-100 text-xs"
              >
                <ListTodo className="h-3 w-3 text-gray-400 flex-shrink-0" />
                <span className="font-medium text-gray-700 truncate flex-1">{task.title}</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                  task.status === 'completed' ? 'bg-green-100 text-green-700' :
                  task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {(task.status || 'not_started').replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface LeaderRequirementsTooltipProps {
  node: HierarchyNode;
  leadersRequiredTotal: number;
  leaderRequirementsSummary?: {
    not_picked: number;
    deprioritised: number;
    in_progress: number;
    done: number;
    total_requirements: number;
  } | null;
  children: React.ReactNode;
  onRefresh?: () => void;
  onCreateTask?: (node: HierarchyNode) => void;
  onCreateTaskForRequirement?: (requirement: LeaderRequirement, node: HierarchyNode) => void;
}

export function LeaderRequirementsTooltip({
  node,
  leadersRequiredTotal,
  leaderRequirementsSummary,
  children,
  onRefresh,
  onCreateTask,
  onCreateTaskForRequirement
}: LeaderRequirementsTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [requirements, setRequirements] = useState<(LeaderRequirement & { leaders_required?: number; existing_leader_effort?: boolean; linked_tasks?: ScalingTask[] })[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringRef = useRef(false);

  // Only show tooltip if there are leader requirements
  const shouldShowTooltip = leadersRequiredTotal > 0;

  // Can change status only at club level
  const canChangeStatus = node.type === 'club' || node.type === 'launch';

  // Fetch requirements when hovering
  const fetchRequirements = useCallback(async () => {
    if (!shouldShowTooltip) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      // Add hierarchy filters based on node type
      if (node.type === 'club' || node.type === 'launch') {
        if (node.club_id) params.append('club_id', node.club_id.toString());
      } else if (node.type === 'area') {
        if (node.area_id) params.append('area_id', node.area_id.toString());
      } else if (node.type === 'city') {
        if (node.city_id) params.append('city_id', node.city_id.toString());
      } else if (node.type === 'activity') {
        if (node.activity_id) params.append('activity_id', node.activity_id.toString());
      }

      const response = await fetch(`${API_BASE}/requirements/leaders?${params}`);
      const data = await response.json();

      if (data.success) {
        setRequirements(data.requirements || []);
      } else {
        setError(data.error || 'Failed to load requirements');
      }
    } catch (err) {
      setError('Failed to load requirements');
    } finally {
      setLoading(false);
    }
  }, [node, shouldShowTooltip]);

  // Handle status change
  const handleStatusChange = async (req: LeaderRequirement, newStatus: RequirementStatus) => {
    const originalStatus = req.status;

    // Optimistically update UI
    setRequirements(prev => prev.map(r =>
      r.id === req.id ? { ...r, status: newStatus } : r
    ));

    try {
      const response = await fetch(`${API_BASE}/requirements/leaders/${req.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        onRefresh?.();
      } else {
        // Revert on failure
        setRequirements(prev => prev.map(r =>
          r.id === req.id ? { ...r, status: originalStatus } : r
        ));
      }
    } catch (err) {
      console.error('Failed to update requirement status:', err);
      // Revert on error
      setRequirements(prev => prev.map(r =>
        r.id === req.id ? { ...r, status: originalStatus } : r
      ));
    }
  };

  // Schedule opening the tooltip
  const scheduleOpen = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (isOpen || openTimeoutRef.current) return;

    openTimeoutRef.current = setTimeout(() => {
      openTimeoutRef.current = null;
      if (isHoveringRef.current && containerRef.current) {
        setTriggerRect(containerRef.current.getBoundingClientRect());
        setIsOpen(true);
        fetchRequirements();
      }
    }, 250);
  }, [isOpen, fetchRequirements]);

  // Schedule closing the tooltip
  const scheduleClose = useCallback(() => {
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
    if (closeTimeoutRef.current) return;

    closeTimeoutRef.current = setTimeout(() => {
      closeTimeoutRef.current = null;
      if (!isHoveringRef.current) {
        setIsOpen(false);
      }
    }, 300);
  }, []);

  // Handle mouse enter on trigger
  const handleTriggerEnter = useCallback(() => {
    if (!shouldShowTooltip) return;
    isHoveringRef.current = true;
    scheduleOpen();
  }, [shouldShowTooltip, scheduleOpen]);

  // Handle mouse leave from trigger
  const handleTriggerLeave = useCallback(() => {
    isHoveringRef.current = false;
    scheduleClose();
  }, [scheduleClose]);

  // Handle tooltip mouse enter
  const handleTooltipEnter = useCallback(() => {
    isHoveringRef.current = true;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  // Handle tooltip mouse leave
  const handleTooltipLeave = useCallback(() => {
    isHoveringRef.current = false;
    scheduleClose();
  }, [scheduleClose]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  // Don't render tooltip if no requirements
  if (!shouldShowTooltip) {
    return <>{children}</>;
  }

  // Calculate tooltip position
  const getTooltipStyle = () => {
    if (!triggerRect) return {};

    const tooltipWidth = 600;
    const tooltipMaxHeight = 400;
    const gap = 8;
    const viewportPadding = 16;

    // Center horizontally on trigger, but keep within viewport
    let left = triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2;
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - tooltipWidth - viewportPadding));

    // Prefer showing below, show above if not enough space
    const spaceBelow = window.innerHeight - triggerRect.bottom - viewportPadding;
    const spaceAbove = triggerRect.top - viewportPadding;
    const showAbove = spaceBelow < tooltipMaxHeight && spaceAbove > spaceBelow;

    let top = showAbove
      ? triggerRect.top - gap
      : triggerRect.bottom + gap;

    return {
      left,
      top,
      width: tooltipWidth,
      maxHeight: Math.min(tooltipMaxHeight, showAbove ? spaceAbove : spaceBelow),
      transform: showAbove ? 'translateY(-100%)' : 'translateY(0)',
      showAbove
    };
  };

  const tooltipStyle = getTooltipStyle();
  const showAbove = (tooltipStyle as { showAbove?: boolean }).showAbove || false;

  // Calculate arrow position
  const getArrowLeft = () => {
    if (!triggerRect) return 20;
    const tooltipLeft = tooltipStyle.left as number || 0;
    const triggerCenter = triggerRect.left + triggerRect.width / 2;
    return Math.max(20, Math.min(triggerCenter - tooltipLeft, 580));
  };

  // Summary stats
  const summary = leaderRequirementsSummary || {
    not_picked: 0,
    deprioritised: 0,
    in_progress: 0,
    done: 0,
    total_requirements: 0
  };

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleTriggerEnter}
      onMouseLeave={handleTriggerLeave}
      className="relative inline-block"
    >
      {children}

      {/* Portal tooltip */}
      {isOpen && triggerRect && createPortal(
        <div
          ref={tooltipRef}
          className="fixed z-[9999]"
          style={{
            left: tooltipStyle.left,
            top: tooltipStyle.top,
            width: tooltipStyle.width,
            maxHeight: tooltipStyle.maxHeight,
            transform: tooltipStyle.transform
          }}
          onMouseEnter={handleTooltipEnter}
          onMouseLeave={handleTooltipLeave}
        >
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col h-full">
            {/* Header */}
            <div className="px-3 py-2 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-indigo-100 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-indigo-600" />
                  <span className="text-xs font-bold text-gray-800">
                    Leader Requirements ({leadersRequiredTotal})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {onCreateTask && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(false);
                        onCreateTask(node);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-green-700 bg-green-100 hover:bg-green-200 rounded-md transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      Create Task
                    </button>
                  )}
                  <span className="text-[10px] font-medium text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200 max-w-[150px] truncate">
                    {node.name}
                  </span>
                </div>
              </div>
              {/* Summary Stats */}
              <div className="flex items-center gap-3 mt-2">
                {summary.not_picked > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-600">
                    <span className="w-2 h-2 rounded-full bg-gray-400" />
                    {summary.not_picked} not picked
                  </span>
                )}
                {summary.deprioritised > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-orange-600">
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                    {summary.deprioritised} deprioritised
                  </span>
                )}
                {summary.in_progress > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    {summary.in_progress} in progress
                  </span>
                )}
                {summary.done > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    {summary.done} done
                  </span>
                )}
              </div>
            </div>

            {/* Content - scrollable area */}
            <div
              className="p-2 overflow-y-auto flex-1 min-h-0 space-y-1.5"
              onScroll={(e) => e.stopPropagation()}
            >
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
                </div>
              ) : error ? (
                <div className="text-center py-4 text-xs text-red-500">{error}</div>
              ) : requirements.length === 0 ? (
                <div className="text-center py-4 text-xs text-gray-500">No requirements found</div>
              ) : (
                requirements.map(req => (
                  <CompactRequirementTile
                    key={req.id}
                    requirement={req}
                    onStatusChange={canChangeStatus ? handleStatusChange : undefined}
                    canChangeStatus={canChangeStatus}
                    onCreateTask={onCreateTaskForRequirement ? (r) => {
                      setIsOpen(false);
                      onCreateTaskForRequirement(r, node);
                    } : undefined}
                  />
                ))
              )}
            </div>
          </div>

          {/* Arrow pointing to trigger */}
          <div
            className={`absolute border-8 border-transparent ${showAbove ? 'bottom-0 translate-y-full border-t-white' : 'top-0 -translate-y-full border-b-white'}`}
            style={{ left: getArrowLeft() }}
          />
        </div>,
        document.body
      )}
    </div>
  );
}

export default LeaderRequirementsTooltip;
