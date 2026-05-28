import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db';
import { users } from '../db/schema';
import { deserializeUser, serializeUser } from '../serializers/user.serializer';
import logger from '../utils/logger';

export const index = async (_req: Request, res: Response): Promise<void> => {
  try {
    const allUsers = await db.select().from(users);
    res.json(serializeUser(allUsers));
  } catch (error) {
    logger.error('[USER INDEX] Error fetching users:', error);
    res.jsonApiError(500, [
      { status: '500', title: 'Internal Server Error', detail: 'Failed to fetch users' },
    ]);
  }
};

export const show = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await db.query.users.findFirst({ where: eq(users.id, req.params.id) });
    if (!user) {
      res.jsonApiError(404, [{ status: '404', title: 'Not Found', detail: 'User not found' }]);
      return;
    }
    res.json(serializeUser(user));
  } catch (error) {
    logger.error('[USER SHOW] Error fetching user:', error);
    res.jsonApiError(500, [
      { status: '500', title: 'Internal Server Error', detail: 'Failed to fetch user' },
    ]);
  }
};

export const create = async (req: Request, res: Response): Promise<void> => {
  try {
    const userData = deserializeUser(req.body);
    if (!userData.username || !userData.password || !userData.firstName || !userData.lastName) {
      res.jsonApiError(400, [
        { status: '400', title: 'Bad Request', detail: 'Missing required fields' },
      ]);
      return;
    }

    const hashedPassword = await argon2.hash(userData.password as string, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 1,
    });

    const [user] = await db
      .insert(users)
      .values({
        username: (userData.username as string).toLowerCase(),
        email: userData.email ? (userData.email as string).toLowerCase() : null,
        password: hashedPassword,
        firstName: userData.firstName as string,
        lastName: userData.lastName as string,
        displayName: (userData.displayName as string) ?? null,
      })
      .returning();

    res.status(201).json(serializeUser(user));
  } catch (error) {
    logger.error('[USER CREATE] Error creating user:', error);
    res.jsonApiError(400, [
      { status: '400', title: 'Bad Request', detail: 'Failed to create user' },
    ]);
  }
};

export const update = async (req: Request, res: Response): Promise<void> => {
  try {
    const userData = deserializeUser(req.body);
    const [user] = await db
      .update(users)
      .set(userData as Partial<typeof users.$inferInsert>)
      .where(eq(users.id, req.params.id))
      .returning();

    if (!user) {
      res.jsonApiError(404, [{ status: '404', title: 'Not Found', detail: 'User not found' }]);
      return;
    }

    res.json(serializeUser(user));
  } catch (error) {
    logger.error('[USER UPDATE] Error updating user:', error);
    res.jsonApiError(400, [
      { status: '400', title: 'Bad Request', detail: 'Failed to update user' },
    ]);
  }
};

export const destroy = async (req: Request, res: Response): Promise<void> => {
  try {
    const [user] = await db.delete(users).where(eq(users.id, req.params.id)).returning();
    if (!user) {
      res.jsonApiError(404, [{ status: '404', title: 'Not Found', detail: 'User not found' }]);
      return;
    }
    res.status(204).send();
  } catch (error) {
    logger.error('[USER DELETE] Error deleting user:', error);
    res.jsonApiError(500, [
      { status: '500', title: 'Internal Server Error', detail: 'Failed to delete user' },
    ]);
  }
};
