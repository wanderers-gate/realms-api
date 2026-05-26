import dotenv from 'dotenv';
import { seedUsers } from './user-seed';

dotenv.config();

const runSeed = async (): Promise<void> => {
  try {
    await seedUsers();
    console.warn('Seed completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error running seed:', error);
    process.exit(1);
  }
};

runSeed();
