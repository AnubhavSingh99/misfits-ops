// Stage Progression Workflow Engine
// Based on PRD v8.1 - Stage: not_picked → stage_1 → stage_2 → stage_3 → realised

import { Stage, Meetup, POC } from '../types/core';
import { api } from './api';

/**
 * Stage Definitions and Workflows (PRD Based)
 */
export const STAGE_DEFINITIONS = {
  not_picked: {
    name: 'Not Picked',
    description: 'Club concept identified but not yet assigned',
    color: 'gray',
    requirements: [],
    nextStages: ['stage_1'],
    autoActions: []
  },
  stage_1: {
    name: 'Stage 1: Planning',
    description: 'Initial planning and resource allocation',
    color: 'blue',
    requirements: [
      'POC assigned',
      'Activity type confirmed',
      'Initial budget approved'
    ],
    nextStages: ['stage_2'],
    autoActions: [
      'assign_poc',
      'create_planning_tasks',
      'schedule_kickoff'
    ]
  },
  stage_2: {
    name: 'Stage 2: Setup',
    description: 'Venue booking, leader recruitment, marketing setup',
    color: 'purple',
    requirements: [
      'Venue confirmed',
      'Leader recruited',
      'Marketing materials ready',
      'Pricing finalized'
    ],
    nextStages: ['stage_3'],
    autoActions: [
      'create_venue_tasks',
      'create_leader_tasks',
      'create_marketing_tasks',
      'setup_pricing'
    ]
  },
  stage_3: {
    name: 'Stage 3: Launch Prep',
    description: 'Final preparations before going live',
    color: 'orange',
    requirements: [
      'First meetup scheduled',
      'Registration system active',
      'Leader trained',
      'Marketing campaign live'
    ],
    nextStages: ['realised'],
    autoActions: [
      'schedule_first_meetup',
      'activate_registration',
      'launch_marketing',
      'conduct_leader_training'
    ]
  },
  realised: {
    name: 'Realised: Active',
    description: 'Club is live and running meetups',
    color: 'green',
    requirements: [
      'First meetup completed',
      'Revenue generated',
      'Members registered',
      'Regular schedule established'
    ],
    nextStages: [],
    autoActions: [
      'track_health_metrics',
      'monitor_revenue',
      'generate_regular_tasks'
    ]
  }
};

/**
 * Stage Business Rules
 */
export const STAGE_RULES = {
  // Minimum time requirements between stages (in days)
  minimumStageTime: {
    not_picked: 0,
    stage_1: 3, // Min 3 days for planning
    stage_2: 7, // Min 1 week for setup
    stage_3: 5, // Min 5 days for launch prep
    realised: 0
  },

  // Auto-progression conditions
  autoProgressionEnabled: true,

  // Validation rules per stage
  validationRules: {
    stage_1: {
      required: ['poc_assigned', 'activity_confirmed', 'budget_approved'],
      optional: ['initial_planning_complete']
    },
    stage_2: {
      required: ['venue_confirmed', 'leader_recruited', 'pricing_set'],
      optional: ['marketing_ready']
    },
    stage_3: {
      required: ['first_meetup_scheduled', 'registration_active', 'leader_trained'],
      optional: ['marketing_live']
    },
    realised: {
      required: ['first_meetup_completed', 'revenue_generated'],
      optional: ['member_feedback_collected']
    }
  }
};

/**
 * Task Templates for Each Stage
 */
