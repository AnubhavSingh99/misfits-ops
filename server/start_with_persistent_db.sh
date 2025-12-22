#!/bin/bash

# Persistent DB Connection and Server Startup Script
# This script handles automatic reconnection when SSH tunnel drops

set -e

# Configuration
SSH_KEY="/Users/retalplaza/Downloads/DB claude key/claude-control-key"
SSH_HOST="claude-control@15.207.255.212"
DB_HOST="misfits.cgncbvolnhe7.ap-south-1.rds.amazonaws.com"
LOCAL_PORT=5433
REMOTE_PORT=5432
SERVER_PORT=5001

# Function to check if SSH tunnel is active
check_tunnel() {
    lsof -i:$LOCAL_PORT >/dev/null 2>&1
}

# Function to establish SSH tunnel
establish_tunnel() {
    echo "Establishing SSH tunnel..."
    ssh -i "$SSH_KEY" -f -N -L $LOCAL_PORT:$DB_HOST:$REMOTE_PORT $SSH_HOST
    sleep 2
}

# Function to kill existing tunnels and processes
cleanup() {
    echo "Cleaning up existing processes..."
    pkill -f "ssh.*$LOCAL_PORT.*$DB_HOST" 2>/dev/null || true
    pkill -f "npm.*dev" 2>/dev/null || true
    lsof -ti:$SERVER_PORT | xargs kill -9 2>/dev/null || true
}

# Function to start server with monitoring
start_server() {
    echo "Starting server with environment variables..."
    export LOCAL_DB_HOST=localhost
    export LOCAL_DB_PORT=5432
    export LOCAL_DB_NAME=misfits_ops
    export LOCAL_DB_USER=retalplaza
    export LOCAL_DB_PASSWORD=
    export PROD_DB_HOST=localhost
    export PROD_DB_PORT=$LOCAL_PORT
    export PROD_DB_NAME=misfits
    export PROD_DB_USER=dev
    export PROD_DB_PASSWORD=postgres
    export PORT=$SERVER_PORT

    # Start server in background
    npm run dev &
    SERVER_PID=$!
    echo "Server started with PID: $SERVER_PID"
}

# Function to monitor and restart if needed
monitor_and_restart() {
    while true; do
        if ! check_tunnel; then
            echo "SSH tunnel lost. Re-establishing..."
            cleanup
            establish_tunnel
            start_server
        fi
        sleep 30
    done
}

# Main execution
echo "Starting persistent DB connection script..."

# Initial cleanup
cleanup

# Establish initial tunnel
establish_tunnel

if check_tunnel; then
    echo "SSH tunnel established successfully"
    start_server

    # Start monitoring (this will run indefinitely)
    echo "Starting monitoring loop..."
    monitor_and_restart
else
    echo "Failed to establish SSH tunnel"
    exit 1
fi