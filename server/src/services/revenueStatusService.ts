/**
 * Revenue Status Service
 *
 * Calculates revenue status by meetup stage and handles:
 * - Revenue allocation by stage (NP, St, S1, S2, S3, S4, Realised)
 * - Realisation Gap = max(0, realised_target - realised_actual)
 * - Unattributed Revenue = revenue that couldn't be matched to any target
 * - Rollup functions for hierarchy aggregation
 */

import { logger } from '../utils/logger';

// Types matching shared/types.ts
export type MeetupStageKey = 'not_picked' | 'started' | 'stage_1' | 'stage_2' | 'stage_3' | 'stage_4' | 'realised';

export interface StageProgress {
  not_picked: number;
  started: number;
  stage_1: number;
  stage_2: number;
  stage_3: number;
  stage_4: number;
  realised: number;
}

export interface RevenueStatus {
  // Revenue potential by stage (pipeline)
  np: number;      // Not Picked stage revenue
  st: number;      // Started stage revenue
  s1: number;      // Stage 1 (Leaders Found) revenue
  s2: number;      // Stage 2 (Venue Found) revenue
  s3: number;      // Stage 3 (Launch Ready) revenue
  s4: number;      // Stage 4 (Regression) revenue

  // Realised metrics
  realised_target: number;  // Total target revenue for realised meetups
  realised_actual: number;  // Actual collected revenue for realised meetups
  realisation_gap: number;  // max(0, realised_target - realised_actual)

  // Unattributed
  unattributed: number;     // Revenue that couldn't match to any target

  // Totals
  total_pipeline: number;   // Sum of NP+St+S1+S2+S3+S4
  total_target: number;     // Total target revenue across all stages
}

export interface RevenueStatusDisplay {
  np: string | null;
  st: string | null;
  s1: string | null;
  s2: string | null;
  s3: string | null;
  s4: string | null;
  rg: string | null;
  ua: string | null;
  ra: string | null;
}

// Create an empty revenue status
export function createEmptyRevenueStatus(): RevenueStatus {
  return {
    np: 0,
    st: 0,
    s1: 0,
    s2: 0,
    s3: 0,
    s4: 0,
    realised_target: 0,
    realised_actual: 0,
    realisation_gap: 0,
    unattributed: 0,
    total_pipeline: 0,
    total_target: 0
  };
}

// Stage to revenue status field mapping
const STAGE_TO_REVENUE_FIELD: Record<MeetupStageKey, keyof RevenueStatus | null> = {
  'not_picked': 'np',
  'started': 'st',
  'stage_1': 's1',
  'stage_2': 's2',
  'stage_3': 's3',
  'stage_4': 's4',
  'realised': null // realised is handled separately
};

/**
 * Calculate revenue status for a single target
 *
 * @param targetRevenue - Total target revenue for this target
 * @param progress - Stage progress (count of meetups in each stage)
 * @param actualRevenue - Actual revenue collected (for realised calculation)
 */
export function calculateTargetRevenueStatus(
  targetRevenue: number,
  progress: StageProgress,
  actualRevenue: number = 0
): RevenueStatus {
  const status = createEmptyRevenueStatus();

  // Count total meetups across all stages
  const totalMeetups = Object.values(progress).reduce((sum, count) => sum + count, 0);

  if (totalMeetups === 0 || targetRevenue === 0) {
    // No meetups or no target - all revenue is unallocated
    return status;
  }

  // Calculate revenue per meetup for this target
  const revenuePerMeetup = targetRevenue / totalMeetups;

  // Allocate revenue to each stage based on meetup count
  const stages: MeetupStageKey[] = ['not_picked', 'started', 'stage_1', 'stage_2', 'stage_3', 'stage_4', 'realised'];

  for (const stage of stages) {
    const meetupsInStage = progress[stage] || 0;
    const stageRevenue = meetupsInStage * revenuePerMeetup;

    if (stage === 'realised') {
      status.realised_target = stageRevenue;
    } else {
      const field = STAGE_TO_REVENUE_FIELD[stage];
      if (field && field !== 'realised_target' && field !== 'realised_actual' &&
          field !== 'realisation_gap' && field !== 'unattributed' &&
          field !== 'total_pipeline' && field !== 'total_target') {
        status[field] = stageRevenue;
      }
    }
  }

  // Set realised actual (from actual revenue data)
  status.realised_actual = Math.min(actualRevenue, status.realised_target);

  // Calculate realisation gap (never negative)
  status.realisation_gap = Math.max(0, status.realised_target - status.realised_actual);

  // Calculate totals
  status.total_pipeline = status.np + status.st + status.s1 + status.s2 + status.s3 + status.s4;
  status.total_target = targetRevenue;

  return status;
}

