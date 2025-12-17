// Gamification Engine - Team Competition System
// Based on PRD v8.1 Section 8.2 - Team Performance & Gamification

import { TeamPerformance, TeamName, Meetup, HealthMetrics, Stage } from '../types/core';

/**
 * Point System Configuration
 */
export const POINT_SYSTEM = {
  // Stage Progression Points
  stage_progression: {
    'not_picked_to_stage_1': 50,
    'stage_1_to_stage_2': 100,
    'stage_2_to_stage_3': 150,
    'stage_3_to_realised': 300, // Biggest reward for going live
  },

  // Revenue Achievement Points
  revenue_achievement: {
    'target_met': 200, // Meeting monthly revenue target
    'target_exceeded_10': 250, // Exceeding by 10%
    'target_exceeded_25': 350, // Exceeding by 25%
    'target_exceeded_50': 500, // Exceeding by 50%
  },

  // Health Improvement Points
  health_improvement: {
    'red_to_yellow': 75,
    'red_to_green': 150,
    'yellow_to_green': 100,
    'maintain_green_week': 25, // Bonus for keeping green status
  },

  // Special Achievements
  special_achievements: {
    'first_meetup_completed': 200,
    'perfect_health_month': 300, // All clubs green for a month
    'revenue_growth_leader': 400, // Highest % growth in period
    'new_club_launched': 250,
    'problem_solver': 100, // Fixing red health issue
  },

  // Penalties
  penalties: {
    'health_degradation': -50, // Green to red
    'revenue_miss_significant': -75, // Missing target by >20%
    'delayed_stage_progression': -25, // Stuck in stage >30 days
  }
};

/**
 * Badge System
 */
export const BADGE_SYSTEM = {
  // Stage Mastery Badges
  'stage_master': {
    name: 'Stage Master',
    description: 'Progressed 10+ clubs through stages in one month',
    icon: '🎯',
    requirement: { stage_progressions: 10, timeframe: 'month' }
  },

  // Revenue Badges
  'revenue_champion': {
    name: 'Revenue Champion',
    description: 'Achieved 150%+ of revenue target',
    icon: '💎',
    requirement: { revenue_achievement: 150 }
  },
  'consistent_performer': {
    name: 'Consistent Performer',
    description: 'Met revenue target 3 months in a row',
    icon: '🔥',
    requirement: { consecutive_targets_met: 3 }
  },

  // Health Badges
  'health_guardian': {
    name: 'Health Guardian',
    description: 'Maintained 90%+ green health rating',
    icon: '🛡️',
    requirement: { green_health_percentage: 90 }
  },
  'turnaround_specialist': {
    name: 'Turnaround Specialist',
    description: 'Improved 5+ red clubs to green',
    icon: '🚀',
    requirement: { health_improvements: 5, from: 'red', to: 'green' }
  },

  // Leadership Badges
  'team_leader': {
    name: 'Team Leader',
    description: 'Led team to #1 position for 2+ months',
    icon: '👑',
    requirement: { team_rank_1_months: 2 }
  },
  'innovation_driver': {
    name: 'Innovation Driver',
    description: 'Launched 3+ new successful clubs',
    icon: '💡',
    requirement: { new_clubs_launched: 3, success_rate: 80 }
  }
};

/**
 * Leaderboard Configuration
 */
export const LEADERBOARD_CONFIG = {
  // Update frequency
  updateFrequency: 'daily', // Points calculated daily

  // Seasons
  seasonLength: 'quarterly', // Reset every quarter

  // Competition categories
  categories: {
    'overall_points': { weight: 1.0, name: 'Overall Performance' },
    'revenue_achievement': { weight: 0.4, name: 'Revenue Excellence' },
    'health_management': { weight: 0.3, name: 'Health Management' },
    'growth_acceleration': { weight: 0.3, name: 'Growth Acceleration' }
  }
};

/**
 * Gamification Engine Class
 */
export class GamificationEngine {

  /**
   * Calculate points for stage progression
   */
  static calculateStageProgressionPoints(
    previousStage: Stage,
    currentStage: Stage,
    meetup: Meetup
  ): number {
    const progression = `${previousStage}_to_${currentStage}`;
    return POINT_SYSTEM.stage_progression[progression as keyof typeof POINT_SYSTEM.stage_progression] || 0;
  }

  /**
   * Calculate points for revenue achievement
   */
  static calculateRevenuePoints(
    actual: number,
    target: number,
    meetup: Meetup
  ): number {
    if (actual < target) {
      const missPercentage = ((target - actual) / target) * 100;
      if (missPercentage > 20) {
        return POINT_SYSTEM.penalties.revenue_miss_significant;
      }
      return 0;
    }

    const exceededPercentage = ((actual - target) / target) * 100;

    if (exceededPercentage >= 50) return POINT_SYSTEM.revenue_achievement.target_exceeded_50;
    if (exceededPercentage >= 25) return POINT_SYSTEM.revenue_achievement.target_exceeded_25;
    if (exceededPercentage >= 10) return POINT_SYSTEM.revenue_achievement.target_exceeded_10;
    return POINT_SYSTEM.revenue_achievement.target_met;
  }

