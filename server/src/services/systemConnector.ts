import { intelligentTaskEngine } from './intelligentTaskEngine';
import { query, transaction } from './database';
import { logger } from '../utils/logger';
import type { Club, SystemEvent } from '../../../shared/types';

/**
 * SystemConnector - Bridges UI actions with database and intelligent systems
 * Ensures all system components stay synchronized
 */
export class SystemConnector {

  /**
   * Handles POC assignment with full system integration
   * Example: User assigns themselves as POC for basketball club
   */
  async assignPOC(clubId: string, pocId: string, assignedBy: string): Promise<void> {
    try {
      await transaction(async (client) => {
        // 1. Update club in database
        await client.query(
          'UPDATE clubs SET poc_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [pocId, clubId]
        );

        // 2. Get club details for context
        const clubResult = await client.query(
          'SELECT name, activity, city FROM clubs WHERE id = $1',
          [clubId]
        );
        const club = clubResult.rows[0];

        logger.info(`POC assigned: ${pocId} → ${club.name} (${club.activity})`);

        // 3. Trigger intelligent task engine
        await intelligentTaskEngine.handlePocAssignment(pocId, clubId, assignedBy);

        // 4. Create system event record
        await client.query(`
          INSERT INTO system_events (event_type, event_data, triggered_by, created_at)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        `, [
          'poc_assigned',
          JSON.stringify({ clubId, pocId, clubName: club.name, activity: club.activity }),
          assignedBy
        ]);

        // 5. Update user workspace with new club
        await this.updateUserWorkspaceForNewClub(pocId, clubId, club);
      });

    } catch (error) {
      logger.error('POC assignment failed:', error);
      throw new Error('Failed to assign POC');
    }
  }

  /**
   * Handles club health status changes with intelligent response
   */
  async updateClubHealth(clubId: string, newHealth: 'green' | 'yellow' | 'red', triggeredBy: string): Promise<void> {
    try {
      await transaction(async (client) => {
        // Get current health
        const currentResult = await client.query('SELECT health_status FROM clubs WHERE id = $1', [clubId]);
        const oldHealth = currentResult.rows[0]?.health_status;

        if (oldHealth === newHealth) return; // No change

        // Update health
        await client.query(
          'UPDATE clubs SET health_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [newHealth, clubId]
        );

        logger.info(`Club health changed: ${clubId} ${oldHealth} → ${newHealth}`);

        // Trigger intelligent response
        await intelligentTaskEngine.handleClubHealthChange(clubId, oldHealth, newHealth);

        // Record event
        await client.query(`
          INSERT INTO system_events (event_type, event_data, triggered_by, created_at)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        `, [
          'health_changed',
          JSON.stringify({ clubId, oldHealth, newHealth }),
          triggeredBy
        ]);
      });
    } catch (error) {
      logger.error('Health update failed:', error);
      throw new Error('Failed to update club health');
    }
  }

  /**
   * Handles club state changes (stage_1 → stage_2 → stage_3 → active)
   */
  async updateClubState(clubId: string, newState: string, triggeredBy: string): Promise<void> {
    try {
      await transaction(async (client) => {
        const currentResult = await client.query('SELECT current_state FROM clubs WHERE id = $1', [clubId]);
        const oldState = currentResult.rows[0]?.current_state;

        if (oldState === newState) return;

        await client.query(
          'UPDATE clubs SET current_state = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [newState, clubId]
        );

        logger.info(`Club state changed: ${clubId} ${oldState} → ${newState}`);

        // Trigger intelligent response
        await intelligentTaskEngine.handleStateChange(clubId, oldState, newState);

        // Record event
        await client.query(`
          INSERT INTO system_events (event_type, event_data, triggered_by, created_at)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        `, [
          'state_changed',
          JSON.stringify({ clubId, oldState, newState }),
          triggeredBy
        ]);
      });
    } catch (error) {
      logger.error('State update failed:', error);
      throw new Error('Failed to update club state');
    }
  }

  /**
   * Gets user's assigned clubs (for basketball example)
   * Returns clubs where user is POC, city head, or activity head
   */
  async getUserAssignedClubs(userId: string): Promise<Club[]> {
    try {
      const result = await query(`
        SELECT c.*,
               u1.name as poc_name,
               u2.name as city_head_name,
               u3.name as activity_head_name
        FROM clubs c
        LEFT JOIN users u1 ON c.poc_id = u1.id
        LEFT JOIN users u2 ON c.city_head_id = u2.id
        LEFT JOIN users u3 ON c.activity_head_id = u3.id
        WHERE c.poc_id = $1 OR c.city_head_id = $1 OR c.activity_head_id = $1
        ORDER BY c.health_status DESC, c.updated_at DESC
      `, [userId]);

      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        activity: row.activity,
        city: row.city,
        area: row.area,
        currentState: row.current_state,
        healthStatus: row.health_status,
        pocId: row.poc_id,
        cityHeadId: row.city_head_id,
        activityHeadId: row.activity_head_id,
        venue: row.venue,
        leaderId: row.leader_id,
        pricing: row.pricing,
        capacity: row.capacity,
        avgRating: parseFloat(row.avg_rating) || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      logger.error('Failed to get user assigned clubs:', error);
      return [];
    }
  }

