import * as argon2 from 'argon2';
import { type User, UserModel } from '../models/user-model';

export const userSeeds: Partial<User>[] = [
  {
    email: 'admin@realms.com',
    password: 'admin123',
    firstName: 'Admin',
    lastName: 'User',
  },
  {
    email: 'user@realms.com',
    password: 'user123',
    firstName: 'Regular',
    lastName: 'User',
  },
];

export const seedUsers = async (): Promise<void> => {
  try {
    // Hash passwords
    const hashedSeeds = await Promise.all(
      userSeeds.map(async (user) => {
        if (!user.password) throw new Error('Password is required');
        return {
          ...user,
          password: await argon2.hash(user.password, {
            type: argon2.argon2id,
            memoryCost: 2 ** 16,
            timeCost: 3,
            parallelism: 1,
          }),
        };
      })
    );

    // Insert users
    await UserModel.insertMany(hashedSeeds);
    console.warn('Users seeded successfully');
  } catch (error) {
    console.error('Error seeding users:', error);
    throw error;
  }
};
