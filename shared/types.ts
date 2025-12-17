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