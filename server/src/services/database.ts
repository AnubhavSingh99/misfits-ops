import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';

let pool: Pool; // Local operations database
let prodPool: Pool; // Production database (read-only, direct connection)

export async function initializeDatabase() {
  // Initialize local operations database
  pool = new Pool({
    host: process.env.LOCAL_DB_HOST || 'localhost',
    port: parseInt(process.env.LOCAL_DB_PORT || '5432'),
    database: process.env.LOCAL_DB_NAME || 'misfits_ops',
    user: process.env.LOCAL_DB_USER || 'postgres',
    password: process.env.LOCAL_DB_PASSWORD || '',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  try {
    // Test local operations database connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();

    logger.info('Local operations database connection established');

    // Run migrations for local database
    await runMigrations();

  } catch (error) {
    logger.error('Local operations database connection failed:', error);
    throw error;
  }

  // Initialize production database with direct connection (no SSH tunnel)
  if (process.env.PROD_DB_HOST) {
    prodPool = new Pool({
      host: process.env.PROD_DB_HOST,
      port: parseInt(process.env.PROD_DB_PORT || '5432'),
      database: process.env.PROD_DB_NAME || 'misfits',
      user: process.env.PROD_DB_USER || 'dev',
      password: process.env.PROD_DB_PASSWORD || 'postgres',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    try {
      // Test production database connection
      const prodClient = await prodPool.connect();
      await prodClient.query('SELECT NOW()');
      prodClient.release();

      logger.info('Production database direct connection established');
    } catch (error) {
      logger.error('Production database connection failed:', error);
      // Don't throw - allow server to start without production DB
    }
  }
}

export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

// Query local operations database (for POC, tasks, etc.)
export async function queryLocal(text: string, params?: any[]) {
  const client = await getClient();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

// Query production database (for clubs, events, payments, etc.) - direct connection
export async function queryProduction(text: string, params?: any[]) {
  if (!prodPool) {
    throw new Error('Production database not initialized');
  }

  const client = await prodPool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

// Default query function - use production for backwards compatibility
export async function query(text: string, params?: any[]) {
  // If production database is configured, use direct connection
  if (process.env.PROD_DB_HOST && prodPool) {
    return await queryProduction(text, params);
  }

  // Otherwise use local database
  const client = await getClient();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function runMigrations() {
  try {
    // Create tables if they don't exist
    await queryLocal(`
      CREATE TABLE IF NOT EXISTS clubs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        activity VARCHAR(100) NOT NULL,
        city VARCHAR(100) NOT NULL,
        area VARCHAR(100) NOT NULL,
        current_state VARCHAR(50) DEFAULT 'stage_1',
        health_status VARCHAR(20) DEFAULT 'green',
        poc_id UUID,
        city_head_id UUID,
        activity_head_id UUID,
        venue VARCHAR(255),
        leader_id UUID,
        pricing INTEGER,
        capacity INTEGER,
        avg_rating DECIMAL(3,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryLocal(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        city VARCHAR(100),
        activity VARCHAR(100),
        permissions JSONB DEFAULT '[]',
        avatar VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryLocal(`
      CREATE TABLE IF NOT EXISTS intelligent_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trigger_event VARCHAR(100) NOT NULL,
        trigger_details JSONB NOT NULL,
        generated_tasks TEXT[],
        assigned_to UUID NOT NULL,
        priority VARCHAR(10) NOT NULL,
        due_date TIMESTAMP,
        escalation_rule TEXT,
        completed_status VARCHAR(20) DEFAULT 'pending',
        created_by_ai BOOLEAN DEFAULT true,
        club_id UUID,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (assigned_to) REFERENCES users(id),
        FOREIGN KEY (club_id) REFERENCES clubs(id)
      );
    `);

    await queryLocal(`
      CREATE TABLE IF NOT EXISTS user_workspace (
        user_id UUID PRIMARY KEY,
        personal_todos JSONB DEFAULT '[]',
        club_notes JSONB DEFAULT '{}',
        weekly_plans JSONB DEFAULT '{}',
        pinned_items TEXT[] DEFAULT '{}',
        preferences JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    await queryLocal(`
      CREATE TABLE IF NOT EXISTS smart_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type VARCHAR(100) NOT NULL,
        priority VARCHAR(20) NOT NULL,
        recipient UUID NOT NULL,
        channel VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        action_buttons JSONB DEFAULT '[]',
        sent_time TIMESTAMP,
        read_time TIMESTAMP,
        action_taken VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (recipient) REFERENCES users(id)
      );
    `);

    await queryLocal(`
      CREATE TABLE IF NOT EXISTS system_patterns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pattern_type VARCHAR(100) NOT NULL,
        location VARCHAR(100),
        frequency INTEGER DEFAULT 1,
        usual_cause VARCHAR(255),
        best_solution VARCHAR(255),
        success_rate DECIMAL(5,2),
        learned_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes
    // Create target tracking tables for scaling planner
    await queryLocal(`
      CREATE TABLE IF NOT EXISTS activity_scaling_targets (
        id SERIAL PRIMARY KEY,
        activity_name VARCHAR(255) NOT NULL UNIQUE,
        activity_id INTEGER,

        -- Target metrics for existing clubs
        target_meetups_existing INTEGER DEFAULT 0,
        target_revenue_existing_rupees DECIMAL(12,2) DEFAULT 0,

        -- Target metrics for new clubs
        target_meetups_new INTEGER DEFAULT 0,
        target_revenue_new_rupees DECIMAL(12,2) DEFAULT 0,

        -- Auto-calculated totals
        total_target_meetups INTEGER GENERATED ALWAYS AS (target_meetups_existing + target_meetups_new) STORED,
        total_target_revenue_rupees DECIMAL(12,2) GENERATED ALWAYS AS (target_revenue_existing_rupees + target_revenue_new_rupees) STORED,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(255)
      );
    `);

    await queryLocal(`
      CREATE TABLE IF NOT EXISTS club_scaling_targets (
        id SERIAL PRIMARY KEY,
        club_id UUID NOT NULL UNIQUE,
        club_name VARCHAR(255) NOT NULL,
        activity_name VARCHAR(255) NOT NULL,

        -- Individual club targets
        target_meetups INTEGER DEFAULT 0,
        target_revenue_rupees DECIMAL(12,2) DEFAULT 0,

        -- New club tracking
        is_new_club BOOLEAN DEFAULT FALSE,
        launch_date TIMESTAMP,
        new_club_tag_expires_at TIMESTAMP,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(255),

        FOREIGN KEY (activity_name) REFERENCES activity_scaling_targets(activity_name) ON DELETE CASCADE
      );
    `);

    await queryLocal(`
      CREATE TABLE IF NOT EXISTS new_club_launches (
        id SERIAL PRIMARY KEY,
        activity_name VARCHAR(255) NOT NULL,

        -- Launch planning
        planned_club_name VARCHAR(255),
        planned_city VARCHAR(255),
        planned_area VARCHAR(255),
        planned_launch_date DATE,

        -- Targets for this new club
        target_meetups INTEGER DEFAULT 0,
        target_revenue_rupees DECIMAL(12,2) DEFAULT 0,

        -- Launch status
        launch_status VARCHAR(50) DEFAULT 'planned',
        actual_club_id UUID,

        -- Launch milestones
        milestones JSONB DEFAULT '{
          "poc_assigned": false,
          "location_found": false,
          "first_event_scheduled": false,
          "first_event_conducted": false,
          "members_onboarded": false
        }',

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(255),

        FOREIGN KEY (activity_name) REFERENCES activity_scaling_targets(activity_name) ON DELETE CASCADE
      );
    `);

    // Create indexes for existing tables
    await queryLocal('CREATE INDEX IF NOT EXISTS idx_clubs_city ON clubs(city);');
    await queryLocal('CREATE INDEX IF NOT EXISTS idx_clubs_activity ON clubs(activity);');
    await queryLocal('CREATE INDEX IF NOT EXISTS idx_clubs_health_status ON clubs(health_status);');
    await queryLocal('CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON intelligent_tasks(assigned_to);');
    await queryLocal('CREATE INDEX IF NOT EXISTS idx_tasks_club_id ON intelligent_tasks(club_id);');
    await queryLocal('CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON smart_notifications(recipient);');

    // Create POC structure table
    await queryLocal(`
      CREATE TABLE IF NOT EXISTS poc_structure (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        poc_type VARCHAR(50) NOT NULL CHECK (poc_type IN ('activity_head', 'city_head')),
        activities TEXT[] DEFAULT '{}',
        cities TEXT[] DEFAULT '{}',
        team_name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(20),
        user_id UUID REFERENCES users(id),
        team_members JSONB DEFAULT '[]',
        display_in_activity_heads BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add team_members column if it doesn't exist (for existing databases)
    await queryLocal(`
      ALTER TABLE poc_structure
      ADD COLUMN IF NOT EXISTS team_members JSONB DEFAULT '[]';
    `);

    // Add display_in_activity_heads column if it doesn't exist (for existing databases)
    await queryLocal(`
      ALTER TABLE poc_structure
      ADD COLUMN IF NOT EXISTS display_in_activity_heads BOOLEAN DEFAULT false;
    `);

    // Create POC assignments table
    await queryLocal(`
      CREATE TABLE IF NOT EXISTS poc_assignments (
        id SERIAL PRIMARY KEY,
        club_id UUID REFERENCES clubs(id),
        poc_id INTEGER REFERENCES poc_structure(id),
        assignment_type VARCHAR(50) NOT NULL CHECK (assignment_type IN ('activity_head', 'city_head')),
        assigned_by VARCHAR(255),
        reason TEXT,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        unassigned_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create operations tasks table
    await queryLocal(`
      CREATE TABLE IF NOT EXISTS operations_tasks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        assigned_to_poc_id INTEGER REFERENCES poc_structure(id),
        assigned_to_user_id UUID REFERENCES users(id),
        priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
        due_date TIMESTAMP,
        club_id UUID REFERENCES clubs(id),
        activity VARCHAR(100),
        city VARCHAR(100),
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      );
    `);

    // Create task comments table
    await queryLocal(`
      CREATE TABLE IF NOT EXISTS task_comments (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES operations_tasks(id) ON DELETE CASCADE,
        author_name VARCHAR(255) NOT NULL,
        comment_text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for target tracking tables
    await queryLocal('CREATE INDEX IF NOT EXISTS idx_activity_targets_name ON activity_scaling_targets(activity_name);');
    await queryLocal('CREATE INDEX IF NOT EXISTS idx_club_targets_club_id ON club_scaling_targets(club_id);');
    await queryLocal('CREATE INDEX IF NOT EXISTS idx_club_targets_activity ON club_scaling_targets(activity_name);');
    await queryLocal('CREATE INDEX IF NOT EXISTS idx_club_targets_new_club ON club_scaling_targets(is_new_club);');
    await queryLocal('CREATE INDEX IF NOT EXISTS idx_new_launches_activity ON new_club_launches(activity_name);');
    await queryLocal('CREATE INDEX IF NOT EXISTS idx_new_launches_status ON new_club_launches(launch_status);');

    // Create activity categorization table
    await queryLocal(`
      CREATE TABLE IF NOT EXISTS activity_categorizations (
        id SERIAL PRIMARY KEY,
        activity_name VARCHAR(255) NOT NULL UNIQUE,
        category VARCHAR(50) NOT NULL CHECK (category IN ('scale', 'long_tail')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for POC and task tables
    await queryLocal('CREATE INDEX IF NOT EXISTS idx_poc_structure_type ON poc_structure(poc_type);');
    await queryLocal('CREATE INDEX IF NOT EXISTS idx_poc_structure_active ON poc_structure(is_active);');
    await queryLocal('CREATE INDEX IF NOT EXISTS idx_poc_assignments_club ON poc_assignments(club_id);');
    await queryLocal('CREATE INDEX IF NOT EXISTS idx_poc_assignments_poc ON poc_assignments(poc_id);');
    await queryLocal('CREATE INDEX IF NOT EXISTS idx_tasks_assigned_poc ON operations_tasks(assigned_to_poc_id);');
    await queryLocal('CREATE INDEX IF NOT EXISTS idx_tasks_status ON operations_tasks(status);');
    await queryLocal('CREATE INDEX IF NOT EXISTS idx_tasks_priority ON operations_tasks(priority);');
    await queryLocal('CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);');

    // Create index for activity categorization table
    await queryLocal('CREATE INDEX IF NOT EXISTS idx_activity_categorizations_category ON activity_categorizations(category);');

    logger.info('Database migrations completed');
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  }
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
    logger.info('Database connection closed');
  }
}