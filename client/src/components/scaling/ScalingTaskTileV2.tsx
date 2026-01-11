import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  GripVertical,
  Copy,
  MessageSquare,
  ExternalLink,
  Pencil,
  Users,
  MapPin,
  Activity,
  Building2,
  Home,
  Check,
  ChevronDown,
  Send,
  X
} from 'lucide-react';
import type { ScalingTask, TeamColor, RequirementStatus } from '../../../../shared/types';
import { TEAMS, getTeamByMember } from '../../../../shared/teamConfig';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const DEFAULT_TEAM_COLOR: TeamColor = { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-800' };

// Render clickable links in text
function renderWithLinks(text: string): React.ReactNode[] {
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlPattern);
  return parts.map((part, index) => {
    if (part.match(urlPattern)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-blue-600 hover:text-blue-800 hover:underline"
        >
          <ExternalLink className="inline h-3 w-3 ml-0.5" />
        </a>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

// Hoverable description with portal-based tooltip to escape overflow:hidden
function HoverableDescription({ description, maxLength = 60 }: { description: string; maxLength?: number }) {
  const [isHovered, setIsHovered] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const spanRef = useRef<HTMLSpanElement>(null);
  const needsTruncation = description.length > maxLength;
  const displayText = needsTruncation ? description.slice(0, maxLength) + '...' : description;

  const handleMouseEnter = useCallback(() => {
    if (spanRef.current && needsTruncation) {
      const rect = spanRef.current.getBoundingClientRect();
      setTooltipPos({
        top: rect.top - 8,
        left: rect.left
      });
      setIsHovered(true);
    }
  }, [needsTruncation]);

  return (
    <>
      <span
        ref={spanRef}
        className={`text-xs text-gray-500 truncate max-w-[200px] ${needsTruncation ? 'cursor-help' : ''}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setIsHovered(false)}
      >
        {renderWithLinks(displayText)}
      </span>
      {/* Portal-based tooltip to escape overflow:hidden */}
      {needsTruncation && isHovered && createPortal(
        <div
          className="fixed z-[99999] pointer-events-none"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            transform: 'translateY(-100%)'
          }}
        >
          <div className="px-3 py-2 bg-gray-800 text-white text-[11px] leading-relaxed rounded-lg shadow-xl max-w-[400px] break-words">
            {description}
          </div>
          <div className="ml-4 -mt-px border-[6px] border-transparent border-t-gray-800" />
        </div>,
        document.body
      )}
    </>
  );
}

function getTeamColor(teamLead: string | null | undefined): TeamColor {
  if (!teamLead) return DEFAULT_TEAM_COLOR;
  const teamKey = getTeamByMember(teamLead);
  if (!teamKey) return DEFAULT_TEAM_COLOR;
  const teamConfig = TEAMS[teamKey];
  return {
    bg: teamConfig.color.bg,
    border: teamConfig.color.border,
    text: teamConfig.color.text.replace('700', '800')
  };
}

// Status options with styling including gradients
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
  },
  {
    value: 'cancelled',
    label: 'Cancelled',
    dot: 'bg-gray-400',
    bg: 'bg-gray-50',
    text: 'text-gray-600',
    hover: 'hover:bg-gray-100',
    gradient: 'from-transparent via-gray-50/50 to-gray-100/80',
    border: 'border-gray-200'
  }
];

const STAGE_DISPLAY: Record<string, string> = {
  'not_picked': 'NP',
  'started': 'S',
  'stage_1': 'S1',
  'stage_2': 'S2',
  'stage_3': 'S3',
  'stage_4': 'S4',
  'realised': 'R'
};

interface Comment {
  id: number;
  comment_text: string;
  author_name: string;
  created_at: string;
}

interface ScalingTaskTileV2Props {
  task: ScalingTask;
  onDuplicate?: (task: ScalingTask) => void;
  onViewComments?: (task: ScalingTask) => void;
  onEdit?: (task: ScalingTask) => void;
  onClick?: (task: ScalingTask) => void;
  onStatusChange?: (task: ScalingTask, newStatus: ScalingTask['status']) => void;
  isDragging?: boolean;
  dragHandleProps?: any;
}

// Format date/time with Today/Yesterday + exact time
function formatDateTime(dateStr: string): string {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  const now = new Date();

  // Get date parts
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  // Format time as "3:45 PM"
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  // Check if today, yesterday, or tomorrow
  if (dateOnly.getTime() === today.getTime()) {
    return `Today at ${timeStr}`;
  } else if (dateOnly.getTime() === yesterday.getTime()) {
    return `Yesterday at ${timeStr}`;
  } else if (dateOnly.getTime() === tomorrow.getTime()) {
    return `Tomorrow at ${timeStr}`;
  } else {
    // Format as "Jan 5 at 3:45 PM"
    const dateFormatted = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
    return `${dateFormatted} at ${timeStr}`;
  }
}

export function ScalingTaskTileV2({
  task,
  onDuplicate,
  onViewComments,
  onEdit,
  onClick,
  onStatusChange,
  isDragging = false,
  dragHandleProps
}: ScalingTaskTileV2Props) {
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentsFetched, setCommentsFetched] = useState(false);
  const [commentAuthor, setCommentAuthor] = useState(task.assigned_to_name || 'User');
  const [authorDropdownOpen, setAuthorDropdownOpen] = useState(false);
  const [assignees, setAssignees] = useState<{ id: number; name: string }[]>([]);

  const statusButtonRef = useRef<HTMLButtonElement>(null);
  const authorButtonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [authorDropdownPosition, setAuthorDropdownPosition] = useState({ top: 0, left: 0 });

  // Update dropdown position when opened
  useEffect(() => {
    if (statusDropdownOpen && statusButtonRef.current) {
      const rect = statusButtonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.right - 140 // align right edge
      });
    }
  }, [statusDropdownOpen]);

  // Update author dropdown position
  useEffect(() => {
    if (authorDropdownOpen && authorButtonRef.current) {
      const rect = authorButtonRef.current.getBoundingClientRect();
      setAuthorDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left
      });
    }
  }, [authorDropdownOpen]);

  // Track if assignees have been fetched
  const [assigneesFetched, setAssigneesFetched] = useState(false);

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

  // Close author dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (authorButtonRef.current && !authorButtonRef.current.contains(e.target as Node)) {
        const dropdown = document.getElementById(`author-dropdown-${task.id}`);
        if (dropdown && dropdown.contains(e.target as Node)) {
          return;
        }
        setAuthorDropdownOpen(false);
      }
    };
    if (authorDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [authorDropdownOpen, task.id]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (statusButtonRef.current && !statusButtonRef.current.contains(e.target as Node)) {
        // Check if click is inside the portal dropdown
        const dropdown = document.getElementById(`status-dropdown-${task.id}`);
        if (dropdown && dropdown.contains(e.target as Node)) {
          return;
        }
        setStatusDropdownOpen(false);
      }
    };
    if (statusDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [statusDropdownOpen, task.id]);

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
      if (!res.ok) {
        throw new Error('Failed to fetch');
      }
      const data = await res.json();
      if (data.success) {
        setComments(data.comments || []);
      }
      setCommentsFetched(true);
    } catch (err) {
      console.error('Failed to fetch comments:', err);
      setComments([]);
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
        setNewComment('');
        task.comments_count = (task.comments_count || 0) + 1;
      }
    } catch (err) {
      console.error('Failed to add comment:', err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const teamKey = task.assigned_team_lead ? getTeamByMember(task.assigned_team_lead) : null;
  const accentColor = teamKey ? TEAMS[teamKey]?.color.accent || '#94a3b8' : '#94a3b8';
  const currentStatus = STATUS_OPTIONS.find(s => s.value === task.status) || STATUS_OPTIONS[0];

  const stageTransition = task.source_stage && task.target_stage
    ? `${STAGE_DISPLAY[task.source_stage]}→${STAGE_DISPLAY[task.target_stage]}`
    : null;

  const leaderCount = task.linked_leader_requirements?.length || 0;
  const venueCount = task.linked_venue_requirements?.length || 0;
  const hasRequirements = leaderCount > 0 || venueCount > 0;

  const leadersDone = task.linked_leader_requirements?.filter(r => r.status === 'done').length || 0;
  const venuesDone = task.linked_venue_requirements?.filter(r => r.status === 'done').length || 0;

  return (
    <div
      className={`
        group relative rounded-lg border bg-white overflow-hidden
        transition-all duration-150 ease-out
        ${isDragging ? 'shadow-xl ring-2 ring-blue-400 scale-[1.01]' : 'hover:shadow-md'}
        ${currentStatus.border}
      `}
      style={{ borderLeftWidth: '3px', borderLeftColor: accentColor }}
    >
      {/* Main Row */}
      <div className="relative flex items-center gap-2 px-3 py-2.5">
        {/* Status Gradient Overlay on right - 25% width - ONLY in main row */}
        <div
          className={`absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l ${currentStatus.gradient} pointer-events-none`}
        />
        {/* Drag Handle */}
        <div
          {...dragHandleProps}
          className={`flex-shrink-0 ${dragHandleProps ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'} text-gray-300 hover:text-gray-500`}
        >
          <GripVertical className="h-4 w-4" />
        </div>

        {/* Stage + Meetups Chip */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {stageTransition && (
            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-mono font-bold text-slate-600 tracking-tight">
              {stageTransition}
            </span>
          )}
          {task.meetups_count > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-semibold text-slate-500">
              {task.meetups_count}m
            </span>
          )}
        </div>

        {/* Title + Description + Tags */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-gray-900 text-sm truncate">
              {task.title}
            </h4>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {task.description && (
              <HoverableDescription description={task.description} maxLength={60} />
            )}

            {task.activity_name && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-violet-100 text-violet-700">
                <Activity className="h-2.5 w-2.5" />
                {task.activity_name}
              </span>
            )}
            {task.city_name && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-sky-100 text-sky-700">
                <Building2 className="h-2.5 w-2.5" />
                {task.city_name}
              </span>
            )}
            {task.area_name && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-emerald-100 text-emerald-700">
                <MapPin className="h-2.5 w-2.5" />
                {task.area_name}
              </span>
            )}
            {task.club_name && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-orange-100 text-orange-700">
                <Home className="h-2.5 w-2.5" />
                {task.club_name}
              </span>
            )}
          </div>
        </div>

        {/* Requirements Badge */}
        {hasRequirements && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {leaderCount > 0 && (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                  leadersDone === leaderCount ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'
                }`}
                title={`${leadersDone}/${leaderCount} leaders done`}
              >
                <Users className="h-2.5 w-2.5" />
                {leadersDone}/{leaderCount}
              </span>
            )}
            {venueCount > 0 && (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                  venuesDone === venueCount ? 'bg-emerald-100 text-emerald-700' : 'bg-teal-100 text-teal-700'
                }`}
                title={`${venuesDone}/${venueCount} venues done`}
              >
                <MapPin className="h-2.5 w-2.5" />
                {venuesDone}/{venueCount}
              </span>
            )}
          </div>
        )}

        {/* Assignee */}
        {task.assigned_to_name && (
          <div className="flex items-center gap-1.5 flex-shrink-0 px-2 py-1 rounded-full bg-white/80 border border-gray-200">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
              style={{ backgroundColor: accentColor }}
            >
              {task.assigned_to_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <span className="text-xs font-medium text-gray-700 max-w-[80px] truncate">
              {task.assigned_to_name}
            </span>
          </div>
        )}

        {/* Status Dropdown Button */}
        <div className="relative flex-shrink-0">
          <button
            ref={statusButtonRef}
            onClick={(e) => {
              e.stopPropagation();
              if (onStatusChange) setStatusDropdownOpen(!statusDropdownOpen);
            }}
            className={`
              flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold
              transition-all duration-150 border
              ${currentStatus.bg} ${currentStatus.text} ${currentStatus.border}
              ${onStatusChange ? 'cursor-pointer hover:shadow-sm' : 'cursor-default'}
            `}
          >
            <span className={`w-2 h-2 rounded-full ${currentStatus.dot} ${task.status === 'in_progress' ? 'animate-pulse' : ''}`} />
            <span>{currentStatus.label}</span>
            {onStatusChange && <ChevronDown className={`h-3 w-3 transition-transform ${statusDropdownOpen ? 'rotate-180' : ''}`} />}
          </button>
        </div>

        {/* Status Dropdown Portal */}
        {statusDropdownOpen && createPortal(
          <div
            id={`status-dropdown-${task.id}`}
            className="fixed bg-white rounded-xl shadow-2xl border border-gray-200 py-1.5 min-w-[150px] animate-in fade-in slide-in-from-top-2 duration-150"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              zIndex: 9999
            }}
          >
            {STATUS_OPTIONS.filter(s => s.value !== 'cancelled').map((option) => (
              <button
                key={option.value}
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange?.(task, option.value as ScalingTask['status']);
                  setStatusDropdownOpen(false);
                }}
                className={`
                  w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-left
                  ${option.hover} transition-colors
                  ${task.status === option.value ? `${option.bg} ${option.text}` : 'text-gray-700'}
                `}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${option.dot}`} />
                <span className="flex-1">{option.label}</span>
                {task.status === option.value && (
                  <Check className="h-3.5 w-3.5" />
                )}
              </button>
            ))}
          </div>,
          document.body
        )}

        {/* Action Icons */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(task);
              }}
              className="p-1.5 rounded hover:bg-white/80 text-gray-400 hover:text-blue-600 transition-colors"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {onDuplicate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(task);
              }}
              className="p-1.5 rounded hover:bg-white/80 text-gray-400 hover:text-blue-600 transition-colors"
              title="Duplicate to week"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
          {/* Comments Toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCommentsExpanded(!commentsExpanded);
            }}
            className={`
              p-1.5 rounded flex items-center gap-0.5 transition-colors
              ${commentsExpanded
                ? 'bg-blue-100 text-blue-600'
                : 'hover:bg-white/80 text-gray-400 hover:text-blue-600'
              }
            `}
            title="Comments"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {(commentsFetched ? comments.length : (task.comments_count || 0)) > 0 && (
              <span className="text-[9px] font-bold">
                {commentsFetched ? comments.length : (task.comments_count || 0)}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Inline Comments Section - Compact */}
      {commentsExpanded && (
        <div className="border-t border-gray-100 bg-slate-50/50">
          <div className="px-3 py-2">
            {/* Add Comment Input */}
            <div className="flex items-center gap-2 mb-2">
              {/* Author Selector */}
              <div className="relative">
                <button
                  ref={authorButtonRef}
                  onClick={(e) => {
                    e.stopPropagation();
                    setAuthorDropdownOpen(!authorDropdownOpen);
                  }}
                  className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[9px] font-bold text-blue-600 flex-shrink-0 hover:ring-2 hover:ring-blue-200 transition-all"
                  title={`Posting as: ${commentAuthor}`}
                >
                  {commentAuthor.split(' ').map(n => n?.[0] || '').join('').slice(0, 2).toUpperCase() || 'U'}
                </button>
              </div>

              {/* Author Dropdown Portal */}
              {authorDropdownOpen && createPortal(
                <div
                  id={`author-dropdown-${task.id}`}
                  className="fixed bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[160px] max-h-[200px] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150"
                  style={{
                    top: authorDropdownPosition.top,
                    left: authorDropdownPosition.left,
                    zIndex: 9999
                  }}
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
                        className={`
                          w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left
                          hover:bg-gray-50 transition-colors
                          ${commentAuthor === assignee.name ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}
                        `}
                      >
                        <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[8px] font-bold text-gray-600">
                          {assignee.name.split(' ').map(n => n?.[0] || '').join('').slice(0, 2).toUpperCase()}
                        </div>
                        <span className="flex-1 truncate">{assignee.name}</span>
                        {commentAuthor === assignee.name && (
                          <Check className="h-3 w-3 text-blue-600" />
                        )}
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
                  className={`
                    p-1 rounded transition-all
                    ${newComment.trim()
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                    }
                  `}
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
            <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
              {loadingComments ? (
                <div className="flex items-center justify-center py-3">
                  <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                  <span className="ml-2 text-[10px] text-gray-400">Loading...</span>
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-3">
                  <p className="text-[10px] text-gray-400">No comments yet</p>
                </div>
              ) : (
                comments.map((comment, idx) => (
                  <div
                    key={comment.id}
                    className={`flex gap-2 px-2 py-1.5 rounded-lg ${idx === 0 ? 'bg-blue-50/70' : 'hover:bg-gray-100/50'}`}
                  >
                    <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[8px] font-bold text-gray-600 flex-shrink-0">
                      {(comment.author_name || 'U').split(' ').map(n => n?.[0] || '').join('').slice(0, 2).toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-gray-700">
                          {comment.author_name || 'User'}
                        </span>
                        <span className="text-[9px] text-gray-400">
                          {comment.created_at ? formatDateTime(comment.created_at) : ''}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-600 leading-snug">
                        {comment.comment_text || ''}
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

export default ScalingTaskTileV2;
