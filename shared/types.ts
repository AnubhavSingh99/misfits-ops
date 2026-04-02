// Shared types for the Misfits Operations Platform

export interface Club {
  id: string;
  name: string;
  activity: string;
  city: string;
  area: string;
  currentState: 'stage_1' | 'stage_2' | 'stage_3' | 'active' | 'paused';
  healthStatus: 'green' | 'yellow' | 'red';
  pocId?: string;
  cityHeadId?: string;
  activityHeadId?: string;
  venue?: string;
  leaderId?: string;
  pricing?: number;
  capacity?: number;
  avgRating?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IntelligentTask {
  id: string;
  triggerEvent: string;
  triggerDetails: Record<string, any>;
  generatedTasks: string[];
  assignedTo: string;
  priority: 'P0' | 'P1' | 'P2';
  dueDate: Date;
  escalationRule?: string;
  completedStatus: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdByAi: boolean;
  clubId?: string;
  title: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'founder' | 'city_head' | 'activity_head' | 'poc' | 'leader';
  city?: string;
  activity?: string;
  permissions: string[];
  avatar?: string;
  createdAt: Date;
}

export interface UserWorkspace {
  userId: string;
  personalTodos: PersonalTodo[];
  clubNotes: Record<string, string>;
  weeklyPlans: Record<string, WeeklyPlan>;
  pinnedItems: string[];
  preferences: Record<string, any>;
}

export interface PersonalTodo {
  id: string;
  content: string;
  completed: boolean;
  dueDate?: Date;
  priority: 'low' | 'medium' | 'high';
  createdAt: Date;
}

export interface WeeklyPlan {
  weekStart: Date;
  days: DayPlan[];
  goals: string[];
  insights: string[];
}

export interface DayPlan {
  date: Date;
  blocks: TimeBlock[];
  focus: string;
}

export interface TimeBlock {
  startTime: string;
  endTime: string;
  title: string;
  tasks: string[];
  type: 'meeting' | 'focus' | 'admin' | 'field';
}

export interface SmartNotification {
  id: string;
  eventType: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  recipient: string;
  channel: 'push' | 'email' | 'whatsapp' | 'in-app';
  message: string;
  actionButtons: NotificationAction[];
  sentTime?: Date;
  readTime?: Date;
  actionTaken?: string;
}

export interface NotificationAction {
  label: string;
  action: string;
  style: 'primary' | 'secondary' | 'danger';
}

export interface SystemPattern {
  patternType: string;
  location: string;
  frequency: number;
  usualCause: string;
  bestSolution: string;
  successRate: number;
  learnedDate: Date;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Event types for the intelligent system
export type SystemEvent =
  | { type: 'poc_assigned'; pocId: string; clubId: string; userId: string }
  | { type: 'state_changed'; clubId: string; oldState: string; newState: string }
  | { type: 'health_changed'; clubId: string; oldHealth: string; newHealth: string }
  | { type: 'venue_lost'; clubId: string; venueId: string }
  | { type: 'leader_quit'; clubId: string; leaderId: string }
  | { type: 'revenue_dropped'; clubId: string; amount: number; percentage: number };

// Task templates for auto-generation
export interface TaskTemplate {
  id: string;
  name: string;
  trigger: string;
  conditions: Record<string, any>;
  tasks: TaskDefinition[];
  priority: 'P0' | 'P1' | 'P2';
  estimatedDuration: number; // in hours
}

export interface TaskDefinition {
  title: string;
  description: string;
  dueInHours: number;
  assigneeDetermination: 'trigger_user' | 'poc' | 'city_head' | 'activity_head';
  prerequisites?: string[];
}

// =====================================================
// DIMENSIONAL TARGETS TYPES
// =====================================================

// Dimension lookup types
export interface DimCity {
  id: number;
  production_city_id?: number;
  city_name: string;
  name?: string; // alias for city_name
  state?: string;
  is_active: boolean;
}

export interface DimArea {
  id: number;
  production_area_id?: number;
  area_name: string;
  name?: string; // alias for area_name
  city_id: number;
  city_name?: string;
  is_custom: boolean;
  is_active: boolean;
}

export interface DimDayType {
  id: number;
  day_type: string;
  name?: string; // alias for day_type
  display_order: number;
  is_custom: boolean;
  is_active: boolean;
}

export interface DimFormat {
  id: number;
  format_name: string;
  name?: string; // alias for format_name
  display_order: number;
  is_custom: boolean;
  is_active: boolean;
}

// Dimension values response
export interface DimensionValues {
  city: {
    values: DimCity[];
    allowCustom: boolean;
  };
  area: {
    values: DimArea[];
    allowCustom: boolean;
  };
  day_type: {
    values: DimDayType[];
    allowCustom: boolean;
  };
  format: {
    values: DimFormat[];
    allowCustom: boolean;
  };
}

// Club dimensional target
export interface ClubDimensionalTarget {
  id?: number;
  club_id: number;
  club_name?: string;
  activity_id?: number;
  area_id: number | null;
  area_name?: string;
  city_id?: number;
  city_name?: string;
  day_type_id: number | null;
  day_type?: string;
  format_id: number | null;
  format_name?: string;
  target_meetups: number;
  target_revenue: number;
  meetup_cost?: number;      // Cost per meetup in INR
  meetup_capacity?: number;  // Average attendees per meetup
  created_at?: string;
  updated_at?: string;
  created_by?: string;
}

// Launch dimensional target
export interface LaunchDimensionalTarget {
  id?: number;
  launch_id: number;
  activity_name?: string;
  area_id: number | null;
  area_name?: string;
  city_id?: number;
  city_name?: string;
  day_type_id: number | null;
  day_type?: string;
  format_id: number | null;
  format_name?: string;
  target_meetups: number;
  target_revenue: number;
  meetup_cost?: number;      // Cost per meetup in INR
  meetup_capacity?: number;  // Average attendees per meetup
  created_at?: string;
  updated_at?: string;
  created_by?: string;
}

// Response types for dimensional targets
export interface ClubDimensionalTargetsResponse {
  success: boolean;
  club_id: number;
  club_name: string;
  activity_name?: string;
  dimensional_targets: ClubDimensionalTarget[];
  totals: {
    total_target_meetups: number;
    total_target_revenue: number;
  };
}

export interface LaunchDimensionalTargetsResponse {
  success: boolean;
  launch_id: number;
  planned_club_name?: string;
  activity_name?: string;
  dimensional_targets: LaunchDimensionalTarget[];
  totals: {
    total_target_meetups: number;
    total_target_revenue: number;
  };
}

// Dashboard aggregation types
export interface AreaAggregation {
  area_id: number;
  area_name: string;
  city_id: number;
  city_name: string;
  total_target_meetups: number;
  total_target_revenue: number;
  club_count: number;
}

export interface CityAggregation {
  city_id: number;
  city_name: string;
  state?: string;
  total_target_meetups: number;
  total_target_revenue: number;
  club_count: number;
  area_count: number;
  areas?: AreaAggregation[];
}

export interface DayTypeAggregation {
  day_type_id: number;
  day_type: string;
  total_target_meetups: number;
  total_target_revenue: number;
  club_count: number;
}

export interface FormatAggregation {
  format_id: number;
  format_name: string;
  total_target_meetups: number;
  total_target_revenue: number;
  club_count: number;
}

export interface ActivityAggregation {
  activity_id: number;
  activity_name?: string;
  total_target_meetups: number;
  total_target_revenue: number;
  club_count: number;
}

// Dashboard response types
export interface DashboardByAreaResponse {
  success: boolean;
  aggregation: 'area';
  data: AreaAggregation[];
  grand_total: {
    total_target_meetups: number;
    total_target_revenue: number;
    area_count: number;
  };
}

export interface DashboardByCityResponse {
  success: boolean;
  aggregation: 'city';
  data: CityAggregation[];
  grand_total: {
    total_target_meetups: number;
    total_target_revenue: number;
    city_count: number;
  };
}

export interface DashboardByDayTypeResponse {
  success: boolean;
  aggregation: 'day_type';
  data: DayTypeAggregation[];
  grand_total: {
    total_target_meetups: number;
    total_target_revenue: number;
  };
}

export interface DashboardByFormatResponse {
  success: boolean;
  aggregation: 'format';
  data: FormatAggregation[];
  grand_total: {
    total_target_meetups: number;
    total_target_revenue: number;
  };
}

export interface DashboardByActivityResponse {
  success: boolean;
  aggregation: 'activity';
  data: ActivityAggregation[];
  grand_total: {
    total_target_meetups: number;
    total_target_revenue: number;
    activity_count: number;
  };
}

export interface DashboardSummaryResponse {
  success: boolean;
  summary: {
    total_clubs_with_targets: number;
    total_launches_with_targets: number;
    total_target_meetups: number;
    total_target_revenue: number;
    by_city: CityAggregation[];
    by_day_type: DayTypeAggregation[];
    by_format: FormatAggregation[];
  };
}

// Create/Update request types
export interface CreateClubDimensionalTargetRequest {
  area_id?: number | null;
  day_type_id?: number | null;
  format_id?: number | null;
  target_meetups: number;
  target_revenue?: number;
  meetup_cost?: number;      // Cost per meetup in INR
  meetup_capacity?: number;  // Average attendees per meetup
}

export interface CreateLaunchDimensionalTargetRequest {
  area_id?: number | null;
  day_type_id?: number | null;
  format_id?: number | null;
  target_meetups: number;
  target_revenue?: number;
  meetup_cost?: number;      // Cost per meetup in INR
  meetup_capacity?: number;  // Average attendees per meetup
}

// Meetup defaults response (from hardcoded lookup)
export interface MeetupDefaultsResponse {
  meetup_cost: number | null;
  meetup_capacity: number | null;
  source: 'exact' | 'city_avg' | 'activity_avg' | 'not_found';
}

// Activity with clubs response
export interface ActivityWithClubs {
  activity_id: number;
  activity_name: string;
  clubs: {
    pk: number;
    name: string;
    city_name?: string;
    area_name?: string;
    status: string;
  }[];
}

// New club launch type
export interface NewClubLaunch {
  id: number;
  activity_name: string;
  planned_club_name?: string;
  planned_city?: string;
  planned_area?: string;
  planned_launch_date?: string;
  launch_status: 'planned' | 'in_progress' | 'launched' | 'cancelled';
  actual_club_id?: string;
  milestones?: {
    poc_assigned: boolean;
    location_found: boolean;
    first_event_scheduled: boolean;
    first_event_conducted: boolean;
    members_onboarded: boolean;
  };
  created_at?: string;
  updated_at?: string;
}

// Club or Launch reference (for requirement linking)
export interface ClubOrLaunch {
  id: number;
  name: string;
  type: 'club' | 'launch';
  activity_id?: number;
  activity_name?: string;
  city_id?: number;
  city_name?: string;
  area_id?: number;
  area_name?: string;
}

// =====================================================
// SCALING PLANNER V2 TYPES
// =====================================================

// =====================================================
// MEETUP STAGE TYPES (renamed from Stage)
// =====================================================

// Meetup stage keys - operational status of a meetup
export type MeetupStageKey = 'not_picked' | 'started' | 'stage_1' | 'stage_2' | 'stage_3' | 'stage_4' | 'realised';

// Meetup stage progress tracking - counts per stage
export interface StageProgress {
  not_picked: number;
  started: number;
  stage_1: number;
  stage_2: number;
  stage_3: number;
  stage_4: number;
  realised: number;
}

// =====================================================
// REVENUE STATUS TYPES
// =====================================================

// Revenue status - revenue potential/actual by meetup stage (in paisa)
export interface RevenueStatus {
  // Pipeline revenue (target revenue by stage)
  np: number;           // Revenue potential at Not Picked stage
  st: number;           // Revenue potential at Started stage
  s1: number;           // Revenue potential at S1 stage
  s2: number;           // Revenue potential at S2 stage
  s3: number;           // Revenue potential at S3 stage
  s4: number;           // Revenue potential at S4 (regression) stage

