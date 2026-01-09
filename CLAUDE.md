# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## IMPORTANT: Database Migration Rules

**ALWAYS create migration files when making ANY database changes:**

1. **Location**: `server/database/migrations/`
2. **Naming**: Use descriptive names like `add_column_name.sql`, `create_table_name.sql`
3. **Contents**: Include all SQL statements needed to apply the change
4. **Views**: If modifying a view, include DROP VIEW and CREATE VIEW statements
5. **Indexes**: If modifying indexes, include DROP INDEX and CREATE INDEX statements

Example migration file structure:
```sql
-- Migration: Description of changes
-- Date: YYYY-MM-DD
-- Description: More detailed explanation

-- Your SQL statements here
ALTER TABLE table_name ADD COLUMN IF NOT EXISTS column_name TYPE;
```

## Project Overview

Misfits Operations Platform is a comprehensive task management and operations dashboard for managing Misfits clubs. It features intelligent task automation, health monitoring, POC (Point of Contact) management, revenue tracking, and scaling operations.

**Tech Stack:**
- Frontend: React 18 + TypeScript + Tailwind CSS + Vite
- Backend: Node.js + TypeScript + Express
- Database: PostgreSQL (connects to existing Misfits production database)
- Real-time: Socket.IO for live updates
- State Management: React Query (@tanstack/react-query)

## Getting Started Locally

### Prerequisites

1. **PostgreSQL** - Running locally on port 5432
2. **Node.js** - v18 or higher
3. **SSH Access** - SSH key for production database access (`~/Downloads/claude-control-key`)
4. **Production SSH Tunnel** - Must be running before starting the app

### Initial Setup (First Time Only)

**Step 1: Clone and Install Dependencies**

```bash
cd ~/misfits-ops

# Install server dependencies
cd server && npm install

# Install client dependencies
cd ../client && npm install
```

**Step 2: Create Local Operations Database**

```bash
# Create the misfits_ops database
psql -d postgres -c "CREATE DATABASE misfits_ops;"

# Verify it was created
psql -l | grep misfits_ops
```

**Step 3: Set Up Environment Files**

```bash
# Copy example env files
cp .env.example .env
cp client/.env.example client/.env

# Edit .env if needed (default values should work)
# Key settings:
# - SSH_KEY_PATH should be empty (uses existing tunnel)
# - LOCAL_DB_USER should match your PostgreSQL user
```

### Starting the Application

**Step 1: Start SSH Tunnel to Production Database**

This tunnel MUST be running before starting the app:

```bash
# Check if tunnel is already running
lsof -i :5433

# If not running, start it:
ssh -f -i ~/Downloads/claude-control-key -N -L 5433:misfits.cgncbvolnhe7.ap-south-1.rds.amazonaws.com:5432 claude-control@15.207.255.212

# Verify tunnel is running
lsof -i :5433 | grep LISTEN
```

**Step 2: Start Backend Server**

```bash
cd ~/misfits-ops/server
PORT=5001 npm run dev

# Or run in background:
PORT=5001 npm run dev > /tmp/misfits-ops-server.log 2>&1 &

# Check logs:
tail -f /tmp/misfits-ops-server.log
```

You should see:
```
info: 🚀 Misfits Operations Server running on port 5001
info: 📊 Environment: development
info: Using existing SSH tunnel on port 5433
```

**Step 3: Start Frontend Client**

```bash
# In a new terminal
cd ~/misfits-ops/client
npm run dev

# Or run in background:
npm run dev > /tmp/misfits-ops-client.log 2>&1 &
```

You should see:
```
VITE v5.x.x  ready in XXX ms
➜  Local:   http://localhost:3000/
```

**Step 4: Access the Dashboard**

Open your browser to: **http://localhost:3000**

### Quick Start (After Initial Setup)

```bash
# 1. Ensure SSH tunnel is running
lsof -i :5433 || ssh -f -i ~/Downloads/claude-control-key -N -L 5433:misfits.cgncbvolnhe7.ap-south-1.rds.amazonaws.com:5432 claude-control@15.207.255.212

# 2. Start backend (in one terminal)
cd ~/misfits-ops/server && PORT=5001 npm run dev

# 3. Start frontend (in another terminal)
cd ~/misfits-ops/client && npm run dev

# 4. Open browser to http://localhost:3000
```

