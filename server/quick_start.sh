#!/bin/bash

echo "🔧 Quick Start Script - Misfits Operations"

# Kill existing processes
echo "Cleaning up existing processes..."
pkill -f "npm.*dev" 2>/dev/null || true
pkill -f "ssh.*5433.*misfits" 2>/dev/null || true
lsof -ti:5001 | xargs kill -9 2>/dev/null || true

# Establish SSH tunnel
echo "Establishing SSH tunnel..."
ssh -i "/Users/retalplaza/Downloads/DB claude key/claude-control-key" -f -N -L 5433:misfits.cgncbvolnhe7.ap-south-1.rds.amazonaws.com:5432 claude-control@15.207.255.212

# Wait for tunnel to establish
sleep 3

# Verify tunnel
if lsof -i:5433 >/dev/null 2>&1; then
    echo "✅ SSH tunnel established on port 5433"
else
    echo "❌ SSH tunnel failed to establish"
    exit 1
fi

# Test database connectivity
echo "Testing database connection..."
if PGPASSWORD=postgres psql -h localhost -p 5433 -U dev misfits -c "SELECT 1;" >/dev/null 2>&1; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed"
    exit 1
fi

# Set environment variables and start server
echo "Starting server on port 5001..."
export PROD_DB_HOST=localhost
export PROD_DB_PORT=5433
export PROD_DB_NAME=misfits
export PROD_DB_USER=dev
export PROD_DB_PASSWORD=postgres
export PORT=5001

npm run dev