  // Realised metrics
  realised_target: number;    // Expected revenue from realised meetups (cost × capacity × meetups)
  realised_actual: number;    // Actual revenue collected (from prod DB)
  realisation_gap: number;    // max(0, realised_target - realised_actual) - never negative

  // Unattributed revenue
  unattributed: number;       // Revenue that couldn't match to any target

  // Totals (for convenience)
  total_pipeline: number;     // Sum of np + st + s1 + s2 + s3 + s4
  total_target: number;       // Sum of all stage revenues + realised_target
}

// Revenue status display format (formatted for UI in ₹K)
export interface RevenueStatusDisplay {
  np: string | null;          // e.g., "4.2" (₹K) or null if 0
  st: string | null;
  s1: string | null;
  s2: string | null;
  s3: string | null;
  s4: string | null;
  rg: string | null;          // Realisation Gap
  ua: string | null;          // Unattributed
  ra: string | null;          // Realised Actual
}

// Meetup stage configuration (for UI display)
export interface MeetupStageConfig {
  key: MeetupStageKey;
  label: string;
  shortLabel: string;
  description: string;
  color: {
    bg: string;       // Tailwind class e.g., 'bg-red-600'
    text: string;     // Tailwind class e.g., 'text-white'
    hex: string;      // Hex color for charts e.g., '#dc2626'
  };
  order: number;
}

// Revenue status key type
export type RevenueStatusKey = 'realisation_gap' | 'unattributed' | 'realised_actual';

// Revenue status configuration (for UI display)
export interface RevenueStatusConfigItem {
  key: RevenueStatusKey;
  label: string;
  shortLabel: string;
  description: string;
  color: {
    bg: string;
    text: string;
    hex: string;
  };
}

// Auto-realisation result
export interface AutoRealisationResult {
  target_id: number;
  target_name: string;
  club_id: number;
  club_name: string;
  previous_stage: MeetupStageKey;
  new_stage: MeetupStageKey;
  reason: string;
  matched_revenue: number;
  matched_meetups: number;
}

// Revenue matching result
export interface RevenueMatchResult {
  club_id: number;
  target_id: number | null;
  matched: boolean;
  confidence: 'high' | 'medium' | 'low';
  amount: number;
  match_criteria: {
    club_match: boolean;
    area_match: boolean;
    day_match: boolean;
    name_match: boolean;
  };
}

// Unattributed revenue item
export interface UnattributedRevenue {
  club_id: number;
  club_name: string;
  activity_name: string;
  area_name?: string;
  day_of_week?: string;
  meetup_name?: string;
  amount: number;
  event_date?: string;
  suggested_targets?: {
    target_id: number;
    target_name: string;
    confidence: number;
  }[];
}

// Validation status for progress
export type ValidationStatus = 'valid' | 'needs_update' | 'over_allocated';

export interface ValidationResult {
  status: ValidationStatus;
  message?: string;
}

// Extended dimensional target with progress and validation
export interface ClubDimensionalTargetV2 extends ClubDimensionalTarget {
  progress: StageProgress;
  current_meetups: number;    // From actual events
  current_revenue: number;    // From actual events
  gap_meetups: number;        // target - current
  gap_revenue: number;        // target - current
  validation_status: ValidationStatus;
  validation_message?: string;
}

export interface LaunchDimensionalTargetV2 extends LaunchDimensionalTarget {
  progress: StageProgress;
  current_meetups: number;
  current_revenue: number;
  gap_meetups: number;
  gap_revenue: number;
  validation_status: ValidationStatus;
  validation_message?: string;
}

// Hierarchy node for drill-down structure
export interface HierarchyNode {
  type: 'activity' | 'city' | 'area' | 'club' | 'launch' | 'target';
  id: string;
  name: string;
  // Target metrics
  target_meetups: number;
  target_revenue: number;
  // Meetup economics (for target nodes)
  meetup_cost?: number;
  meetup_capacity?: number;
  // Current (actual) metrics
  current_meetups: number;
  current_revenue: number;
  // Gap (target - current)
  gap_meetups: number;
  gap_revenue: number;
  // Progress summary (rolled up from children or direct)
  progress_summary: StageProgress;
  // Validation
  validation_status: ValidationStatus;
  validation_message?: string;
  // Children (for drill-down)
  children?: HierarchyNode[];
  // Metadata
  club_count?: number;
  area_count?: number;
  city_count?: number;
  target_count?: number;  // Number of targets for a club
  is_launch?: boolean;  // For new club launches (displayed differently)
  is_expansion?: boolean;  // For expansion targets (clubs expanding to new areas)
  // IDs for linking
  activity_id?: number;
  city_id?: number;
  area_id?: number;
  club_id?: number;
  launch_id?: number;
  target_id?: number;  // The dimensional target ID (for progress updates)
  has_target?: boolean;  // Whether this node has a target set
  launch_status?: string;  // For launches: 'planned' | 'in_progress' | 'launched'
  // Team assignment (for clubs and launches)
  team?: 'blue' | 'green' | 'yellow';
  // Last 4 weeks revenue (rolled up from clubs)
  last_4w_revenue_total?: number;  // Sum of last 4 weeks revenue
  last_4w_revenue_avg?: number;    // Moving average per week
  // Revenue status (rolled up from children or direct)
  revenue_status?: RevenueStatus;
  revenue_status_display?: RevenueStatusDisplay;
  // Day type for targets (displayed as tags)
  day_type_id?: number;
  day_type_name?: string;
  // Health metrics (for clubs)
  health_score?: number;           // 0-100 weighted score
  health_status?: 'green' | 'yellow' | 'red' | 'gray';  // Overall status
  capacity_pct?: number;           // Capacity utilization %
  repeat_rate_pct?: number;        // Repeat rate %
  avg_rating?: number;             // Average rating (0-5)
  is_new_club?: boolean;           // Less than 2 months old
  // Individual metric health (for clubs)
  capacity_health?: 'green' | 'yellow' | 'red';
  repeat_health?: 'green' | 'yellow' | 'red';
  rating_health?: 'green' | 'yellow' | 'red';
  // Health distribution (for roll-up nodes: area, city, activity)
  health_distribution?: {
    green: number;
    yellow: number;
    red: number;
    gray: number;  // Dormant/inactive
  };
  // Leader requirements (rolled up from children or direct)
  leaders_required_total?: number;  // Sum of leaders_required from all requirements
  leader_requirements_summary?: {
    not_picked: number;
    deprioritised: number;
    in_progress: number;
    done: number;
    total_requirements: number;
  };
  // Launch transition tracking (for clubs matched from launches)
  matched_from_launch?: {
    launch_id: number;
    original_name: string;  // Original launch target name
    match_type: 'auto' | 'manual' | 'legacy';
    matched_at: string;
  };
  // Club UUID for matching operations
  club_uuid?: string;
}

// Weekly trend data for charts
export interface WeeklyTrend {
  week_start: string;
  week_end: string;
  week_label: string;  // e.g., "Dec 30 - Jan 5"
  meetups: number;
  revenue: number;
  target_meetups?: number;
  target_revenue?: number;
}

// Trends response
export interface TrendsResponse {
  success: boolean;
  weeks: WeeklyTrend[];
  summary: {
    total_meetups: number;
    total_revenue: number;
    avg_meetups_per_week: number;
    avg_revenue_per_week: number;
    trend_direction: 'up' | 'down' | 'stable';
    trend_percentage: number;
  };
}

// Hierarchy response
export interface HierarchyResponse {
  success: boolean;
  hierarchy: HierarchyNode[];
  summary: {
    total_activities: number;
    total_cities: number;
    total_areas: number;
    total_clubs: number;
    total_launches: number;
    total_target_meetups: number;
    total_target_revenue: number;
    total_current_meetups: number;
    total_current_revenue: number;
    overall_progress: StageProgress;
    overall_validation_status: ValidationStatus;
    // Monthly projections (weekly × 4.2)
    monthly_target_meetups: number;
    monthly_target_revenue: number;
    // Last 4 weeks totals
    last_4w_revenue_total: number;
    last_4w_revenue_avg: number;
    // March 2026 specific (for tracking)
    march_2026_revenue: number;
  };
}

// Quick add context for dimension inheritance
export interface QuickAddContext {
  activity_id?: number;
  activity_name?: string;
  city_id?: number;
  city_name?: string;
  area_id?: number;
  area_name?: string;
}

// Filter options for V2 dashboard
export interface ScalingPlannerV2Filters {
  activity_id?: number;
  city_id?: number;
  area_id?: number;
  validation_status?: ValidationStatus;
  include_launches?: boolean;
}

// =====================================================
// SCALING TASKS TYPES
// =====================================================

// Stage key type for task transitions
export type StageKey = 'not_picked' | 'started' | 'stage_1' | 'stage_2' | 'stage_3' | 'stage_4' | 'realised';

// Task scope - what level of hierarchy the task is at
export type TaskScope = 'activity' | 'city' | 'area' | 'club' | 'launch';

// Task status
export type TaskStatus = 'not_started' | 'in_progress' | 'completed' | 'cancelled';

// Team color mapping (based on team lead)
export interface TeamColor {
  bg: string;
  border: string;
  text: string;
}

// Main scaling task type
export interface ScalingTask {
  id: number;
  task_scope: TaskScope;

