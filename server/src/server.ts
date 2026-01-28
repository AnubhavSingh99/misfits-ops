import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { createServer } from 'http';

// Import routes
import authRoutes from './routes/auth';
import clubRoutes from './routes/clubs';
import taskRoutes from './routes/tasks';
// Mock user routes removed
// Mock workspace and notification routes removed
import pocRoutes from './routes/poc';
import testRoutes from './routes/test';
import revenueRoutes from './routes/revenue';
import databaseRoutes from './routes/database';
import healthRoutes from './routes/health';
import scalingRoutes from './routes/scaling';
import targetsRoutes from './routes/targets';
import meetupsRoutes from './routes/meetups';
import trendsRoutes from './routes/trends';
import scalingTasksRoutes from './routes/scalingTasks';
import requirementsRoutes from './routes/requirements';
import configRoutes from './routes/config';
import feedbackRoutes from './routes/feedback';
import customerServiceRoutes from './routes/customerService';

// Import services
import { initializeDatabase, getLocalPool } from './services/database';
import { initializeRedis } from './services/redis';
import { initializeDimensions } from './services/dimensionSync';
import { initCSPolling, startPolling } from './services/csPollingService';
import { initSlackService, checkSLABreaches } from './services/slackService';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app = express();
const PORT = process.env.PORT || (process.env.NODE_ENV === 'production' ? 80 : 5000);

// Trust proxy - required for rate limiting behind Nginx
// Use 1 instead of true to specify exactly one proxy (nginx)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3002'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Cache-Control', 'Pragma', 'Expires'],
  optionsSuccessStatus: 200,
  preflightContinue: false
}));

// Handle preflight requests explicitly
app.options('*', cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3002'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Cache-Control', 'Pragma', 'Expires'],
}));

// General middleware
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiting for heavy endpoints
const heavyEndpointLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // limit each IP to 20 requests per windowMs for heavy endpoints
  message: 'Too many requests to this endpoint, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to API routes
app.use('/api', apiLimiter);

// Add no-cache headers to all API responses
app.use('/api', (req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/clubs', clubRoutes);
app.use('/api/tasks', taskRoutes);
// Mock users endpoint removed
// Workspace and notifications endpoints removed - were mock only
app.use('/api/poc', pocRoutes);
app.use('/api/test', testRoutes);
app.use('/api/revenue', revenueRoutes);
app.use('/api/database', databaseRoutes);
app.use('/api/health', heavyEndpointLimiter, healthRoutes);
app.use('/api/scaling', scalingRoutes);
app.use('/api/targets', targetsRoutes);
app.use('/api/meetups', meetupsRoutes);
app.use('/api/trends', trendsRoutes);
app.use('/api/scaling-tasks', scalingTasksRoutes);
app.use('/api/requirements', requirementsRoutes);
app.use('/api/config', configRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/cs', customerServiceRoutes);
app.use('/api', revenueRoutes); // Also handle direct /api/revenue-growth

// Teams endpoints (simple fallback)
app.get('/api/teams/leaderboard', (req, res) => {
  res.json([]);
});

app.get('/api/teams/:team', (req, res) => {
  res.json({
    team: req.params.team,
    metrics: {
      totalRevenue: 0,
      totalEvents: 0,
      totalClubs: 0,
      avgRating: 0
    },
    performance: "stable",
    lastUpdated: new Date().toISOString()
  });
});

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

      // Initialize dimension tables (sync from production)
      await initializeDimensions();
      logger.info('Dimension tables initialized');

      // Initialize CS polling service
      const localPool = getLocalPool();
      initCSPolling(localPool);
      startPolling();
      logger.info('CS polling service started (every 30 seconds)');

      // Initialize Slack service
      initSlackService(localPool);
      logger.info('Slack service initialized');

      // Check SLA breaches every hour
      setInterval(async () => {
        try {
          await checkSLABreaches();
        } catch (error) {
          logger.error('SLA breach check failed:', error);
        }
      }, 60 * 60 * 1000); // 1 hour
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
      logger.info(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);

      // Memory monitoring - log memory usage every 5 minutes
      setInterval(() => {
        const memUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);

        if (heapUsedMB > 500) { // Alert if heap usage > 500MB
          logger.warn(`High memory usage: ${heapUsedMB}MB heap used (${heapTotalMB}MB total)`);
        } else {
          logger.info(`Memory usage: ${heapUsedMB}MB heap used (${heapTotalMB}MB total)`);
        }
      }, 5 * 60 * 1000); // 5 minutes
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully`);

      // Stop CS polling
      const { stopPolling: stopCSPolling } = await import('./services/csPollingService');
      stopCSPolling();
      logger.info('CS polling stopped');

      // Close HTTP server
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });

      // Force exit after 10 seconds if graceful shutdown hangs
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
