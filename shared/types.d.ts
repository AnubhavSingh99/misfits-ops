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
export type SystemEvent = {
    type: 'poc_assigned';
    pocId: string;
    clubId: string;
    userId: string;
} | {
    type: 'state_changed';
    clubId: string;
    oldState: string;
    newState: string;
} | {
    type: 'health_changed';
    clubId: string;
    oldHealth: string;
    newHealth: string;
} | {
    type: 'venue_lost';
    clubId: string;
    venueId: string;
} | {
    type: 'leader_quit';
    clubId: string;
    leaderId: string;
} | {
    type: 'revenue_dropped';
    clubId: string;
    amount: number;
    percentage: number;
};
export interface TaskTemplate {
    id: string;
    name: string;
    trigger: string;
    conditions: Record<string, any>;
    tasks: TaskDefinition[];
    priority: 'P0' | 'P1' | 'P2';
    estimatedDuration: number;
}
export interface TaskDefinition {
    title: string;
    description: string;
    dueInHours: number;
    assigneeDetermination: 'trigger_user' | 'poc' | 'city_head' | 'activity_head';
    prerequisites?: string[];
}
export interface DimCity {
    id: number;
    production_city_id?: number;
    city_name: string;
    name?: string;
    state?: string;
    is_active: boolean;
}
export interface DimArea {
    id: number;
    production_area_id?: number;
    area_name: string;
    name?: string;
    city_id: number;
    city_name?: string;
    is_custom: boolean;
    is_active: boolean;
}
export interface DimDayType {
    id: number;
    day_type: string;
    name?: string;
    display_order: number;
    is_custom: boolean;
    is_active: boolean;
}
export interface DimFormat {
    id: number;
    format_name: string;
    name?: string;
    display_order: number;
    is_custom: boolean;
    is_active: boolean;
}
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
    meetup_cost?: number;
    meetup_capacity?: number;
    created_at?: string;
    updated_at?: string;
    created_by?: string;
}
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
    meetup_cost?: number;
    meetup_capacity?: number;
    created_at?: string;
    updated_at?: string;
    created_by?: string;
}
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
export interface CreateClubDimensionalTargetRequest {
    area_id?: number | null;
    day_type_id?: number | null;
    format_id?: number | null;
    target_meetups: number;
    target_revenue?: number;
    meetup_cost?: number;
    meetup_capacity?: number;
}
export interface CreateLaunchDimensionalTargetRequest {
    area_id?: number | null;
    day_type_id?: number | null;
    format_id?: number | null;
    target_meetups: number;
    target_revenue?: number;
    meetup_cost?: number;
    meetup_capacity?: number;
}
export interface MeetupDefaultsResponse {
    meetup_cost: number | null;
    meetup_capacity: number | null;
    source: 'exact' | 'city_avg' | 'activity_avg' | 'not_found';
}
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
    np: number;
    st: number;
    s1: number;
    s2: number;
    s3: number;
    s4: number;
    realised_target: number;
    realised_actual: number;
    realisation_gap: number;
    unattributed: number;
    total_pipeline: number;
    total_target: number;
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
export interface MeetupStageConfig {
    key: MeetupStageKey;
    label: string;
    shortLabel: string;
    description: string;
    color: {
        bg: string;
        text: string;
        hex: string;
    };
    order: number;
}
export type RevenueStatusKey = 'realisation_gap' | 'unattributed' | 'realised_actual';
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
export type ValidationStatus = 'valid' | 'needs_update' | 'over_allocated';
export interface ValidationResult {
    status: ValidationStatus;
    message?: string;
}
export interface ClubDimensionalTargetV2 extends ClubDimensionalTarget {
    progress: StageProgress;
    current_meetups: number;
    current_revenue: number;
    gap_meetups: number;
    gap_revenue: number;
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
export interface HierarchyNode {
    type: 'activity' | 'city' | 'area' | 'club' | 'launch' | 'target';
    id: string;
    name: string;
    target_meetups: number;
    target_revenue: number;
    meetup_cost?: number;
    meetup_capacity?: number;
    current_meetups: number;
    current_revenue: number;
    gap_meetups: number;
    gap_revenue: number;
    progress_summary: StageProgress;
    validation_status: ValidationStatus;
    validation_message?: string;
    children?: HierarchyNode[];
    club_count?: number;
    area_count?: number;
    city_count?: number;
    target_count?: number;
    is_launch?: boolean;
    activity_id?: number;
    city_id?: number;
    area_id?: number;
    club_id?: number;
    launch_id?: number;
    target_id?: number;
    has_target?: boolean;
    launch_status?: string;
    team?: 'blue' | 'green' | 'yellow';
    last_4w_revenue_total?: number;
    last_4w_revenue_avg?: number;
    revenue_status?: RevenueStatus;
    revenue_status_display?: RevenueStatusDisplay;
    day_type_id?: number;
    day_type_name?: string;
}
export interface WeeklyTrend {
    week_start: string;
    week_end: string;
    week_label: string;
    meetups: number;
    revenue: number;
    target_meetups?: number;
    target_revenue?: number;
}
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
        monthly_target_meetups: number;
        monthly_target_revenue: number;
        last_4w_revenue_total: number;
        last_4w_revenue_avg: number;
        march_2026_revenue: number;
    };
}
export interface QuickAddContext {
    activity_id?: number;
    activity_name?: string;
    city_id?: number;
    city_name?: string;
    area_id?: number;
    area_name?: string;
}
export interface ScalingPlannerV2Filters {
    activity_id?: number;
    city_id?: number;
    area_id?: number;
    validation_status?: ValidationStatus;
    include_launches?: boolean;
}
export type StageKey = 'not_picked' | 'started' | 'stage_1' | 'stage_2' | 'stage_3' | 'stage_4' | 'realised';
export type TaskScope = 'activity' | 'city' | 'area' | 'club' | 'launch';
export type TaskStatus = 'not_started' | 'in_progress' | 'completed' | 'cancelled';
export interface TeamColor {
    bg: string;
    border: string;
    text: string;
}
export interface ScalingTask {
    id: number;
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
    target_id?: number;
    title: string;
    description?: string;
    source_stage?: StageKey;
    target_stage?: StageKey;
    meetups_count: number;
    assigned_to_poc_id?: number;
    assigned_to_name?: string;
    assigned_team_lead?: string;
    status: TaskStatus;
    created_at: string;
    updated_at: string;
    due_date?: string;
    created_by?: string;
    weeks?: ScalingTaskWeek[];
    week_start?: string;
    week_position?: number;
    comments_count?: number;
    comments?: ScalingTaskComment[];
    team_color?: TeamColor;
    linked_leader_requirements?: LeaderRequirement[];
    linked_venue_requirements?: VenueRequirement[];
}
export interface ScalingTaskWeek {
    id: number;
    task_id: number;
    week_start: string;
    position: number;
}
export interface ScalingTaskComment {
    id: number;
    task_id: number;
    comment_text: string;
    author_name?: string;
    created_at: string;
}
export interface ScalingTaskSummary {
    not_started: number;
    in_progress: number;
    completed: number;
    cancelled: number;
    by_transition: {
        'NP_S'?: number;
        'S_S1'?: number;
        'S1_S2'?: number;
        'S2_S3'?: number;
        'S3_S4'?: number;
        'S4_R'?: number;
    };
}
export type RequirementStatus = 'not_picked' | 'deprioritised' | 'in_progress' | 'done';
export interface BaseRequirement {
    id: number;
    name: string;
    description?: string;
    activity_id?: number;
    activity_name?: string;
    city_id?: number;
    city_name?: string;
    area_id?: number;
    area_name?: string;
    club_id?: number;
    club_name?: string;
    status: RequirementStatus;
    growth_team_effort: boolean;
    platform_team_effort: boolean;
    comments?: string;
    team?: 'blue' | 'green' | 'yellow';
    created_at: string;
    updated_at: string;
    created_by?: string;
}
export interface LeaderRequirement extends BaseRequirement {
    type: 'leader';
}
export interface VenueRequirement extends BaseRequirement {
    type: 'venue';
}
export interface CreateRequirementRequest {
    name: string;
    description?: string;
    activity_id?: number;
    activity_name?: string;
    city_id?: number;
    city_name?: string;
    area_id?: number;
    area_name?: string;
    club_id?: number;
    club_name?: string;
    growth_team_effort?: boolean;
    platform_team_effort?: boolean;
    comments?: string;
    team?: 'blue' | 'green' | 'yellow';
}
export interface UpdateRequirementRequest extends Partial<CreateRequirementRequest> {
    status?: RequirementStatus;
}
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
export interface RequirementHierarchyNode {
    type: 'activity' | 'city' | 'area' | 'club' | 'requirement';
    id: string;
    name: string;
    activity_id?: number;
    city_id?: number;
    area_id?: number;
    club_id?: number;
    count: number;
    status_counts: {
        not_picked: number;
        deprioritised: number;
        in_progress: number;
        done: number;
    };
    growth_effort_count: number;
    platform_effort_count: number;
    team?: 'blue' | 'green' | 'yellow';
    children?: RequirementHierarchyNode[];
    requirements?: (LeaderRequirement | VenueRequirement)[];
}
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
    launch_name?: string;
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
export interface SprintsResponse {
    success: boolean;
    weeks: SprintWeek[];
    current_week: string;
}
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
export declare const DAY_TYPE_TO_DOW: Record<number, number[]>;
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
export interface TargetMatchResult {
    target_id: number;
    target_name: string | null;
    matched_meetups: ActualMeetup[];
    matched_count: number;
    matched_revenue: number;
    extra_meetups: number;
    extra_revenue: number;
    new_progress: StageProgress;
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
export interface StageProgressWithUA extends StageProgress {
    unattributed_meetups: number;
}
//# sourceMappingURL=types.d.ts.map