import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'misfits-operations' },
  transports: [
    new winston.transports.File({
      filename: 'error.log',
      level: 'error',
      maxsize: 5 * 1024 * 1024, // 5MB per file
      maxFiles: 3,              // Keep 3 rotated files max (15MB total)
    }),
    new winston.transports.File({
      filename: 'combined.log',
      maxsize: 10 * 1024 * 1024, // 10MB per file
      maxFiles: 3,               // Keep 3 rotated files max (30MB total)
    }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}
