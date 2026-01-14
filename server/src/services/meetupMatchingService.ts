/**
 * Meetup Matching Service
 *
 * Matches actual meetups from production DB to targets based on:
 * 1. Area - HARD FILTER (exact match if set, otherwise passes)
 * 2. Day Type - HARD FILTER (DOW match if set, otherwise passes)
 * 3. Name - SOFT FILTER (used for disambiguation when multiple targets match, not for filtering)
 *
 * Matching Process:
 * - Find all targets that pass Area + Day hard filters (candidates)
 * - If 1 candidate → use it (regardless of name)
 * - If multiple candidates → prefer name match, then highest specificity
 * - If 0 candidates → goes to unattributed (UA)
 *
 * Also handles:
 * - Stage movement (highest stage first → realised)
 * - Revenue attribution (RA, UA, RG calculation)
 */

import { logger } from '../utils/logger';
import { queryProduction, queryLocal } from './database';
import { createEmptyRevenueStatus, type RevenueStatus, type StageProgress } from './revenueStatusService';

// Day type to day-of-week mapping (matching shared/types.ts)
export const DAY_TYPE_TO_DOW: Record<number, number[]> = {
  1: [1, 2, 3, 4, 5],  // weekday (Mon-Fri)
  2: [0, 6],           // weekend (Sun, Sat)
  3: [1],              // monday
  4: [2],              // tuesday
  5: [3],              // wednesday
  6: [4],              // thursday
  7: [5],              // friday
  8: [6],              // saturday
  9: [0],              // sunday
};

// Local type definitions (matching shared/types.ts)
export interface ActualMeetup {
  event_id: number;
  event_name: string;
  club_id: number;
  area_id: number;
  area_name?: string;
  dow: number;
  revenue: number;
  start_time?: string;
}

export interface TargetWithMapping {
  target_id: number;
  target_name: string | null;
  club_id: number;
  area_id: number | null;
  production_area_id: number | null;
  day_type_id: number | null;
  day_type_name: string | null;
  day_type_dows: number[] | null;
  target_meetups: number;
  target_revenue: number;
  meetup_cost: number;
  meetup_capacity: number;
  progress: StageProgress;
  specificity_score: number;
}

export interface MeetupMatchResult {
  matched: boolean;
  target_id: number | null;
  target_name: string | null;
  match_type: 'full' | 'partial' | 'none';
  match_details: {
    area_matched: boolean;
    day_matched: boolean | null;
    name_matched: boolean | null;
  };
}

export interface StageProgressWithUA extends StageProgress {
  unattributed_meetups: number;
}

export interface TargetMatchResult {
  target_id: number;
  target_name: string | null;
  matched_meetups: ActualMeetup[];
  matched_count: number;
  matched_revenue: number;
  extra_meetups: number;
  extra_revenue: number;
  new_progress: StageProgressWithUA;
  revenue_status: RevenueStatus;
}

export interface AreaUnattributed {
  area_id: number;
  area_name: string;
  meetups: ActualMeetup[];
  meetup_count: number;
  total_revenue: number;
}

export interface ClubMatchResult {
  club_id: number;
  club_name: string;
  targets: TargetMatchResult[];
  area_unattributed: AreaUnattributed[];
  total_matched_meetups: number;
  total_matched_revenue: number;
  total_unattributed_meetups: number;
  total_unattributed_revenue: number;
}

/**
 * Get actual meetups for a club from production DB
 * Filters to last completed week by default
 */
