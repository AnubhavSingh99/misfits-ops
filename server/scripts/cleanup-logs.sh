#!/bin/bash
# Cleanup script for misfits-ops server logs
# Designed to run daily via cron to prevent disk from filling up

LOG_DIR="/home/ec2-user/misfits-operations/server"
PM2_LOG_DIR="$HOME/.pm2/logs"
MAX_LOG_SIZE_MB=50

echo "$(date): Starting log cleanup..."

# 1. Truncate Winston logs if they exceed max size
for logfile in "$LOG_DIR/error.log" "$LOG_DIR/combined.log"; do
  if [ -f "$logfile" ]; then
    size_mb=$(du -m "$logfile" 2>/dev/null | cut -f1)
    if [ "$size_mb" -gt "$MAX_LOG_SIZE_MB" ]; then
      echo "Truncating $logfile (${size_mb}MB > ${MAX_LOG_SIZE_MB}MB)"
      tail -n 1000 "$logfile" > "${logfile}.tmp" && mv "${logfile}.tmp" "$logfile"
    else
      echo "$logfile is ${size_mb}MB - OK"
    fi
  fi
done

# 2. Truncate PM2 logs if they exceed max size
if [ -d "$PM2_LOG_DIR" ]; then
  for logfile in "$PM2_LOG_DIR"/*.log; do
    if [ -f "$logfile" ]; then
      size_mb=$(du -m "$logfile" 2>/dev/null | cut -f1)
      if [ "$size_mb" -gt "$MAX_LOG_SIZE_MB" ]; then
        echo "Truncating $logfile (${size_mb}MB > ${MAX_LOG_SIZE_MB}MB)"
        tail -n 1000 "$logfile" > "${logfile}.tmp" && mv "${logfile}.tmp" "$logfile"
      else
        echo "$logfile is ${size_mb}MB - OK"
      fi
    fi
  done
fi

# 3. Show disk usage after cleanup
echo "Disk usage after cleanup:"
df -h / | tail -1

echo "$(date): Log cleanup complete."
