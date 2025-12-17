// Health Calculation Engine - 4-Metric System
// Based on PRD v8.1 Section 6.1

import { HealthMetrics, HealthStatus, Meetup } from '../types/core';

/**
 * Health Thresholds Configuration (PRD Section 6.1)
 */
export const HEALTH_THRESHOLDS = {
  capacity_utilization: {
    green: 80, // 80%+ utilization = green
    yellow: 60, // 60-79% = yellow
    // <60% = red
  },
  repeat_rate: {
    green: 70, // 70%+ repeat attendance = green
    yellow: 50, // 50-69% = yellow
    // <50% = red
  },
  avg_rating: {
    green: 4.0, // 4.0+ rating = green
    yellow: 3.5, // 3.5-3.9 = yellow
    // <3.5 = red
  },
  revenue_achievement: {
    green: 90, // 90%+ of revenue target = green
    yellow: 70, // 70-89% = yellow
    // <70% = red
  }
};

/**
 * Auto-Issue Detection Patterns
 */
export const ISSUE_PATTERNS = {
  low_capacity: {
    condition: (metrics: any) => metrics.capacity_utilization.value < 40,
    message: 'Very low attendance - venue or timing issues likely'
  },
  declining_repeat: {
    condition: (metrics: any) => metrics.repeat_rate.value < 30,
    message: 'Low repeat rate - member experience needs improvement'
  },
  poor_rating: {
    condition: (metrics: any) => metrics.avg_rating.value < 3.0,
    message: 'Poor ratings - leader or content quality issues'
  },
  revenue_miss: {
    condition: (metrics: any) => metrics.revenue_per_meetup.achievement_percent < 50,
    message: 'Severe revenue underperformance - pricing or demand issues'
  },
  multiple_red: {
    condition: (metrics: any) => {
      const redMetrics = [
        metrics.capacity_utilization.status === 'red',
        metrics.repeat_rate.status === 'red',
        metrics.avg_rating.status === 'red',
        metrics.revenue_per_meetup.status === 'red'
      ].filter(Boolean).length;
      return redMetrics >= 2;
    },
    message: 'Multiple critical issues - requires immediate intervention'
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
 * Calculate Overall Health Score (0-100)
 */
function calculateOverallHealthScore(metrics: {
  capacity_utilization: { status: HealthStatus; value: number };
  repeat_rate: { status: HealthStatus; value: number };
  avg_rating: { status: HealthStatus; value: number };
  revenue_per_meetup: { status: HealthStatus; achievement_percent: number };
}): number {
  const weights = {
    capacity_utilization: 0.3, // 30% weight - attendance is key
    repeat_rate: 0.25, // 25% weight - retention matters
    avg_rating: 0.20, // 20% weight - quality indicator
    revenue_per_meetup: 0.25 // 25% weight - revenue achievement
  };

  let totalScore = 0;
  totalScore += (metrics.capacity_utilization.value / 100) * weights.capacity_utilization * 100;
  totalScore += (metrics.repeat_rate.value / 100) * weights.repeat_rate * 100;
  totalScore += (metrics.avg_rating.value / 5) * weights.avg_rating * 100; // Rating out of 5
  totalScore += (metrics.revenue_per_meetup.achievement_percent / 100) * weights.revenue_per_meetup * 100;

  return Math.round(totalScore);
}

/**
 * Calculate Overall Health Status
 */
function calculateOverallHealth(
  capacity: HealthStatus,
  repeat: HealthStatus,
  rating: HealthStatus,
  revenue: HealthStatus
): HealthStatus {
  const statusValues = { red: 0, yellow: 1, green: 2 };
  const scores = [capacity, repeat, rating, revenue].map(s => statusValues[s]);
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
 * Main Health Calculation Function
 * Calculates comprehensive health metrics for a meetup
 */
export function calculateMeetupHealth(
  meetup: Meetup,
  attendanceData: {
    capacity_utilization: number;
    repeat_rate: number;
    avg_rating: number;
    recent_revenue_per_meetup: number;
    revenue_target: number;
  }
): HealthMetrics {
  const now = new Date().toISOString();

  // Calculate individual metric health
  const capacityHealth = calculateMetricHealth(
    attendanceData.capacity_utilization,
    HEALTH_THRESHOLDS.capacity_utilization
  );

  const repeatHealth = calculateMetricHealth(
    attendanceData.repeat_rate,
    HEALTH_THRESHOLDS.repeat_rate
  );

  const ratingHealth = calculateMetricHealth(
    attendanceData.avg_rating,
    HEALTH_THRESHOLDS.avg_rating
  );

  const revenueAchievement = (attendanceData.recent_revenue_per_meetup / attendanceData.revenue_target) * 100;
  const revenueHealth = calculateMetricHealth(
    revenueAchievement,
    HEALTH_THRESHOLDS.revenue_achievement
  );

  // Build metrics object
  const metricsObj = {
    capacity_utilization: {
      value: attendanceData.capacity_utilization,
      threshold_green: HEALTH_THRESHOLDS.capacity_utilization.green,
      threshold_yellow: HEALTH_THRESHOLDS.capacity_utilization.yellow,
      status: capacityHealth,
    },
    repeat_rate: {
      value: attendanceData.repeat_rate,
      threshold_green: HEALTH_THRESHOLDS.repeat_rate.green,
      threshold_yellow: HEALTH_THRESHOLDS.repeat_rate.yellow,
      status: repeatHealth,
    },
    avg_rating: {
      value: attendanceData.avg_rating,
      threshold_green: HEALTH_THRESHOLDS.avg_rating.green,
      threshold_yellow: HEALTH_THRESHOLDS.avg_rating.yellow,
      status: ratingHealth,
    },
    revenue_per_meetup: {
      value: attendanceData.recent_revenue_per_meetup,
      target: attendanceData.revenue_target,
      achievement_percent: revenueAchievement,
      status: revenueHealth,
    },
  };

  // Calculate overall health
  const overallHealth = calculateOverallHealth(
    capacityHealth,
    repeatHealth,
    ratingHealth,
    revenueHealth
  );

  const healthScore = calculateOverallHealthScore(metricsObj);

  // Detect issues
  const autoDetectedIssues = detectIssues(metricsObj);
  const requiresAttention = overallHealth === 'red' || autoDetectedIssues.length > 0;

  return {
    meetup_id: meetup.id,
    calculated_at: now,
    capacity_utilization: metricsObj.capacity_utilization,
    repeat_rate: metricsObj.repeat_rate,
    avg_rating: metricsObj.avg_rating,
    revenue_per_meetup: metricsObj.revenue_per_meetup,
    overall_health: overallHealth,
    health_score: healthScore,
    auto_detected_issues: autoDetectedIssues,
    requires_attention: requiresAttention,
  };
}

/**
 * Aggregate Health for Multiple Meetups (Club Level)
 */
export function aggregateClubHealth(meetupHealths: HealthMetrics[]): {
  distribution: { green: number; yellow: number; red: number };
  overall_health: HealthStatus;
  avg_health_score: number;
  critical_meetups: HealthMetrics[];
  total_issues: string[];
} {
  if (meetupHealths.length === 0) {
    return {
      distribution: { green: 0, yellow: 0, red: 0 },
      overall_health: 'red',
      avg_health_score: 0,
      critical_meetups: [],
      total_issues: []
    };
  }

  // Calculate distribution
  const distribution = {
    green: meetupHealths.filter(m => m.overall_health === 'green').length,
    yellow: meetupHealths.filter(m => m.overall_health === 'yellow').length,
    red: meetupHealths.filter(m => m.overall_health === 'red').length,
  };

  // Calculate overall club health
  const redPercentage = distribution.red / meetupHealths.length;
  const greenPercentage = distribution.green / meetupHealths.length;

  let overallHealth: HealthStatus = 'green';
  if (redPercentage >= 0.3) overallHealth = 'red'; // 30%+ red meetups = red club
  else if (greenPercentage < 0.5) overallHealth = 'yellow'; // <50% green = yellow club

  // Calculate average health score
  const avgHealthScore = Math.round(
    meetupHealths.reduce((sum, m) => sum + m.health_score, 0) / meetupHealths.length
  );

  // Get critical meetups
  const criticalMeetups = meetupHealths.filter(m =>
    m.overall_health === 'red' || m.auto_detected_issues.length > 0
  );

  // Aggregate all issues
  const allIssues = meetupHealths.flatMap(m => m.auto_detected_issues);
  const uniqueIssues = [...new Set(allIssues)];

  return {
    distribution,
    overall_health: overallHealth,
    avg_health_score: avgHealthScore,
    critical_meetups: criticalMeetups,
    total_issues: uniqueIssues
  };
}

/**
 * Real-time Health Monitoring
 * Returns system-wide health overview for dashboard
 */
export function calculateSystemHealth(allMeetups: Meetup[], allHealthMetrics: HealthMetrics[]): {
  total_meetups: number;
  health_distribution: { green: number; yellow: number; red: number; total: number };
  critical_alerts: {
    id: string;
    type: 'health' | 'revenue' | 'stage' | 'general';
    severity: 'high' | 'medium' | 'low';
    message: string;
    meetup_id: string;
    created_at: string;
  }[];
  avg_system_health_score: number;
} {
  const now = new Date().toISOString();

  // Calculate distribution
  const distribution = {
    green: allHealthMetrics.filter(m => m.overall_health === 'green').length,
    yellow: allHealthMetrics.filter(m => m.overall_health === 'yellow').length,
    red: allHealthMetrics.filter(m => m.overall_health === 'red').length,
    total: allHealthMetrics.length,
  };

  // Generate critical alerts
  const alerts = allHealthMetrics
    .filter(m => m.requires_attention)
    .map(m => ({
      id: `health_${m.meetup_id}_${Date.now()}`,
      type: 'health' as const,
      severity: (m.overall_health === 'red' ? 'high' : 'medium') as const,
      message: m.auto_detected_issues[0] || `Meetup ${m.meetup_id} needs attention`,
      meetup_id: m.meetup_id,
      created_at: now,
    }));

  // Calculate system average
  const avgSystemScore = allHealthMetrics.length > 0
    ? Math.round(allHealthMetrics.reduce((sum, m) => sum + m.health_score, 0) / allHealthMetrics.length)
    : 0;

  return {
    total_meetups: allMeetups.length,
    health_distribution: distribution,
    critical_alerts: alerts,
    avg_system_health_score: avgSystemScore,
  };
}

/**
 * Export health calculation utilities
 */
export const healthEngine = {
  calculateMeetupHealth,
  aggregateClubHealth,
  calculateSystemHealth,
  HEALTH_THRESHOLDS,
  ISSUE_PATTERNS,
};