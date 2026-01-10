import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Sigma, Calendar, Plus } from 'lucide-react';
import type { HierarchyNode, StageProgress, StageKey, ScalingTaskSummary, RevenueStatus } from '../../../../shared/types';
import { TEAMS, type TeamKey } from '../../../../shared/teamConfig';
import { RevenueStatusPills, createEmptyRevenueStatus, rollupRevenueStatuses } from './RevenueStatusPills';
import { HealthDistributionBar } from './HealthDot';
import { STAGES_ORDERED, STAGE_CONFIG, type MeetupStageKey } from '../../pages/ScalingPlannerV2';

// Portal-based tooltip component that escapes overflow:hidden containers
function PortalTooltip({ text, targetRect, visible }: { text: string; targetRect: DOMRect | null; visible: boolean }) {
  if (!visible || !targetRect) return null;

  return createPortal(
    <div
      className="fixed z-[9999] pointer-events-none transition-opacity duration-150"
      style={{
        left: targetRect.left + targetRect.width / 2,
        top: targetRect.bottom + 8,
        transform: 'translateX(-50%)',
        opacity: visible ? 1 : 0
      }}
    >
      <div className="bg-gray-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-md shadow-lg whitespace-nowrap max-w-xs">
        {text}
      </div>
      <div
        className="absolute border-4 border-b-gray-800 border-x-transparent border-t-transparent"
        style={{ bottom: '100%', left: '50%', transform: 'translateX(-50%)' }}
      />
    </div>,
    document.body
  );
}

// Premium team color palettes - solid, refined colors matching filter chips
const TEAM_PALETTES: Record<TeamKey, {
  row: string;
  accent: string;
  icon: string;
  iconBg: string;
  title: string;
  subtitle: string;
}> = {
  blue: {
    row: 'bg-blue-50',
    accent: 'border-l-blue-500',
    icon: 'text-blue-600',
    iconBg: 'bg-blue-100',
    title: 'text-blue-900',
    subtitle: 'text-blue-600'
  },
  green: {
    row: 'bg-green-50',
    accent: 'border-l-green-500',
    icon: 'text-green-600',
    iconBg: 'bg-green-100',
    title: 'text-green-900',
    subtitle: 'text-green-600'
  },
  yellow: {
    row: 'bg-yellow-50',
    accent: 'border-l-yellow-500',
    icon: 'text-yellow-600',
    iconBg: 'bg-yellow-100',
    title: 'text-yellow-900',
    subtitle: 'text-yellow-600'
  }
};

// Context for creating tasks at the filtered hierarchy level
interface FilteredContext {
  task_scope: 'activity' | 'city' | 'area' | 'club' | 'all';
  activity_id?: number;
  activity_name?: string;
  city_id?: number;
  city_name?: string;
  area_id?: number;
  area_name?: string;
}

interface HierarchyRollupHeaderProps {
  filteredData: HierarchyNode[];
  visibleCounts: {
    activities: number;
    cities: number;
    areas: number;
    clubs: number;
  };
  isFiltered: boolean;
  activeTeamFilter?: TeamKey | null;
  // Callbacks for sprint and task actions
  onOpenSprint?: () => void;
  onCreateTask?: () => void;
  // Current filter context to determine hierarchy level
  filterContext?: FilteredContext;
  // Task summary for the filtered data
  taskSummary?: ScalingTaskSummary | null;
}

