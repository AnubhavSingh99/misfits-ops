import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Loader2,
  MessageSquare,
  Check,
  ChevronDown,
  Activity,
  Building2,
  MapPin,
  Home
} from 'lucide-react';
import type { ScalingTask, HierarchyNode, ScalingTaskSummary } from '../../../../shared/types';
import { TEAMS, getTeamByMember, type TeamKey } from '../../../../shared/teamConfig';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

// Status options with full styling
const STATUS_OPTIONS = [
  {
    value: 'not_started',
    label: 'Not Started',
    dot: 'bg-rose-500',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    hover: 'hover:bg-rose-100',
    gradient: 'from-transparent via-rose-50/50 to-rose-100/80',
    border: 'border-rose-200'
  },
  {
    value: 'in_progress',
    label: 'In Progress',
    dot: 'bg-amber-500',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    hover: 'hover:bg-amber-100',
    gradient: 'from-transparent via-amber-50/50 to-amber-100/80',
    border: 'border-amber-200'
  },
  {
    value: 'completed',
    label: 'Completed',
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    hover: 'hover:bg-emerald-100',
    gradient: 'from-transparent via-emerald-50/50 to-emerald-100/80',
    border: 'border-emerald-200'
  }
];

// Stage display mapping
const STAGE_DISPLAY: Record<string, string> = {
  'not_picked': 'NP', 'started': 'S', 'stage_1': 'S1', 'stage_2': 'S2',
  'stage_3': 'S3', 'stage_4': 'S4', 'realised': 'R'
};

// Comment interface
interface Comment {
  id: number;
  comment_text: string;
  author_name: string;
  created_at: string;
}

