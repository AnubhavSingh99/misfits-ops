#!/bin/bash

# Misfits Operations Deployment Script
# Usage: ./deploy.sh [push|pull|status]

set -e

PRODUCTION_KEY="/Users/retalplaza/Downloads/cdk-key-staging.pem"
PRODUCTION_SERVER="ec2-user@13.201.15.180"
PRODUCTION_PATH="/home/ec2-user/misfits-operations"

function show_help() {
    echo "Misfits Operations Deployment Manager"
    echo ""
    echo "Usage: ./deploy.sh [command]"
    echo ""
    echo "Commands:"
    echo "  push     - Deploy local changes to production"
    echo "  pull     - Pull production changes to local"
    echo "  status   - Show deployment status"
    echo "  restart  - Restart production services"
    echo "  logs     - Show production logs"
    echo ""
}

function deploy_to_production() {
    echo "🚀 Deploying to production..."

    echo "📦 Committing local changes..."
    git add .
    if git diff --staged --quiet; then
        echo "ℹ️  No changes to commit"
    else
        git commit -m "Deploy updates to production

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"
    fi

    echo "📡 Pushing to production..."
    ssh -i $PRODUCTION_KEY $PRODUCTION_SERVER "cd $PRODUCTION_PATH && git fetch && git reset --hard origin/main"
    git push production main

    echo "🔗 Setting up database tunnel on production..."
    ssh -i $PRODUCTION_KEY $PRODUCTION_SERVER "cd $PRODUCTION_PATH && chmod +x db_connect.sh && ./db_connect.sh start"

    echo "🧹 Setting up log cleanup cron job..."
    ssh -i $PRODUCTION_KEY $PRODUCTION_SERVER "chmod +x $PRODUCTION_PATH/server/scripts/cleanup-logs.sh && (crontab -l 2>/dev/null | grep -q 'cleanup-logs.sh' || (crontab -l 2>/dev/null; echo '0 3 * * * $PRODUCTION_PATH/server/scripts/cleanup-logs.sh >> $PRODUCTION_PATH/server/cleanup.log 2>&1') | crontab -)"

    echo "🔄 Restarting services..."
    ssh -i $PRODUCTION_KEY $PRODUCTION_SERVER "cd $PRODUCTION_PATH && pm2 restart misfits-app"

    echo "✅ Deployment complete!"
    show_status
}

function pull_from_production() {
    echo "⬇️  Pulling from production..."

    ssh -i $PRODUCTION_KEY $PRODUCTION_SERVER "cd $PRODUCTION_PATH && git add . && git commit -m 'Production changes' || true"
    git pull production main

    echo "✅ Pull complete!"
}

function show_status() {
    echo "📊 Production Status:"

    echo ""
    echo "🖥️  PM2 Status:"
    ssh -i $PRODUCTION_KEY $PRODUCTION_SERVER "pm2 status"

    echo ""
    echo "🔗 API Health Check:"
    curl -s https://operations.misfits.net.in/api/scaling/activities | jq '.success' || echo "❌ API not responding"

    echo ""
    echo "🗂️  Git Status:"
    ssh -i $PRODUCTION_KEY $PRODUCTION_SERVER "cd $PRODUCTION_PATH && git status --porcelain"
}

function restart_services() {
    echo "🔄 Restarting production services..."
    ssh -i $PRODUCTION_KEY $PRODUCTION_SERVER "cd $PRODUCTION_PATH && pm2 restart misfits-app"
    echo "✅ Services restarted!"
}

function show_logs() {
    echo "📋 Production Logs:"
    ssh -i $PRODUCTION_KEY $PRODUCTION_SERVER "pm2 logs misfits-app --lines 20"
}

function manage_db() {
    case "$2" in
        start)
            echo "🔗 Starting database tunnel..."
            ssh -i $PRODUCTION_KEY $PRODUCTION_SERVER "cd $PRODUCTION_PATH && ./db_connect.sh start"
            ;;
        stop)
            echo "🔌 Stopping database tunnel..."
            ssh -i $PRODUCTION_KEY $PRODUCTION_SERVER "cd $PRODUCTION_PATH && ./db_connect.sh stop"
            ;;
        status)
            echo "📊 Database tunnel status:"
            ssh -i $PRODUCTION_KEY $PRODUCTION_SERVER "cd $PRODUCTION_PATH && ./db_connect.sh status"
            ;;
        test)
            echo "🧪 Testing database connection:"
            ssh -i $PRODUCTION_KEY $PRODUCTION_SERVER "cd $PRODUCTION_PATH && ./db_connect.sh test"
            ;;
        restart)
            echo "🔄 Restarting database tunnel..."
            ssh -i $PRODUCTION_KEY $PRODUCTION_SERVER "cd $PRODUCTION_PATH && ./db_connect.sh restart"
            ;;
        *)
            echo "Database tunnel management:"
            echo "  ./deploy.sh db start    - Start tunnel"
            echo "  ./deploy.sh db stop     - Stop tunnel"
            echo "  ./deploy.sh db status   - Check status"
            echo "  ./deploy.sh db test     - Test connection"
            echo "  ./deploy.sh db restart  - Restart tunnel"
            ;;
    esac
}

case "${1:-help}" in
    push)
        deploy_to_production
        ;;
    pull)
        pull_from_production
        ;;
    status)
        show_status
        ;;
    restart)
        restart_services
        ;;
    logs)
        show_logs
        ;;
    db)
        manage_db "$@"
        ;;
    help|--help|-h|*)
        show_help
        ;;
esac