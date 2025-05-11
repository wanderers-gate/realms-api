import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { seedUsers } from './user-seed';

dotenv.config();

const runSeed = async (): Promise<void> => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/realms');
    console.warn('Connected to MongoDB');

    // Run seeds
    await seedUsers();

    // Close connection
    await mongoose.connection.close();
    console.warn('Seed completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error running seed:', error);
    process.exit(1);
  }
};

runSeed();
