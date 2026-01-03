// Health Calculation Engine - 4-Metric System
// Based on PRD v8.1 Section 6.1
// Simplified for backend use

export type HealthStatus = 'green' | 'yellow' | 'red';

/**
 * Health Thresholds Configuration (Updated per requirements)
 */
export const HEALTH_THRESHOLDS = {
  capacity_utilization: {
    green: 75, // >=75% utilization = green
    yellow: 50, // 50-74% = yellow
    // <50% = red
  },
  repeat_rate: {
    green: 65, // >=65% repeat attendance = green
    yellow: 50, // 50-64% = yellow
    // <50% = red
  },
  avg_rating: {
    green: 4.0, // >=4.0 rating = green (average of total ratings in last week)
    yellow: 3.5, // 3.5-3.9 = yellow
    // <3.5 = red
  },
  revenue_achievement: {
    green: 90, // 90%+ of revenue target = green
    yellow: 70, // 70-89% = yellow
    // <70% = red - NOT USED in traffic light system
  }
};

/**
 * Auto-Issue Detection Patterns
 */
export const ISSUE_PATTERNS = {
  low_capacity: {
    condition: (metrics: any) => metrics.capacity_utilization < 40,
    message: 'Very low attendance - venue or timing issues likely'
  },
  declining_repeat: {
    condition: (metrics: any) => metrics.repeat_rate < 30,
    message: 'Low repeat rate - member experience needs improvement'
  },
  poor_rating: {
    condition: (metrics: any) => metrics.avg_rating < 3.0,
    message: 'Poor ratings - leader or content quality issues'
  },
  revenue_miss: {
    condition: (metrics: any) => metrics.revenue_achievement < 50,
    message: 'Severe revenue underperformance - pricing or demand issues'
  }
};

/**
 * Calculate Health Status for Individual Metric
 */
function calculateMetricHealth(
  value: number,
  thresholds: { green: number; yellow: number },
  isHigherBetter: boolean = true
): HealthStatus {
  if (isHigherBetter) {
    if (value >= thresholds.green) return 'green';
    if (value >= thresholds.yellow) return 'yellow';
    return 'red';
  } else {
    // For metrics where lower is better (none in current system)
    if (value <= thresholds.green) return 'green';
    if (value <= thresholds.yellow) return 'yellow';
    return 'red';
  }
}

/**
 * Calculate Overall Health Score (0-100) - Updated weights per requirements
 */
function calculateOverallHealthScore(metrics: {
  capacity_utilization: number;
  repeat_rate: number;
  avg_rating: number;
  revenue_achievement: number;
  is_new_club?: boolean;
}): number {
  const weights = metrics.is_new_club
    ? {
        capacity_utilization: 0.6, // 60% weight for new clubs
        repeat_rate: 0.0, // 0% weight - not a factor for new clubs
        avg_rating: 0.4, // 40% weight for new clubs
        revenue_achievement: 0.0 // Not used in overall score
      }
    : {
        capacity_utilization: 0.3, // 30% weight
        repeat_rate: 0.4, // 40% weight - retention matters most
        avg_rating: 0.3, // 30% weight - quality indicator
        revenue_achievement: 0.0 // Not used in overall score
      };

  let totalScore = 0;
  totalScore += (metrics.capacity_utilization / 100) * weights.capacity_utilization * 100;
  totalScore += (metrics.repeat_rate / 100) * weights.repeat_rate * 100;
  totalScore += (metrics.avg_rating / 5) * weights.avg_rating * 100; // Rating out of 5
  // Revenue not included in overall score as per requirements

  return Math.round(totalScore);
}

/**
 * Calculate Overall Health Status (excluding revenue from traffic light system)
 */
