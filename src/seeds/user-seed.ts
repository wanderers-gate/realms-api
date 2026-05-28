import * as argon2 from 'argon2';
import { db } from '../db';
import { users } from '../db/schema';

const userSeeds = [
  { username: 'admin', password: 'admin123', displayName: 'Admin' },
  { username: 'user', password: 'user123', displayName: 'User' },
];

export const seedUsers = async (): Promise<void> => {
  try {
    const hashedSeeds = await Promise.all(
      userSeeds.map(async (user) => ({
        ...user,
        password: await argon2.hash(user.password, {
          type: argon2.argon2id,
          memoryCost: 2 ** 16,
          timeCost: 3,
          parallelism: 1,
        }),
      }))
    );

    await db.insert(users).values(hashedSeeds).onConflictDoNothing();
    console.warn('Users seeded successfully');
  } catch (error) {
    console.error('Error seeding users:', error);
    throw error;
  }
};
