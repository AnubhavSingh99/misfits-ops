import type { HierarchyNode, ScalingTaskSummary } from '../../../../shared/types';

/**
 * Task Rollup Logic
 *
 * The problem: Tasks are stored flat with activity/city/area/club names,
 * but the hierarchy is nested. Parent nodes need to show aggregated counts
 * from all their descendants.
 *
 * Solution: Build a hierarchical summary map that:
 * 1. Stores direct tasks at each level
 * 2. Computes rolled-up totals by traversing children
 */

// Empty summary for initialization
export const EMPTY_SUMMARY: ScalingTaskSummary = {
  not_started: 0,
  in_progress: 0,
  completed: 0,
  cancelled: 0,
  by_transition: {}
};

/**
 * Merge two summaries together
 */
export function mergeSummaries(
  a: ScalingTaskSummary,
  b: ScalingTaskSummary | null
): ScalingTaskSummary {
  if (!b) return a;
  return {
    not_started: a.not_started + b.not_started,
    in_progress: a.in_progress + b.in_progress,
    completed: a.completed + b.completed,
    cancelled: a.cancelled + b.cancelled,
    by_transition: {} // Don't merge transitions - they're confusing at rolled-up level
  };
}

/**
 * Build a normalized key for task summary lookup
 * Uses lowercase names joined by pipe character
 */
export function buildSummaryKey(
  activityName?: string,
  cityName?: string,
  areaName?: string,
  clubName?: string
): string {
  return [
    activityName?.toLowerCase(),
    cityName?.toLowerCase(),
    areaName?.toLowerCase(),
    clubName?.toLowerCase()
  ].filter(Boolean).join('|');
}

/**
 * Compute rolled-up task summary for a hierarchy node
 *
 * This recursively aggregates:
 * 1. Direct tasks assigned to this node
 * 2. All tasks from descendant nodes
 *
 * @param node - The hierarchy node to compute summary for
 * @param directSummaries - Map of node keys to their direct task summaries
 * @param cache - Memoization cache to avoid recomputation
 */
export function computeRolledUpSummary(
  node: HierarchyNode,
  directSummaries: Record<string, ScalingTaskSummary>,
  cache: Map<string, ScalingTaskSummary> = new Map()
): ScalingTaskSummary {
  // Check cache first
  if (cache.has(node.id)) {
    return cache.get(node.id)!;
  }

  // Target nodes don't have direct tasks - they only aggregate from children
  // Tasks are created at club/area/city/activity level, not at target level
  // Without this check, target nodes would match their parent club's task key
  // and cause duplicate counting (1 task counted for club + each target child)
  if (node.type === 'target') {
    // Targets just pass through children's summaries (if any)
    let summary = { ...EMPTY_SUMMARY };
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        const childSummary = computeRolledUpSummary(child, directSummaries, cache);
        summary = mergeSummaries(summary, childSummary);
      }
    }
    cache.set(node.id, summary);
    return summary;
  }

  // Build key for this node to look up direct tasks
  const nodeKey = buildSummaryKey(
    node.activity_name || (node.type === 'activity' ? node.name : undefined),
    node.city_name || (node.type === 'city' ? node.name : undefined),
    node.area_name || (node.type === 'area' ? node.name : undefined),
    node.club_name || (node.type === 'club' || node.type === 'launch' ? node.name : undefined)
  );

  // Start with direct tasks for this node
  let summary = { ...(directSummaries[nodeKey] || EMPTY_SUMMARY) };

  // Recursively add children's summaries
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      const childSummary = computeRolledUpSummary(child, directSummaries, cache);
      summary = mergeSummaries(summary, childSummary);
    }
  }

  // Cache and return
  cache.set(node.id, summary);
  return summary;
}

/**
 * Build complete summary map with rollups for entire hierarchy
 *
 * Returns a map of node.id -> rolled-up summary
 */
export function buildRolledUpSummaryMap(
  hierarchy: HierarchyNode[],
  directSummaries: Record<string, ScalingTaskSummary>
): Map<string, ScalingTaskSummary> {
  const cache = new Map<string, ScalingTaskSummary>();

  // Process all top-level nodes (this will recursively process all descendants)
  for (const node of hierarchy) {
    computeRolledUpSummary(node, directSummaries, cache);
  }

  return cache;
}

/**
 * Get total task count from a summary
 */
export function getTotalTasks(summary: ScalingTaskSummary | null): number {
  if (!summary) return 0;
  return summary.not_started + summary.in_progress + summary.completed + summary.cancelled;
}

/**
 * Get active (non-completed, non-cancelled) task count
 */
export function getActiveTasks(summary: ScalingTaskSummary | null): number {
  if (!summary) return 0;
  return summary.not_started + summary.in_progress;
}

/**
 * Check if a summary has any tasks
 */
export function hasTasks(summary: ScalingTaskSummary | null): boolean {
  return getTotalTasks(summary) > 0;
}