  // Hierarchy context
  activity_id?: number;
  activity_name?: string;
  city_id?: number;
  city_name?: string;
  area_id?: number;
  area_name?: string;
  club_id?: number;
  club_name?: string;
  launch_id?: number;
  target_id?: number;

  // Task content
  title: string;
  description?: string;

  // Stage transition
  source_stage?: StageKey;
  target_stage?: StageKey;
  meetups_count: number;

  // Assignment
  assigned_to_poc_id?: number;
  assigned_to_name?: string;
  assigned_team_lead?: string; // Shashwat=blue, Saurabh=green, CD=yellow

  // Status
  status: TaskStatus;

  // Timestamps
  created_at: string;
  updated_at: string;
  due_date?: string;
  created_by?: string;

  // Joined data (from API)
  weeks?: ScalingTaskWeek[];
  week_start?: string;      // Current week context
  week_position?: number;   // Position in current week
  comments_count?: number;
  comments?: ScalingTaskComment[];
  team_color?: TeamColor;

  // Linked requirements
  linked_leader_requirements?: LeaderRequirement[];
  linked_venue_requirements?: VenueRequirement[];
}

// Task-week junction (for multi-week tasks)
export interface ScalingTaskWeek {
  id: number;
  task_id: number;
  week_start: string;
  position: number;
}

// Task comment (for status updates)
export interface ScalingTaskComment {
  id: number;
  task_id: number;
  comment_text: string;
  author_name?: string;
  created_at: string;
}

// Task summary for hierarchy nodes
export interface ScalingTaskSummary {
  not_started: number;
  in_progress: number;
  completed: number;
  cancelled: number;
  by_transition: {
    'NP_S'?: number;   // not_picked → started
    'S_S1'?: number;   // started → stage_1
    'S1_S2'?: number;  // stage_1 → stage_2
    'S2_S3'?: number;  // stage_2 → stage_3
    'S3_S4'?: number;  // stage_3 → stage_4
    'S4_R'?: number;   // stage_4 → realised
  };
}

// =====================================================
// LEADER & VENUE REQUIREMENTS
// =====================================================

// Requirement status for venue requirements (expanded workflow)
export type VenueRequirementStatus = 'not_picked' | 'picked' | 'venue_aligned' | 'leader_approval' | 'done' | 'deprioritised';

// Requirement status for leader requirements (original workflow)
export type RequirementStatus = 'not_picked' | 'deprioritised' | 'in_progress' | 'done';

// Time of day options for venue requirements
export type TimeOfDay = 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'night' | 'all_nighter';

// Time of day options configuration
export const TIME_OF_DAY_OPTIONS: { value: TimeOfDay; label: string; time: string; icon: string }[] = [
  { value: 'early_morning', label: 'Early Morning', time: '5-8 AM', icon: '🌅' },
  { value: 'morning', label: 'Morning', time: '8 AM-12 PM', icon: '☀️' },
  { value: 'afternoon', label: 'Afternoon', time: '12-4 PM', icon: '🌤️' },
  { value: 'evening', label: 'Evening', time: '4-8 PM', icon: '🌆' },
  { value: 'night', label: 'Night', time: '8 PM-12 AM', icon: '🌙' },
  { value: 'all_nighter', label: 'All-Nighter', time: '12-5 AM', icon: '🌃' }
];

// Comment for requirements (leader and venue)
export interface RequirementComment {
  id: number;
  requirement_id: number;
  requirement_type: 'leader' | 'venue';
  comment_text: string;
  author_name: string;
  created_at: string;
}

// Base requirement interface (shared by leader and venue)
export interface BaseRequirement {
  id: number;
  name: string;
  description?: string;