  /**
   * Creates initial workspace entry when user gets new club assignment
   */
  private async updateUserWorkspaceForNewClub(userId: string, clubId: string, club: any): Promise<void> {
    try {
      // Get or create user workspace
      const workspaceResult = await query('SELECT * FROM user_workspace WHERE user_id = $1', [userId]);

      if (workspaceResult.rows.length === 0) {
        // Create new workspace
        await query(`
          INSERT INTO user_workspace (user_id, club_notes, personal_todos, weekly_plans, pinned_items, preferences)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          userId,
          JSON.stringify({ [clubId]: `New assignment: ${club.name}\n\nInitial notes:\n- Get familiar with current state\n- Connect with leader\n- Understand challenges` }),
          JSON.stringify([]),
          JSON.stringify({}),
          JSON.stringify([]),
          JSON.stringify({})
        ]);
      } else {
        // Update existing workspace
        const workspace = workspaceResult.rows[0];
        const clubNotes = JSON.parse(workspace.club_notes || '{}');

        clubNotes[clubId] = `New assignment: ${club.name}\n\nInitial notes:\n- Get familiar with current state\n- Connect with leader\n- Understand challenges`;

        await query(`
          UPDATE user_workspace
          SET club_notes = $1, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $2
        `, [JSON.stringify(clubNotes), userId]);
      }

      logger.info(`Updated workspace for user ${userId} with new club ${clubId}`);
    } catch (error) {
      logger.error('Failed to update user workspace:', error);
    }
  }

  /**
   * Smart query: Find clubs by activity and owner
   * Example: "Show me all basketball clubs where Saurabh is POC"
   */
  async getClubsByActivityAndOwner(activity: string, userId: string, role: 'poc' | 'city_head' | 'activity_head' = 'poc'): Promise<Club[]> {
    const roleColumn = role === 'poc' ? 'poc_id' : role === 'city_head' ? 'city_head_id' : 'activity_head_id';

    try {
      const result = await query(`
        SELECT c.*, u.name as owner_name
        FROM clubs c
        JOIN users u ON c.${roleColumn} = u.id
        WHERE LOWER(c.activity) = LOWER($1) AND c.${roleColumn} = $2
        ORDER BY c.health_status DESC, c.name
      `, [activity, userId]);

      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        activity: row.activity,
        city: row.city,
        area: row.area,
        currentState: row.current_state,
        healthStatus: row.health_status,
        pocId: row.poc_id,
        cityHeadId: row.city_head_id,
        activityHeadId: row.activity_head_id,
        venue: row.venue,
        leaderId: row.leader_id,
        pricing: row.pricing,
        capacity: row.capacity,
        avgRating: parseFloat(row.avg_rating) || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      logger.error('Failed to get clubs by activity and owner:', error);
      return [];
    }
  }

  /**
   * Dashboard data with intelligent insights
   */
  async getDashboardData(userId: string) {
    try {
      const [userClubs, allTasks, systemEvents] = await Promise.all([
        this.getUserAssignedClubs(userId),
        query('SELECT * FROM intelligent_tasks WHERE assigned_to = $1 AND completed_status != $2 ORDER BY priority, due_date', [userId, 'completed']),
        query('SELECT * FROM system_events WHERE created_at > NOW() - INTERVAL \'24 hours\' ORDER BY created_at DESC LIMIT 10')
      ]);

      return {
        assignedClubs: userClubs,
        priorityTasks: allTasks.rows,
        recentSystemEvents: systemEvents.rows,
        healthSummary: this.calculateHealthSummary(userClubs)
      };
    } catch (error) {
      logger.error('Failed to get dashboard data:', error);
      throw error;
    }
  }

  private calculateHealthSummary(clubs: Club[]) {
    const total = clubs.length;
    const green = clubs.filter(c => c.healthStatus === 'green').length;
    const yellow = clubs.filter(c => c.healthStatus === 'yellow').length;
    const red = clubs.filter(c => c.healthStatus === 'red').length;

    return { total, green, yellow, red };
  }
}

// Export singleton
export const systemConnector = new SystemConnector();