  /**
   * Calculate points for health changes
   */
  static calculateHealthPoints(
    previousHealth: 'green' | 'yellow' | 'red',
    currentHealth: 'green' | 'yellow' | 'red',
    meetup: Meetup
  ): number {
    const change = `${previousHealth}_to_${currentHealth}`;

    // Health improvements
    const improvementPoints = POINT_SYSTEM.health_improvement[change as keyof typeof POINT_SYSTEM.health_improvement] || 0;

    // Maintenance bonus
    if (currentHealth === 'green' && previousHealth === 'green') {
      return POINT_SYSTEM.health_improvement.maintain_green_week;
    }

    // Penalty for degradation
    if (previousHealth === 'green' && currentHealth === 'red') {
      return POINT_SYSTEM.penalties.health_degradation;
    }

    return improvementPoints;
  }

  /**
   * Calculate special achievement points
   */
  static calculateSpecialAchievementPoints(
    achievementType: string,
    context: any
  ): number {
    return POINT_SYSTEM.special_achievements[achievementType as keyof typeof POINT_SYSTEM.special_achievements] || 0;
  }

  /**
   * Calculate team performance metrics
   */
  static calculateTeamPerformance(
    teamName: TeamName,
    meetups: Meetup[],
    healthMetrics: HealthMetrics[],
    pointsHistory: any[]
  ): TeamPerformance {
    const teamMeetups = meetups.filter(m => m.team === teamName);
    const teamHealth = healthMetrics.filter(h =>
      teamMeetups.some(m => m.id === h.meetup_id)
    );

    // Calculate basic metrics
    const totalRevenue = teamMeetups.reduce((sum, m) => sum + (m.metrics.revenue_per_meetup * 30), 0); // Monthly estimate
    const revenueTarget = totalRevenue * 1.2; // 20% growth target

    // Health distribution
    const greenClubs = teamHealth.filter(h => h.overall_health === 'green').length;
    const yellowClubs = teamHealth.filter(h => h.overall_health === 'yellow').length;
    const redClubs = teamHealth.filter(h => h.overall_health === 'red').length;

    // Calculate points from history
    const totalPoints = pointsHistory.reduce((sum, entry) => sum + entry.points, 0);
    const weeklyPoints = pointsHistory
      .filter(entry => this.isThisWeek(entry.created_at))
      .reduce((sum, entry) => sum + entry.points, 0);

    // Calculate achievement percentage
    const achievementPercent = (totalRevenue / revenueTarget) * 100;

    // Determine rank (simplified - in production would compare with other teams)
    const rank = this.calculateRank(totalPoints, achievementPercent);

    // Calculate badges
    const badges = this.calculateBadges(teamName, teamMeetups, teamHealth, pointsHistory);

    return {
      team: teamName,
      leader_name: this.getTeamLeader(teamName),
      total_clubs: teamMeetups.length,
      total_revenue: totalRevenue,
      revenue_target: revenueTarget,
      achievement_percent: achievementPercent,
      points: totalPoints,
      rank: rank,
      badges: badges,
      green_clubs: greenClubs,
      yellow_clubs: yellowClubs,
      red_clubs: redClubs,
      wow_growth: this.calculateWoWGrowth(teamMeetups),
      weekly_points_earned: weeklyPoints,
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Calculate badges earned by team
   */
  static calculateBadges(
    teamName: TeamName,
    meetups: Meetup[],
    healthMetrics: HealthMetrics[],
    pointsHistory: any[]
  ): string[] {
    const badges: string[] = [];

    // Check each badge requirement
    Object.entries(BADGE_SYSTEM).forEach(([badgeKey, badgeInfo]) => {
      if (this.checkBadgeRequirement(badgeInfo.requirement, teamName, meetups, healthMetrics, pointsHistory)) {
        badges.push(badgeInfo.name);
      }
    });

    return badges;
  }

  /**
   * Check if badge requirement is met
   */
  static checkBadgeRequirement(
    requirement: any,
    teamName: TeamName,
    meetups: Meetup[],
    healthMetrics: HealthMetrics[],
    pointsHistory: any[]
  ): boolean {
    // Simplified badge checking - in production would be more sophisticated

    if (requirement.stage_progressions) {
      const progressions = pointsHistory.filter(entry =>
        entry.type === 'stage_progression' &&
        this.isThisMonth(entry.created_at)
      ).length;
      return progressions >= requirement.stage_progressions;
    }

    if (requirement.revenue_achievement) {
      const totalRevenue = meetups.reduce((sum, m) => sum + (m.metrics.revenue_per_meetup * 30), 0);
      const target = totalRevenue * 1.2;
      const achievement = (totalRevenue / target) * 100;
      return achievement >= requirement.revenue_achievement;
    }

    if (requirement.green_health_percentage) {
      const greenCount = healthMetrics.filter(h => h.overall_health === 'green').length;
      const totalCount = healthMetrics.length;
      const percentage = (greenCount / totalCount) * 100;
      return percentage >= requirement.green_health_percentage;
    }

    return false;
  }

  /**
   * Calculate WoW growth for team
   */
  static calculateWoWGrowth(meetups: Meetup[]): number {
    // Simplified calculation - in production would use actual WoW data
    const totalRevenue = meetups.reduce((sum, m) => sum + (m.metrics.revenue_per_meetup * 30), 0);
    return Math.floor(totalRevenue * 0.1); // 10% assumed growth
  }

  /**
   * Get team leader name
   */
  static getTeamLeader(teamName: TeamName): string {
    const leaders = {
      'phoenix': 'Saurabh',
      'rocket': 'Aditya',
      'support': 'Ankit'
    };
    return leaders[teamName];
  }

  /**
   * Calculate team rank (simplified)
   */
  static calculateRank(points: number, achievement: number): 1 | 2 | 3 {
    const score = (points * 0.6) + (achievement * 0.4);
    if (score >= 80) return 1;
    if (score >= 60) return 2;
    return 3;
  }

  /**
   * Helper: Check if date is this week
   */
  static isThisWeek(dateString: string): boolean {
    const date = new Date(dateString);
    const now = new Date();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    return date >= weekStart && date <= now;
  }

  /**
   * Helper: Check if date is this month
   */
  static isThisMonth(dateString: string): boolean {
    const date = new Date(dateString);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }

  /**
   * Generate leaderboard with all teams
   */
  static generateLeaderboard(
    allMeetups: Meetup[],
    allHealthMetrics: HealthMetrics[],
    allPointsHistory: any[]
  ): TeamPerformance[] {
    const teams: TeamName[] = ['phoenix', 'rocket', 'support'];

    const teamPerformances = teams.map(team =>
      this.calculateTeamPerformance(team, allMeetups, allHealthMetrics, allPointsHistory)
    );

    // Sort by points (primary) and achievement percentage (secondary)
    return teamPerformances.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return b.achievement_percent - a.achievement_percent;
    }).map((team, index) => ({
      ...team,
      rank: (index + 1) as 1 | 2 | 3
    }));
  }

