#!/bin/bash
set -e

echo "Starting production deployment with database tunnel..."

# Set production environment
export NODE_ENV=production

# Load production environment variables
source .env.production

# Kill any existing tunnels on port 5433
echo "Cleaning up existing database tunnels..."
pkill -f "5433.*misfits" 2>/dev/null || true

# Start database tunnel
echo "Starting database tunnel to production database..."
ssh -i "/Users/retalplaza/Downloads/DB claude key/claude-control-key" -f -N -L 5433:misfits.cgncbvolnhe7.ap-south-1.rds.amazonaws.com:5432 claude-control@15.207.255.212

# Wait for tunnel to establish
sleep 3

# Test database connection
echo "Testing production database connection..."
PGPASSWORD=postgres psql -h localhost -p 5433 -U dev misfits -c "SELECT 1" > /dev/null

if [ $? -eq 0 ]; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed"
    exit 1
fi

echo "🚀 Production environment ready"
echo "Database: misfits via tunnel (localhost:5433)"
echo "Starting server on port ${PORT}..."

# Start the server
npm run dev