  // Hierarchy context (inherited from task/club)
  activity_id?: number;
  activity_name?: string;
  city_id?: number;
  city_name?: string;
  area_id?: number;
  area_name?: string;
  club_id?: number;
  club_name?: string;
  launch_id?: number;  // For new club launches (alternative to club_id)

  // Status (can be RequirementStatus for leaders or VenueRequirementStatus for venues)
  status: RequirementStatus | VenueRequirementStatus;

  // Effort attributes
  growth_team_effort: boolean;
  platform_team_effort: boolean;
  existing_leader_effort: boolean;  // Current leader finds leaders

  // Number of leaders/venues required (for roll-up calculations)
  leaders_required: number;  // Default 1

  // Linked tasks (for reverse linking feature)
  linked_tasks?: ScalingTask[];

  // Comments
  comments?: string;
  comments_count?: number;  // Count of comments from requirement_comments table

  // Team (auto-inherited from activity-city context)
  team?: 'blue' | 'green' | 'yellow';

  // Timestamps
  created_at: string;
  updated_at: string;
  completed_at?: string;  // Auto-set when status changes to 'done'
  created_by?: string;
}

export interface LeaderRequirement extends BaseRequirement {
  type: 'leader';
  // Who closed/completed this requirement - triggers Slack notification
  closed_by?: 'growth_team' | 'platform_team';
}

// Priority levels for venue requirements
export type PriorityLevel = 'critical' | 'high' | 'normal' | 'done' | 'deprioritised';

// Venue platform team (BAU/Supply) - separate from growth teams (blue/green/yellow)
export type VenuePlatformTeam = 'bau' | 'supply';

// Capacity bucket options for venue requirements
export type CapacityBucket = '<10' | '10-20' | '20-30' | '30-50' | '50-100' | '100-200' | '200-500' | '>500';

export const CAPACITY_BUCKET_OPTIONS: CapacityBucket[] = ['<10', '10-20', '20-30', '30-50', '50-100', '100-200', '200-500', '>500'];

export interface VenueRequirement extends BaseRequirement {
  type: 'venue';
  // Override status to use venue-specific statuses
  status: VenueRequirementStatus;
  // Scheduling fields
  day_type_id?: number;
  day_type_name?: string;
  time_of_day?: TimeOfDay[];
  amenities_required?: string;
  capacity?: CapacityBucket;
  // Priority fields (calculated based on age and SLA)
  age_days?: number;
  priority_level?: PriorityLevel;
  // Venue completion info (captured when marking as done)
  venue_name?: string;
  venue_city?: string;
  venue_area?: string;
  venue_categories?: string[];
  amenities_list?: string[];
  // Venue platform team routing (BAU/Supply)
  venue_platform_team?: VenuePlatformTeam;
  escalated_at?: string;
  escalated_by?: string;
}

// Request types for creating/updating requirements
export interface CreateRequirementRequest {
  name: string;
  description?: string;
  activity_id?: number;
  activity_name?: string;
  city_id?: number;
  city_name?: string;
  area_id?: number;
  area_name?: string;
  club_id?: number;  // Required for V2 - must link to club or launch
  club_name?: string;
  launch_id?: number;  // Alternative to club_id for new launches
  target_id?: number;  // For expansion targets (club_dimensional_targets.id)
  growth_team_effort?: boolean;
  platform_team_effort?: boolean;
  existing_leader_effort?: boolean;  // New effort type
  leaders_required?: number;  // Default 1
  comments?: string;
  team?: 'blue' | 'green' | 'yellow';
  // Venue requirement scheduling fields
  day_type_id?: number;
  time_of_day?: TimeOfDay[];
  amenities_required?: string;
  capacity?: CapacityBucket;
  venue_categories?: string[];
  amenities_list?: string[];
  venue_platform_team?: VenuePlatformTeam;
}

export interface UpdateRequirementRequest extends Partial<CreateRequirementRequest> {
  status?: RequirementStatus | VenueRequirementStatus;
  // Venue completion fields
  venue_name?: string;
  venue_city?: string;
  venue_area?: string;
}

// Response types for requirement API
export interface RequirementResponse {
  success: boolean;
  requirement?: LeaderRequirement | VenueRequirement;
  error?: string;
}

export interface RequirementsListResponse {
  success: boolean;
  requirements: (LeaderRequirement | VenueRequirement)[];
  total: number;
}

// Requirement hierarchy node for dashboards
export interface RequirementHierarchyNode {
  type: 'activity' | 'city' | 'area' | 'club' | 'requirement' | 'priority';
  id: string;
  name: string;