export const STAGE_TASK_TEMPLATES = {
  stage_1: [
    {
      title: 'Assign POC for {meetup_name}',
      description: 'Assign appropriate Activity Head and City Head',
      priority: 'P1' as const,
      estimated_hours: 1,
      category: 'assignment'
    },
    {
      title: 'Confirm activity details for {meetup_name}',
      description: 'Finalize activity type, format, and target audience',
      priority: 'P1' as const,
      estimated_hours: 2,
      category: 'planning'
    },
    {
      title: 'Approve initial budget for {meetup_name}',
      description: 'Review and approve startup costs and pricing strategy',
      priority: 'P2' as const,
      estimated_hours: 1,
      category: 'finance'
    }
  ],
  stage_2: [
    {
      title: 'Find and book venue for {meetup_name}',
      description: 'Identify suitable venue and negotiate terms',
      priority: 'P0' as const,
      estimated_hours: 8,
      category: 'venue'
    },
    {
      title: 'Recruit and interview leader for {meetup_name}',
      description: 'Find qualified leader for the activity',
      priority: 'P0' as const,
      estimated_hours: 12,
      category: 'leader'
    },
    {
      title: 'Create marketing materials for {meetup_name}',
      description: 'Design flyers, social media content, and descriptions',
      priority: 'P1' as const,
      estimated_hours: 6,
      category: 'marketing'
    },
    {
      title: 'Set pricing and capacity for {meetup_name}',
      description: 'Finalize pricing strategy and maximum capacity',
      priority: 'P1' as const,
      estimated_hours: 2,
      category: 'pricing'
    }
  ],
  stage_3: [
    {
      title: 'Schedule first meetup for {meetup_name}',
      description: 'Set date, time, and create event listing',
      priority: 'P0' as const,
      estimated_hours: 2,
      category: 'scheduling'
    },
    {
      title: 'Activate registration system for {meetup_name}',
      description: 'Enable online registration and payment processing',
      priority: 'P0' as const,
      estimated_hours: 3,
      category: 'registration'
    },
    {
      title: 'Conduct leader training for {meetup_name}',
      description: 'Train leader on Misfits processes and standards',
      priority: 'P1' as const,
      estimated_hours: 4,
      category: 'training'
    },
    {
      title: 'Launch marketing campaign for {meetup_name}',
      description: 'Begin promotion across all channels',
      priority: 'P1' as const,
      estimated_hours: 3,
      category: 'marketing'
    }
  ],
  realised: [
    {
      title: 'Monitor health metrics for {meetup_name}',
      description: 'Track capacity, repeat rate, rating, and revenue',
      priority: 'P2' as const,
      estimated_hours: 1,
      category: 'monitoring',
      recurring: 'weekly'
    },
    {
      title: 'Collect member feedback for {meetup_name}',
      description: 'Gather feedback after each meetup',
      priority: 'P2' as const,
      estimated_hours: 1,
      category: 'feedback',
      recurring: 'after_each_meetup'
    }
  ]
};

/**
 * Stage Progression Engine
 */
export class StageProgressionEngine {

  /**
   * Check if meetup can progress to next stage
   */
  static canProgressToStage(meetup: Meetup, targetStage: Stage): {
    canProgress: boolean;
    blockers: string[];
    requirements: string[];
  } {
    const currentStageInfo = STAGE_DEFINITIONS[meetup.stage];
    const targetStageInfo = STAGE_DEFINITIONS[targetStage];

    const blockers: string[] = [];
    const requirements = targetStageInfo.requirements;

    // Check if target stage is a valid next stage
    if (!currentStageInfo.nextStages.includes(targetStage)) {
      blockers.push(`Cannot progress from ${meetup.stage} directly to ${targetStage}`);
    }

    // Check minimum time requirements
    const stageStartDate = new Date(meetup.updated_at);
    const daysSinceStageStart = Math.floor((Date.now() - stageStartDate.getTime()) / (1000 * 60 * 60 * 24));
    const minimumDays = STAGE_RULES.minimumStageTime[meetup.stage];

    if (daysSinceStageStart < minimumDays) {
      blockers.push(`Must spend at least ${minimumDays} days in ${meetup.stage} (${daysSinceStageStart} days elapsed)`);
    }

    // Check validation rules (would integrate with actual data)
    const validationRules = STAGE_RULES.validationRules[targetStage];
    if (validationRules) {
      // In production, would check actual completion status
      validationRules.required.forEach(requirement => {
        // Simulate validation - in production would check actual status
        const isCompleted = Math.random() > 0.3; // Simulate 70% completion rate
        if (!isCompleted) {
          blockers.push(`Required: ${requirement.replace('_', ' ')}`);
        }
      });
    }

    return {
      canProgress: blockers.length === 0,
      blockers,
      requirements
    };
  }

