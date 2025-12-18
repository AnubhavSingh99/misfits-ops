// API Service Layer - Clean Architecture Implementation
// Based on PRD v8.1 Requirements

import {
  Meetup,
  Club,
  POC,
  WoWTracking,
  HealthMetrics,
  RevenueGrowth,
  TeamPerformance,
  SystemState,
  FilterOptions,
  SortOptions,
  PaginationOptions
} from '../types/core';

// Base API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
    this.name = 'ApiError';
  }
}

// Generic API Request Handler
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(response.status, data.message || 'API Error', data);
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, 'Network Error', error);
  }
}

// Real-time System State Service (PRD Section 3.1)
export class SystemStateService {
  static async getCurrentState(): Promise<SystemState> {
    return apiRequest<SystemState>('/system/state');
  }

  static async refreshState(): Promise<SystemState> {
    return apiRequest<SystemState>('/system/refresh');
  }
}

// Meetup Service - Primary Revenue Units (PRD Section 4.1)
export class MeetupService {
  static async getAll(
    filters: FilterOptions = {},
    sort: SortOptions = { field: 'updated_at', direction: 'desc' },
    pagination: PaginationOptions = { page: 1, limit: 50 }
  ): Promise<{ meetups: Meetup[]; total: number; page: number }> {
    const params = new URLSearchParams({
      ...filters,
      sort_field: sort.field,
      sort_direction: sort.direction,
      page: pagination.page.toString(),
      limit: pagination.limit.toString(),
    });

    return apiRequest<{ meetups: Meetup[]; total: number; page: number }>(
      `/meetups?${params}`
    );
  }

  static async getById(id: string): Promise<Meetup> {
    return apiRequest<Meetup>(`/meetups/${id}`);
  }

  static async updateStage(id: string, stage: string, comment?: string): Promise<Meetup> {
    return apiRequest<Meetup>(`/meetups/${id}/stage`, {
      method: 'PUT',
      body: JSON.stringify({ stage, comment }),
    });
  }

  static async bulkUpdate(
    meetupIds: string[],
    updates: Partial<Meetup>
  ): Promise<Meetup[]> {
    return apiRequest<Meetup[]>('/meetups/bulk', {
      method: 'PUT',
      body: JSON.stringify({ meetup_ids: meetupIds, updates }),
    });
  }

  static async getByPOC(pocId: string): Promise<Meetup[]> {
    return apiRequest<Meetup[]>(`/meetups/poc/${pocId}`);
  }
}

// Club Service - Aggregation Layer (PRD Section 4.2)
export class ClubService {
  static async getAll(filters: FilterOptions = {}): Promise<Club[]> {
    const params = new URLSearchParams(filters);
    return apiRequest<Club[]>(`/clubs?${params}`);
  }

  static async getById(id: string): Promise<Club> {
    return apiRequest<Club>(`/clubs/${id}`);
  }

  static async getClubMeetups(id: string): Promise<Meetup[]> {
    return apiRequest<Meetup[]>(`/clubs/${id}/meetups`);
  }
}

// Health Service - 4-Metric System (PRD Section 6.1)
export class HealthService {
  static async calculateHealth(meetupId: string): Promise<HealthMetrics> {
    return apiRequest<HealthMetrics>(`/health/calculate/${meetupId}`);
  }

  static async getHealthOverview(filters: FilterOptions = {}): Promise<{
    distribution: { green: number; yellow: number; red: number };
    critical_issues: HealthMetrics[];
    trends: { period: string; green: number; yellow: number; red: number }[];
  }> {
    const params = new URLSearchParams(filters);
    return apiRequest(`/health/overview?${params}`);
  }

  static async getHealthByMeetup(meetupId: string): Promise<HealthMetrics> {
    return apiRequest<HealthMetrics>(`/health/meetup/${meetupId}`);
  }

  static async getCriticalAlerts(): Promise<HealthMetrics[]> {
    return apiRequest<HealthMetrics[]>('/health/alerts');
  }
}

// WoW Tracking Service (PRD Section 7.3)
export class WoWTrackingService {
  static async getWeeklyProgress(
    weekNumber: number,
    year: number,
    filters: FilterOptions = {}
  ): Promise<WoWTracking[]> {
    const params = new URLSearchParams({
      week: weekNumber.toString(),
      year: year.toString(),
      ...filters,
    });
    return apiRequest<WoWTracking[]>(`/wow/progress?${params}`);
  }

