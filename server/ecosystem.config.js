module.exports = {
  apps: [{
    name: 'misfits-app',
    script: 'src/server.ts',
    interpreter: 'tsx',
    cwd: '/home/ec2-user/misfits-ops/server',
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
      // Production database connection (via SSH tunnel)
      PROD_DB_HOST: 'localhost',
      PROD_DB_PORT: 5433,
      PROD_DB_NAME: 'misfits',
      PROD_DB_USER: 'dev',
      PROD_DB_PASSWORD: 'postgres',
      // SSH tunnel configuration
      SSH_KEY_PATH: '/home/ec2-user/Downloads/claude-control-key',
      SSH_HOST: 'grpc-prod.misfits.net.in',
      SSH_USER: 'claude-control',
      DB_HOST: 'misfits.cgncbvolnhe7.ap-south-1.rds.amazonaws.com',
      DB_PORT: '5432',
      // Local database configuration
      LOCAL_DB_HOST: 'localhost',
      LOCAL_DB_PORT: 5432,
      LOCAL_DB_NAME: 'misfits_ops',
      LOCAL_DB_USER: 'ec2-user',
      LOCAL_DB_PASSWORD: 'misfits_ops_password',
      // Business logic
      TARGET_MEETUP_INCREASE: 50,
      MIN_TARGET_MEETUPS: 300,
      // JWT secret
      JWT_SECRET: 'production-jwt-secret-misfits-ops-2024'
    }
  }]
};