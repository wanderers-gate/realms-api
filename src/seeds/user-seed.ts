import * as argon2 from 'argon2';
import { db } from '../db';
import { users } from '../db/schema';

const userSeeds = [
  {
    username: 'admin',
    email: 'admin@realms.com',
    password: 'admin123',
    firstName: 'Admin',
    lastName: 'User',
  },
  {
    username: 'user',
    email: 'user@realms.com',
    password: 'user123',
    firstName: 'Regular',
    lastName: 'User',
  },
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
