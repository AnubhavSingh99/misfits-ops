import { query } from './database';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, addDoc, collection, getDocs, updateDoc } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { logger } from '../utils/logger';
import type { Club, IntelligentTask, UserWorkspace } from '../../../shared/types';

/**
 * Hybrid Data Layer
 * - READ from Misfits PostgreSQL (existing data)
 * - WRITE to Firebase (operations data)
 * - NO IMPACT on Misfits database
 */

// Firebase configuration
const firebaseConfig = {
  // Add your Firebase config here
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

export class HybridDataLayer {

  // ===============================
  // READ OPERATIONS (PostgreSQL - Misfits DB)
  // ===============================

  /**
   * Get clubs from Misfits database (READ ONLY)
   */
  async getClubsFromMisfitsDB(): Promise<Club[]> {
    try {
      const result = await query(`
        SELECT
          c.pk as id,
          c.name,
          c.activity,
          c.status,
          c.avg_rating,
          c.city,
          c.area,
          c.venue,
          c.pricing,
          c.capacity,
          c.created_at,
          c.updated_at
        FROM club c
        WHERE c.status = 'ACTIVE'
        ORDER BY c.name
      `);

      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        activity: row.activity,
        city: row.city || 'Unknown',
        area: row.area || 'Unknown',
        currentState: 'active', // Default since existing clubs are active
        healthStatus: this.calculateHealthFromMisfitsData(row) as 'green' | 'yellow' | 'red',
        venue: row.venue,
        pricing: row.pricing,
        capacity: row.capacity,
        avgRating: parseFloat(row.avg_rating) || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      logger.error('Failed to get clubs from Misfits DB:', error);
      return [];
    }
  }

  /**
   * Get users from Misfits database (READ ONLY)
   */
  async getUsersFromMisfitsDB() {
    try {
      const result = await query(`
        SELECT
          id,
          name,
          email,
          role,
          created_at
        FROM users
        WHERE status = 'ACTIVE'
      `);

      return result.rows;
    } catch (error) {
      logger.error('Failed to get users from Misfits DB:', error);
      return [];
    }
  }

  /**
   * Get revenue data from Misfits DB (READ ONLY)
   */
  async getRevenueData() {
    try {
      const result = await query(`
        SELECT
          DATE_TRUNC('month', p.created_at) as month,
          SUM(p.amount)/100 as total_revenue_rupees
        FROM payment p
        JOIN booking b ON p.booking_id = b.pk
        JOIN event e ON b.event_id = e.pk
        JOIN club c ON e.club_id = c.pk
        WHERE p.status = 'COMPLETED'
        AND p.created_at >= CURRENT_DATE - INTERVAL '6 months'
        AND c.status = 'ACTIVE'
        GROUP BY DATE_TRUNC('month', p.created_at)
        ORDER BY month DESC
      `);

      return result.rows;
    } catch (error) {
      logger.error('Failed to get revenue data:', error);
      return [];
    }
  }

  // ===============================
  // WRITE OPERATIONS (Firebase)
  // ===============================

  /**
   * Save intelligent task to Firebase
   */
  async saveIntelligentTask(task: Omit<IntelligentTask, 'id'>): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, 'intelligent_tasks'), {
        ...task,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      logger.info(`Saved task to Firebase: ${docRef.id}`);
      return docRef.id;
    } catch (error) {
      logger.error('Failed to save task to Firebase:', error);
      throw error;
    }
  }

  /**
   * Update task status in Firebase
   */
  async updateTaskStatus(taskId: string, status: 'pending' | 'in_progress' | 'completed'): Promise<void> {
    try {
      await updateDoc(doc(db, 'intelligent_tasks', taskId), {
        completedStatus: status,
        updatedAt: new Date()
      });

      logger.info(`Updated task status: ${taskId} -> ${status}`);
    } catch (error) {
      logger.error('Failed to update task status:', error);
      throw error;
    }
  }

  /**
   * Save user workspace to Firebase
   */
  async saveUserWorkspace(userId: string, workspace: UserWorkspace): Promise<void> {
    try {
      await setDoc(doc(db, 'user_workspaces', userId), {
        ...workspace,
        updatedAt: new Date()
      });

      logger.info(`Saved workspace for user: ${userId}`);
    } catch (error) {
      logger.error('Failed to save workspace:', error);
      throw error;
    }
  }

  /**
   * Save POC assignment to Firebase (not Misfits DB!)
   */
  async savePOCAssignment(clubId: string, pocId: string, assignedBy: string): Promise<void> {
    try {
      await addDoc(collection(db, 'poc_assignments'), {
        clubId,
        pocId,
        assignedBy,
        createdAt: new Date(),
        status: 'active'
      });

      logger.info(`Saved POC assignment: ${pocId} -> club ${clubId}`);
    } catch (error) {
      logger.error('Failed to save POC assignment:', error);
      throw error;
    }
  }

  /**
   * Save club health update to Firebase (tracking only)
   */
  async saveClubHealthUpdate(clubId: string, oldHealth: string, newHealth: string, reason: string): Promise<void> {
    try {
      await addDoc(collection(db, 'club_health_updates'), {
        clubId,
        oldHealth,
        newHealth,
        reason,
        timestamp: new Date()
      });

      logger.info(`Saved health update: club ${clubId} ${oldHealth} -> ${newHealth}`);
    } catch (error) {
      logger.error('Failed to save health update:', error);
      throw error;
    }
  }

  /**
   * Save system notification to Firebase
   */
  async saveNotification(notification: {
    userId: string;
    title: string;
    message: string;
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    actionButtons?: any[];
  }): Promise<void> {
    try {
      await addDoc(collection(db, 'notifications'), {
        ...notification,
        read: false,
        createdAt: new Date()
      });

      logger.info(`Saved notification for user: ${notification.userId}`);
    } catch (error) {
      logger.error('Failed to save notification:', error);
      throw error;
    }
  }

  // ===============================
  // HYBRID OPERATIONS (Read from PostgreSQL + Augment with Firebase)
  // ===============================

  /**
   * Get user's assigned clubs (combines PostgreSQL data with Firebase assignments)
   */
  async getUserAssignedClubs(userId: string): Promise<Club[]> {
    try {
      // Get all clubs from Misfits DB
      const allClubs = await this.getClubsFromMisfitsDB();

      // Get POC assignments from Firebase
      const assignmentsSnapshot = await getDocs(collection(db, 'poc_assignments'));
      const userAssignments = assignmentsSnapshot.docs
        .map(doc => doc.data())
        .filter(assignment => assignment.pocId === userId && assignment.status === 'active');

      // Filter clubs based on assignments
      const assignedClubIds = userAssignments.map(a => a.clubId);
      const assignedClubs = allClubs.filter(club => assignedClubIds.includes(club.id));

      // Augment with Firebase operations data
      for (const club of assignedClubs) {
        // Get health updates from Firebase
        const healthSnapshot = await getDocs(collection(db, 'club_health_updates'));
        const latestHealthUpdate = healthSnapshot.docs
          .map(doc => doc.data())
          .filter(update => update.clubId === club.id)
          .sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis())[0];

        if (latestHealthUpdate) {
          club.healthStatus = latestHealthUpdate.newHealth as 'green' | 'yellow' | 'red';
        }
      }

      return assignedClubs;
    } catch (error) {
      logger.error('Failed to get user assigned clubs:', error);
      return [];
    }
  }

  /**
   * Get user tasks from Firebase
   */
  async getUserTasks(userId: string): Promise<IntelligentTask[]> {
    try {
      const tasksSnapshot = await getDocs(collection(db, 'intelligent_tasks'));
      const userTasks = tasksSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(task => task.assignedTo === userId)
        .sort((a, b) => {
          // Sort by priority then due date
          const priorityOrder = { 'P0': 0, 'P1': 1, 'P2': 2 };
          return priorityOrder[a.priority] - priorityOrder[b.priority] ||
                 a.dueDate.toMillis() - b.dueDate.toMillis();
        });

      return userTasks as IntelligentTask[];
    } catch (error) {
      logger.error('Failed to get user tasks:', error);
      return [];
    }
  }

  /**
   * Helper: Calculate health status from Misfits data
   */
  private calculateHealthFromMisfitsData(clubData: any): string {
    // Simple health calculation based on available metrics
    const rating = parseFloat(clubData.avg_rating) || 0;

    if (rating >= 4.0) return 'green';
    if (rating >= 3.0) return 'yellow';
    return 'red';
  }

  /**
   * Get combined dashboard data
   */
  async getDashboardData(userId: string) {
    try {
      const [assignedClubs, userTasks, revenueData] = await Promise.all([
        this.getUserAssignedClubs(userId),
        this.getUserTasks(userId),
        this.getRevenueData()
      ]);

      const healthSummary = {
        total: assignedClubs.length,
        green: assignedClubs.filter(c => c.healthStatus === 'green').length,
        yellow: assignedClubs.filter(c => c.healthStatus === 'yellow').length,
        red: assignedClubs.filter(c => c.healthStatus === 'red').length
      };

      return {
        assignedClubs,
        priorityTasks: userTasks.filter(t => t.completedStatus !== 'completed'),
        healthSummary,
        revenueData
      };
    } catch (error) {
      logger.error('Failed to get dashboard data:', error);
      throw error;
    }
  }
}

// Export singleton
export const hybridDataLayer = new HybridDataLayer();