### Stopping the Application

```bash
# Stop backend
pkill -f "tsx watch src/server.ts"

# Stop frontend
pkill -f "vite"

# Or if running in background:
kill <PID>
```

### Troubleshooting

**"System Unavailable" Error**
- Check if SSH tunnel is running: `lsof -i :5433`
- Check backend logs: `tail -f /tmp/misfits-ops-server.log`
- Restart backend server

**Empty Data in Dashboard**
- Ensure SSH tunnel is connected to production database
- Check backend logs for "Using existing SSH tunnel on port 5433"
- Verify API endpoints: `curl http://localhost:5001/api/scaling/activities`

**Port Already in Use**
- Backend: Change PORT in .env or use `PORT=5002 npm run dev`
- Frontend: Vite will auto-select next available port

**Database Connection Error**
- Verify PostgreSQL is running: `psql -l`
- Check LOCAL_DB_USER matches your PostgreSQL user
- Recreate misfits_ops database if needed

## Development Commands

### Server Commands (from `/server` directory)

```bash
npm run dev              # Start development server with hot reload (tsx watch)
npm run build            # Compile TypeScript to JavaScript
npm start                # Run with tsx (development)
npm run start:compiled   # Run compiled JavaScript (production)
npm run db:migrate       # Run database migrations
npm run db:seed          # Seed database with initial data
```

### Client Commands (from `/client` directory)

```bash
npm run dev      # Start Vite dev server on port 3000
npm run build    # Build production bundle
npm run lint     # Run ESLint
npm run preview  # Preview production build
```

## Architecture

### Database Connection Strategy

The system uses a **hybrid read-write pattern**:

1. **READ from Misfits PostgreSQL** (existing production data)
   - Clubs, events, users, bookings
   - Connects via automatic SSH tunnels (on-demand)
   - READ-ONLY to avoid impacting production

2. **WRITE to Local Storage** (operations-specific data)
   - Tasks, workspace notes, health calculations
   - No impact on Misfits production database

**SSH Tunnel Configuration:**
- Tunnels are established automatically on-demand by `server/src/services/sshTunnel.ts`
- Uses retry logic with exponential backoff (max 2 retries)
- Finds available ports automatically (starting from 5434)
- Connection pooling for efficient database access
- Configure SSH credentials in `.env` (see `.env.example`)

### Key Services (`/server/src/services/`)

- **`sshTunnel.ts`**: Automatic SSH tunnel management for database connections
- **`database.ts`**: PostgreSQL connection pooling and query execution
- **`hybridDataLayer.ts`**: Hybrid read-write data layer (READ: PostgreSQL, WRITE: Firebase/Local)
- **`healthEngine.ts`**: 4-metric health calculation system (capacity, repeat rate, rating, revenue)
- **`intelligentTaskEngine.ts`**: Auto-generates tasks based on system events
- **`systemConnector.ts`**: Connects to Misfits backend systems
- **`realtime.ts`**: Socket.IO server for real-time updates
- **`scalingUploadService.ts`**: Handles bulk club data uploads

### Health Calculation System

The health engine uses 4 key metrics (defined in `healthEngine.ts`):

1. **Capacity Utilization**: ≥75% green, 50-74% yellow, <50% red
2. **Repeat Rate**: ≥65% green, 50-64% yellow, <50% red
3. **Average Rating**: ≥4.0 green, 3.5-3.9 yellow, <3.5 red
4. **Revenue Achievement**: ≥90% green, 70-89% yellow, <70% red (not used in traffic light)

Overall health score is weighted:
- Capacity: 30%
- Repeat Rate: 30%
- Rating: 25%
- Revenue: 15%

### API Routes (`/server/src/routes/`)

