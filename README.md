# Misfits Operations Platform

A comprehensive story-driven task management system for Misfits operations, featuring intelligent task automation, personal workspace, and smart insights.

## Features

### 🤖 Intelligent Task Engine
- Auto-generates tasks based on system events
- Smart assignment based on roles and context
- Predictive escalation rules
- Pattern learning and optimization

### 📋 Personal Workspace
- Rich note-taking for each club
- Personal todo management
- Quick capture with slash commands
- Weekly planning with AI insights

### 📊 Smart Dashboard
- Real-time club health monitoring
- Priority task management
- System automation summary
- Performance insights

### 🎯 Week Planning
- AI-optimized scheduling
- Batched operations
- Context-aware suggestions
- Progress tracking

## Tech Stack

**Frontend:**
- React 18 with TypeScript
- Tailwind CSS for styling
- React Query for state management
- React Router for navigation
- Vite for build tooling

**Backend:**
- Node.js with TypeScript
- Express.js framework
- PostgreSQL database
- Redis for caching
- Winston for logging

**Database Schema:**
- Clubs management
- Intelligent task system
- User workspaces
- Smart notifications
- Pattern learning

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL (or use existing Misfits DB)
- Redis (optional)

### Installation

1. Clone and install dependencies:
```bash
git clone <repository>
cd misfits-operations
npm run install:all
```

2. Set up environment variables:
```bash
cp .env.example .env
cp client/.env.example client/.env
```

3. Configure database connection in `.env`:
```bash
# For local development with existing DB:
DB_HOST=localhost
DB_PORT=5433
DB_NAME=misfits
DB_USER=dev
DB_PASSWORD=postgres
```

4. Start development servers:
```bash
npm run dev
```

This runs both frontend (port 3000) and backend (port 5000) concurrently.

## Database Connection

### Automatic Database Connection
The system automatically connects directly to the Misfits production RDS database using the credentials configured in your environment. No SSH tunnels are required.

### Database Schema
The system creates its own tables for operations management:
- `clubs` - Club information and health status
- `intelligent_tasks` - AI-generated tasks
- `user_workspace` - Personal workspace data
- `smart_notifications` - Notification queue
- `system_patterns` - Learning patterns

## Key Components

### Intelligent Task Engine (`/server/src/services/intelligentTaskEngine.ts`)
- Processes system events (POC assignment, health changes, etc.)
- Auto-generates contextual tasks
- Smart assignee determination
- Escalation rule creation

### Personal Workspace (`/client/src/pages/Workspace.tsx`)
- Rich note editor per club
- Personal todo management
- Quick capture with commands
- Weekly planning interface

### Smart Dashboard (`/client/src/pages/Dashboard.tsx`)
- Priority task management
- Club health overview
- System automation summary
- AI insights and suggestions

## Development Notes

### Mock Data
Currently using mock data for frontend development. When ready to connect to database:
1. Set `DB_HOST` and other DB variables in `.env`
2. Run database migrations: `npm run db:migrate`
3. Switch from mock data to real API calls

### Key Features Implemented
- ✅ Project structure with React + Node.js
- ✅ TypeScript configuration
- ✅ Intelligent task engine framework
- ✅ Personal workspace with rich components
- ✅ Smart dashboard with health monitoring
- ✅ Weekly planning interface
- ✅ Database schema and migrations

### Next Steps
- Connect to real database when ready
- Implement user authentication
- Add real-time notifications
- Enhance AI pattern learning
- Build analytics dashboard

## Production Deployment

**Domain:** QualityMisfits.net.in
**Server:** 13.201.15.180

The system is designed to scale and can be deployed using standard Node.js hosting with PostgreSQL and Redis.

## Architecture

```
Frontend (React/TypeScript)
├── Dashboard (Priority tasks, health overview)
├── Workspace (Personal notes, todos, planning)
├── Clubs (Management interface)
└── Analytics (Insights and reports)

Backend (Node.js/TypeScript)
├── Intelligent Task Engine
├── Database Layer (PostgreSQL)
├── Redis Caching
├── API Routes
└── Real-time Notifications

Database
├── Existing Misfits Schema (clubs, users, events)
└── Operations Schema (tasks, workspace, notifications)
```

This system transforms chaotic operations into organized, intelligent workflows - exactly as described in the PRD story.
