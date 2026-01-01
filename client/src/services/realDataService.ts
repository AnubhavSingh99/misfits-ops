// Real Data Service - Integration with Actual Misfits Database
// Based on your Club Health Report Generation Script requirements

import { SystemState, HealthMetrics, Meetup } from '../types/core';
import { API_URL } from '../config/api';

/**
 * Revenue calculation based on actual database queries
 * Replaces hardcoded ₹42L with real database values
 */
export class RealDataService {

  /**
   * Calculate actual current revenue from database
   * Based on your CLAUDE.md database queries
   */
  static async getCurrentRevenue(): Promise<{
    current_revenue: number;
    target_revenue: number;
    progress_percentage: number;
  }> {
    try {
      const response = await fetch(`${API_URL}/api/revenue`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Revenue API request failed');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Revenue calculation failed');
      }

      return {
        current_revenue: result.data.current_revenue,
        target_revenue: result.data.target_revenue,
        progress_percentage: result.data.progress_percentage
      };

    } catch (error) {
      console.error('Failed to fetch real revenue:', error);
      throw new Error('Revenue data unavailable');
    }
  }

  /**
   * Get club health distribution from database
   * Using the 4-metric system from Club Health Report Script
   */
  static async getHealthDistribution(): Promise<{
    green: number;
    yellow: number;
    red: number;
    total: number;
  }> {
    try {
      const response = await fetch(`${API_URL}/api/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Health API request failed');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Health calculation failed');
      }

      return result.data.distribution;

    } catch (error) {
      console.error('Failed to fetch health distribution:', error);
      throw new Error('Health data unavailable');
    }
  }

  /**
   * Get active meetup count from database
   */
  static async getActiveMeetupCount(): Promise<{
    active_meetups: number;
    target_meetups: number;
    progress_percentage: number;
  }> {
    try {
      const response = await fetch(`${API_URL}/api/meetups`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Meetup API request failed');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Meetup calculation failed');
      }

      return {
        active_meetups: result.data.active_meetups,
        target_meetups: result.data.target_meetups,
        progress_percentage: result.data.progress_percentage
      };

    } catch (error) {
      console.error('Failed to fetch meetup count:', error);
      throw new Error('Meetup data unavailable');
    }
  }

  /**
   * Get system state using real data from Club Health Report calculations
   */
  static async getSystemState(): Promise<SystemState> {
    try {
      // Fetch all real data in parallel
      const [revenueData, healthData, meetupData] = await Promise.all([
        this.getCurrentRevenue(),
        this.getHealthDistribution(),
        this.getActiveMeetupCount()
      ]);

      // Generate critical alerts based on real health issues
      const criticalAlerts = await this.generateCriticalAlerts(healthData);

      return {
        current_revenue: revenueData.current_revenue,
        target_revenue: revenueData.target_revenue,
        progress_percentage: revenueData.progress_percentage,

        active_meetups: meetupData.active_meetups,
        target_meetups: meetupData.target_meetups,
        meetup_progress_percentage: meetupData.progress_percentage,

        health_distribution: healthData,

        critical_alerts: criticalAlerts,

        last_updated: new Date().toISOString(),
        updates_count_today: Math.floor(Math.random() * 50) + 20 // Simulated for now
      };

    } catch (error) {
      console.error('Failed to get real system state:', error);
      throw error;
    }
  }

  /**
   * Generate critical alerts based on real health data
   */
  static async generateCriticalAlerts(healthData: any): Promise<any[]> {
    const alerts = [];
    const now = new Date().toISOString();

    // Alert if too many red clubs
    if (healthData.red > healthData.total * 0.15) { // More than 15% red
      alerts.push({
        id: `health_red_high_${Date.now()}`,
        type: 'health' as const,
        severity: 'high' as const,
        message: `${healthData.red} clubs in critical health - immediate intervention needed`,
        created_at: now
      });
    }

    // Alert if health distribution is skewed
    const greenPercentage = (healthData.green / healthData.total) * 100;
    if (greenPercentage < 60) {
      alerts.push({
        id: `health_green_low_${Date.now()}`,
        type: 'health' as const,
        severity: 'medium' as const,
        message: `Only ${greenPercentage.toFixed(1)}% clubs are healthy - need improvement plan`,
        created_at: now
      });
    }

    return alerts.slice(0, 5); // Limit to 5 alerts
  }

  /**
   * Query builder for custom database queries
   * Integrates with your Club Health Report Script logic
   */
  static async executeQuery(query: string): Promise<any> {
    try {
      const response = await fetch(`${API_URL}/api/database/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      if (!response.ok) {
        throw new Error('Database query failed');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Query execution failed');
      }

      return result;

    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  /**
   * Health calculation based on your Club Health Report Script
   * 4-metric system: Capacity, Repeat, Rating, Revenue
   */
  static calculateClubHealth(metrics: {
    capacity_utilization: number;  // % of capacity filled
    repeat_rate: number;          // % of repeat attendees
    avg_rating: number;           // Average rating 1-5
    revenue_per_meetup: number;   // Revenue per meetup
    target_revenue: number;       // Target revenue
  }): 'green' | 'yellow' | 'red' {

    let score = 0;

    // Capacity utilization (25% weight)
    if (metrics.capacity_utilization >= 80) score += 25;
    else if (metrics.capacity_utilization >= 60) score += 15;
    else if (metrics.capacity_utilization >= 40) score += 8;

    // Repeat rate (25% weight)
    if (metrics.repeat_rate >= 70) score += 25;
    else if (metrics.repeat_rate >= 50) score += 15;
    else if (metrics.repeat_rate >= 30) score += 8;

    // Rating (20% weight)
    if (metrics.avg_rating >= 4.0) score += 20;
    else if (metrics.avg_rating >= 3.5) score += 12;
    else if (metrics.avg_rating >= 3.0) score += 6;

    // Revenue achievement (30% weight)
    const revenueAchievement = (metrics.revenue_per_meetup / metrics.target_revenue) * 100;
    if (revenueAchievement >= 90) score += 30;
    else if (revenueAchievement >= 70) score += 20;
    else if (revenueAchievement >= 50) score += 10;

    // Health classification based on total score
    if (score >= 75) return 'green';
    if (score >= 50) return 'yellow';
    return 'red';
  }

  /**
   * WoW Comments Methods - For historical tracking and persistent storage
   */

  /**
   * Get historical WoW comments from database
   */
  static async getWoWComments(clubName?: string): Promise<any> {
    try {
      const url = clubName
        ? `${API_URL}/api/database/wow-comments?club_name=${encodeURIComponent(clubName)}`
        : `${API_URL}/api/database/wow-comments`;

      const response = await fetch(url);
      const result = await response.json();

      if (result.success) {
        return result.data.historical_comments;
      } else {
        throw new Error(result.error || 'Failed to fetch WoW comments');
      }
    } catch (error) {
      console.error('Failed to fetch WoW comments:', error);
      throw new Error('WoW comments data unavailable');
    }
  }

  /**
   * Save WoW comment to database
   */
  static async saveWoWComment(
    clubName: string,
    weekLabel: string,
    comment: string,
    blocker: string = '',
    actionTaken: string = ''
  ): Promise<boolean> {
    try {
      const response = await fetch(`${API_URL}/api/database/wow-comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          club_name: clubName,
          week_label: weekLabel,
          comment: comment,
          blocker: blocker,
          action_taken: actionTaken
        })
      });

      const result = await response.json();

      if (result.success) {
        return true;
      } else {
        console.error('Failed to save WoW comment:', result.error);
        return false;
      }
    } catch (error) {
      console.error('Failed to save WoW comment:', error);
      return false;
    }
  }
}

export default RealDataService;