function calculateOverallHealth(
  capacity: HealthStatus,
  repeat: HealthStatus,
  rating: HealthStatus,
  isNewClub: boolean = false
): HealthStatus {
  const statusValues = { red: 0, yellow: 1, green: 2 };

  // For new clubs, only consider capacity and rating
  const scores = isNewClub
    ? [capacity, rating].map(s => statusValues[s])
    : [capacity, repeat, rating].map(s => statusValues[s]);

  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  // If any metric is red, overall cannot be green
  const hasRed = scores.includes(0);

  if (hasRed && avgScore < 1.5) return 'red';
  if (avgScore >= 1.5) return hasRed ? 'yellow' : 'green';
  return 'yellow';
}

/**
 * Detect Auto-Issues
 */
function detectIssues(metrics: any): string[] {
  const issues: string[] = [];

  for (const [key, pattern] of Object.entries(ISSUE_PATTERNS)) {
    if (pattern.condition(metrics)) {
      issues.push(pattern.message);
    }
  }

  return issues;
}

/**
 * Main Club Health Calculation Function
 * Updated to use last week data and new requirements
 */
export function calculateClubHealth(clubData: {
  club_id: string;
  club_name: string;
  club_status: string;
  activity: string;
  club_created_date?: string;
  capacity_percentage: number;
  repeat_rate_percentage: number;
  avg_rating: number;
  weekly_revenue: number; // Changed from monthly_revenue to weekly_revenue
  monthly_revenue_target?: number; // Monthly target for calculation
  last_week_capacity_percentage?: number;
  last_week_repeat_rate_percentage?: number;
  last_week_avg_rating?: number;
  last_week_revenue?: number;
}): any {
  const now = new Date();

  // Check if club is new (less than 2 months old)
  const clubCreatedDate = clubData.club_created_date ? new Date(clubData.club_created_date) : null;
  const isNewClub = clubCreatedDate ?
    (now.getTime() - clubCreatedDate.getTime()) < (2 * 30 * 24 * 60 * 60 * 1000) : false;

  // Calculate revenue achievement: 4 * weekly_revenue / monthly_target
  const monthlyTarget = clubData.monthly_revenue_target || 20000; // Default 200 rupees = 20000 paisa
  const projectedMonthlyRevenue = clubData.weekly_revenue * 4;
  const revenueAchievement = (projectedMonthlyRevenue / monthlyTarget) * 100;

  // Calculate individual metric health
  const capacityHealth = calculateMetricHealth(
    clubData.capacity_percentage,
    HEALTH_THRESHOLDS.capacity_utilization
  );

  const repeatHealth = isNewClub ? 'green' : calculateMetricHealth(
    clubData.repeat_rate_percentage,
    HEALTH_THRESHOLDS.repeat_rate
  );

  const ratingHealth = calculateMetricHealth(
    clubData.avg_rating,
    HEALTH_THRESHOLDS.avg_rating
  );

  const revenueHealth = calculateMetricHealth(
    revenueAchievement,
    HEALTH_THRESHOLDS.revenue_achievement
  );

  // Build metrics object
  const metricsObj = {
    capacity_utilization: clubData.capacity_percentage,
    repeat_rate: isNewClub ? 0 : clubData.repeat_rate_percentage,
    avg_rating: clubData.avg_rating,
    revenue_achievement: revenueAchievement,
    is_new_club: isNewClub
  };

  // Calculate overall health (excluding revenue from traffic light system)
  const overallHealth = calculateOverallHealth(
    capacityHealth,
    repeatHealth as HealthStatus,
    ratingHealth,
    isNewClub
  );

  const healthScore = calculateOverallHealthScore(metricsObj);

  // Detect issues (modified for new clubs)
  const autoDetectedIssues = detectIssues({
    ...metricsObj,
    repeat_rate: isNewClub ? 100 : metricsObj.repeat_rate, // Don't flag repeat rate issues for new clubs
    revenue_achievement: 100 // Revenue should never be a factor for health (for any club)
  });

  // Determine health status for UI - dormant takes priority over capacity health
  let healthStatusForUI = 'healthy';
  if (clubData.club_status === 'INACTIVE') {
    healthStatusForUI = 'inactive';
  } else if (clubData.is_dormant) {
    // Dormant = 1 week no events (but had events 2 weeks ago)
    healthStatusForUI = 'dormant';
  } else if (capacityHealth === 'red') {
    // Critical = Red capacity health OR 2+ weeks without events
    healthStatusForUI = 'critical';
  } else if (capacityHealth === 'yellow') {
    // At Risk = Yellow capacity health
    healthStatusForUI = 'at_risk';
  } else if (capacityHealth === 'green') {
    // Healthy = Green capacity health
    healthStatusForUI = 'healthy';
  }

  // Determine capacity health color
  let capacityHealthColor = 'Gray';
  if (clubData.club_status === 'INACTIVE') {
    capacityHealthColor = 'Gray';
  } else if (capacityHealth === 'green') {
    capacityHealthColor = 'Green';
  } else if (capacityHealth === 'yellow') {
    capacityHealthColor = 'Yellow';
  } else {
    capacityHealthColor = 'Red';
  }

  return {
    ...clubData,
    capacity: Math.round(clubData.capacity_percentage || 0),
    capacity_health: capacityHealthColor,
    repeat_rate: Math.round(isNewClub ? 0 : clubData.repeat_rate_percentage || 0),
    rating: parseFloat((Number(clubData.avg_rating) || 0).toFixed(1)),
    revenue: Math.round(clubData.weekly_revenue || 0), // Show weekly revenue in paisa
    health_status: healthStatusForUI,
    health_score: healthScore,
    auto_detected_issues: autoDetectedIssues,
    requires_attention: overallHealth === 'red' || autoDetectedIssues.length > 0,
    is_new_club: isNewClub,
    revenue_achievement_pct: Math.round(revenueAchievement),
    week_over_week_change: {
      capacity: clubData.last_week_capacity_percentage ?
        clubData.capacity_percentage - clubData.last_week_capacity_percentage : 0,
      repeat: clubData.last_week_repeat_rate_percentage && !isNewClub ?
        clubData.repeat_rate_percentage - clubData.last_week_repeat_rate_percentage : 0,
      rating: clubData.last_week_avg_rating ?
        clubData.avg_rating - clubData.last_week_avg_rating : 0,
      revenue: clubData.last_week_revenue ?
        clubData.weekly_revenue - clubData.last_week_revenue : 0
    }
  };
}

