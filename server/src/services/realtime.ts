import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { logger } from '../utils/logger';
import { query } from './database';

interface RealTimeEvent {
  type: string;
  data: any;
  targetPOCs?: string[];
  timestamp: Date;
}

class RealTimeService {
  private io: any;
  private connectedClients: Map<string, { pocId?: string; filters?: any }> = new Map();

  constructor(server: any) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
      }
    });

    this.setupEventHandlers();
    this.startHealthMonitoring();
    this.startRevenuePipeline();
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}`);

      // Client identifies their POC filter
      socket.on('subscribe', (data: { pocId?: string; filters?: any }) => {
        this.connectedClients.set(socket.id, data);
        logger.info(`Client ${socket.id} subscribed with POC: ${data.pocId}`);

        // Send initial data for their filter
        this.sendInitialData(socket, data);
      });

      socket.on('disconnect', () => {
        this.connectedClients.delete(socket.id);
        logger.info(`Client disconnected: ${socket.id}`);
      });

      // POC Assignment Changes (Your Music Example Scenario)
      socket.on('poc_assignment_changed', async (data) => {
        await this.handlePOCAssignmentChange(data);
      });

      // Meetup Health Changes
      socket.on('meetup_health_changed', async (data) => {
        await this.handleHealthChange(data);
      });

      // Revenue Updates
      socket.on('revenue_updated', async (data) => {
        await this.handleRevenueUpdate(data);
      });
    });
  }

  // Send initial data when client connects with filters
  private async sendInitialData(socket: any, clientData: any) {
    try {
      if (clientData.pocId) {
        // Fetch meetups for this POC
        const meetups = await query(`
          SELECT m.*,
            CASE m.health_status
              WHEN 'GREEN' THEN '🟢'
              WHEN 'YELLOW' THEN '🟡'
              WHEN 'RED' THEN '🔴'
              ELSE '⚪'
            END as health_emoji
          FROM meetups m
          WHERE m.activity_head_id = $1 OR m.city_head_id = $1
          ORDER BY
            CASE m.health_status WHEN 'RED' THEN 1 WHEN 'YELLOW' THEN 2 ELSE 3 END,
            m.updated_at DESC
        `, [clientData.pocId]);

        socket.emit('initial_data', {
          type: 'poc_meetups',
          pocId: clientData.pocId,
          meetups: meetups.rows,
          timestamp: new Date()
        });
      }
    } catch (error) {
      logger.error('Failed to send initial data:', error);
    }
  }

  // Handle POC assignment changes (Dynamic allocation)
  private async handlePOCAssignmentChange(data: any) {
    const { meetupIds, oldPOCId, newPOCId, assignmentType, assignedBy } = data;

    try {
      // Update database
      for (const meetupId of meetupIds) {
        if (assignmentType === 'activity_head') {
          await query(`
            UPDATE meetups
            SET activity_head_id = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [newPOCId, meetupId]);
        } else if (assignmentType === 'city_head') {
          await query(`
            UPDATE meetups
            SET city_head_id = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [newPOCId, meetupId]);
        }
      }

      // Broadcast to affected POCs
      const affectedPOCs = [oldPOCId, newPOCId].filter(Boolean);

      this.broadcastToPOCs(affectedPOCs, {
        type: 'poc_assignment_changed',
        data: {
          meetupIds,
          oldPOCId,
          newPOCId,
          assignmentType,
          assignedBy,
          message: `${meetupIds.length} meetups reassigned`
        },
        timestamp: new Date()
      });

      logger.info(`POC assignment changed: ${meetupIds.length} meetups from ${oldPOCId} to ${newPOCId}`);

    } catch (error) {
      logger.error('Failed to handle POC assignment change:', error);
    }
  }

  // Real-time health monitoring
  private async handleHealthChange(data: any) {
    const { meetupId, oldHealth, newHealth, metrics } = data;

    try {
      // Update health in database
      await query(`
        UPDATE meetups
        SET
          health_status = $1,
          capacity_utilization = $2,
          repeat_rate = $3,
          average_rating = $4,
          revenue_achievement = $5,
          health_last_calculated = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
      `, [newHealth, metrics.capacity, metrics.repeat, metrics.rating, metrics.revenue, meetupId]);

      // Get POCs for this meetup
      const meetupPOCs = await query(`
        SELECT activity_head_id, city_head_id FROM meetups WHERE id = $1
      `, [meetupId]);

      if (meetupPOCs.rows.length > 0) {
        const { activity_head_id, city_head_id } = meetupPOCs.rows[0];
        const affectedPOCs = [activity_head_id, city_head_id].filter(Boolean);

        // Broadcast health change
        this.broadcastToPOCs(affectedPOCs, {
          type: 'health_changed',
          data: {
            meetupId,
            oldHealth,
            newHealth,
            metrics,
            isEmergency: newHealth === 'RED' && oldHealth !== 'RED'
          },
          timestamp: new Date()
        });

        // Create alert for critical health
        if (newHealth === 'RED' && oldHealth !== 'RED') {
          await this.createHealthAlert(meetupId, affectedPOCs);
        }
      }

    } catch (error) {
      logger.error('Failed to handle health change:', error);
    }
  }

  // Revenue pipeline updates
  private async handleRevenueUpdate(data: any) {
    const { meetupId, oldRevenue, newRevenue, source } = data;

    try {
      await query(`
        UPDATE meetups
        SET actual_revenue = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [newRevenue, meetupId]);

      // Broadcast to all clients (affects overall pipeline)
      this.io.emit('revenue_updated', {
        type: 'revenue_pipeline_update',
        data: {
          meetupId,
          oldRevenue,
          newRevenue,
          difference: newRevenue - oldRevenue,
          source
        },
        timestamp: new Date()
      });

      // Update total revenue calculation
      const totalRevenue = await query(`
        SELECT SUM(actual_revenue) as total FROM meetups WHERE actual_revenue > 0
      `);

      this.io.emit('total_revenue_update', {
        type: 'total_revenue',
        data: {
          totalRevenue: totalRevenue.rows[0]?.total || 0,
          target: 6000000, // ₹60L target
          percentage: Math.round((totalRevenue.rows[0]?.total || 0) / 6000000 * 100)
        },
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Failed to handle revenue update:', error);
    }
  }

  // Create health alert notification
  private async createHealthAlert(meetupId: string, pocIds: string[]) {
    try {
      const meetup = await query(`
        SELECT m.*, c.name as club_name
        FROM meetups m
        LEFT JOIN club c ON m.club_id = c.pk
        WHERE m.id = $1
      `, [meetupId]);

      if (meetup.rows.length > 0) {
        const meetupData = meetup.rows[0];

        for (const pocId of pocIds) {
          await query(`
            INSERT INTO real_time_notifications
            (poc_id, notification_type, priority, title, message, action_required, related_meetup_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            pocId,
            'health_alert',
            'CRITICAL',
            `🔴 Critical Health Alert: ${meetupData.name}`,
            `Health dropped to RED. Revenue at risk: ₹${meetupData.expected_revenue}. Immediate action required.`,
            true,
            meetupId
          ]);
        }
      }
    } catch (error) {
      logger.error('Failed to create health alert:', error);
    }
  }

  // Broadcast to specific POCs
  private broadcastToPOCs(pocIds: string[], event: RealTimeEvent) {
    this.connectedClients.forEach((clientData, socketId) => {
      if (clientData.pocId && pocIds.includes(clientData.pocId)) {
        this.io.to(socketId).emit(event.type, event);
      }
    });

    // Also broadcast to "All Data" view
    this.connectedClients.forEach((clientData, socketId) => {
      if (!clientData.pocId) { // All Data view
        this.io.to(socketId).emit(event.type, event);
      }
    });
  }

  // Continuous health monitoring
  private startHealthMonitoring() {
    setInterval(async () => {
      try {
        // Check for health changes every 30 seconds
        const healthChecks = await query(`
          SELECT
            m.id,
            m.health_status,
            m.capacity_utilization,
            m.repeat_rate,
            m.average_rating,
            m.revenue_achievement
          FROM meetups m
          WHERE m.health_last_calculated < CURRENT_TIMESTAMP - INTERVAL '5 minutes'
          LIMIT 50
        `);

        for (const meetup of healthChecks.rows) {
          // Recalculate health
          const newHealth = this.calculateHealth(meetup);

          if (newHealth !== meetup.health_status) {
            await this.handleHealthChange({
              meetupId: meetup.id,
              oldHealth: meetup.health_status,
              newHealth,
              metrics: {
                capacity: meetup.capacity_utilization,
                repeat: meetup.repeat_rate,
                rating: meetup.average_rating,
                revenue: meetup.revenue_achievement
              }
            });
          }
        }
      } catch (error) {
        logger.error('Health monitoring error:', error);
      }
    }, 30000); // Every 30 seconds
  }

  // Start revenue pipeline monitoring
  private startRevenuePipeline() {
    setInterval(async () => {
      try {
        const pipeline = await query(`
          SELECT
            SUM(actual_revenue) as current_revenue,
            SUM(expected_revenue) as target_revenue,
            COUNT(*) as total_meetups,
            COUNT(CASE WHEN health_status = 'GREEN' THEN 1 END) as healthy_count,
            COUNT(CASE WHEN health_status = 'RED' THEN 1 END) as critical_count
          FROM meetups
        `);

        const data = pipeline.rows[0];

        this.io.emit('pipeline_update', {
          type: 'revenue_pipeline',
          data: {
            currentRevenue: data.current_revenue || 0,
            targetRevenue: 6000000, // ₹60L
            percentage: Math.round(((data.current_revenue || 0) / 6000000) * 100),
            totalMeetups: data.total_meetups || 0,
            healthyCounts: {
              healthy: data.healthy_count || 0,
              critical: data.critical_count || 0
            }
          },
          timestamp: new Date()
        });

      } catch (error) {
        logger.error('Revenue pipeline monitoring error:', error);
      }
    }, 60000); // Every minute
  }

  // Health calculation logic
  private calculateHealth(meetup: any): string {
    const { capacity_utilization, repeat_rate, average_rating, revenue_achievement } = meetup;

    if (capacity_utilization >= 0.75 &&
        repeat_rate >= 0.60 &&
        average_rating >= 4.7 &&
        revenue_achievement >= 1.0) {
      return 'GREEN';
    }

    if (capacity_utilization < 0.60 ||
        repeat_rate < 0.40 ||
        average_rating < 4.5 ||
        revenue_achievement < 0.8) {
      return 'RED';
    }

    return 'YELLOW';
  }

  // Your Music Example: Simulate Saurabh getting assigned to Music
  async simulateMusic_POCAssignment() {
    // This simulates you appointing Saurabh as Music head
    const pocId = await query(`SELECT id FROM poc_structure WHERE name = 'Saurabh' AND 'Music' = ANY(activities)`);

    if (pocId.rows.length > 0) {
      const musicMeetups = await query(`SELECT id FROM meetups WHERE activity = 'Music'`);

      await this.handlePOCAssignmentChange({
        meetupIds: musicMeetups.rows.map(r => r.id),
        oldPOCId: null,
        newPOCId: pocId.rows[0].id,
        assignmentType: 'activity_head',
        assignedBy: 'System Admin'
      });

      logger.info('Saurabh assigned as Music head - real-time updates sent!');
    }
  }
}

export default RealTimeService;
