#!/bin/bash

# Database connection script for Misfits Operations
# This script establishes SSH tunnel to production database

set -e

SSH_KEY="$HOME/Downloads/DB claude key/claude-control-key"
SSH_HOST="claude-control@15.207.255.212"
LOCAL_PORT="5433"
REMOTE_HOST="misfits.cgncbvolnhe7.ap-south-1.rds.amazonaws.com"
REMOTE_PORT="5432"

echo "Setting up SSH tunnel to production database..."

# Check if SSH key exists
if [ ! -f "$SSH_KEY" ]; then
    echo "Error: SSH key not found at $SSH_KEY"
    exit 1
fi

# Set correct permissions on SSH key
chmod 600 "$SSH_KEY"

# Kill any existing tunnels on port 5433
echo "Killing existing tunnels on port $LOCAL_PORT..."
pkill -f "$LOCAL_PORT.*misfits" 2>/dev/null || true
lsof -ti:$LOCAL_PORT | xargs kill 2>/dev/null || true

# Wait a moment for port to be freed
sleep 1

# Establish SSH tunnel
echo "Establishing SSH tunnel..."
ssh -i "$SSH_KEY" -f -N -L $LOCAL_PORT:$REMOTE_HOST:$REMOTE_PORT $SSH_HOST

# Verify tunnel is working
echo "Verifying database connection..."
if PGPASSWORD=postgres psql -h localhost -p $LOCAL_PORT -U dev misfits -c "SELECT 1;" >/dev/null 2>&1; then
    echo "✓ Database connection established successfully!"
    echo "You can now connect to the database using:"
    echo "  PGPASSWORD=postgres psql -h localhost -p $LOCAL_PORT -U dev misfits"
else
    echo "✗ Failed to connect to database"
    exit 1
fi