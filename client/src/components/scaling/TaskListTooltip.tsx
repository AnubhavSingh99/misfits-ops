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
  Home,
  Send,
  X
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

// Description tooltip component - matches dashboard tooltip design
function DescriptionTooltip({ text, targetRect, visible }: { text: string; targetRect: DOMRect | null; visible: boolean }) {
  if (!visible || !targetRect || !text) return null;

  // Position tooltip above the element, centered
  const tooltipWidth = 280;
  let left = targetRect.left + targetRect.width / 2;
  // Keep within viewport
  left = Math.max(tooltipWidth / 2 + 8, Math.min(left, window.innerWidth - tooltipWidth / 2 - 8));

  return createPortal(
    <div
      className="fixed z-[99999] pointer-events-none animate-in fade-in zoom-in-95 duration-150"
      style={{
        left,
        top: targetRect.top - 8,
        transform: 'translate(-50%, -100%)'
      }}
    >
      <div className="bg-gray-800 text-white text-[11px] leading-relaxed px-3 py-2 rounded-lg shadow-xl max-w-[280px]">
        {text}
      </div>
      {/* Arrow pointing down */}
      <div
        className="absolute border-[6px] border-transparent border-t-gray-800"
        style={{ top: '100%', left: '50%', transform: 'translateX(-50%) translateY(-1px)' }}
      />
    </div>,
    document.body
  );
}

