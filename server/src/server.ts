import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import { createServer } from 'http';

// Import routes
import authRoutes from './routes/auth';
import clubRoutes from './routes/clubs';
import taskRoutes from './routes/tasks';
import userRoutes from './routes/users';
import workspaceRoutes from './routes/workspace';
import notificationRoutes from './routes/notifications';
import pocRoutes from './routes/poc';
import testRoutes from './routes/test';
import revenueRoutes from './routes/revenue';
import databaseRoutes from './routes/database';
import healthRoutes from './routes/health';
import scalingRoutes from './routes/scaling';
import targetsRoutes from './routes/targets';

// Import services
import { initializeDatabase } from './services/database';
import { initializeRedis } from './services/redis';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app = express();
const PORT = process.env.PORT || (process.env.NODE_ENV === 'production' ? 80 : 5000);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : 'http://localhost:3000',
  credentials: true,
}));

// General middleware
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/clubs', clubRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);
app.use('/api/workspace', workspaceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/poc', pocRoutes);
app.use('/api/test', testRoutes);
app.use('/api/revenue', revenueRoutes);
app.use('/api/database', databaseRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/scaling', scalingRoutes);
app.use('/api/targets', targetsRoutes);
app.use('/api', revenueRoutes); // Also handle direct /api/revenue-growth

// Serve static files from React app
app.use(express.static(path.join(__dirname, '../public')));

// Catch all handler: send back React's index.html file for any non-API routes
app.get('*', (req, res) => {
  // Skip if this is an API route
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling
app.use(errorHandler);

async function startServer() {
  try {
    // Try to initialize database (optional)
    try {
      await initializeDatabase();
      logger.info('Database initialized');
    } catch (dbError) {
      logger.warn('Database initialization failed, continuing without database:', dbError.message);
    }

    // Try to initialize Redis (optional)
    try {
      await initializeRedis();
      logger.info('Redis initialized');
    } catch (redisError) {
      logger.warn('Redis initialization failed, continuing without Redis:', redisError.message);
    }

    // Start server
    const server = createServer(app);

    server.listen(PORT, () => {
      logger.info(`🚀 Misfits Operations Server running on port ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔗 Frontend URL: http://localhost:3000`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(() => {
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();