// Format date/time
function formatDateTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  if (dateOnly.getTime() === today.getTime()) {
    return `Today at ${timeStr}`;
  } else if (dateOnly.getTime() === yesterday.getTime()) {
    return `Yesterday at ${timeStr}`;
  } else {
    const dateFormatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${dateFormatted} at ${timeStr}`;
  }
}

// Get team accent color
function getTeamAccent(teamLead: string | null | undefined): string {
  if (!teamLead) return '#94a3b8';
  const teamKey = getTeamByMember(teamLead);
  if (!teamKey) return '#94a3b8';
  return TEAMS[teamKey]?.color.accent || '#94a3b8';
}

// Compact Task Tile for Tooltip - horizontal layout
function CompactTaskTile({
  task,
  onStatusChange
}: {
  task: ScalingTask;
  onStatusChange?: (task: ScalingTask, newStatus: ScalingTask['status']) => void;
}) {
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusButtonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

  const currentStatus = STATUS_OPTIONS.find(s => s.value === task.status) || STATUS_OPTIONS[0];
  const accentColor = getTeamAccent(task.assigned_team_lead);

  const stageTransition = task.source_stage && task.target_stage
    ? `${STAGE_DISPLAY[task.source_stage]}→${STAGE_DISPLAY[task.target_stage]}`
    : null;

  // Update dropdown position
  useEffect(() => {
    if (statusDropdownOpen && statusButtonRef.current) {
      const rect = statusButtonRef.current.getBoundingClientRect();
      setDropdownPosition({ top: rect.bottom + 4, left: rect.right - 130 });
    }
  }, [statusDropdownOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (statusButtonRef.current && !statusButtonRef.current.contains(e.target as Node)) {
        const dropdown = document.getElementById(`tooltip-status-dropdown-${task.id}`);
        if (dropdown && dropdown.contains(e.target as Node)) return;
        setStatusDropdownOpen(false);
      }
    };
    if (statusDropdownOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [statusDropdownOpen, task.id]);

  const handleStatusClick = (newStatus: ScalingTask['status']) => {
    onStatusChange?.(task, newStatus);
    setStatusDropdownOpen(false);
  };

  return (
    <div
      className={`relative rounded-lg border bg-white overflow-hidden transition-all duration-150 hover:shadow-md ${currentStatus.border}`}
      style={{ borderLeftWidth: '3px', borderLeftColor: accentColor }}
    >
      {/* Status Gradient Overlay */}
      <div className={`absolute inset-y-0 right-0 w-1/5 bg-gradient-to-l ${currentStatus.gradient} pointer-events-none`} />

      {/* Single Row Layout */}
      <div className="relative flex items-center gap-2 px-2.5 py-2">
        {/* Stage + Meetups */}
        {(stageTransition || task.meetups_count > 0) && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {stageTransition && (
              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[9px] font-mono font-bold text-slate-600">
                {stageTransition}
              </span>
            )}
            {task.meetups_count > 0 && (
              <span className="px-1 py-0.5 rounded bg-slate-100 text-[9px] font-semibold text-slate-500">
                {task.meetups_count}m
              </span>
            )}
          </div>
        )}

        {/* Title + Description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-gray-900 text-[11px] truncate max-w-[180px]">{task.title}</h4>
            {task.description && (
              <span className="text-[10px] text-gray-400 truncate max-w-[100px] hidden sm:inline">
                {task.description.slice(0, 30)}{task.description.length > 30 ? '...' : ''}
              </span>
            )}
          </div>
          {/* Tags Row - inline */}
          <div className="flex items-center gap-1 mt-0.5 flex-nowrap overflow-hidden">
            {task.activity_name && (
              <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-medium bg-violet-100 text-violet-700 whitespace-nowrap">
                <Activity className="h-2 w-2" />
                {task.activity_name}
              </span>
            )}
            {task.city_name && (
              <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-medium bg-sky-100 text-sky-700 whitespace-nowrap">
                <Building2 className="h-2 w-2" />
                {task.city_name}
              </span>
            )}
            {task.area_name && (
              <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-medium bg-emerald-100 text-emerald-700 whitespace-nowrap">
                <MapPin className="h-2 w-2" />
                {task.area_name}
              </span>
            )}
            {task.club_name && (
              <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-medium bg-orange-100 text-orange-700 whitespace-nowrap max-w-[80px] truncate">
                <Home className="h-2 w-2 flex-shrink-0" />
                <span className="truncate">{task.club_name}</span>
              </span>
            )}
          </div>
        </div>

        {/* Assignee */}
        {task.assigned_to_name && (
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0"
            style={{ backgroundColor: accentColor }}
            title={task.assigned_to_name}
          >
            {task.assigned_to_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
        )}

        {/* Status Dropdown */}
        <button
          ref={statusButtonRef}
          onClick={(e) => {
            e.stopPropagation();
            if (onStatusChange) setStatusDropdownOpen(!statusDropdownOpen);
          }}
          className={`flex items-center gap-1 px-1.5 py-1 rounded text-[9px] font-semibold transition-all border flex-shrink-0 ${currentStatus.bg} ${currentStatus.text} ${currentStatus.border} ${onStatusChange ? 'cursor-pointer hover:shadow-sm' : 'cursor-default'}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${currentStatus.dot} ${task.status === 'in_progress' ? 'animate-pulse' : ''}`} />
          <span className="hidden sm:inline">{currentStatus.label}</span>
          {onStatusChange && <ChevronDown className={`h-2.5 w-2.5 transition-transform ${statusDropdownOpen ? 'rotate-180' : ''}`} />}
        </button>

        {/* Status Dropdown Portal */}
        {statusDropdownOpen && createPortal(
          <div
            id={`tooltip-status-dropdown-${task.id}`}
            className="fixed bg-white rounded-lg shadow-2xl border border-gray-200 py-1 min-w-[110px] animate-in fade-in slide-in-from-top-2 duration-150"
            style={{ top: dropdownPosition.top, left: dropdownPosition.left, zIndex: 99999 }}
          >
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={(e) => {
                  e.stopPropagation();
                  handleStatusClick(option.value as ScalingTask['status']);
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-[10px] font-medium text-left ${option.hover} transition-colors ${task.status === option.value ? `${option.bg} ${option.text}` : 'text-gray-700'}`}
              >
                <span className={`w-2 h-2 rounded-full ${option.dot}`} />
                <span className="flex-1">{option.label}</span>
                {task.status === option.value && <Check className="h-3 w-3" />}
              </button>
            ))}
          </div>,
          document.body
        )}

        {/* Comments indicator */}
        {(task.comments_count || 0) > 0 && (
          <div className="flex items-center gap-0.5 text-gray-400 flex-shrink-0">
            <MessageSquare className="h-3 w-3" />
            <span className="text-[9px] font-medium">{task.comments_count}</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface TaskListTooltipProps {
  node: HierarchyNode;
  taskSummary: ScalingTaskSummary | null;
  children: React.ReactNode;
  onRefreshTasks?: () => void;
}

export function TaskListTooltip({ node, taskSummary, children, onRefreshTasks }: TaskListTooltipProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isTooltipHovered, setIsTooltipHovered] = useState(false);
  const [tasks, setTasks] = useState<ScalingTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calculate total tasks
  const totalTasks = taskSummary
    ? (taskSummary.not_started || 0) + (taskSummary.in_progress || 0) + (taskSummary.completed || 0)
    : 0;

  // Only show tooltip for ≤6 tasks
  const shouldShowTooltip = totalTasks > 0 && totalTasks <= 6;

  // Fetch tasks when hovering
  const fetchTasks = useCallback(async () => {
    if (!shouldShowTooltip) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      if (node.activity_id) params.append('activity_id', node.activity_id.toString());
      if (node.city_id) params.append('city_id', node.city_id.toString());
      if (node.area_id) params.append('area_id', node.area_id.toString());
      if ((node.type === 'club' || node.type === 'launch') && node.club_id) {
        params.append('club_id', node.club_id.toString());
      }
      params.append('include_completed', 'true');

      const response = await fetch(`${API_BASE}/scaling-tasks?${params}`);
      const data = await response.json();

      if (data.success) {
        const allTasks: ScalingTask[] = (data.tasks || [])
          .filter((t: ScalingTask) => t.status !== 'cancelled')
          .slice(0, 6);
        setTasks(allTasks);
      } else {
        setError(data.error || 'Failed to load tasks');
      }
    } catch (err) {
      setError('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [node, shouldShowTooltip]);

  // Handle status change
  const handleStatusChange = async (task: ScalingTask, newStatus: ScalingTask['status']) => {
    try {
      const response = await fetch(`${API_BASE}/scaling-tasks/${task.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        setTasks(prev => prev.map(t =>
          t.id === task.id ? { ...t, status: newStatus } : t
        ));
        onRefreshTasks?.();
      }
    } catch (err) {
      console.error('Failed to update task status:', err);
    }
  };

  // Handle mouse enter on trigger
  const handleMouseEnter = () => {
    if (!shouldShowTooltip) return;

    // Clear any pending leave timeout
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }

    if (containerRef.current) {
      setTooltipRect(containerRef.current.getBoundingClientRect());
    }

    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(true);
      fetchTasks();
    }, 200);
  };

  // Handle mouse leave - with delay to allow moving to tooltip
  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    // Delay hiding to allow cursor to move to tooltip
    leaveTimeoutRef.current = setTimeout(() => {
      if (!isTooltipHovered) {
        setIsHovered(false);
      }
    }, 150);
  };

  // Handle tooltip hover
  const handleTooltipEnter = () => {
    setIsTooltipHovered(true);
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
  };

  const handleTooltipLeave = () => {
    setIsTooltipHovered(false);
    setIsHovered(false);
  };

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
    };
  }, []);

  // Don't render tooltip if not enough tasks
  if (!shouldShowTooltip) {
    return <>{children}</>;
  }

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative"
    >
      {children}

      {/* Portal tooltip */}
      {isHovered && tooltipRect && createPortal(
        (() => {
          const tooltipWidth = 520;
          const tooltipHeight = 350;
          const viewportPadding = 16;

          let left = Math.min(tooltipRect.left, window.innerWidth - tooltipWidth - viewportPadding);
          left = Math.max(viewportPadding, left);

          const spaceBelow = window.innerHeight - tooltipRect.bottom - viewportPadding;
          const spaceAbove = tooltipRect.top - viewportPadding;
          const showAbove = spaceBelow < tooltipHeight && spaceAbove > spaceBelow;

          let top = showAbove
            ? Math.max(viewportPadding, tooltipRect.top - tooltipHeight - 8)
            : tooltipRect.bottom + 8;

          if (!showAbove && top + tooltipHeight > window.innerHeight - viewportPadding) {
            top = Math.max(viewportPadding, window.innerHeight - tooltipHeight - viewportPadding);
          }

          const arrowLeft = Math.max(20, Math.min(tooltipRect.left + tooltipRect.width / 2 - left, tooltipWidth - 20));

          return (
            <div
              className="fixed z-[9999] pointer-events-auto"
              style={{
                left,
                top,
                width: tooltipWidth,
                maxHeight: `calc(100vh - ${viewportPadding * 2}px)`
              }}
              onMouseEnter={handleTooltipEnter}
              onMouseLeave={handleTooltipLeave}
            >
              <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[inherit]">
                {/* Header */}
                <div className="px-3 py-2 bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-100 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-800">
                      Tasks ({totalTasks})
                    </span>
                    <span className="text-[10px] font-medium text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200 max-w-[200px] truncate">
                      {node.name}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-2 overflow-y-auto flex-1 min-h-0 space-y-1.5">
                  {loading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                    </div>
                  ) : error ? (
                    <div className="text-center py-4 text-xs text-red-500">{error}</div>
                  ) : tasks.length === 0 ? (
                    <div className="text-center py-4 text-xs text-gray-500">No tasks found</div>
                  ) : (
                    tasks.map(task => (
                      <CompactTaskTile
                        key={task.id}
                        task={task}
                        onStatusChange={handleStatusChange}
                      />
                    ))
                  )}
                </div>
              </div>

              {/* Arrow */}
              <div
                className={`absolute border-8 border-transparent ${showAbove ? '-bottom-2 border-t-white' : '-top-2 border-b-white'}`}
                style={{ left: arrowLeft }}
              />
            </div>
          );
        })(),
        document.body
      )}
    </div>
  );
}

export default TaskListTooltip;
