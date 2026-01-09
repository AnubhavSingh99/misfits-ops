import React, { useMemo } from 'react';
import type { ScalingTaskSummary } from '../../../../shared/types';

interface TaskIndicatorProps {
  summary: ScalingTaskSummary | null;
  onClick?: () => void;
}

/**
 * TaskIndicator - Compact task status visualization
 *
 * Shows rolled-up task counts from current + last sprint:
 * - Red dots = pending (not_started)
 * - Amber dots = active (in_progress)
 * - Green dots = done (completed)
 *
 * Visual: "●●○○○" or "3●2○" for larger counts
 */
export function TaskIndicator({ summary, onClick }: TaskIndicatorProps) {
  const stats = useMemo(() => {
    if (!summary) return null;

    const pending = summary.not_started || 0;
    const active = summary.in_progress || 0;
    const done = summary.completed || 0;
    const total = pending + active + done;

    if (total === 0) return null;

    return { pending, active, done, total };
  }, [summary]);

  // Empty state
  if (!stats) {
    return (
      <button
        onClick={onClick}
        className="px-2 py-1 text-gray-300 hover:text-gray-400 transition-colors"
        title="No tasks"
      >
        <span className="text-xs">—</span>
      </button>
    );
  }

  // For small counts (≤5), show individual dots
  // For larger counts, show numbers with dots
  const showDots = stats.total <= 6;

  return (
    <button
      onClick={onClick}
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
  );
}

export default TaskIndicator;