export async function getClubMeetups(
  clubId: number,
  weekStart?: Date,
  weekEnd?: Date
): Promise<ActualMeetup[]> {
  try {
    // Default to last completed week if not specified
    // 0-BOOKING FILTER: Only include events with at least 1 valid booking
    const query = `
      WITH week_bounds AS (
        SELECT
          COALESCE($2::timestamp, DATE_TRUNC('week', CURRENT_DATE AT TIME ZONE 'Asia/Kolkata') - INTERVAL '1 week') as week_start,
          COALESCE($3::timestamp, DATE_TRUNC('week', CURRENT_DATE AT TIME ZONE 'Asia/Kolkata')) as week_end
      )
      SELECT
        e.pk as event_id,
        e.name as event_name,
        e.club_id,
        l.area_id as area_id,
        a.name as area_name,
        EXTRACT(DOW FROM e.start_time AT TIME ZONE 'Asia/Kolkata')::int as dow,
        e.start_time AT TIME ZONE 'Asia/Kolkata' as start_time,
        COALESCE(SUM(
          CASE WHEN p.state = 'COMPLETED' THEN p.amount / 100.0 ELSE 0 END
        ), 0) as revenue,
        COUNT(DISTINCT CASE WHEN b.booking_status NOT IN ('DEREGISTERED', 'INITIATED') THEN b.id END) as booking_count
      FROM event e
      JOIN location l ON e.location_id = l.id
      LEFT JOIN area a ON l.area_id = a.id
      LEFT JOIN booking b ON b.event_id = e.pk
      LEFT JOIN transaction t ON t.entity_id = b.id AND t.entity_type = 'BOOKING'
      LEFT JOIN payment p ON p.pk = t.payment_id
      CROSS JOIN week_bounds wb
      WHERE e.club_id = $1
        AND e.state = 'CREATED'
        AND e.start_time AT TIME ZONE 'Asia/Kolkata' >= wb.week_start
        AND e.start_time AT TIME ZONE 'Asia/Kolkata' < wb.week_end
      GROUP BY e.pk, e.name, e.club_id, l.area_id, a.name, e.start_time
      HAVING COUNT(DISTINCT CASE WHEN b.booking_status NOT IN ('DEREGISTERED', 'INITIATED') THEN b.id END) > 0
      ORDER BY e.start_time
    `;

    const result = await queryProduction(query, [
      clubId,
      weekStart || null,
      weekEnd || null
    ]);

    return result.rows.map((row: any) => ({
      event_id: parseInt(row.event_id),
      event_name: row.event_name || '',
      club_id: parseInt(row.club_id),
      area_id: row.area_id ? parseInt(row.area_id) : 0,
      area_name: row.area_name || '',
      dow: parseInt(row.dow),
      revenue: parseFloat(row.revenue) || 0,
      start_time: row.start_time
    }));
  } catch (error) {
    logger.error(`Error getting meetups for club ${clubId}:`, error);
    return [];
  }
}

/**
 * Get targets for a club with area mapping from local DB
 * Ordered by specificity (most specific first)
 */
export async function getClubTargets(clubId: number): Promise<TargetWithMapping[]> {
  try {
    const query = `
      SELECT
        cdt.id as target_id,
        cdt.name as target_name,
        cdt.club_id,
        cdt.area_id,
        da.production_area_id,
        cdt.day_type_id,
        dt.day_type as day_type_name,
        cdt.target_meetups,
        cdt.target_revenue,
        cdt.meetup_cost,
        cdt.meetup_capacity,
        cdt.progress,
        -- Specificity score: area=4, day_type=2, name=1
        (CASE WHEN cdt.area_id IS NOT NULL THEN 4 ELSE 0 END) +
        (CASE WHEN cdt.day_type_id IS NOT NULL THEN 2 ELSE 0 END) +
        (CASE WHEN cdt.name IS NOT NULL AND cdt.name != '' THEN 1 ELSE 0 END) as specificity_score
      FROM club_dimensional_targets cdt
      LEFT JOIN dim_areas da ON cdt.area_id = da.id
      LEFT JOIN dim_day_types dt ON cdt.day_type_id = dt.id
      WHERE cdt.club_id = $1
      ORDER BY
        -- Most specific first
        specificity_score DESC,
        cdt.id
    `;

    const result = await queryLocal(query, [clubId]);

    return result.rows.map((row: any) => {
      const dayTypeId = row.day_type_id ? parseInt(row.day_type_id) : null;

      return {
        target_id: parseInt(row.target_id),
        target_name: row.target_name || null,
        club_id: parseInt(row.club_id),
        area_id: row.area_id ? parseInt(row.area_id) : null,
        production_area_id: row.production_area_id ? parseInt(row.production_area_id) : null,
        day_type_id: dayTypeId,
        day_type_name: row.day_type_name || null,
        day_type_dows: dayTypeId ? (DAY_TYPE_TO_DOW[dayTypeId] || null) : null,
        target_meetups: parseInt(row.target_meetups) || 0,
        target_revenue: parseFloat(row.target_revenue) || 0,
        meetup_cost: parseFloat(row.meetup_cost) || 0,
        meetup_capacity: parseInt(row.meetup_capacity) || 0,
        progress: (() => {
          const targetMeetups = parseInt(row.target_meetups) || 0;
          const defaultProgress = {
            not_picked: targetMeetups,
            started: 0,
            stage_1: 0,
            stage_2: 0,
            stage_3: 0,
            stage_4: 0,
            realised: 0
          };

          if (!row.progress) return defaultProgress;

          const p = row.progress;
          // Calculate sum of all stages
          const sum = (p.not_picked || 0) + (p.started || 0) +
            (p.stage_1 || 0) + (p.stage_2 || 0) + (p.stage_3 || 0) +
            (p.stage_4 || 0) + (p.realised || 0);

          // If sum doesn't match target, adjust not_picked to compensate
          if (sum !== targetMeetups) {
            const diff = targetMeetups - sum;
            return {
              ...defaultProgress,
              ...p,
              not_picked: Math.max(0, (p.not_picked || 0) + diff)
            };
          }

          return p;
        })(),
        specificity_score: parseInt(row.specificity_score) || 0
      };
    });
  } catch (error) {
    logger.error(`Error getting targets for club ${clubId}:`, error);
    return [];
  }
}