/**
 * Calculate System Health Overview
 */
export function calculateSystemHealth(clubs: any[]): {
  total_clubs: number;
  active_clubs: number;
  inactive_clubs: number;
  healthy_clubs: number;
  at_risk_clubs: number;
  critical_clubs: number;
  dormant_clubs: number;
  avg_health_score: number;
  total_revenue: number;
  avg_rating: number;
} {
  const totalClubs = clubs.length;
  const activeClubs = clubs.filter(c => c.club_status === 'ACTIVE').length;
  const inactiveClubs = clubs.filter(c => c.club_status === 'INACTIVE').length;

  const healthyClubs = clubs.filter(c => c.health_status === 'healthy').length;
  const atRiskClubs = clubs.filter(c => c.health_status === 'at_risk').length;
  const criticalClubs = clubs.filter(c => c.health_status === 'critical').length;
  const dormantClubs = clubs.filter(c => c.health_status === 'dormant').length;

  const avgHealthScore = totalClubs > 0
    ? Math.round(clubs.reduce((sum, c) => sum + (c.health_score || 0), 0) / totalClubs)
    : 0;

  const totalRevenue = clubs.reduce((sum, c) => sum + (c.revenue || 0), 0);

  const avgRating = totalClubs > 0
    ? parseFloat((clubs.reduce((sum, c) => sum + (c.rating || 0), 0) / totalClubs).toFixed(1))
    : 0;

  return {
    total_clubs: totalClubs,
    active_clubs: activeClubs,
    inactive_clubs: inactiveClubs,
    healthy_clubs: healthyClubs,
    at_risk_clubs: atRiskClubs,
    critical_clubs: criticalClubs,
    dormant_clubs: dormantClubs,
    avg_health_score: avgHealthScore,
    total_revenue: totalRevenue,
    avg_rating: avgRating
  };
}