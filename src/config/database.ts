import mongoose from 'mongoose';

import logger from '../utils/logger';

import config from './config';

const connectDB = async (): Promise<void> => {
  try {
    const isK8s = process.env.USE_K8S_DB === 'true';
    const maskedUri = config.mongodb.uri.replace(/\/\/.*@/, '//***:***@');

    logger.info(`Connecting to ${isK8s ? 'Kubernetes' : 'local'} MongoDB: ${maskedUri}`);
    await mongoose.connect(config.mongodb.uri, config.mongodb.options);
    logger.info(`Successfully connected to ${isK8s ? 'Kubernetes' : 'local'} MongoDB`);
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

export default connectDB;