// Hoverable description with tooltip
function HoverableDescription({ description, maxLength = 100, inline = false }: { description: string; maxLength?: number; inline?: boolean }) {
  const [isHovered, setIsHovered] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  const needsTruncation = description.length > maxLength;
  const displayText = needsTruncation ? description.slice(0, maxLength) + '...' : description;

  const handleMouseEnter = () => {
    if (ref.current) {
      setRect(ref.current.getBoundingClientRect());
      setIsHovered(true);
    }
  };

  return (
    <span className={inline ? 'inline' : 'block'}>
      <span
        ref={ref}
        className={`text-[10px] text-gray-400 ${inline ? '' : 'block'} ${needsTruncation ? 'cursor-help' : ''}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setIsHovered(false)}
      >
        {displayText}
      </span>
      {needsTruncation && (
        <DescriptionTooltip text={description} targetRect={rect} visible={isHovered} />
      )}
    </span>
  );
}

// Compact Task Tile for Tooltip - with inline comments like SprintModal
function CompactTaskTile({
  task,
  onStatusChange,
  onCommentAdded
}: {
  task: ScalingTask;
  onStatusChange?: (task: ScalingTask, newStatus: ScalingTask['status']) => void;
  onCommentAdded?: () => void;
}) {
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentsFetched, setCommentsFetched] = useState(false);
  const [commentAuthor, setCommentAuthor] = useState(task.assigned_to_name || 'User');
  const [localCommentsCount, setLocalCommentsCount] = useState(task.comments_count || 0);
  // Author selector state
  const [authorDropdownOpen, setAuthorDropdownOpen] = useState(false);
  const [assignees, setAssignees] = useState<{ id: number; name: string }[]>([]);
  const [assigneesFetched, setAssigneesFetched] = useState(false);

  const statusButtonRef = useRef<HTMLButtonElement>(null);
  const authorButtonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [authorDropdownPosition, setAuthorDropdownPosition] = useState({ top: 0, left: 0 });

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

  // Update author dropdown position
  useEffect(() => {
    if (authorDropdownOpen && authorButtonRef.current) {
      const rect = authorButtonRef.current.getBoundingClientRect();
      setAuthorDropdownPosition({ top: rect.bottom + 4, left: rect.left });
    }
  }, [authorDropdownOpen]);

  // Close status dropdown on outside click
  useEffect(() => {
    if (!statusDropdownOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (statusButtonRef.current?.contains(target)) return;
      const dropdown = document.getElementById(`tooltip-status-dropdown-${task.id}`);
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
  }, [statusDropdownOpen, task.id]);

  // Close author dropdown on outside click
  useEffect(() => {
    if (!authorDropdownOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (authorButtonRef.current?.contains(target)) return;
      const dropdown = document.getElementById(`tooltip-author-dropdown-${task.id}`);
      if (dropdown?.contains(target)) return;
      setAuthorDropdownOpen(false);
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [authorDropdownOpen, task.id]);

  // Fetch assignees when comments expanded
  useEffect(() => {
    if (commentsExpanded && !assigneesFetched) {
      fetchAssignees();
    }
  }, [commentsExpanded, assigneesFetched]);

  const fetchAssignees = async () => {
    try {
      const res = await fetch(`${API_BASE}/scaling-tasks/assignees/list`);
      const data = await res.json();
      if (data.success && data.assignees) {
        setAssignees(data.assignees);
      }
      setAssigneesFetched(true);
    } catch (err) {
      console.error('Failed to fetch assignees:', err);
      setAssigneesFetched(true);
    }
  };

  // Fetch comments when expanded
  useEffect(() => {
    if (commentsExpanded && !commentsFetched) {
      fetchComments();
    }
  }, [commentsExpanded, commentsFetched]);

  const fetchComments = async () => {
    setLoadingComments(true);
    try {
      const res = await fetch(`${API_BASE}/scaling-tasks/${task.id}/comments`);
      const data = await res.json();
      if (data.success) {
        setComments(data.comments || []);
        setLocalCommentsCount(data.comments?.length || 0);
      }
      setCommentsFetched(true);
    } catch (err) {
      console.error('Failed to fetch comments:', err);
      setCommentsFetched(true);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || submittingComment) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`${API_BASE}/scaling-tasks/${task.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_text: newComment.trim(), author_name: commentAuthor })
      });
      const data = await res.json();
      if (data.success && data.comment) {
        setComments(prev => [data.comment, ...prev]);
        setLocalCommentsCount(prev => prev + 1);
        setNewComment('');
        // Don't call onCommentAdded here - it causes a refetch which recreates components
        // and loses the expanded state. Just update local state like SprintModal does.
      }
    } catch (err) {
      console.error('Failed to add comment:', err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleStatusClick = (newStatus: ScalingTask['status']) => {
    if (onStatusChange) {
      onStatusChange(task, newStatus);
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

          {/* Col 2: Title + Description + Tags (flex grow) */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-gray-900 text-xs truncate flex-shrink-0">{task.title}</h4>
              {task.description && (
                <HoverableDescription description={task.description} maxLength={60} inline />
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

          {/* Col 5: Comments Toggle */}
          <div className="w-8 flex justify-center">
            <button
              className={`flex items-center gap-0.5 p-1 rounded transition-colors ${
                commentsExpanded
                  ? 'bg-blue-100 text-blue-600'
                  : localCommentsCount > 0
                    ? 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'
                    : 'text-gray-300 hover:text-blue-500 hover:bg-blue-50'
              }`}
              title={localCommentsCount > 0 ? `${localCommentsCount} comments` : 'Add comment'}
              onClick={(e) => {
                e.stopPropagation();
                setCommentsExpanded(!commentsExpanded);
              }}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {localCommentsCount > 0 && (
                <span className="text-[10px] font-medium">{localCommentsCount}</span>
              )}
            </button>
          </div>

          {/* Status Dropdown Portal */}
          {statusDropdownOpen && createPortal(
            <div
              id={`tooltip-status-dropdown-${task.id}`}
              className="fixed bg-white rounded-lg shadow-2xl border border-gray-200 py-1 min-w-[120px] animate-in fade-in slide-in-from-top-2 duration-150"
              style={{ top: dropdownPosition.top, left: dropdownPosition.left, zIndex: 99999 }}
            >
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onMouseDown={(e) => {
                    e.stopPropagation();
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

      {/* Inline Comments Section */}
      {commentsExpanded && (
        <div className="border-t border-gray-100 bg-slate-50/50">
          <div className="px-3 py-2">
            {/* Add Comment Input */}
            <div className="flex items-center gap-2 mb-2">
              {/* Author Selector Button */}
              <div className="relative">
                <button
                  ref={authorButtonRef}
                  onClick={(e) => {
                    e.stopPropagation();
                    setAuthorDropdownOpen(!authorDropdownOpen);
                  }}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 hover:ring-2 hover:ring-blue-200 transition-all cursor-pointer"
                  style={{ backgroundColor: accentColor }}
                  title={`Posting as: ${commentAuthor} (click to change)`}
                >
                  {commentAuthor.split(' ').map(n => n?.[0] || '').join('').slice(0, 2).toUpperCase() || 'U'}
                </button>
              </div>

              {/* Author Dropdown Portal */}
              {authorDropdownOpen && createPortal(
                <div
                  id={`tooltip-author-dropdown-${task.id}`}
                  className="fixed bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[160px] max-h-[200px] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150"
                  style={{ top: authorDropdownPosition.top, left: authorDropdownPosition.left, zIndex: 99999 }}
                >
                  <div className="px-2 py-1 text-[9px] text-gray-400 uppercase tracking-wide border-b border-gray-100 mb-1">
                    Post as
                  </div>
                  {!assigneesFetched ? (
                    <div className="px-3 py-2 text-xs text-gray-400">Loading...</div>
                  ) : assignees.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-gray-400">No members found</div>
                  ) : (
                    assignees.map((assignee) => (
                      <button
                        key={assignee.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCommentAuthor(assignee.name);
                          setAuthorDropdownOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-gray-50 transition-colors ${
                          commentAuthor === assignee.name ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                        }`}
                      >
                        <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[8px] font-bold text-gray-600">
                          {assignee.name.split(' ').map(n => n?.[0] || '').join('').slice(0, 2).toUpperCase()}
                        </div>
                        <span className="flex-1 truncate">{assignee.name}</span>
                        {commentAuthor === assignee.name && <Check className="h-3 w-3 text-blue-600" />}
                      </button>
                    ))
                  )}
                </div>,
                document.body
              )}

              <div className="flex-1 flex items-center gap-1.5 bg-white rounded-lg border border-gray-200 px-2 py-1.5 focus-within:border-blue-400 transition-all">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                  placeholder={`Comment as ${commentAuthor.split(' ')[0]}...`}
                  className="flex-1 text-xs bg-transparent outline-none placeholder-gray-400"
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddComment();
                  }}
                  disabled={!newComment.trim() || submittingComment}
                  className={`p-1 rounded transition-all ${
                    newComment.trim()
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                  }`}
                >
                  <Send className="h-3 w-3" />
                </button>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCommentsExpanded(false);
                }}
                className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Comments List */}
            <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
              {loadingComments ? (
                <div className="flex items-center justify-center py-2">
                  <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                  <span className="ml-2 text-[10px] text-gray-400">Loading...</span>
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-2">
                  <p className="text-[10px] text-gray-400">No comments yet</p>
                </div>
              ) : (
                comments.map((comment, idx) => (
                  <div
                    key={comment.id}
                    className={`flex gap-2 px-2 py-1.5 rounded-lg ${idx === 0 ? 'bg-blue-50/70' : 'hover:bg-gray-100/50'}`}
                  >
                    <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[8px] font-bold text-gray-600 flex-shrink-0">
                      {(comment.author_name || 'U').split(' ').map(n => n?.[0] || '').join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-gray-700">
                          {comment.author_name || 'User'}
                        </span>
                        <span className="text-[9px] text-gray-400">
                          {formatDateTime(comment.created_at)}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-600 leading-snug">
                        {comment.comment_text}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
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
  const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track if we're hovering over trigger or tooltip
  const isHoveringRef = useRef(false);

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
        // Deduplicate tasks by ID
        const taskMap = new Map<number, ScalingTask>();
        (data.tasks || [])
          .filter((t: ScalingTask) => t.status !== 'cancelled')
          .forEach((t: ScalingTask) => {
            if (!taskMap.has(t.id)) {
              taskMap.set(t.id, t);
            }
          });
        const uniqueTasks = Array.from(taskMap.values()).slice(0, 6);
        setTasks(uniqueTasks);
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
    console.log('handleStatusChange called:', task.id, 'from', task.status, 'to', newStatus);

    const originalStatus = task.status;

    // Optimistically update UI first
    setTasks(prev => prev.map(t =>
      t.id === task.id ? { ...t, status: newStatus } : t
    ));

    try {
      // Use the general task update endpoint (not /status)
      const response = await fetch(`${API_BASE}/scaling-tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        console.log('Status updated successfully');
        onRefreshTasks?.();
      } else {
        // Revert on failure
        console.error('Status update failed:', response.status, data);
        setTasks(prev => prev.map(t =>
          t.id === task.id ? { ...t, status: originalStatus } : t
        ));
      }
    } catch (err) {
      console.error('Failed to update task status:', err);
      // Revert on error
      setTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, status: originalStatus } : t
      ));
    }
  };

  // Handle comment added - refresh tasks to get updated comment count
  const handleCommentAdded = () => {
    fetchTasks();
    onRefreshTasks?.();
  };

  // Schedule opening the tooltip
  const scheduleOpen = useCallback(() => {
    // Cancel any pending close
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    // Don't schedule if already open or opening
    if (isOpen || openTimeoutRef.current) return;

    openTimeoutRef.current = setTimeout(() => {
      openTimeoutRef.current = null;
      if (isHoveringRef.current && containerRef.current) {
        setTriggerRect(containerRef.current.getBoundingClientRect());
        setIsOpen(true);
        fetchTasks();
      }
    }, 250);
  }, [isOpen, fetchTasks]);

  // Schedule closing the tooltip
  const scheduleClose = useCallback(() => {
    // Cancel any pending open
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
    // Don't schedule if already closing
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
    // Cancel any pending close
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
                    onCommentAdded={handleCommentAdded}
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
