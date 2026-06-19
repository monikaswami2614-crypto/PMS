export const JWT_CONFIG = {
  secret: process.env.JWT_SECRET || 'your-secret-key',
  expiresIn: process.env.JWT_EXPIRE || '7d',
};

export const API_CONFIG = {
  baseUrl: process.env.API_BASE_URL || 'http://localhost:5000',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
};

export const SERVER_CONFIG = {
  port: parseInt(process.env.PORT || '5000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  scanRootPath: process.env.SCAN_ROOT_PATH || '',
};