/**
 * Calculate revenue status for a club with multiple targets
 *
 * Key principle: current_revenue = realised_actual + unattributed (ALWAYS)
 * - realised_actual (RA): Revenue we can attribute to realised meetups (capped at realised_target)
 * - unattributed (UA): Revenue we cannot attribute to any target
 * - realisation_gap (RG): Shortfall between realised_target and realised_actual
 */
export function calculateClubRevenueStatus(
  targets: Array<{
    target_revenue: number;
    progress: StageProgress;
  }>,
  totalActualRevenue: number
): RevenueStatus {
  const status = createEmptyRevenueStatus();

  // Calculate total target revenue
  const totalTargetRevenue = targets.reduce((sum, t) => sum + t.target_revenue, 0);

  // Calculate total realised target (sum of target revenue for meetups in "realised" stage)
  let totalRealisedTarget = 0;

  // Aggregate revenue by stage from all targets
  for (const target of targets) {
    const totalMeetups = Object.values(target.progress).reduce((sum, count) => sum + count, 0);

    if (totalMeetups > 0 && target.target_revenue > 0) {
      const revenuePerMeetup = target.target_revenue / totalMeetups;

      // Distribute target revenue across stages
      status.np += (target.progress.not_picked || 0) * revenuePerMeetup;
      status.st += (target.progress.started || 0) * revenuePerMeetup;
      status.s1 += (target.progress.stage_1 || 0) * revenuePerMeetup;
      status.s2 += (target.progress.stage_2 || 0) * revenuePerMeetup;
      status.s3 += (target.progress.stage_3 || 0) * revenuePerMeetup;
      status.s4 += (target.progress.stage_4 || 0) * revenuePerMeetup;

      // Calculate realised target for this target
      const realisedMeetups = target.progress.realised || 0;
      totalRealisedTarget += realisedMeetups * revenuePerMeetup;
    }
  }

  status.realised_target = totalRealisedTarget;

  // KEY LOGIC: Split current revenue into RA and UA
  // current_revenue = realised_actual + unattributed (ALWAYS)
  //
  // RA = Revenue attributed to targets with realised meetups (no cap - even if exceeded target)
  // UA = Revenue that can't be attributed to any target
  if (totalActualRevenue > 0) {
    // Count total realised meetups across all targets
    const totalRealisedMeetups = targets.reduce((sum, t) => sum + (t.progress.realised || 0), 0);

    if (totalRealisedMeetups > 0) {
      // Club has realised meetups - ALL revenue is attributed to those meetups
      status.realised_actual = totalActualRevenue;
      status.unattributed = 0;
    } else {
      // No realised meetups - all revenue is unattributed (can't attribute to any target)
      status.realised_actual = 0;
      status.unattributed = totalActualRevenue;
    }
  }

  // Realisation gap = how much we're missing from realised target
  status.realisation_gap = Math.max(0, status.realised_target - status.realised_actual);

  // Calculate totals
  status.total_pipeline = status.np + status.st + status.s1 + status.s2 + status.s3 + status.s4;
  status.total_target = totalTargetRevenue;

  return status;
}

/**
 * Roll up multiple revenue statuses (for hierarchy aggregation)
 */
export function rollupRevenueStatuses(statuses: RevenueStatus[]): RevenueStatus {
  const result = createEmptyRevenueStatus();

  for (const status of statuses) {
    result.np += status.np || 0;
    result.st += status.st || 0;
    result.s1 += status.s1 || 0;
    result.s2 += status.s2 || 0;
    result.s3 += status.s3 || 0;
    result.s4 += status.s4 || 0;
    result.realised_target += status.realised_target || 0;
    result.realised_actual += status.realised_actual || 0;
    result.unattributed += status.unattributed || 0;
    result.total_target += status.total_target || 0;
  }

  // Recalculate gap and pipeline after aggregation
  result.realisation_gap = Math.max(0, result.realised_target - result.realised_actual);
  result.total_pipeline = result.np + result.st + result.s1 + result.s2 + result.s3 + result.s4;

  return result;
}

/**
 * Format currency for display (in thousands/lakhs)
 */