  /**
   * Award points for specific action
   */
  static async awardPoints(
    teamName: TeamName,
    points: number,
    reason: string,
    context?: any
  ): Promise<void> {
    const pointsEntry = {
      team: teamName,
      points,
      reason,
      context,
      created_at: new Date().toISOString()
    };

    // In production, would save to database via API
    console.log(`Awarded ${points} points to Team ${teamName}: ${reason}`);
  }

  /**
   * Process daily point calculations
   */
  static async processDailyPoints(
    allMeetups: Meetup[],
    wowData: any[],
    healthChanges: any[]
  ): Promise<void> {
    // Process stage progressions
    for (const wow of wowData) {
      if (wow.stage_changed) {
        const meetup = allMeetups.find(m => m.id === wow.meetup_id);
        if (meetup) {
          const points = this.calculateStageProgressionPoints(
            wow.previous_stage,
            wow.current_stage,
            meetup
          );
          if (points > 0) {
            await this.awardPoints(
              meetup.team,
              points,
              `Stage progression: ${wow.previous_stage} → ${wow.current_stage}`,
              { meetup_id: meetup.id }
            );
          }
        }
      }

      // Process revenue changes
      if (wow.revenue_change !== 0) {
        const meetup = allMeetups.find(m => m.id === wow.meetup_id);
        if (meetup) {
          const points = this.calculateRevenuePoints(
            wow.revenue_this_week,
            meetup.metrics.revenue_per_meetup * 1.2, // 20% target increase
            meetup
          );
          if (points !== 0) {
            await this.awardPoints(
              meetup.team,
              points,
              `Revenue ${points > 0 ? 'achievement' : 'miss'}`,
              { meetup_id: meetup.id, revenue_change: wow.revenue_change }
            );
          }
        }
      }
    }

    // Process health changes
    for (const healthChange of healthChanges) {
      const meetup = allMeetups.find(m => m.id === healthChange.meetup_id);
      if (meetup) {
        const points = this.calculateHealthPoints(
          healthChange.previous_health,
          healthChange.current_health,
          meetup
        );
        if (points !== 0) {
          await this.awardPoints(
            meetup.team,
            points,
            `Health ${points > 0 ? 'improvement' : 'degradation'}`,
            { meetup_id: meetup.id }
          );
        }
      }
    }
  }
}

export default GamificationEngine;