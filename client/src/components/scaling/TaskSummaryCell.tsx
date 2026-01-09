import React, { useMemo } from 'react';
import { Plus, Calendar } from 'lucide-react';
import type { ScalingTaskSummary } from '../../../../shared/types';

interface TaskSummaryCellProps {
  summary?: ScalingTaskSummary | null;
  onOpenSprints?: () => void;
  onCreateTask?: () => void;
  loading?: boolean;
}

export function TaskSummaryCell({ summary, onOpenSprints, onCreateTask, loading }: TaskSummaryCellProps) {
  const stats = useMemo(() => {
    if (!summary) return null;

    const pending = summary.not_started || 0;
    const active = summary.in_progress || 0;
    const done = summary.completed || 0;
    const total = pending + active + done;

    if (total === 0) return null;

    return { pending, active, done, total };
  }, [summary]);

  // For small counts (≤6), show individual dots
  // For larger counts, show numbers with dots
  const showDots = stats && stats.total <= 6;

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* Task Summary Visualization (clickable to open sprints) */}
      {stats ? (
        <button
          onClick={onOpenSprints}
          className="group relative flex items-center gap-1.5 px-2 py-1 rounded-md
            hover:bg-gray-50 transition-all cursor-pointer"
          title={`${stats.pending} pending, ${stats.active} active, ${stats.done} done`}
        >
          {showDots ? (
            // Dot visualization for small counts
            <div className="flex items-center gap-0.5">
              {/* Pending - Red */}
              {Array.from({ length: stats.pending }).map((_, i) => (
                <span key={`p-${i}`} className="w-2 h-2 rounded-full bg-red-400" />
              ))}
              {/* Active - Amber */}
              {Array.from({ length: stats.active }).map((_, i) => (
                <span key={`a-${i}`} className="w-2 h-2 rounded-full bg-amber-500" />
              ))}
              {/* Done - Green */}
              {Array.from({ length: stats.done }).map((_, i) => (
                <span key={`d-${i}`} className="w-2 h-2 rounded-full bg-emerald-500" />
              ))}
            </div>
          ) : (
            // Compact number visualization for larger counts
            <div className="flex items-center gap-2 text-xs font-medium">
              {stats.pending > 0 && (
                <span className="flex items-center gap-0.5">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-red-600 tabular-nums">{stats.pending}</span>
                </span>
              )}
              {stats.active > 0 && (
                <span className="flex items-center gap-0.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-amber-600 tabular-nums">{stats.active}</span>
                </span>
              )}
              {stats.done > 0 && (
                <span className="flex items-center gap-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-emerald-600 tabular-nums">{stats.done}</span>
                </span>
              )}
            </div>
          )}

          {/* Hover tooltip with breakdown */}
          <div className="
            absolute left-1/2 -translate-x-1/2 bottom-full mb-2
            opacity-0 group-hover:opacity-100 pointer-events-none
            transition-opacity duration-150 z-50
          ">
            <div className="bg-gray-900 text-white text-[10px] rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap">
              <div className="flex items-center gap-3">
                {stats.pending > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    <span>{stats.pending} pending</span>
                  </span>
                )}
                {stats.active > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span>{stats.active} active</span>
                  </span>
                )}
                {stats.done > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>{stats.done} done</span>
                  </span>
                )}
              </div>
              <div className="absolute left-1/2 -translate-x-1/2 top-full">
                <div className="border-4 border-transparent border-t-gray-900" />
              </div>
            </div>
          </div>
        </button>
      ) : null}

      {/* Action Buttons */}
      <div className="flex items-center justify-center gap-1">
        {/* Sprints Button */}
        <button
          onClick={onOpenSprints}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
          title="View Sprints"
        >
          <Calendar className="h-3 w-3" />
          <span>Sprints</span>
        </button>

        {/* Create Task Button */}
        <button
          onClick={onCreateTask}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
          title="Create Task"
        >
          <Plus className="h-3 w-3" />
          <span>Task</span>
        </button>
      </div>
    </div>
  );
}

export default TaskSummaryCell;