/**
 * Match a single meetup to a target
 *
 * Matching logic:
 * 1. Area: HARD FILTER - If target has area → must match; If NULL → passes
 * 2. Day Type: HARD FILTER - If target has day_type → meetup DOW must be in allowed list; If NULL → passes
 * 3. Name: SOFT FILTER (disambiguation only) - Used to pick best match when multiple targets match area+day
 *
 * Process:
 * - First find all targets that pass Area + Day checks (candidates)
 * - If 1 candidate → use it (regardless of name)
 * - If multiple candidates → prefer one with matching name, else use highest specificity
 * - If 0 candidates → no match (goes to UA)
 */
export function matchMeetupToTarget(
  meetup: ActualMeetup,
  targets: TargetWithMapping[]
): MeetupMatchResult {
  // Step 1: Find all candidates (targets that pass Area + Day hard filters)
  const candidates: Array<{
    target: TargetWithMapping;
    areaMatched: boolean;
    dayMatched: boolean | null;
    nameMatched: boolean;
  }> = [];

  for (const target of targets) {
    // HARD FILTER 1: Area
    if (target.production_area_id !== null) {
      if (meetup.area_id !== target.production_area_id) {
        continue; // Area doesn't match, skip this target
      }
    }
    const areaMatched = target.production_area_id !== null;

    // HARD FILTER 2: Day Type
    let dayMatched: boolean | null = null;
    if (target.day_type_id !== null && target.day_type_dows) {
      if (!target.day_type_dows.includes(meetup.dow)) {
        continue; // Day type doesn't match, skip this target
      }
      dayMatched = true;
    }

    // SOFT CHECK: Name (for disambiguation, not filtering)
    let nameMatched = false;
    if (target.target_name && target.target_name.trim() !== '') {
      const pattern = target.target_name.toLowerCase().trim();
      const eventName = meetup.event_name.toLowerCase();
      nameMatched = eventName.includes(pattern);
    }

    // This target passed hard filters - add to candidates
    candidates.push({ target, areaMatched, dayMatched, nameMatched });
  }

  // Step 2: Pick best candidate
  if (candidates.length === 0) {
    // No targets matched area + day
    return {
      matched: false,
      target_id: null,
      target_name: null,
      match_type: 'none',
      match_details: {
        area_matched: false,
        day_matched: null,
        name_matched: null
      }
    };
  }

  // If only one candidate, use it
  let best = candidates[0];

  if (candidates.length > 1) {
    // Multiple candidates - prefer name match, then highest specificity
    const withNameMatch = candidates.filter(c => c.nameMatched);
    if (withNameMatch.length > 0) {
      // Use the one with name match (and highest specificity if multiple)
      best = withNameMatch.reduce((a, b) =>
        b.target.specificity_score > a.target.specificity_score ? b : a
      );
    } else {
      // No name match - use highest specificity
      best = candidates.reduce((a, b) =>
        b.target.specificity_score > a.target.specificity_score ? b : a
      );
    }
  }

  // Return the match
  return {
    matched: true,
    target_id: best.target.target_id,
    target_name: best.target.target_name,
    match_type: best.dayMatched ? 'full' : 'partial',
    match_details: {
      area_matched: best.areaMatched,
      day_matched: best.dayMatched,
      name_matched: best.nameMatched
    }
  };
}