  // Hierarchy identifiers
  activity_id?: number;
  city_id?: number;
  area_id?: number;
  club_id?: number;

  // Summary counts
  count: number;
  status_counts: {
    not_picked: number;
    deprioritised: number;
    in_progress: number;  // For leader requirements
    done: number;
    // Venue-specific statuses (optional for backward compatibility)
    picked?: number;
    venue_aligned?: number;
    leader_approval?: number;
  };
  growth_effort_count: number;
  platform_effort_count: number;

  // Team
  team?: 'blue' | 'green' | 'yellow';

  // Priority fields (for venue requirements hierarchy)
  priority_level?: PriorityLevel;
  priority_icon?: string;
  max_priority_level?: PriorityLevel;
  max_priority_order?: number;

  // Children nodes or requirements
  children?: RequirementHierarchyNode[];
  requirements?: (LeaderRequirement | VenueRequirement)[];
}

// Sprint week for Jira-like view
export interface SprintWeek {
  week_start: string;
  week_end: string;
  week_label: string;
  is_current: boolean;
  tasks: ScalingTask[];
  summary: {
    not_started: number;
    in_progress: number;
    completed: number;
  };
}

// POC/Assignee for task assignment
export interface TaskAssignee {
  id: number;
  name: string;
  poc_type?: string;
  activities?: string[];
  cities?: string[];
  team_name?: string;
  team_role?: string;
  team_lead?: string;
  team_color?: TeamColor;
  is_active?: boolean;
}

// Request type for creating a task
export interface CreateScalingTaskRequest {
  task_scope: TaskScope;
  activity_id?: number;
  activity_name?: string;
  city_id?: number;
  city_name?: string;
  area_id?: number;
  area_name?: string;
  club_id?: number;
  club_name?: string;
  launch_id?: number;
  launch_name?: string;  // Used for new club launches (stored as club_name in DB)
  target_id?: number;
  title: string;
  description?: string;
  source_stage?: StageKey;
  target_stage?: StageKey;
  meetups_count?: number;
  assigned_to_poc_id?: number;
  assigned_to_name?: string;
  assigned_team_lead?: string;
  status?: TaskStatus;
  week_start?: string;
  due_date?: string;
  created_by?: string;
}

// Sprints API response
export interface SprintsResponse {
  success: boolean;
  weeks: SprintWeek[];
  current_week: string;
}

// Task summary by hierarchy response
export interface TaskSummaryByHierarchyResponse {
  success: boolean;
  summaries: Array<{
    task_scope: TaskScope;
    activity_id?: number;
    activity_name?: string;
    city_id?: number;
    city_name?: string;
    area_id?: number;
    area_name?: string;
    club_id?: number;
    club_name?: string;
    launch_id?: number;
    not_started: number;
    in_progress: number;
    completed: number;
    cancelled: number;
    by_transition: Record<string, number>;
  }>;
}

// =====================================================
// AUTO-MATCHING TYPES (Meetup to Target Matching)
// =====================================================

// Day type to day-of-week mapping
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

// Actual meetup from production DB
export interface ActualMeetup {
  event_id: number;
  event_name: string;
  club_id: number;
  area_id: number;
  area_name?: string;
  dow: number;  // 0-6, extracted with IST timezone (0=Sunday)
  revenue: number;
  start_time?: string;
}

// Target with area mapping for matching
export interface TargetWithMapping {
  target_id: number;
  target_name: string | null;
  club_id: number;
  area_id: number | null;
  production_area_id: number | null;  // Maps to event location area_id
  day_type_id: number | null;
  day_type_name: string | null;
  day_type_dows: number[] | null;     // Computed from day_type_id
  target_meetups: number;
  target_revenue: number;
  meetup_cost: number;
  meetup_capacity: number;
  progress: StageProgress;
  specificity_score: number;  // For ordering (higher = more specific)
}

// Match result for a single meetup
export interface MeetupMatchResult {
  matched: boolean;
  target_id: number | null;
  target_name: string | null;
  match_type: 'full' | 'partial' | 'none';  // full = day matched, partial = day NULL
  match_details: {
    area_matched: boolean;
    day_matched: boolean | null;  // null if day_type not set
    name_matched: boolean | null;  // null if name not set
  };
}

// Target match result with matched meetups
export interface TargetMatchResult {
  target_id: number;
  target_name: string | null;
  matched_meetups: ActualMeetup[];
  matched_count: number;
  matched_revenue: number;
  extra_meetups: number;  // Beyond target capacity
  extra_revenue: number;
  new_progress: StageProgress;
  revenue_status: RevenueStatus;
}

// Area-level unattributed (meetups that didn't match any target in this area)
export interface AreaUnattributed {
  area_id: number;
  area_name: string;
  meetups: ActualMeetup[];
  meetup_count: number;
  total_revenue: number;
}

// Club-level match result
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

// Extended StageProgress with unattributed meetups
export interface StageProgressWithUA extends StageProgress {
  unattributed_meetups: number;  // Meetups beyond target capacity
}

// ============================================================
// Start Your Club — Club Application Pipeline Types
// ============================================================

export type ClubApplicationStatus =
  | 'ACTIVE' | 'ABANDONED' | 'NOT_INTERESTED'
  | 'SUBMITTED' | 'UNDER_REVIEW' | 'ON_HOLD'
  | 'INTERVIEW_PENDING' | 'INTERVIEW_SCHEDULED' | 'INTERVIEW_DONE'
  | 'SELECTED' | 'CLUB_CREATED' | 'REJECTED';

export interface ScreeningRatings {
  [key: string]: number;
}

export type RejectionReason =
  | 'insufficient_experience'
  | 'low_commitment'
  | 'unclear_motivation'
  | 'city_not_available'
  | 'incomplete_responses'
  | 'other';

export interface ClubApplication {
  id: string;
  user_id: number | null;
  user_phone: string | null;
  name: string | null;
  status: ClubApplicationStatus;
  exit_type: 'interested' | 'silent' | null;
  source: 'app' | 'link';
  city: string | null;
  activity: string | null;
  awareness: 'yes' | 'no' | 'maybe' | null;
  archived: boolean;
  questionnaire_data: Record<string, any>;
  last_screen: string | null;
  last_story_slide: number | null;
  last_question_index: number | null;
  last_question_section: string | null;
  total_questions: number | null;
  abandoned_at: string | null;
  screening_ratings: ScreeningRatings | null;
  interview_ratings: ScreeningRatings | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  split_template_id: string | null;
  split_percentage: Record<string, number> | null;
  contract_url: string | null;
  contract_uploaded_at: string | null;
  signed_contract_url: string | null;
  signed_contract_uploaded_at: string | null;
  first_call_done: boolean;
  venue_sorted: boolean;
  marketing_launched: boolean;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  selected_at: string | null;
  club_created_at: string | null;
}

export interface ApplicationStatusEvent {
  id: string;
  application_id: string;
  from_status: string | null;
  to_status: string;
  actor: 'applicant' | 'admin' | 'system';
  actor_id: number | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface ApplicationActivity {
  id: string;
  application_id: string;
  type: 'note' | 'call' | 'connect_request';
  content: string | null;
  metadata: Record<string, any>;
  created_by: number | null;
  created_at: string;
}