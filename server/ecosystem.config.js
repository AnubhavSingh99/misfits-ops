module.exports = {
  apps: [{
    name: 'misfits-app',
    script: 'src/server.ts',
    interpreter: 'tsx',
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
      // Production database connection (direct to RDS)
      POSTGRES_HOST: 'misfits.cgncbvolnhe7.ap-south-1.rds.amazonaws.com',
      POSTGRES_PORT: 5432,
      POSTGRES_DB: 'misfits',
      POSTGRES_USER: 'dev',
      POSTGRES_PASSWORD: 'postgres'
    }
  }]
};