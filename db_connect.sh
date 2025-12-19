#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
if [ "$NODE_ENV" = "production" ]; then
    SSH_KEY="/home/ec2-user/Downloads/claude-control-key"
else
    SSH_KEY="$HOME/Downloads/DB claude key/claude-control-key"
fi
SSH_USER="claude-control"
SSH_HOST="15.207.255.212"
LOCAL_PORT="5433"
REMOTE_HOST="misfits.cgncbvolnhe7.ap-south-1.rds.amazonaws.com"
REMOTE_PORT="5432"
DB_USER="dev"
DB_NAME="misfits"
DB_PASS="postgres"

# Function to check if tunnel is already running
check_tunnel() {
    lsof -i :$LOCAL_PORT -sTCP:LISTEN > /dev/null 2>&1
    return $?
}

# Function to get tunnel PID
get_tunnel_pid() {
    lsof -ti :$LOCAL_PORT -sTCP:LISTEN 2>/dev/null
}

# Function to establish SSH tunnel
establish_tunnel() {
    if check_tunnel; then
        PID=$(get_tunnel_pid)
        echo -e "${YELLOW}SSH tunnel already running on port $LOCAL_PORT (PID: $PID)${NC}"
        return 0
    fi

    echo -e "${GREEN}Establishing SSH tunnel...${NC}"

    # Start tunnel in background with keepalive
    ssh -o ServerAliveInterval=60 \
        -o ServerAliveCountMax=3 \
        -o StrictHostKeyChecking=no \
        -i "$SSH_KEY" \
        -N \
        -L $LOCAL_PORT:$REMOTE_HOST:$REMOTE_PORT \
        $SSH_USER@$SSH_HOST > /tmp/ssh_tunnel.log 2>&1 &

    TUNNEL_PID=$!

    # Wait for tunnel to establish
    echo -e "${YELLOW}Waiting for tunnel to establish...${NC}"
    sleep 3

    # Check if tunnel is running
    if check_tunnel; then
        PID=$(get_tunnel_pid)
        echo -e "${GREEN}✓ SSH tunnel established successfully!${NC}"
        echo -e "${GREEN}  PID: $PID${NC}"
        echo -e "${GREEN}  Local port: $LOCAL_PORT${NC}"
        echo -e "${GREEN}  Remote: $REMOTE_HOST:$REMOTE_PORT${NC}"
        echo ""
        echo -e "${GREEN}Connect with:${NC}"
        echo -e "  psql -h localhost -p $LOCAL_PORT -U $DB_USER $DB_NAME"
        echo -e "  Password: $DB_PASS"
        echo ""
        echo -e "${YELLOW}To stop the tunnel:${NC}"
        echo -e "  $0 stop"
        return 0
    else
        echo -e "${RED}✗ Failed to establish SSH tunnel${NC}"
        echo -e "${RED}Check logs: tail /tmp/ssh_tunnel.log${NC}"
        return 1
    fi
}

# Function to stop tunnel
stop_tunnel() {
    PID=$(get_tunnel_pid)
    if [ -z "$PID" ]; then
        echo -e "${YELLOW}No tunnel running on port $LOCAL_PORT${NC}"
        return 1
    fi

    echo -e "${YELLOW}Stopping SSH tunnel (PID: $PID)...${NC}"
    kill $PID 2>/dev/null
    sleep 1

    if check_tunnel; then
        echo -e "${RED}Failed to stop tunnel, forcing...${NC}"
        kill -9 $PID 2>/dev/null
        sleep 1
    fi

    if check_tunnel; then
        echo -e "${RED}✗ Failed to stop tunnel${NC}"
        return 1
    else
        echo -e "${GREEN}✓ SSH tunnel stopped${NC}"
        return 0
    fi
}

# Function to show status
show_status() {
    if check_tunnel; then
        PID=$(get_tunnel_pid)
        echo -e "${GREEN}✓ SSH tunnel is running${NC}"
        echo -e "  PID: $PID"
        echo -e "  Port: $LOCAL_PORT"
        echo -e "  Connect: psql -h localhost -p $LOCAL_PORT -U $DB_USER $DB_NAME"
        return 0
    else
        echo -e "${YELLOW}✗ SSH tunnel is not running${NC}"
        echo -e "  Start with: $0 start"
        return 1
    fi
}

# Function to test connection
test_connection() {
    if ! check_tunnel; then
        echo -e "${RED}✗ Tunnel is not running${NC}"
        return 1
    fi

    echo -e "${GREEN}Testing database connection...${NC}"
    PGPASSWORD=$DB_PASS psql -h localhost -p $LOCAL_PORT -U $DB_USER $DB_NAME -c "SELECT current_database(), current_user, version();" 2>/dev/null

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Database connection successful${NC}"
        return 0
    else
        echo -e "${RED}✗ Database connection failed${NC}"
        return 1
    fi
}

# Main script logic
case "$1" in
    start)
        establish_tunnel
        ;;
    stop)
        stop_tunnel
        ;;
    restart)
        stop_tunnel
        sleep 2
        establish_tunnel
        ;;
    status)
        show_status
        ;;
    test)
        test_connection
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|test}"
        echo ""
        echo "Commands:"
        echo "  start    - Establish SSH tunnel to database"
        echo "  stop     - Stop SSH tunnel"
        echo "  restart  - Restart SSH tunnel"
        echo "  status   - Check tunnel status"
        echo "  test     - Test database connection"
        exit 1
        ;;
esac

exit $?