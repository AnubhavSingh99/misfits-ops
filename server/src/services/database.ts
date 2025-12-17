import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';

let pool: Pool;

export async function initializeDatabase() {
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'misfits_ops',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  try {
    // Test connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();

    logger.info('Database connection established (read-only mode)');

    // Skip migrations - database is read-only
    logger.info('Skipping migrations - running in read-only mode');

  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
}

export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

export async function query(text: string, params?: any[]) {
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
    await query(`
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

    await query(`
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

    await query(`
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

    await query(`
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

    await query(`
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

    await query(`
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
    await query('CREATE INDEX IF NOT EXISTS idx_clubs_city ON clubs(city);');
    await query('CREATE INDEX IF NOT EXISTS idx_clubs_activity ON clubs(activity);');
    await query('CREATE INDEX IF NOT EXISTS idx_clubs_health_status ON clubs(health_status);');
    await query('CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON intelligent_tasks(assigned_to);');
    await query('CREATE INDEX IF NOT EXISTS idx_tasks_club_id ON intelligent_tasks(club_id);');
    await query('CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON smart_notifications(recipient);');

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