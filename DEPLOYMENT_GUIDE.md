# Deployment Guide for Misfits Operations Platform

## Production Deployment Configuration

### Server Environment Variables

Copy `server/.env.production` and update the following variables for your production environment:

```bash
# Required: Set your production frontend URL
FRONTEND_URL=https://operations.misfits.net.in

# Required: SSH configuration for database access
SSH_KEY_PATH=/home/ec2-user/.ssh/claude-control-key
SSH_HOST=15.207.255.212
SSH_USER=claude-control

# Required: Production database connection details
DB_HOST=misfits.cgncbvolnhe7.ap-south-1.rds.amazonaws.com
DB_PORT=5432
PROD_DB_NAME=misfits
PROD_DB_USER=dev
PROD_DB_PASSWORD=postgres

# Optional: Customize business logic
TARGET_MEETUP_INCREASE=50
MIN_TARGET_MEETUPS=300
```

### Client Environment Variables

Copy `client/.env.production` and update:

```bash
# Required: Set your production API URL
VITE_API_URL=https://operations.misfits.net.in/api
VITE_WS_URL=wss://operations.misfits.net.in
```

### Deployment Steps

1. **Server Setup:**
   ```bash
   cd server
   cp .env.production .env
   npm install
   npm run build
   npm start
   ```

2. **Client Setup:**
   ```bash
   cd client
   cp .env.production .env
   npm install
   npm run build
   # Deploy build/ folder to your CDN/hosting
   ```

### SSH Key Setup

Ensure the SSH key is properly configured on your production server:
```bash
chmod 600 /home/ec2-user/.ssh/claude-control-key
```

### Local Development

For local development, copy `.env.example` to `.env` and adjust values as needed:
```bash
cp .env.example .env
cp client/.env.example client/.env
```

### Environment Variable Summary

| Variable | Purpose | Development Default | Production Value |
|----------|---------|-------------------|------------------|
| `FRONTEND_URL` | CORS configuration | `http://localhost:3000` | Your domain |
| `SSH_KEY_PATH` | Database tunnel key | Local path | `/home/ec2-user/.ssh/claude-control-key` |
| `VITE_API_URL` | Frontend API endpoint | `http://localhost:5001` | Your API domain |
| `TARGET_MEETUP_INCREASE` | Business logic | `50` | Configurable |
| `MIN_TARGET_MEETUPS` | Business logic | `300` | Configurable |

### Security Notes

- Never commit actual `.env` files to version control
- Ensure SSH keys have proper permissions (600)
- Use environment-specific configuration files
- Database credentials should be secured in production

### Verification

After deployment, verify:
1. Frontend loads at your domain
2. API endpoints return data
3. SSH tunnel establishes successfully
4. Database queries execute without errors