Major route groups:
- **`/api/clubs`**: Club management and health data
- **`/api/poc`**: POC assignment and management
- **`/api/health`**: Health metrics and calculations
- **`/api/revenue`**: Revenue tracking and analytics
- **`/api/scaling`**: Bulk operations and scaling tools
- **`/api/targets`**: Target setting and tracking
- **`/api/tasks`**: Task management
- **`/api/trends`**: Trend analysis and insights
- **`/api/database`**: Direct database queries for operations

### Frontend Pages (`/client/src/pages/`)

- **`Dashboard.tsx`**: Main operations dashboard with task overview
- **`HealthDashboard.tsx`**: Club health monitoring (34KB, complex component)
- **`POCManagement.tsx`**: POC assignment and management (103KB, largest component)
- **`POCDashboard.tsx`**: POC overview and metrics
- **`RevenueGrowth.tsx`**: Revenue tracking and growth analysis
- **`WoWTracking.tsx`**: Week-over-week metrics tracking
- **`ScalingUpload.tsx`**: Bulk club data upload interface
- **`Tasks.tsx`**: Task management interface
- **`Workspace.tsx`**: Personal workspace with notes and todos

## Environment Configuration

### Server Environment Variables (`.env`)

Required variables:

```bash
# Server
PORT=5001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Production Database (via SSH tunnel)
PROD_DB_HOST=localhost
PROD_DB_PORT=5433
PROD_DB_NAME=misfits
PROD_DB_USER=dev
PROD_DB_PASSWORD=postgres

# SSH Tunnel Configuration (OPTIONAL - only if no existing tunnel)
# Leave SSH_KEY_PATH empty to use existing tunnel on port 5433
# To create tunnel manually: ssh -f -i ~/Downloads/claude-control-key -N -L 5433:misfits.cgncbvolnhe7.ap-south-1.rds.amazonaws.com:5432 claude-control@15.207.255.212
SSH_KEY_PATH=
SSH_HOST=15.207.255.212
SSH_USER=claude-control
DB_HOST=misfits.cgncbvolnhe7.ap-south-1.rds.amazonaws.com
DB_PORT=5432

# Local Database Configuration (for operations data)
# Update LOCAL_DB_USER based on your system's PostgreSQL user (commonly 'postgres' or 'rental')
LOCAL_DB_HOST=localhost
LOCAL_DB_PORT=5432
LOCAL_DB_NAME=misfits_ops
LOCAL_DB_USER=postgres
LOCAL_DB_PASSWORD=

# Business Logic
TARGET_MEETUP_INCREASE=50
MIN_TARGET_MEETUPS=300
```

### Client Environment Variables (`client/.env`)

```bash
VITE_API_URL=http://localhost:5001
VITE_WS_URL=ws://localhost:5001
VITE_APP_NAME=Misfits Operations Platform
```

## Production Deployment

**Domain**: operations.misfits.net.in (or qualitymisfits.net.in)
**Server**: 13.201.15.180
**Process Manager**: PM2

### Deployment Script (`./deploy.sh`)

The deployment script provides easy production management:

```bash
./deploy.sh push      # Deploy local changes to production
./deploy.sh pull      # Pull production changes to local
./deploy.sh status    # Show production status (PM2, API health, git)
./deploy.sh restart   # Restart production services
./deploy.sh logs      # Show production logs
./deploy.sh db start  # Start database tunnel on production
./deploy.sh db stop   # Stop database tunnel
./deploy.sh db status # Check tunnel status
```

**Deployment Flow:**
1. Commits local changes with auto-generated commit message
2. Pushes to production server
3. Sets up database tunnel on production
4. Restarts PM2 service (`misfits-app`)

**SSH Configuration:**
- Key: `/Users/retalplaza/Downloads/cdk-key-staging.pem`
- Server: `ec2-user@13.201.15.180`
- Path: `/home/ec2-user/misfits-operations`

## Development Workflow

### Database Access

The system automatically manages database connections:

1. **Automatic SSH Tunnels**: No manual tunnel setup needed
2. **Connection Pooling**: Efficient connection reuse
3. **Retry Logic**: Handles temporary connection failures
4. **Port Management**: Automatically finds available ports

To manually test database connection:

