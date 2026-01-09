import React from 'react';
import { GripVertical, Copy, MessageSquare, User, ChevronRight, ExternalLink, Pencil, Users, MapPin } from 'lucide-react';
import type { ScalingTask, TeamColor } from '../../../../shared/types';
import { TEAMS, getTeamByMember } from '../../../../shared/teamConfig';

// Default color for unassigned or unknown team members
const DEFAULT_TEAM_COLOR: TeamColor = { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-800' };

// Helper function to render text with clickable links
function renderWithLinks(text: string): React.ReactNode[] {
  // URL regex pattern
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
          className="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-800 underline break-all"
        >
          {part.length > 40 ? part.slice(0, 40) + '...' : part}
          <ExternalLink className="h-3 w-3 flex-shrink-0" />
        </a>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

// Get team color using the hardcoded team config
function getTeamColor(teamLead: string | null | undefined): TeamColor {
  if (!teamLead) return DEFAULT_TEAM_COLOR;
  const teamKey = getTeamByMember(teamLead);
  if (!teamKey) return DEFAULT_TEAM_COLOR;
  const teamConfig = TEAMS[teamKey];
  return {
    bg: teamConfig.color.bg,
    border: teamConfig.color.border,
    text: teamConfig.color.text.replace('700', '800') // Slightly darker text for readability
  };
}

// Status colors (solid for strong highlight)
const STATUS_COLORS: Record<string, { dot: string; bg: string; text: string }> = {
  'not_started': { dot: 'bg-red-500', bg: 'bg-red-100', text: 'text-red-800' },
  'in_progress': { dot: 'bg-amber-500', bg: 'bg-amber-100', text: 'text-amber-800' },
  'completed': { dot: 'bg-green-500', bg: 'bg-green-100', text: 'text-green-800' },
  'cancelled': { dot: 'bg-gray-400', bg: 'bg-gray-100', text: 'text-gray-600' }
};

// Stage display mapping
const STAGE_DISPLAY: Record<string, string> = {
  'not_picked': 'NP',
  'started': 'S',
  'stage_1': 'S1',
  'stage_2': 'S2',
  'stage_3': 'S3',
  'stage_4': 'S4',
  'realised': 'R'
};

interface ScalingTaskTileProps {
  task: ScalingTask;
  onDuplicate?: (task: ScalingTask) => void;
  onViewComments?: (task: ScalingTask) => void;
  onEdit?: (task: ScalingTask) => void;
  onClick?: (task: ScalingTask) => void;
  onStatusChange?: (task: ScalingTask, newStatus: ScalingTask['status']) => void;
  isDragging?: boolean;
  dragHandleProps?: any;
}

export function ScalingTaskTile({
  task,
  onDuplicate,
  onViewComments,
  onEdit,
  onClick,
  onStatusChange,
  isDragging = false,
  dragHandleProps
}: ScalingTaskTileProps) {
  const teamColor = task.team_color || getTeamColor(task.assigned_team_lead);
  const statusColor = STATUS_COLORS[task.status] || STATUS_COLORS['not_started'];

  // Stage transition display
  const stageTransition = task.source_stage && task.target_stage
    ? `${STAGE_DISPLAY[task.source_stage]} → ${STAGE_DISPLAY[task.target_stage]}`
    : null;

  return (
    <div
      className={`
        rounded-lg border p-3 cursor-pointer transition-all
        ${teamColor.bg} ${teamColor.border}
        ${isDragging ? 'shadow-lg ring-2 ring-blue-400' : 'hover:shadow-md'}
      `}
      onClick={() => onClick?.(task)}
    >
      {/* Header: Drag handle + Status */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Drag Handle */}
          <div
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </div>

          {/* Title */}
          <h4 className="font-medium text-gray-900 text-sm truncate flex-1">
            {task.title}
          </h4>
        </div>

        {/* Status Indicator */}
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${statusColor.bg} ${statusColor.text}`}>
          <div className={`w-2 h-2 rounded-full ${statusColor.dot}`} />
          <span className="capitalize">{task.status.replace('_', ' ')}</span>
        </div>
      </div>

      {/* Stage Transition + Meetups */}
      {(stageTransition || task.meetups_count > 0) && (
        <div className="flex items-center gap-2 text-xs text-gray-600 mb-2">
          {stageTransition && (
            <span className="font-mono bg-white/60 px-1.5 py-0.5 rounded">
              {stageTransition}
            </span>
          )}
          {task.meetups_count > 0 && (
            <>
              <span className="text-gray-400">•</span>
              <span>{task.meetups_count} meetup{task.meetups_count > 1 ? 's' : ''}</span>
            </>
          )}
        </div>
      )}

      {/* Description with clickable links */}
      {task.description && (
        <div className="text-xs text-gray-600 mb-2 line-clamp-2">
          {renderWithLinks(task.description)}
        </div>
      )}

      {/* Hierarchy Tags */}
      <div className="flex flex-wrap gap-1 mb-2">
        {task.activity_name && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">
            {task.activity_name}
          </span>
        )}
        {task.city_name && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
            {task.city_name}
          </span>
        )}
        {task.area_name && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">
            {task.area_name}
          </span>
        )}
        {task.club_name && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">
            {task.club_name}
          </span>
        )}
      </div>

      {/* Assignee */}
      {task.assigned_to_name && (
        <div className="flex items-center gap-1 text-xs text-gray-600 mb-2">
          <User className="h-3 w-3" />
          <span className="truncate">{task.assigned_to_name}</span>
        </div>
      )}

      {/* Linked Requirements Tags */}
      {((task.linked_leader_requirements && task.linked_leader_requirements.length > 0) ||
        (task.linked_venue_requirements && task.linked_venue_requirements.length > 0)) && (
        <div className="flex items-center gap-2 mb-2">
          {task.linked_leader_requirements && task.linked_leader_requirements.length > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200">
              <Users className="h-3 w-3 text-indigo-600" />
              <span className="text-[10px] font-medium text-indigo-700">
                {task.linked_leader_requirements.length} Leader{task.linked_leader_requirements.length > 1 ? 's' : ''}
              </span>
            </div>
          )}
          {task.linked_venue_requirements && task.linked_venue_requirements.length > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-50 border border-teal-200">
              <MapPin className="h-3 w-3 text-teal-600" />
              <span className="text-[10px] font-medium text-teal-700">
                {task.linked_venue_requirements.length} Venue{task.linked_venue_requirements.length > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200/50">
        {/* Edit Button */}
        {onEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(task);
            }}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors"
          >
            <Pencil className="h-3 w-3" />
            <span>Edit</span>
          </button>
        )}

        {/* Duplicate Button */}
        {onDuplicate && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(task);
            }}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors"
          >
            <Copy className="h-3 w-3" />
            <span>Duplicate</span>
          </button>
        )}

        {/* Comments Button */}
        {onViewComments && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewComments(task);
            }}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors"
          >
            <MessageSquare className="h-3 w-3" />
            <span>Comments{task.comments_count ? ` (${task.comments_count})` : ''}</span>
          </button>
        )}

        {/* Status Quick Toggle */}
        {onStatusChange && task.status !== 'completed' && task.status !== 'cancelled' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const nextStatus = task.status === 'not_started' ? 'in_progress' : 'completed';
              onStatusChange(task, nextStatus);
            }}
            className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-green-600 transition-colors"
          >
            <ChevronRight className="h-3 w-3" />
            <span>{task.status === 'not_started' ? 'Start' : 'Complete'}</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default ScalingTaskTile;