// Format currency in Lakhs or K
const formatCurrency = (value: number): string => {
  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(1)}L`;
  }
  if (value >= 1000) {
    return `₹${(value / 1000).toFixed(1)}K`;
  }
  return `₹${value}`;
};

// Calculate totals from filtered hierarchy data
function calculateTotals(nodes: HierarchyNode[]) {
  let totalTargetMeetups = 0;
  let totalCurrentMeetups = 0;
  let totalTargetRevenue = 0;
  let totalCurrentRevenue = 0;
  let totalL4WRevenue = 0;
  let totalL4WRevenueAvg = 0;
  let clubCount = 0;

  const aggregatedProgress: StageProgress & { unattributed_meetups: number } = {
    not_picked: 0,
    started: 0,
    stage_1: 0,
    stage_2: 0,
    stage_3: 0,
    stage_4: 0,
    realised: 0,
    unattributed_meetups: 0
  };

  // Health distribution for rollup
  const healthDistribution = { green: 0, yellow: 0, red: 0, gray: 0 };

  // Collect all revenue statuses for rollup
  const revenueStatuses: RevenueStatus[] = [];

  function collectFromNode(node: HierarchyNode) {
    if (node.type === 'club' || node.type === 'launch') {
      totalTargetMeetups += node.target_meetups || 0;
      totalCurrentMeetups += node.current_meetups || 0;
      totalTargetRevenue += node.target_revenue || 0;
      totalCurrentRevenue += node.current_revenue || 0;
      totalL4WRevenue += node.last_4w_revenue_total || 0;
      totalL4WRevenueAvg += node.last_4w_revenue_avg || 0;
      clubCount++;

      if (node.progress_summary) {
        (Object.keys(aggregatedProgress) as StageKey[]).forEach(stage => {
          aggregatedProgress[stage] += node.progress_summary?.[stage] || 0;
        });
        // Also aggregate unattributed_meetups if present
        const progressWithUA = node.progress_summary as StageProgress & { unattributed_meetups?: number };
        aggregatedProgress.unattributed_meetups += progressWithUA.unattributed_meetups || 0;
      }

      // Collect revenue status if available
      if (node.revenue_status) {
        revenueStatuses.push(node.revenue_status);
      }

      // Aggregate health status (exclude launches from health rollup)
      if (!node.is_launch && node.health_status) {
        healthDistribution[node.health_status as keyof typeof healthDistribution]++;
      }
    }

    if (node.children) {
      node.children.forEach(collectFromNode);
    }
  }

  nodes.forEach(collectFromNode);

  const gapMeetups = Math.max(0, totalTargetMeetups - totalCurrentMeetups);
  const gapRevenue = Math.max(0, totalTargetRevenue - totalCurrentRevenue);

  // Roll up all revenue statuses
  const aggregatedRevenueStatus = revenueStatuses.length > 0
    ? rollupRevenueStatuses(revenueStatuses)
    : createEmptyRevenueStatus();

  return {
    targetMeetups: totalTargetMeetups,
    currentMeetups: totalCurrentMeetups,
    targetRevenue: totalTargetRevenue,
    currentRevenue: totalCurrentRevenue,
    gapMeetups,
    gapRevenue,
    l4wRevenue: totalL4WRevenue,
    l4wRevenueAvg: totalL4WRevenueAvg,
    clubCount,
    progress: aggregatedProgress,
    revenueStatus: aggregatedRevenueStatus,
    healthDistribution
  };
}

// Individual stage pill with portal tooltip
function StagePillWithTooltip({ stageKey, count }: { stageKey: MeetupStageKey; count: number }) {
  const [isHovered, setIsHovered] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  const config = STAGE_CONFIG[stageKey];

  const handleMouseEnter = () => {
    if (ref.current) {
      setRect(ref.current.getBoundingClientRect());
    }
    setIsHovered(true);
  };

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setIsHovered(false)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold
          ${config.color.bg} ${config.color.text} shadow-sm ${config.color.glow}
          transition-all duration-200 hover:scale-110 hover:shadow-md`}
      >
        <span className="opacity-70">{config.shortLabel}</span>
        <span className="font-mono">{count}</span>
      </span>
      <PortalTooltip
        text={`${config.label}: ${config.description}`}
        targetRect={rect}
        visible={isHovered}
      />
    </>
  );
}

// Stage distribution pills (matching the table style) with tooltips
function StagePills({ progress }: { progress: StageProgress & { unattributed_meetups?: number } }) {
  // Use STAGES_ORDERED to ensure consistent ordering from single source of truth
  const progressWithUA = progress as Record<MeetupStageKey, number>;
  const stages = STAGES_ORDERED
    .map(stage => ({
      key: stage.key as MeetupStageKey,
      count: progressWithUA[stage.key as MeetupStageKey] || 0
    }))
    .filter(s => s.count > 0);

  if (stages.length === 0) {
    return <span className="text-gray-400 text-sm italic">No stages</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {stages.map(s => (
        <StagePillWithTooltip key={s.key} stageKey={s.key} count={s.count} />
      ))}
    </div>
  );
}