```bash
# The system will auto-establish tunnels as needed
# Monitor tunnel status in server logs
cd server && npm run dev
```

### Adding New Features

1. **Backend Route**: Add route in `/server/src/routes/`
2. **Service Logic**: Add service in `/server/src/services/`
3. **Frontend Page**: Add page in `/client/src/pages/`
4. **API Integration**: Add service in `/client/src/services/`
5. **Types**: Update shared types in `/shared/types.ts`

### Rate Limiting

API routes have rate limiting configured:
- General API: 1000 requests per 15 minutes
- Heavy endpoints: 20 requests per 5 minutes

Applied to all `/api/*` routes.

## Key Features

### Intelligent Task Engine

Auto-generates tasks based on:
- POC assignments
- Health status changes
- Revenue milestones
- Event patterns

### Health Monitoring

Real-time club health tracking with:
- 4-metric calculation system
- Auto-issue detection
- Historical trend analysis
- Predictive insights

### POC Management

Comprehensive POC assignment system:
- Bulk assignment tools
- Performance tracking
- Handoff workflows
- Activity monitoring

### Scaling Operations

Tools for scaling club operations:
- Bulk data upload (Excel/CSV)
- Automated target setting
- Area-wise analysis
- Growth planning

## How It Works

### Local Development Architecture

```
┌─────────────────────────────────────────────────┐
│  Your Mac (Development)                          │
│                                                  │
│  ┌────────────────────────────────────────┐    │
│  │  Frontend (Vite)                        │    │
│  │  http://localhost:3000                  │    │
│  └────────────────┬───────────────────────┘    │
│                   │ HTTP                        │
│                   ▼                             │
│  ┌────────────────────────────────────────┐    │
│  │  Backend (Node/Express)                 │    │
│  │  http://localhost:5001                  │    │
│  └────────┬────────────────────┬───────────┘    │
│           │ WRITE              │ READ           │
│           ▼                    ▼                │
│  ┌─────────────────┐  ┌─────────────────┐     │
│  │  PostgreSQL      │  │  SSH Tunnel     │     │
│  │  (Local)         │  │  Port 5433      │     │
│  │                  │  │        │        │     │
│  │  misfits_ops DB  │  │        └────────┼─────┼──→ Production RDS
│  │  (Operations)    │  │                 │     │     (Read-Only)
│  └─────────────────┘  └─────────────────┘     │
│                                                  │
└─────────────────────────────────────────────────┘
```

**Key Points:**
- **Write Operations**: Go to local `misfits_ops` database (safe, isolated)
- **Read Operations**: Go through SSH tunnel to production database (read-only)
- **Production data is NEVER modified** by the ops platform locally

### Production Architecture

Same architecture, but PostgreSQL runs on the EC2 server instead of your local machine.

## Important Notes

1. **Database Safety**: The system NEVER writes to the Misfits production database. All writes go to the local `misfits_ops` database.

2. **SSH Tunnel Required**: The app requires an SSH tunnel to production DB on port 5433. Start it before launching the app.

3. **Port Conflicts**: Backend uses port 5001 (not 5000) to avoid common conflicts. Frontend uses 3000.

4. **CORS Configuration**: Backend allows both localhost:3000 and 127.0.0.1:3000 for development flexibility.

5. **Real-time Updates**: Socket.IO is configured but may need additional setup for production use.

6. **Large Components**: POCManagement.tsx (103KB) and HealthDashboard.tsx (34KB) are complex components. Refactor with caution.

7. **Business Logic Constants**: Target settings are configurable via environment variables (TARGET_MEETUP_INCREASE, MIN_TARGET_MEETUPS).

8. **Redis Optional**: Redis connection errors are logged but don't affect core functionality.

## Shared Types

Type definitions are shared between client and server in `/shared/types.ts`:
- `Club`: Club entity with health status
- `IntelligentTask`: Auto-generated tasks
- `UserWorkspace`: Personal workspace data
- `HealthMetrics`: 4-metric health calculations
- `POCAssignment`: POC assignment data

Both client and server import from this shared location to maintain type consistency.
