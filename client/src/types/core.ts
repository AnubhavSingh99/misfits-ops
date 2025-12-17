// Core Domain Types for Misfits Operations Platform
// Based on PRD v8.1 - Meetup-Centric Architecture

export type Stage = 'not_picked' | 'stage_1' | 'stage_2' | 'stage_3' | 'realised';

export type HealthStatus = 'green' | 'yellow' | 'red';

export type POCType = 'activity_head' | 'city_head';

export type TeamName = 'phoenix' | 'rocket' | 'support';

// Core Entities

/**
 * Meetup - Primary Revenue Unit (PRD Section 4.1)
 * This is the fundamental unit of the business model
 */
export interface Meetup {
  id: string;
  code: string; // e.g., "MUM-RUN-001"

  // Basic Info
  name: string;
  activity: string;
  city: string;
  location: string;

  // Revenue & Capacity
  price: number; // in rupees
  capacity: number;
  frequency: 'weekly' | 'bi_weekly' | 'monthly';

  // Stage & Health
  stage: Stage;
  health: HealthStatus;

  // Ownership (Dual POC Structure)
  activity_head_id: string;
  city_head_id: string;
  team: TeamName;

  // Performance Metrics (4-Metric System)
  metrics: {
    capacity_utilization: number; // percentage
    repeat_rate: number; // percentage
    avg_rating: number; // 1-5 scale
    revenue_per_meetup: number; // rupees
  };

  // Timestamps
  created_at: string;
  updated_at: string;
  last_meetup_date?: string;
  next_meetup_date?: string;
}

/**
 * Club - Container for Multiple Meetups (PRD Section 4.2)
 * Aggregation layer for reporting and management
 */
export interface Club {
  id: string;
  name: string;
  activity: string;
  city: string;

  // Aggregated from Meetups
  total_meetups: number;
  total_revenue: number;
  avg_health_score: number;
  overall_health: HealthStatus;

  // Ownership
  activity_head_id: string;
  city_head_id: string;
  team: TeamName;

  // Meta
  created_at: string;
  updated_at: string;
}

/**
 * POC (Point of Contact) - Dual Structure (PRD Section 5.1)
 */
export interface POC {
  id: string;
  name: string;
  type: POCType;

  // Specialization
  activities?: string[]; // For Activity Heads
  cities?: string[]; // For City Heads

  // Performance
  total_clubs: number;
  total_revenue: number;
  team: TeamName;
  performance_score: number;

  // Contact
  email: string;
  phone?: string;

  created_at: string;
}

/**
 * WoW Tracking - Week over Week Progress (PRD Section 7.3)
 */
export interface WoWTracking {
  id: string;
  meetup_id: string;
  week_number: number;
  year: number;

  // Stage Progression
  previous_stage: Stage;
  current_stage: Stage;
  stage_changed: boolean;

  // Revenue Tracking
  revenue_last_week: number;
  revenue_this_week: number;
  revenue_change: number;
  revenue_change_percent: number;

  // Comments System (Key Feature)
  comment: string; // What happened this week
  action_taken?: string; // What was done
  blocker?: string; // What's preventing progress
  next_steps?: string; // Planned actions

  // Health Changes
  health_last_week: HealthStatus;
  health_this_week: HealthStatus;
  health_changed: boolean;

  // Metadata
  updated_by: string;
  updated_at: string;
}

/**
 * Health Metrics - 4-Metric System (PRD Section 6.1)
 */
export interface HealthMetrics {
  meetup_id: string;
  calculated_at: string;

  // Core 4 Metrics
  capacity_utilization: {
    value: number;
    threshold_green: 80;
    threshold_yellow: 60;
    status: HealthStatus;
  };

  repeat_rate: {
    value: number;
    threshold_green: 70;
    threshold_yellow: 50;
    status: HealthStatus;
  };

  avg_rating: {
    value: number;
    threshold_green: 4.0;
    threshold_yellow: 3.5;
    status: HealthStatus;
  };

  revenue_per_meetup: {
    value: number;
    target: number;
    achievement_percent: number;
    status: HealthStatus;
  };

  // Overall Health
  overall_health: HealthStatus;
  health_score: number; // 0-100

  // Issues Detection
  auto_detected_issues: string[];
  requires_attention: boolean;
}

/**
 * Revenue Analytics - Growth Attribution (PRD Section 6.2)
 */
export interface RevenueGrowth {
  period_start: string;
  period_end: string;
  compare_period_start: string;
  compare_period_end: string;

  current_revenue: number;
  previous_revenue: number;
  growth_amount: number;
  growth_percentage: number;

  // Attribution
  growth_from_existing: number;
  growth_from_new: number;
  existing_contribution_percent: number;
  new_contribution_percent: number;

  // Top Performers
  top_performers: {
    meetup_id: string;
    meetup_name: string;
    growth_amount: number;
    growth_percentage: number;
  }[];

  // Needs Attention
  declining_meetups: {
    meetup_id: string;
    meetup_name: string;
    decline_amount: number;
    decline_percentage: number;
  }[];
}

/**
 * Team Performance - Gamification (PRD Section 8.2)
 */
export interface TeamPerformance {
  team: TeamName;
  leader_name: string;

  // Performance Metrics
  total_clubs: number;
  total_revenue: number;
  revenue_target: number;
  achievement_percent: number;

  // Gamification
  points: number;
  rank: 1 | 2 | 3;
  badges: string[];

  // Health Distribution
  green_clubs: number;
  yellow_clubs: number;
  red_clubs: number;

  // Recent Performance
  wow_growth: number;
  weekly_points_earned: number;

  updated_at: string;
}

/**
 * System State - Real-time Dashboard (PRD Section 3.1)
 */
export interface SystemState {
  // Revenue Pipeline
  current_revenue: number; // ₹42L
  target_revenue: number; // ₹60L
  progress_percentage: number;

  // Meetup Stats
  active_meetups: number; // 862
  target_meetups: number; // 1200
  meetup_progress_percentage: number;

  // Health Overview
  health_distribution: {
    green: number; // 111
    yellow: number; // 24
    red: number; // 15
    total: number;
  };

  // Critical Alerts
  critical_alerts: {
    id: string;
    type: 'health' | 'revenue' | 'stage' | 'general';
    severity: 'high' | 'medium' | 'low';
    message: string;
    meetup_id?: string;
    created_at: string;
  }[];

  // Real-time Updates
  last_updated: string;
  updates_count_today: number;
}

// Utility Types

export interface FilterOptions {
  poc_type?: POCType;
  poc_id?: string;
  activity?: string;
  city?: string;
  team?: TeamName;
  health?: HealthStatus;
  stage?: Stage;
}

export interface SortOptions {
  field: string;
  direction: 'asc' | 'desc';
}

export interface PaginationOptions {
  page: number;
  limit: number;
  total?: number;
}