/**
 * Calculate new progress after matching meetups
 *
 * Stage movement logic:
 * - Move from HIGHEST stage first (S4 → S3 → S2 → S1 → Started → NP)
 * - Realised cannot exceed target_meetups
 * - Extra meetups go to unattributed_meetups
 */
export function calculateNewProgress(
  currentProgress: StageProgress,
  matchedMeetups: number,
  targetMeetups: number
): { progress: StageProgressWithUA; extraMeetups: number } {
  // Reset realised to 0 - we calculate it fresh from matched meetups
  // This ensures auto-matching shows absolute values, not incremental
  // The stored progress stages (not_picked through stage_4) are the "pipeline"
  // Matched meetups move from pipeline to realised
  const progress: StageProgressWithUA = {
    ...currentProgress,
    realised: 0,  // Reset to calculate from scratch
    unattributed_meetups: 0
  };

  // Cap realised at target - all matched meetups go to realised (up to target)
  const toRealise = Math.min(matchedMeetups, targetMeetups);
  const extraMeetups = matchedMeetups - toRealise;

  let remaining = toRealise;

  // Move from HIGHEST stage first
  const stageOrder: (keyof StageProgress)[] = [
    'stage_4', 'stage_3', 'stage_2', 'stage_1', 'started', 'not_picked'
  ];

  for (const stage of stageOrder) {
    if (remaining <= 0) break;

    const available = progress[stage] as number;
    const toMove = Math.min(available, remaining);

    (progress[stage] as number) -= toMove;
    progress.realised += toMove;
    remaining -= toMove;
  }

  // Store extra meetups
  progress.unattributed_meetups = extraMeetups;

  return { progress, extraMeetups };
}

/**
 * Calculate revenue attribution for a target
 *
 * Revenue categories:
 * - RA (realised_actual): Revenue from matched meetups within target
 * - UA (unattributed): Revenue from extra meetups beyond target
 * - RG (realisation_gap): Expected - Actual (shortfall)
 */
export function calculateRevenueAttribution(
  target: TargetWithMapping,
  matchedMeetups: number,
  matchedRevenue: number,
  newProgress: StageProgressWithUA
): RevenueStatus {
  const status = createEmptyRevenueStatus();

  if (target.target_meetups === 0) {
    // No target - all is unattributed
    status.unattributed = matchedRevenue;
    return status;
  }

  const revenuePerTargetMeetup = target.target_revenue / target.target_meetups;

  // Stage-wise distribution based on new progress
  status.np = newProgress.not_picked * revenuePerTargetMeetup;
  status.st = newProgress.started * revenuePerTargetMeetup;
  status.s1 = newProgress.stage_1 * revenuePerTargetMeetup;
  status.s2 = newProgress.stage_2 * revenuePerTargetMeetup;
  status.s3 = newProgress.stage_3 * revenuePerTargetMeetup;
  status.s4 = newProgress.stage_4 * revenuePerTargetMeetup;

  // Realised target = realised meetups × revenue per target meetup
  status.realised_target = newProgress.realised * revenuePerTargetMeetup;

  // Split actual revenue between realised and extra
  if (matchedMeetups > 0) {
    const revenuePerActualMeetup = matchedRevenue / matchedMeetups;
    const meetupsWithinTarget = Math.min(matchedMeetups, target.target_meetups);
    const meetupsBeyondTarget = Math.max(0, matchedMeetups - target.target_meetups);

    status.realised_actual = meetupsWithinTarget * revenuePerActualMeetup;
    status.unattributed = meetupsBeyondTarget * revenuePerActualMeetup;
  }

  // Realisation gap = expected - actual (never negative)
  status.realisation_gap = Math.max(0, status.realised_target - status.realised_actual);

  // Calculate totals
  status.total_pipeline = status.np + status.st + status.s1 + status.s2 + status.s3 + status.s4;
  status.total_target = target.target_revenue;

  return status;
}

