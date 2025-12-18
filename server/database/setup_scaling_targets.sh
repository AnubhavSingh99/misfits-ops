#!/bin/bash

# Setup script for Scaling Targets Database Schema
# This script creates the necessary tables and triggers for the target tracking system

set -e  # Exit on any error

echo "🚀 Setting up Scaling Targets Database Schema..."

# Check if we're in the right directory
if [ ! -f "scaling_targets_schema.sql" ]; then
    echo "❌ Error: scaling_targets_schema.sql not found in current directory"
    echo "Please run this script from the database directory"
    exit 1
fi

# Database connection details (using SSH tunnel)
DB_HOST="localhost"
DB_PORT="5433"
DB_NAME="misfits"
DB_USER="dev"
export PGPASSWORD="postgres"

echo "📋 Connecting to database..."
echo "Host: $DB_HOST:$DB_PORT"
echo "Database: $DB_NAME"
echo "User: $DB_USER"

# Test connection
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
    echo "❌ Error: Could not connect to database"
    echo "Please ensure SSH tunnel is running:"
    echo "  ./db_connect.sh start"
    exit 1
fi

echo "✅ Database connection successful"

# Execute the schema script
echo "📊 Creating scaling targets schema..."
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f scaling_targets_schema.sql; then
    echo "✅ Schema created successfully"
else
    echo "❌ Error creating schema"
    exit 1
fi

# Verify tables were created
echo "🔍 Verifying tables..."
TABLES=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('activity_targets', 'club_targets', 'new_club_launches', 'club_transitions')
    ORDER BY table_name;
")

echo "Created tables:"
echo "$TABLES"

# Count the tables
TABLE_COUNT=$(echo "$TABLES" | grep -v '^$' | wc -l)
if [ "$TABLE_COUNT" -eq 4 ]; then
    echo "✅ All 4 tables created successfully"
else
    echo "⚠️  Warning: Expected 4 tables, found $TABLE_COUNT"
fi

# Check triggers
echo "🔧 Verifying triggers..."
TRIGGERS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
    SELECT trigger_name
    FROM information_schema.triggers
    WHERE event_object_table IN ('club_targets', 'new_club_launches')
    ORDER BY trigger_name;
")

echo "Created triggers:"
echo "$TRIGGERS"

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📋 Summary:"
echo "   - activity_targets: Activity-level target tracking"
echo "   - club_targets: Club-level target tracking"
echo "   - new_club_launches: New club launch planning"
echo "   - club_transitions: Track when new clubs become existing"
echo "   - Triggers: Auto-update activity targets when club targets change"
echo ""
echo "🚀 The target tracking system is ready to use!"
echo ""
echo "📖 Usage:"
echo "   - Use /api/scaling/data to get activity-level view"
echo "   - Use /api/scaling/activity/{name} to get drill-down view"
echo "   - Use PUT endpoints to update targets"
echo "   - Use POST endpoints to create new club launches"