  /**
   * Progress meetup to next stage
   */
  static async progressMeetup(
    meetupId: string,
    targetStage: Stage,
    comment?: string,
    assignedTo?: string
  ): Promise<{
    success: boolean;
    meetup?: Meetup;
    tasksCreated?: any[];
    error?: string;
  }> {
    try {
      // Progress the meetup
      const updatedMeetup = await api.meetups.updateStage(meetupId, targetStage, comment);

      // Generate stage-specific tasks
      const tasksCreated = await this.generateStageTasks(updatedMeetup, assignedTo);

      // Execute auto-actions for the new stage
      await this.executeAutoActions(updatedMeetup, targetStage);

      return {
        success: true,
        meetup: updatedMeetup,
        tasksCreated
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate tasks for current stage
   */
  static async generateStageTasks(meetup: Meetup, assignedTo?: string): Promise<any[]> {
    const taskTemplates = STAGE_TASK_TEMPLATES[meetup.stage] || [];
    const tasks: any[] = [];

    for (const template of taskTemplates) {
      const task = {
        ...template,
        title: template.title.replace('{meetup_name}', meetup.name),
        description: template.description.replace('{meetup_name}', meetup.name),
        meetup_id: meetup.id,
        assigned_to: assignedTo || meetup.activity_head_id,
        stage: meetup.stage,
        created_at: new Date().toISOString(),
        due_date: this.calculateDueDate(template.priority, template.estimated_hours),
        status: 'pending' as const
      };

      tasks.push(task);
    }

    // In production, would save tasks via API
    // await api.tasks.createBatch(tasks);

    return tasks;
  }

  /**
   * Execute auto-actions for stage
   */
  static async executeAutoActions(meetup: Meetup, stage: Stage): Promise<void> {
    const stageInfo = STAGE_DEFINITIONS[stage];
    const actions = stageInfo.autoActions;

    for (const action of actions) {
      try {
        await this.executeAction(action, meetup);
      } catch (error) {
        console.error(`Failed to execute action ${action} for meetup ${meetup.id}:`, error);
      }
    }
  }

  /**
   * Execute individual auto-action
   */
  static async executeAction(action: string, meetup: Meetup): Promise<void> {
    switch (action) {
      case 'assign_poc':
        // Logic to assign POCs based on activity and city
        console.log(`Auto-assigning POC for ${meetup.name}`);
        break;

      case 'create_planning_tasks':
        // Generate planning-specific tasks
        console.log(`Creating planning tasks for ${meetup.name}`);
        break;

      case 'create_venue_tasks':
        // Generate venue-related tasks
        console.log(`Creating venue tasks for ${meetup.name}`);
        break;

      case 'track_health_metrics':
        // Start health tracking
        console.log(`Starting health tracking for ${meetup.name}`);
        break;

      // Add more auto-actions as needed
      default:
        console.log(`Executing action: ${action} for ${meetup.name}`);
    }
  }

  /**
   * Calculate due date based on priority and effort
   */
  static calculateDueDate(priority: 'P0' | 'P1' | 'P2', estimatedHours: number): string {
    const now = new Date();
    let daysToAdd = 7; // Default: 1 week

    switch (priority) {
      case 'P0': daysToAdd = Math.max(1, Math.ceil(estimatedHours / 8)); break; // Critical: based on effort
      case 'P1': daysToAdd = Math.max(3, Math.ceil(estimatedHours / 6)); break; // Important: 3+ days
      case 'P2': daysToAdd = Math.max(7, Math.ceil(estimatedHours / 4)); break; // Normal: 1+ weeks
    }

    now.setDate(now.getDate() + daysToAdd);
    return now.toISOString();
  }

  /**
   * Get stage progression analytics
   */
  static getStageAnalytics(meetups: Meetup[]): {
    distribution: Record<Stage, number>;
    averageTimeInStage: Record<Stage, number>;
    bottlenecks: { stage: Stage; count: number; avgDays: number }[];
  } {
    const distribution: Record<Stage, number> = {
      not_picked: 0,
      stage_1: 0,
      stage_2: 0,
      stage_3: 0,
      realised: 0
    };

    const timeInStage: Record<Stage, number[]> = {
      not_picked: [],
      stage_1: [],
      stage_2: [],
      stage_3: [],
      realised: []
    };

    meetups.forEach(meetup => {
      distribution[meetup.stage]++;

      const daysSinceUpdate = Math.floor(
        (Date.now() - new Date(meetup.updated_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      timeInStage[meetup.stage].push(daysSinceUpdate);
    });

    const averageTimeInStage: Record<Stage, number> = {} as Record<Stage, number>;
    Object.keys(timeInStage).forEach(stage => {
      const times = timeInStage[stage as Stage];
      averageTimeInStage[stage as Stage] = times.length > 0
        ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
        : 0;
    });

    // Identify bottlenecks (stages with high count and high average time)
    const bottlenecks = Object.entries(distribution)
      .map(([stage, count]) => ({
        stage: stage as Stage,
        count,
        avgDays: averageTimeInStage[stage as Stage]
      }))
      .filter(item => item.count > 0 && item.avgDays > 14) // More than 2 weeks is a bottleneck
      .sort((a, b) => b.count - a.count);

    return {
      distribution,
      averageTimeInStage,
      bottlenecks
    };
  }
}

export default StageProgressionEngine;