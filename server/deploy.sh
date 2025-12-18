#!/bin/bash

# Create tar archive with source code and public files
tar --exclude="node_modules" --exclude="dist" --exclude=".git" -czf ../server-deploy.tar.gz .

echo "Server package created: server-deploy.tar.gz"
echo "Manual deployment steps:"
echo "1. Copy server-deploy.tar.gz to server"
echo "2. Extract and install dependencies"
echo "3. Set NODE_ENV=production"
echo "4. Start with PM2: pm2 start src/server.ts --name misfits-api --interpreter tsx"