/**
 * Match all meetups for a club to its targets
 *
 * Distribution priority (to maximize fully fulfilled targets):
 * 1. Day type match first (specific day types like Weekday, Weekend)
 * 2. Name match second (meetup name contains target name)
 * 3. Smallest targets first (to maximize fully fulfilled targets)
 *
 * Returns detailed match results including:
 * - Per-target matched meetups and revenue
 * - Area-level unattributed (meetups that didn't match any target)
 * - Updated progress for each target
 * - Revenue attribution
 */
export async function matchClubMeetups(
  clubId: number,
  clubName: string = '',
  weekStart?: Date,
  weekEnd?: Date
): Promise<ClubMatchResult> {
  // Get meetups and targets
  const [meetups, targets] = await Promise.all([
    getClubMeetups(clubId, weekStart, weekEnd),
    getClubTargets(clubId)
  ]);

  // Initialize result structure
  const result: ClubMatchResult = {
    club_id: clubId,
    club_name: clubName,
    targets: [],
    area_unattributed: [],
    total_matched_meetups: 0,
    total_matched_revenue: 0,
    total_unattributed_meetups: 0,
    total_unattributed_revenue: 0
  };

  // For each meetup, find ALL targets it could match (pass area + day filters)
  // Track day type match and name match for prioritization
  const meetupCandidates = new Map<number, { targetId: number; dayTypeMatched: boolean; nameMatched: boolean }[]>();
  for (const meetup of meetups) {
    const candidates: { targetId: number; dayTypeMatched: boolean; nameMatched: boolean }[] = [];
    for (const target of targets) {
      // HARD FILTER 1: Area
      if (target.production_area_id !== null) {
        if (meetup.area_id !== target.production_area_id) {
          continue;
        }
      }
      // HARD FILTER 2: Day Type (if target has specific day type)
      let dayTypeMatched = false;
      if (target.day_type_id !== null && target.day_type_dows) {
        if (!target.day_type_dows.includes(meetup.dow)) {
          continue;
        }
        dayTypeMatched = true;
      }
      // Check name match (soft filter for prioritization)
      let nameMatched = false;
      if (target.target_name && target.target_name.trim() !== '') {
        const pattern = target.target_name.toLowerCase().trim();
        const eventName = meetup.event_name.toLowerCase();
        nameMatched = eventName.includes(pattern);
      }
      candidates.push({ targetId: target.target_id, dayTypeMatched, nameMatched });
    }
    meetupCandidates.set(meetup.event_id, candidates);
  }

  // Track assigned meetups and target matches
  const assignedMeetups = new Set<number>();
  const targetMatches: Map<number, ActualMeetup[]> = new Map();
  const targetFillCount = new Map<number, number>();
  for (const target of targets) {
    targetMatches.set(target.target_id, []);
    targetFillCount.set(target.target_id, 0);
  }

  // Sort targets by target_meetups ascending (smallest first)
  const sortedTargets = [...targets].sort((a, b) => a.target_meetups - b.target_meetups);

  // PHASE 1: Assign meetups with SPECIFIC DAY TYPE MATCH first
  for (const target of sortedTargets) {
    const limit = target.target_meetups;
    let filled = targetFillCount.get(target.target_id) || 0;

    for (const meetup of meetups) {
      if (filled >= limit) break;
      if (assignedMeetups.has(meetup.event_id)) continue;

      const candidates = meetupCandidates.get(meetup.event_id) || [];
      const match = candidates.find(c => c.targetId === target.target_id && c.dayTypeMatched);
      if (match) {
        const matches = targetMatches.get(target.target_id) || [];
        matches.push(meetup);
        targetMatches.set(target.target_id, matches);
        assignedMeetups.add(meetup.event_id);
        filled++;
      }
    }
    targetFillCount.set(target.target_id, filled);
  }

  // PHASE 2: Assign meetups with NAME MATCH
  for (const target of sortedTargets) {
    const limit = target.target_meetups;
    let filled = targetFillCount.get(target.target_id) || 0;

    for (const meetup of meetups) {
      if (filled >= limit) break;
      if (assignedMeetups.has(meetup.event_id)) continue;

      const candidates = meetupCandidates.get(meetup.event_id) || [];
      const match = candidates.find(c => c.targetId === target.target_id && c.nameMatched);
      if (match) {
        const matches = targetMatches.get(target.target_id) || [];
        matches.push(meetup);
        targetMatches.set(target.target_id, matches);
        assignedMeetups.add(meetup.event_id);
        filled++;
      }
    }
    targetFillCount.set(target.target_id, filled);
  }

  // PHASE 3: Assign remaining meetups (smallest first)
  for (const target of sortedTargets) {
    const limit = target.target_meetups;
    let filled = targetFillCount.get(target.target_id) || 0;

    for (const meetup of meetups) {
      if (filled >= limit) break;
      if (assignedMeetups.has(meetup.event_id)) continue;

      const candidates = meetupCandidates.get(meetup.event_id) || [];
      const match = candidates.find(c => c.targetId === target.target_id);
      if (match) {
        const matches = targetMatches.get(target.target_id) || [];
        matches.push(meetup);
        targetMatches.set(target.target_id, matches);
        assignedMeetups.add(meetup.event_id);
        filled++;
      }
    }
    targetFillCount.set(target.target_id, filled);
  }

  // Collect unmatched meetups by area
  const unmatchedByArea: Map<number, ActualMeetup[]> = new Map();
  for (const meetup of meetups) {
    if (!assignedMeetups.has(meetup.event_id)) {
      const areaMatches = unmatchedByArea.get(meetup.area_id) || [];
      areaMatches.push(meetup);
      unmatchedByArea.set(meetup.area_id, areaMatches);
    }
  }

  // Process each target
  for (const target of targets) {
    const matchedMeetups = targetMatches.get(target.target_id) || [];
    const matchedCount = matchedMeetups.length;
    const matchedRevenue = matchedMeetups.reduce((sum, m) => sum + m.revenue, 0);

    // Calculate new progress
    const { progress: newProgress, extraMeetups } = calculateNewProgress(
      target.progress,
      matchedCount,
      target.target_meetups
    );

    // Calculate revenue attribution
    const revenueStatus = calculateRevenueAttribution(
      target,
      matchedCount,
      matchedRevenue,
      newProgress
    );

    // Calculate extra revenue (from meetups beyond target)
    const extraRevenue = extraMeetups > 0 && matchedCount > 0
      ? (matchedRevenue / matchedCount) * extraMeetups
      : 0;

    result.targets.push({
      target_id: target.target_id,
      target_name: target.target_name,
      matched_meetups: matchedMeetups,
      matched_count: matchedCount,
      matched_revenue: matchedRevenue,
      extra_meetups: extraMeetups,
      extra_revenue: extraRevenue,
      new_progress: newProgress,
      revenue_status: revenueStatus
    });

    result.total_matched_meetups += matchedCount;
    result.total_matched_revenue += matchedRevenue;
  }

  // Process area unattributed
  for (const [areaId, areaMeetups] of unmatchedByArea) {
    const totalRevenue = areaMeetups.reduce((sum, m) => sum + m.revenue, 0);
    const areaName = areaMeetups[0]?.area_name || `Area ${areaId}`;

    result.area_unattributed.push({
      area_id: areaId,
      area_name: areaName,
      meetups: areaMeetups,
      meetup_count: areaMeetups.length,
      total_revenue: totalRevenue
    });

    result.total_unattributed_meetups += areaMeetups.length;
    result.total_unattributed_revenue += totalRevenue;
  }

  return result;
}

/**
 * Get match results for multiple clubs at once
 * Used for hierarchy aggregation
 */
export async function matchMultipleClubs(
  clubs: Array<{ club_id: number; club_name: string }>,
  weekStart?: Date,
  weekEnd?: Date
): Promise<Map<number, ClubMatchResult>> {
  const results = new Map<number, ClubMatchResult>();

  // Process clubs in parallel (with reasonable batch size)
  const batchSize = 10;
  for (let i = 0; i < clubs.length; i += batchSize) {
    const batch = clubs.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(club => matchClubMeetups(club.club_id, club.club_name, weekStart, weekEnd))
    );

    for (const result of batchResults) {
      results.set(result.club_id, result);
    }
  }

  return results;
}

export default {
  getClubMeetups,
  getClubTargets,
  matchMeetupToTarget,
  calculateNewProgress,
  calculateRevenueAttribution,
  matchClubMeetups,
  matchMultipleClubs,
  DAY_TYPE_TO_DOW
};
