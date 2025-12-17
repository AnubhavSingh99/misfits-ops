import { hybridDataLayer } from './hybridDataLayer';
import { logger } from '../utils/logger';
import type { SystemEvent, IntelligentTask, TaskTemplate } from '../../../shared/types';

export class IntelligentTaskEngine {
  private taskTemplates: Map<string, TaskTemplate[]> = new Map();

  constructor() {
    this.initializeTaskTemplates();
  }

  private initializeTaskTemplates() {
    // POC Assignment Templates
    this.taskTemplates.set('poc_assigned', [
      {
        id: 'poc_onboarding',
        name: 'POC Onboarding Workflow',
        trigger: 'poc_assigned',
        conditions: {},
        priority: 'P0',
        estimatedDuration: 8,
        tasks: [
          {
            title: 'Review assigned clubs overview',
            description: 'Study current state, metrics, and challenges of all assigned clubs',
            dueInHours: 4,
            assigneeDetermination: 'trigger_user'
          },
          {
            title: 'Connect with club leaders',
            description: 'Introduce yourself and understand current operations',
            dueInHours: 24,
            assigneeDetermination: 'trigger_user'
          },
          {
            title: 'Visit problematic venues',
            description: 'Conduct field visits for all RED status clubs',
            dueInHours: 48,
            assigneeDetermination: 'trigger_user'
          },
          {
            title: 'Create improvement action plan',
            description: 'Develop specific plans for each struggling club',
            dueInHours: 96,
            assigneeDetermination: 'trigger_user'
          }
        ]
      }
    ]);

    // Health Change Templates
    this.taskTemplates.set('health_changed', [
      {
        id: 'red_alert_response',
        name: 'Emergency Red Club Response',
        trigger: 'health_changed',
        conditions: { newHealth: 'red' },
        priority: 'P0',
        estimatedDuration: 24,
        tasks: [
          {
            title: 'Emergency club investigation',
            description: 'Immediately investigate cause of health deterioration',
            dueInHours: 2,
            assigneeDetermination: 'poc'
          },
          {
            title: 'Contact club leader',
            description: 'Speak with leader to understand immediate issues',
            dueInHours: 4,
            assigneeDetermination: 'poc'
          },
          {
            title: 'Create recovery plan',
            description: 'Develop specific recovery actions with timelines',
            dueInHours: 24,
            assigneeDetermination: 'poc'
          }
        ]
      }
    ]);
  }

  async processEvent(event: SystemEvent): Promise<IntelligentTask[]> {
    logger.info('Processing intelligent event:', event);

    const templates = this.taskTemplates.get(event.type) || [];
    const generatedTasks: IntelligentTask[] = [];

    for (const template of templates) {
      if (this.matchesConditions(event, template.conditions)) {
        const tasks = await this.generateTasksFromTemplate(event, template);
        generatedTasks.push(...tasks);
      }
    }

    // Save generated tasks to Firebase (NOT PostgreSQL)
    for (const task of generatedTasks) {
      await hybridDataLayer.saveIntelligentTask(task);
    }

    // Send notifications for critical tasks
    await this.sendTaskNotifications(generatedTasks);

    logger.info(`Generated ${generatedTasks.length} intelligent tasks for event: ${event.type}`);
    return generatedTasks;
  }

  private matchesConditions(event: SystemEvent, conditions: Record<string, any>): boolean {
    for (const [key, value] of Object.entries(conditions)) {
      if ((event as any)[key] !== value) {
        return false;
      }
    }
    return true;
  }

  private async generateTasksFromTemplate(
    event: SystemEvent,
    template: TaskTemplate
  ): Promise<IntelligentTask[]> {
    const tasks: IntelligentTask[] = [];

    for (const taskDef of template.tasks) {
      const assignedTo = await this.determineAssignee(event, taskDef.assigneeDetermination);
      const dueDate = new Date(Date.now() + taskDef.dueInHours * 60 * 60 * 1000);

      const task: Omit<IntelligentTask, 'id'> = {
        triggerEvent: event.type,
        triggerDetails: event,
        generatedTasks: template.tasks.map(t => t.title),
        assignedTo,
        priority: template.priority,
        dueDate,
        escalationRule: this.generateEscalationRule(template.priority, taskDef.dueInHours),
        completedStatus: 'pending',
        createdByAi: true,
        clubId: 'clubId' in event ? event.clubId : undefined,
        title: taskDef.title,
        description: taskDef.description,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      tasks.push(task as IntelligentTask);
    }

    return tasks;
  }

  private async determineAssignee(event: SystemEvent, determination: string): Promise<string> {
    // For now, return the user who triggered the event or default founder
    if (determination === 'trigger_user' && 'userId' in event) {
      return event.userId;
    }

    // Default to founder for now - in real system, would look up actual assignments
    return 'founder-user-id';
  }

  private generateEscalationRule(priority: string, dueInHours: number): string {
    if (priority === 'P0') {
      return `Escalate to founder if not completed in ${Math.floor(dueInHours / 2)} hours`;
    } else if (priority === 'P1') {
      return `Escalate to manager if not completed in ${dueInHours + 24} hours`;
    } else {
      return `Review if not completed in ${dueInHours + 48} hours`;
    }
  }

  private async sendTaskNotifications(tasks: IntelligentTask[]): Promise<void> {
    for (const task of tasks) {
      if (task.priority === 'P0') {
        await this.sendCriticalNotification(task);
      }
    }
  }

  private async sendCriticalNotification(task: IntelligentTask): Promise<void> {
    await hybridDataLayer.saveNotification({
      userId: task.assignedTo,
      title: 'Critical Task Assigned',
      message: `🔴 ${task.title}`,
      priority: 'CRITICAL',
      actionButtons: [
        { label: 'View Task', action: 'view_task', style: 'primary' },
        { label: 'Delegate', action: 'delegate', style: 'secondary' }
      ]
    });
  }

  // Event handlers that save to Firebase instead of PostgreSQL
  async handleClubHealthChange(clubId: string, oldHealth: string, newHealth: string): Promise<void> {
    // Save health change to Firebase
    await hybridDataLayer.saveClubHealthUpdate(clubId, oldHealth, newHealth, 'Manual update');

    const event: SystemEvent = {
      type: 'health_changed',
      clubId,
      oldHealth,
      newHealth
    };

    await this.processEvent(event);
  }

  async handlePocAssignment(pocId: string, clubId: string, userId: string): Promise<void> {
    // Save POC assignment to Firebase
    await hybridDataLayer.savePOCAssignment(clubId, pocId, userId);

    const event: SystemEvent = {
      type: 'poc_assigned',
      pocId,
      clubId,
      userId
    };

    await this.processEvent(event);
  }

  async handleStateChange(clubId: string, oldState: string, newState: string): Promise<void> {
    const event: SystemEvent = {
      type: 'state_changed',
      clubId,
      oldState,
      newState
    };

    await this.processEvent(event);
  }
}

// Export singleton instance
export const intelligentTaskEngine = new IntelligentTaskEngine();