  static async addComment(
    meetupId: string,
    comment: string,
    actionTaken?: string,
    blocker?: string,
    nextSteps?: string
  ): Promise<WoWTracking> {
    return apiRequest<WoWTracking>('/wow/comment', {
      method: 'POST',
      body: JSON.stringify({
        meetup_id: meetupId,
        comment,
        action_taken: actionTaken,
        blocker,
        next_steps: nextSteps,
      }),
    });
  }

  static async getHistoryForMeetup(meetupId: string): Promise<WoWTracking[]> {
    return apiRequest<WoWTracking[]>(`/wow/history/${meetupId}`);
  }

  static async getCurrentWeekProgress(): Promise<WoWTracking[]> {
    return apiRequest<WoWTracking[]>('/wow/current-week');
  }
}

// Revenue Growth Service (PRD Section 6.2)
export class RevenueGrowthService {
  static async getGrowthAnalysis(
    currentPeriodStart: string,
    currentPeriodEnd: string,
    comparePeriodStart: string,
    comparePeriodEnd: string,
    filters: FilterOptions = {}
  ): Promise<RevenueGrowth> {
    return apiRequest<RevenueGrowth>('/revenue/growth-analysis', {
      method: 'POST',
      body: JSON.stringify({
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        compare_period_start: comparePeriodStart,
        compare_period_end: comparePeriodEnd,
        filters,
      }),
    });
  }

  static async getTrends(
    startDate: string,
    endDate: string,
    filters: FilterOptions = {}
  ): Promise<{ date: string; revenue: number; meetups: number }[]> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      ...filters,
    });
    return apiRequest(`/revenue/trends?${params}`);
  }

  static async getForecast(
    filters: FilterOptions = {}
  ): Promise<{ month: string; predicted_revenue: number; confidence: number }[]> {
    const params = new URLSearchParams(filters);
    return apiRequest(`/revenue/forecast?${params}`);
  }
}

// POC Management Service (PRD Section 5.1)
export class POCService {
  static async getAll(): Promise<POC[]> {
    return apiRequest<POC[]>('/poc');
  }

  static async getById(id: string): Promise<POC> {
    return apiRequest<POC>(`/poc/${id}`);
  }

  static async getActivityHeads(): Promise<POC[]> {
    return apiRequest<POC[]>('/poc/activity-heads');
  }

  static async getCityHeads(): Promise<POC[]> {
    return apiRequest<POC[]>('/poc/city-heads');
  }

  static async getPOCPerformance(id: string): Promise<{
    poc: POC;
    meetups: Meetup[];
    revenue_trend: { month: string; revenue: number }[];
    health_distribution: { green: number; yellow: number; red: number };
  }> {
    return apiRequest(`/poc/${id}/performance`);
  }
}

// Team Performance Service (PRD Section 8.2)
export class TeamPerformanceService {
  static async getLeaderboard(): Promise<TeamPerformance[]> {
    return apiRequest<TeamPerformance[]>('/teams/leaderboard');
  }

  static async getTeamDetails(team: string): Promise<TeamPerformance> {
    return apiRequest<TeamPerformance>(`/teams/${team}`);
  }

  static async updatePoints(
    team: string,
    points: number,
    reason: string
  ): Promise<TeamPerformance> {
    return apiRequest<TeamPerformance>(`/teams/${team}/points`, {
      method: 'POST',
      body: JSON.stringify({ points, reason }),
    });
  }
}

// Scaling Planner Service (PRD Section 6.2) - Enhanced with target tracking
export class ScalingPlannerService {
  // Legacy CSV upload (maintaining backward compatibility)
  static async uploadCSV(
    file: File,
    pocId: string
  ): Promise<{ success: true; processed: number; errors: string[] }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('poc_id', pocId);

