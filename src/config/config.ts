import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

interface Config {
  port: number;
  nodeEnv: string;
  jwtSecret: string;
  allowedOrigins: string[];
  dataDir: string;
  database: {
    provider: 'sqlite' | 'postgresql';
    url: string;
  };
}

const config: Config = {
  port: Number(process.env.PORT) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean).length
    ? (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim())
    : [
        'http://localhost:5174',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:8080',
        'http://realmsapp.io',
        'https://realmsapp.io',
      ],
  dataDir: process.env.REALMS_DATA_DIR || path.join(__dirname, '../../../realms_data'),
  database: {
    provider: (process.env.DATABASE_PROVIDER as 'sqlite' | 'postgresql') || 'sqlite',
    url:
      process.env.DATABASE_URL ||
      `file:${path.join(process.env.REALMS_DATA_DIR || path.join(__dirname, '../../../realms_data'), 'realms.db')}`,
  },
};

export default config;
