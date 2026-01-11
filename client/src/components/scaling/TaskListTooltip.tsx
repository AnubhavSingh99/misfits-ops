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

// Compact Task Tile for Tooltip - grid layout for alignment
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
      <div className={`absolute inset-y-0 right-0 w-1/6 bg-gradient-to-l ${currentStatus.gradient} pointer-events-none`} />

      {/* Grid Layout for consistent alignment */}
      <div className="relative grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 px-3 py-2.5">
        {/* Col 1: Stage + Meetups (fixed width) */}
        <div className="flex items-center gap-1.5 w-[70px]">
          {stageTransition && (
            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-mono font-bold text-slate-600">
              {stageTransition}
            </span>
          )}
          {task.meetups_count > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-semibold text-slate-500">
              {task.meetups_count}m
            </span>
          )}
        </div>

        {/* Col 2: Title + Tags (flex grow) */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-gray-900 text-xs truncate">{task.title}</h4>
            {task.description && (
              <span className="text-[10px] text-gray-400 truncate flex-shrink">
                {task.description.slice(0, 40)}{task.description.length > 40 ? '...' : ''}
              </span>
            )}
          </div>
          {/* Tags Row */}
          <div className="flex items-center gap-1.5 mt-1 flex-nowrap overflow-hidden">
            {task.activity_name && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-violet-100 text-violet-700 whitespace-nowrap">
                <Activity className="h-2.5 w-2.5" />
                {task.activity_name}
              </span>
            )}
            {task.city_name && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-sky-100 text-sky-700 whitespace-nowrap">
                <Building2 className="h-2.5 w-2.5" />
                {task.city_name}
              </span>
            )}
            {task.area_name && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-100 text-emerald-700 whitespace-nowrap">
                <MapPin className="h-2.5 w-2.5" />
                {task.area_name}
              </span>
            )}
            {task.club_name && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-orange-100 text-orange-700 whitespace-nowrap max-w-[120px]">
                <Home className="h-2.5 w-2.5 flex-shrink-0" />
                <span className="truncate">{task.club_name}</span>
              </span>
            )}
          </div>
        </div>

        {/* Col 3: Assignee (fixed width) */}
        <div className="w-7 flex justify-center">
          {task.assigned_to_name ? (
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
              style={{ backgroundColor: accentColor }}
              title={task.assigned_to_name}
            >
              {task.assigned_to_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
          ) : (
            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-[9px] text-gray-400">
              --
            </div>
          )}
        </div>

        {/* Col 4: Status Dropdown (fixed width) */}
        <div className="w-[110px]">
          <button
            ref={statusButtonRef}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (onStatusChange) setStatusDropdownOpen(!statusDropdownOpen);
            }}
            className={`w-full flex items-center justify-between gap-1 px-2 py-1.5 rounded text-[10px] font-semibold transition-all border ${currentStatus.bg} ${currentStatus.text} ${currentStatus.border} ${onStatusChange ? 'cursor-pointer hover:shadow-sm' : 'cursor-default'}`}
          >
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${currentStatus.dot} ${task.status === 'in_progress' ? 'animate-pulse' : ''}`} />
              <span>{currentStatus.label}</span>
            </span>
            {onStatusChange && <ChevronDown className={`h-3 w-3 transition-transform ${statusDropdownOpen ? 'rotate-180' : ''}`} />}
          </button>
        </div>

        {/* Col 5: Comments (fixed width) */}
        <div className="w-8 flex justify-center">
          {(task.comments_count || 0) > 0 ? (
            <div className="flex items-center gap-0.5 text-gray-500">
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="text-[10px] font-medium">{task.comments_count}</span>
            </div>
          ) : (
            <div className="w-3.5" />
          )}
        </div>

        {/* Status Dropdown Portal */}
        {statusDropdownOpen && createPortal(
          <div
            id={`tooltip-status-dropdown-${task.id}`}
            className="fixed bg-white rounded-lg shadow-2xl border border-gray-200 py-1 min-w-[120px] animate-in fade-in slide-in-from-top-2 duration-150"
            style={{ top: dropdownPosition.top, left: dropdownPosition.left, zIndex: 99999 }}
            onClick={(e) => e.stopPropagation()}
          >
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleStatusClick(option.value as ScalingTask['status']);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-left ${option.hover} transition-colors ${task.status === option.value ? `${option.bg} ${option.text}` : 'text-gray-700'}`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${option.dot}`} />
                <span className="flex-1">{option.label}</span>
                {task.status === option.value && <Check className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>,
          document.body
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
  const [isOpen, setIsOpen] = useState(false);
  const [tasks, setTasks] = useState<ScalingTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calculate total tasks from taskSummary (for deciding whether to show tooltip)
  const summaryTotalTasks = taskSummary
    ? (taskSummary.not_started || 0) + (taskSummary.in_progress || 0) + (taskSummary.completed || 0)
    : 0;

  // Only show tooltip for ≤6 tasks
  const shouldShowTooltip = summaryTotalTasks > 0 && summaryTotalTasks <= 6;

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

  // Clear all timeouts
  const clearAllTimeouts = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  // Open tooltip
  const openTooltip = () => {
    clearAllTimeouts();
    if (containerRef.current) {
      setTriggerRect(containerRef.current.getBoundingClientRect());
    }
    setIsOpen(true);
    fetchTasks();
  };

  // Close tooltip with delay
  const closeTooltip = () => {
    clearAllTimeouts();
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  };

  // Cancel close (when moving to tooltip)
  const cancelClose = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  // Handle mouse enter on trigger
  const handleTriggerEnter = () => {
    if (!shouldShowTooltip) return;
    cancelClose();
    hoverTimeoutRef.current = setTimeout(openTooltip, 200);
  };

  // Handle mouse leave from trigger
  const handleTriggerLeave = () => {
    clearAllTimeouts();
    closeTooltip();
  };

  // Handle tooltip mouse enter
  const handleTooltipEnter = () => {
    cancelClose();
  };

  // Handle tooltip mouse leave
  const handleTooltipLeave = () => {
    closeTooltip();
  };

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => clearAllTimeouts();
  }, []);

  // Don't render tooltip if not enough tasks
  if (!shouldShowTooltip) {
    return <>{children}</>;
  }

  // Calculate tooltip position
  const getTooltipStyle = () => {
    if (!triggerRect) return {};

    const tooltipWidth = 700;
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

  // Calculate arrow position to point at trigger center
  const getArrowLeft = () => {
    if (!triggerRect) return 20;
    const tooltipLeft = tooltipStyle.left as number || 0;
    const triggerCenter = triggerRect.left + triggerRect.width / 2;
    return Math.max(20, Math.min(triggerCenter - tooltipLeft, 680));
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
            <div className="px-3 py-2 bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-800">
                  Tasks ({tasks.length > 0 ? tasks.length : summaryTotalTasks})
                </span>
                <span className="text-[10px] font-medium text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200 max-w-[200px] truncate">
                  {node.name}
                </span>
              </div>
            </div>

            {/* Content - scrollable area doesn't trigger close */}
            <div
              className="p-2 overflow-y-auto flex-1 min-h-0 space-y-1.5"
              onScroll={(e) => e.stopPropagation()}
            >
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

export default TaskListTooltip;
