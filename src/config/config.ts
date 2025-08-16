import dotenv from 'dotenv';

dotenv.config();

interface Config {
  port: number;
  nodeEnv: string;
  jwtSecret: string;
  mongodb: {
    uri: string;
    options: {
      autoIndex: boolean;
    };
  };
}

const getMongoDBUri = (): string => {
  const useK8s = process.env.USE_K8S_DB === 'true';

  if (useK8s) {
    return (
      process.env.MONGODB_K8S_URI ||
      'mongodb://admin:mongodb-password@localhost:27018/realms?authSource=admin'
    );
  }

  return process.env.MONGODB_URI || 'mongodb://localhost:27017/realms';
};

const config: Config = {
  port: Number(process.env.PORT) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
  mongodb: {
    uri: getMongoDBUri(),
    options: {
      autoIndex: true,
    },
  },
};

export default config;