export function HierarchyRollupHeader({
  filteredData,
  visibleCounts,
  isFiltered,
  activeTeamFilter,
  onOpenSprint,
  onCreateTask,
  filterContext,
  taskSummary
}: HierarchyRollupHeaderProps) {
  const totals = calculateTotals(filteredData);

  // Calculate total tasks from summary
  const totalTasks = taskSummary
    ? (taskSummary.not_started || 0) + (taskSummary.in_progress || 0) + (taskSummary.completed || 0)
    : 0;

  // Get palette based on team filter
  const palette = activeTeamFilter ? TEAM_PALETTES[activeTeamFilter] : null;

  // Row styling
  const rowClasses = palette
    ? `${palette.row} ${palette.accent} border-l-4`
    : 'bg-slate-50 border-l-4 border-l-slate-400';

  return (
    <tr className={`${rowClasses} sticky top-[41px] z-10 shadow-[0_1px_3px_rgba(0,0,0,0.05)]`}>
      {/* Name column */}
      <td className="py-3 pl-4 pr-4">
        <div className="flex items-center gap-3">
          <span className="w-7" /> {/* Spacer to match expand button */}
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
            palette ? palette.iconBg : 'bg-slate-200'
          }`}>
            <Sigma size={15} className={palette ? palette.icon : 'text-slate-600'} strokeWidth={2.5} />
          </div>
          <div>
            {activeTeamFilter ? (
              <div className="flex items-center gap-2">
                <span className={`font-semibold text-[15px] tracking-tight ${palette?.title}`}>
                  Team {TEAMS[activeTeamFilter].name}
                </span>
                <span className={`text-xs font-medium ${palette?.subtitle}`}>
                  {visibleCounts.clubs} clubs
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[15px] text-slate-700 tracking-tight">
                  {isFiltered ? 'Filtered View' : 'Misfits Assemble'}
                </span>
                <span className="text-xs text-slate-500">
                  {visibleCounts.clubs} clubs
                </span>
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Health column */}
      <td className="py-3 px-3 text-center">
        <HealthDistributionBar distribution={totals.healthDistribution} />
      </td>

      {/* Target column */}
      <td className="py-3 px-4 text-right">
        <div className="text-gray-800 font-mono font-semibold">{totals.targetMeetups}</div>
        <div className="text-xs text-gray-500">{formatCurrency(totals.targetRevenue)}</div>
      </td>

      {/* Current column */}
      <td className="py-3 px-4 text-right">
        <div className="text-gray-800 font-mono">{totals.currentMeetups}</div>
        <div className="text-xs text-gray-500">{formatCurrency(totals.currentRevenue)}</div>
      </td>

      {/* Gap column */}
      <td className="py-3 px-4 text-right">
        <div className={`font-mono font-semibold ${totals.gapMeetups > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
          {totals.gapMeetups}
        </div>
        <div className={`text-xs ${totals.gapRevenue > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
          {formatCurrency(totals.gapRevenue)}
        </div>
      </td>

      {/* L4W Revenue column */}
      <td className="py-3 px-4 text-right">
        <div className="text-gray-800 font-mono">
          {formatCurrency(totals.l4wRevenue)}
        </div>
        <div className="text-xs text-gray-500">
          {formatCurrency(totals.l4wRevenueAvg)}/wk
        </div>
      </td>

      {/* Stage Distribution column */}
      <td className="py-3 px-4">
        <StagePills progress={totals.progress} />
      </td>

      {/* Revenue Status column */}
      <td className="py-3 px-4">
        <RevenueStatusPills revenueStatus={totals.revenueStatus} compact />
      </td>

      {/* Validation column - empty for totals row */}
      <td className="py-3 px-4">
        <span className="text-gray-400">—</span>
      </td>

      {/* Tasks column - Sprint and Task buttons matching hierarchy rows */}
      <td className="py-3 px-4">
        <div className="flex items-center justify-center gap-1">
          {/* Sprints Button - matches TaskSummaryCell */}
          <button
            onClick={onOpenSprint}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="View Sprints"
          >
            <Calendar className="h-3 w-3" />
            <span>Sprints</span>
          </button>

          {/* Create Task Button - matches TaskSummaryCell */}
          <button
            onClick={onCreateTask}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
            title="Create Task"
          >
            <Plus className="h-3 w-3" />
            <span>Task</span>
          </button>
        </div>
      </td>

      {/* Actions column - empty for rollup */}
      <td className="py-3 px-4">
        <span className="text-gray-400"></span>
      </td>
    </tr>
  );
}

export default HierarchyRollupHeader;
