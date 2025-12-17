#!/bin/bash

# Claude Database Connection Script for Misfits Operations
# This script establishes SSH tunnel and connects to the Misfits database

# Try multiple key locations (Downloads folder first, then project folder as fallback)
KEY_FILE_PRIMARY="/Users/retalplaza/Downloads/DB claude key/claude-control-key"
KEY_FILE_BACKUP="$(dirname "$0")/db-keys/claude-control-key"

# Determine which key file to use
if [ -f "$KEY_FILE_PRIMARY" ]; then
    KEY_FILE="$KEY_FILE_PRIMARY"
    echo "Using primary key file from Downloads folder"
elif [ -f "$KEY_FILE_BACKUP" ]; then
    KEY_FILE="$KEY_FILE_BACKUP"
    echo "Using backup key file from project folder"
else
    echo "Error: No SSH key file found. Tried:"
    echo "  - $KEY_FILE_PRIMARY"
    echo "  - $KEY_FILE_BACKUP"
    exit 1
fi
SSH_HOST=15.207.255.212
SSH_USER=claude-control
DB_HOST=misfits.cgncbvolnhe7.ap-south-1.rds.amazonaws.com
DB_PORT=5432
LOCAL_PORT=5433
DB_NAME=misfits
DB_USER=dev
DB_PASSWORD=postgres

echo "Setting up database connection..."

# Check if key file exists and has correct permissions
if [ ! -f "$KEY_FILE" ]; then
    echo "Error: SSH key file not found at $KEY_FILE"
    exit 1
fi

# Set correct permissions for key file
chmod 600 "$KEY_FILE"

# Kill any existing SSH tunnels on port 5433
echo "Killing existing SSH tunnels on port $LOCAL_PORT..."
pkill -f "$LOCAL_PORT.*misfits"

# Establish SSH tunnel
echo "Establishing SSH tunnel..."
ssh -i "$KEY_FILE" -f -N -L "$LOCAL_PORT:$DB_HOST:$DB_PORT" "$SSH_USER@$SSH_HOST"

if [ $? -eq 0 ]; then
    echo "SSH tunnel established successfully on port $LOCAL_PORT"

    # Wait a moment for the tunnel to be ready
    sleep 2

    echo "Connecting to database..."
    echo "Database connection details:"
    echo "  Host: localhost"
    echo "  Port: $LOCAL_PORT"
    echo "  Database: $DB_NAME"
    echo "  User: $DB_USER"
    echo ""

    # Connect to database
    PGPASSWORD="$DB_PASSWORD" psql -h localhost -p "$LOCAL_PORT" -U "$DB_USER" "$DB_NAME"
else
    echo "Failed to establish SSH tunnel"
    exit 1
fi