    const response = await fetch(`${API_BASE_URL}/scaling/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new ApiError(response.status, error.message, error);
    }

    return response.json();
  }

  // New upload method for the 3 upload types
  static async uploadPlan(
    file: File,
    uploadType: 'working-sheet' | 'existing-clubs' | 'new-clubs'
  ): Promise<{ success: true; processed: number; errors: string[]; uploadType: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_type', uploadType);

    const response = await fetch(`${API_BASE_URL}/scaling/upload-plan`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new ApiError(response.status, error.message, error);
    }

    return response.json();
  }

  // Get comprehensive scaling data
  static async getScalingData(): Promise<{
    activity_targets: any[];
    existing_club_targets: any[];
    new_club_launches: any[];
    summary: {
      total_current_meetups: number;
      total_target_meetups: number;
      total_target_revenue: number;
      total_target_attendees: number;
      new_clubs_count: number;
      existing_clubs_count: number;
    };
  }> {
    return apiRequest('/scaling/data');
  }

  static async getScalingPlan(pocId: string): Promise<{
    existing_meetups: Meetup[];
    new_meetups: Meetup[];
    targets: { current: number; target: number; impact: number };
  }> {
    return apiRequest(`/scaling/plan/${pocId}`);
  }

  static async savePlan(
    pocId: string,
    plan: { meetup_id: string; target_meetups: number; impact: number }[]
  ): Promise<{ success: true }> {
    return apiRequest('/scaling/save-plan', {
      method: 'POST',
      body: JSON.stringify({ poc_id: pocId, plan }),
    });
  }

  static async generateTasks(
    pocId: string
  ): Promise<{ tasks: any[]; assigned_count: number }> {
    return apiRequest(`/scaling/generate-tasks/${pocId}`, {
      method: 'POST',
    });
  }

  // ===== TARGET TRACKING METHODS =====

  // Get comprehensive scaling data (Activity-level view)
  static async getScalingTargets(): Promise<{
    activity_targets: any[];
    existing_club_targets: any[];
    new_club_launches: any[];
    summary: {
      total_current_meetups: number;
      total_target_meetups: number;
      total_target_revenue: number;
      total_target_attendees: number;
      existing_clubs_count: number;
      new_clubs_count: number;
    };
  }> {
    return apiRequest('/scaling/data');
  }

  // Get detailed view for a specific activity (Drill-down view)
  static async getActivityDetails(activityName: string): Promise<{
    activity: any;
    existing_clubs: any[];
    new_club_launches: any[];
  }> {
    return apiRequest(`/scaling/activity/${encodeURIComponent(activityName)}`);
  }

  // Update activity-level targets
  static async updateActivityTargets(
    activityName: string,
    targets: {
      target_meetups_existing?: number;
      target_meetups_new?: number;
      target_revenue_existing?: number;
      target_revenue_new?: number;
    }
  ): Promise<{ activity: any; message: string }> {
    return apiRequest(`/scaling/activity/${encodeURIComponent(activityName)}/targets`, {
      method: 'PUT',
      body: JSON.stringify(targets),
    });
  }

  // Update club-level targets
  static async updateClubTargets(
    clubId: number,
    targets: {
      target_meetups?: number;
      target_revenue?: number;
      activity_name: string;
    }
  ): Promise<{ club: any; message: string }> {
    return apiRequest(`/scaling/club/${clubId}/targets`, {
      method: 'PUT',
      body: JSON.stringify(targets),
    });
  }

  // Add new club launch plan
  static async createNewClubLaunch(launchPlan: {
    activity_name: string;
    planned_clubs_count?: number;
    target_meetups_per_club?: number;
    target_revenue_per_club?: number;
    planned_launch_date?: string;
    city?: string;
    area?: string;
    poc_assigned?: string;
  }): Promise<{ launch_plan: any; message: string }> {
    return apiRequest('/scaling/new-club-launch', {
      method: 'POST',
      body: JSON.stringify(launchPlan),
    });
  }

  // Transition new club to existing (when launched)
  static async transitionClub(transitionData: {
    new_club_launch_id: number;
    club_id: number;
    activity_name: string;
    target_meetups?: number;
    target_revenue?: number;
  }): Promise<{ club: any; message: string }> {
    return apiRequest('/scaling/transition-club', {
      method: 'POST',
      body: JSON.stringify(transitionData),
    });
  }
}

// Additional helper functions for POC Management
export async function getActivities(): Promise<Array<{
  id: string;
  name: string;
  clubCount: number;
  activeClubs: number;
  inactiveClubs: number;
}>> {
  const response = await apiRequest<{
    success: boolean;
    activities: Array<{
      id: string;
      name: string;
      clubCount: number;
      activeClubs: number;
      inactiveClubs: number;
    }>;
  }>('/scaling/activities');

  if (response.success) {
    return response.activities;
  }
  throw new Error('Failed to fetch activities');
}

export async function getCities(): Promise<Array<{
  id: string;
  name: string;
  areas: Array<{id: string, name: string}>;
  clubCount: number;
}>> {
  const response = await apiRequest<{
    success: boolean;
    cities: Array<{
      id: string;
      name: string;
      areas: Array<{id: string, name: string}>;
      clubCount: number;
    }>;
  }>('/scaling/cities');

  if (response.success) {
    return response.cities;
  }
  throw new Error('Failed to fetch cities');
}

// Export functions for easy access
export const api = {
  system: SystemStateService,
  meetups: MeetupService,
  clubs: ClubService,
  health: HealthService,
  wow: WoWTrackingService,
  revenue: RevenueGrowthService,
  poc: POCService,
  teams: TeamPerformanceService,
  scaling: ScalingPlannerService,
};

export default api;