function formatCurrency(value: number): string {
  if (value >= 100000) {
    return `${(value / 100000).toFixed(1)}L`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toFixed(0);
}

/**
 * Get display-ready revenue status (formatted strings, nulls for zero values)
 */
export function getRevenueStatusDisplay(status: RevenueStatus | null): RevenueStatusDisplay {
  if (!status) {
    return {
      np: null, st: null, s1: null, s2: null, s3: null, s4: null,
      rg: null, ua: null, ra: null
    };
  }

  return {
    np: status.np > 0 ? formatCurrency(status.np) : null,
    st: status.st > 0 ? formatCurrency(status.st) : null,
    s1: status.s1 > 0 ? formatCurrency(status.s1) : null,
    s2: status.s2 > 0 ? formatCurrency(status.s2) : null,
    s3: status.s3 > 0 ? formatCurrency(status.s3) : null,
    s4: status.s4 > 0 ? formatCurrency(status.s4) : null,
    rg: status.realisation_gap > 0 ? formatCurrency(status.realisation_gap) : null,
    ua: status.unattributed > 0 ? formatCurrency(status.unattributed) : null,
    ra: status.realised_actual > 0 ? formatCurrency(status.realised_actual) : null
  };
}

/**
 * Calculate auto-realisation result
 * Determines if a target should be auto-moved to Realised or S4 based on current data
 *
 * @param currentMeetups - Number of meetups that actually happened (from prod DB)
 * @param currentRevenue - Actual revenue collected (from prod DB)
 * @param progress - Current stage progress
 * @returns Recommended stage and reason
 */
export interface AutoRealisationResult {
  shouldUpdate: boolean;
  currentStage: MeetupStageKey;
  recommendedStage: MeetupStageKey | null;
  reason: string;
}

export function calculateAutoRealisation(
  currentMeetups: number,
  currentRevenue: number,
  progress: StageProgress
): AutoRealisationResult {
  // Find the current dominant stage (highest count)
  const stages: MeetupStageKey[] = ['not_picked', 'started', 'stage_1', 'stage_2', 'stage_3', 'stage_4', 'realised'];
  let currentStage: MeetupStageKey = 'not_picked';
  let maxCount = 0;

  for (const stage of stages) {
    if (progress[stage] > maxCount) {
      maxCount = progress[stage];
      currentStage = stage;
    }
  }

  // Determine if auto-realisation should apply
  const hasCurrentActivity = currentMeetups > 0 || currentRevenue > 0;
  const isCurrentlyRealised = currentStage === 'realised';
  const isInPipeline = ['not_picked', 'started', 'stage_1', 'stage_2', 'stage_3'].includes(currentStage);
  const isRegressed = currentStage === 'stage_4';

  // Rule 1: If club has current activity but not realised, recommend moving to realised
  if (hasCurrentActivity && !isCurrentlyRealised && (isInPipeline || isRegressed)) {
    return {
      shouldUpdate: true,
      currentStage,
      recommendedStage: 'realised',
      reason: `Club has ${currentMeetups} meetups and ₹${currentRevenue} revenue - should be marked as Realised`
    };
  }

  // Rule 2: If club was realised but has no current activity, recommend moving to S4 (regression)
  if (!hasCurrentActivity && isCurrentlyRealised) {
    return {
      shouldUpdate: true,
      currentStage,
      recommendedStage: 'stage_4',
      reason: 'Club was Realised but has no recent activity - marked as Regression (S4)'
    };
  }

  // No change needed
  return {
    shouldUpdate: false,
    currentStage,
    recommendedStage: null,
    reason: 'No auto-realisation needed'
  };
}

/**
 * Apply auto-realisation to progress
 * Returns updated progress with meetups moved to the recommended stage
 */
export function applyAutoRealisation(
  progress: StageProgress,
  autoResult: AutoRealisationResult
): StageProgress {
  if (!autoResult.shouldUpdate || !autoResult.recommendedStage) {
    return progress;
  }

  // Move all meetups from current stage to recommended stage
  const newProgress: StageProgress = { ...progress };
  const currentCount = newProgress[autoResult.currentStage];

  newProgress[autoResult.currentStage] = 0;
  newProgress[autoResult.recommendedStage] = (newProgress[autoResult.recommendedStage] || 0) + currentCount;

  return newProgress;
}

export default {
  createEmptyRevenueStatus,
  calculateTargetRevenueStatus,
  calculateClubRevenueStatus,
  rollupRevenueStatuses,
  getRevenueStatusDisplay,
  calculateAutoRealisation,
  applyAutoRealisation
};
