import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MessageSquare, ChevronRight, Check, X, Send, Pencil, Copy } from 'lucide-react';
import type { ScalingTask, HierarchyNode, ScalingTaskSummary } from '../../../../shared/types';
import { TEAMS, getTeamByMember } from '../../../../shared/teamConfig';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

// Team color helper
function getTeamColor(teamLead: string | null | undefined) {
  if (!teamLead) return { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-800' };
  const teamKey = getTeamByMember(teamLead);
  if (!teamKey) return { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-800' };
  const teamConfig = TEAMS[teamKey];
  return {
    bg: teamConfig.color.bg,
    border: teamConfig.color.border,
    text: teamConfig.color.text.replace('700', '800')
  };
}

// Status styling
const STATUS_STYLES: Record<string, { dot: string; bg: string; text: string }> = {
  'not_started': { dot: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-700' },
  'in_progress': { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700' },
  'completed': { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  'cancelled': { dot: 'bg-gray-400', bg: 'bg-gray-50', text: 'text-gray-600' }
};

// Stage display mapping
const STAGE_DISPLAY: Record<string, string> = {
  'not_picked': 'NP', 'started': 'S', 'stage_1': 'S1', 'stage_2': 'S2',
  'stage_3': 'S3', 'stage_4': 'S4', 'realised': 'R'
};

// Compact task tile for tooltip
function CompactTaskTile({
  task,
  onStatusChange,
  onViewComments
}: {
  task: ScalingTask;
  onStatusChange?: (task: ScalingTask, newStatus: ScalingTask['status']) => void;
  onViewComments?: (task: ScalingTask) => void;
}) {
  const teamColor = getTeamColor(task.assigned_team_lead);
  const statusStyle = STATUS_STYLES[task.status] || STATUS_STYLES['not_started'];
  const stageTransition = task.source_stage && task.target_stage
    ? `${STAGE_DISPLAY[task.source_stage]} → ${STAGE_DISPLAY[task.target_stage]}`
    : null;

  return (
    <div className={`rounded-lg border p-2.5 ${teamColor.bg} ${teamColor.border}`}>
      {/* Header: Title + Status */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h4 className="font-medium text-gray-900 text-xs leading-tight flex-1 line-clamp-2">
          {task.title}
        </h4>
        <div className={`flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${statusStyle.bg} ${statusStyle.text}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
          <span className="capitalize">{task.status.replace('_', ' ')}</span>
        </div>
      </div>

      {/* Stage Transition */}
      {stageTransition && (
        <div className="flex items-center gap-1.5 text-[10px] text-gray-600 mb-1.5">
          <span className="font-mono bg-white/60 px-1 py-0.5 rounded text-[10px]">
            {stageTransition}
          </span>
          {task.meetups_count > 0 && (
            <>
              <span className="text-gray-400">•</span>
              <span>{task.meetups_count} meetup{task.meetups_count > 1 ? 's' : ''}</span>
            </>
          )}
        </div>
      )}

      {/* Description */}
      {task.description && (
        <p className="text-[10px] text-gray-600 line-clamp-1 mb-1.5">{task.description}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1.5 border-t border-gray-200/50">
        {onViewComments && (
          <button
            onClick={(e) => { e.stopPropagation(); onViewComments(task); }}
            className="flex items-center gap-0.5 text-[10px] text-gray-500 hover:text-blue-600 transition-colors"
          >
            <MessageSquare className="h-3 w-3" />
            {task.comments_count ? `(${task.comments_count})` : ''}
          </button>
        )}

        {onStatusChange && task.status !== 'completed' && task.status !== 'cancelled' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const nextStatus = task.status === 'not_started' ? 'in_progress' : 'completed';
              onStatusChange(task, nextStatus);
            }}
            className="ml-auto flex items-center gap-0.5 text-[10px] text-gray-500 hover:text-green-600 transition-colors"
          >
            <ChevronRight className="h-3 w-3" />
            <span>{task.status === 'not_started' ? 'Start' : 'Done'}</span>
          </button>
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
  const [tasks, setTasks] = useState<ScalingTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      // Build query params based on node type
      const params = new URLSearchParams();

      if (node.type === 'activity' && node.activity_id) {
        params.append('activity_id', node.activity_id.toString());
      } else if (node.type === 'city' && node.city_id) {
        params.append('city_id', node.city_id.toString());
      } else if (node.type === 'area' && node.area_id) {
        params.append('area_id', node.area_id.toString());
      } else if ((node.type === 'club' || node.type === 'launch') && node.club_id) {
        params.append('club_id', node.club_id.toString());
      }

      // Exclude cancelled tasks
      params.append('exclude_cancelled', 'true');

      const response = await fetch(`${API_BASE}/scaling-tasks?${params}`);
      const data = await response.json();

      if (data.success) {
        // Flatten weeks into tasks list
        const allTasks: ScalingTask[] = [];
        data.weeks?.forEach((week: { tasks: ScalingTask[] }) => {
          allTasks.push(...(week.tasks || []));
        });
        setTasks(allTasks.slice(0, 6)); // Limit to 6 tasks
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
        // Update local state
        setTasks(prev => prev.map(t =>
          t.id === task.id ? { ...t, status: newStatus } : t
        ));
        onRefreshTasks?.();
      }
    } catch (err) {
      console.error('Failed to update task status:', err);
    }
  };

  // Handle mouse enter with delay
  const handleMouseEnter = () => {
    if (!shouldShowTooltip) return;

    if (containerRef.current) {
      setTooltipRect(containerRef.current.getBoundingClientRect());
    }

    // Delay showing tooltip to avoid accidental triggers
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(true);
      fetchTasks();
    }, 300);
  };

  // Handle mouse leave
  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(false);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
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
        <div
          className="fixed z-[9999] pointer-events-auto"
          style={{
            left: Math.min(tooltipRect.left, window.innerWidth - 340),
            top: tooltipRect.bottom + 8,
            width: 320
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={handleMouseLeave}
        >
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700">
                  Tasks ({totalTasks})
                </span>
                <span className="text-[10px] text-gray-500">
                  {node.name}
                </span>
              </div>
            </div>

            {/* Content */}
            <div className="p-2 max-h-[400px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : error ? (
                <div className="text-center py-4 text-xs text-red-500">{error}</div>
              ) : tasks.length === 0 ? (
                <div className="text-center py-4 text-xs text-gray-500">No tasks found</div>
              ) : (
                <div className="space-y-2">
                  {tasks.map(task => (
                    <CompactTaskTile
                      key={task.id}
                      task={task}
                      onStatusChange={handleStatusChange}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Arrow */}
          <div
            className="absolute -top-2 border-8 border-transparent border-b-white"
            style={{ left: Math.max(20, Math.min(tooltipRect.left + tooltipRect.width / 2 - tooltipRect.left, 300)) }}
          />
        </div>,
        document.body
      )}
    </div>
  );
}

export default TaskListTooltip;
