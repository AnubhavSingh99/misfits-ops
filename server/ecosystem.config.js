module.exports = {
  apps: [{
    name: 'misfits-app',
    script: 'src/server.ts',
    interpreter: 'tsx',
    cwd: '/home/ec2-user/misfits-ops/server',
    kill_timeout: 8000, // Wait 8 seconds for graceful shutdown (SSH tunnel cleanup needs ~5s)
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
      // Production database connection (direct to RDS)
      PROD_DB_HOST: 'misfits.cgncbvolnhe7.ap-south-1.rds.amazonaws.com',
      PROD_DB_PORT: 5432,
      PROD_DB_NAME: 'misfits',
      PROD_DB_USER: 'dev',
      PROD_DB_PASSWORD: 'postgres',
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