import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db';
import { users } from '../db/schema';
import { serializeUser } from '../serializers/user.serializer';
import { generateToken } from '../utils/jwt';
import logger from '../utils/logger';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password, displayName } = req.body;

    if (!username || !password) {
      res.jsonApiError(400, [
        {
          status: '400',
          title: 'Bad Request',
          detail: 'Username and password are required',
        },
      ]);
      return;
    }

    if (displayName && (displayName.trim().length === 0 || displayName.trim().length > 50)) {
      res.jsonApiError(400, [
        {
          status: '400',
          title: 'Bad Request',
          detail: 'Display name must be between 1 and 50 characters',
        },
      ]);
      return;
    }

    const existing = await db.query.users.findFirst({
      where: eq(users.username, username.toLowerCase()),
    });
    if (existing) {
      res.jsonApiError(400, [
        { status: '400', title: 'Bad Request', detail: 'Username already taken' },
      ]);
      return;
    }

    const hashedPassword = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 1,
    });

    const [user] = await db
      .insert(users)
      .values({
        username: username.toLowerCase(),
        password: hashedPassword,
        displayName: displayName ? displayName.trim() : null,
      })
      .returning();

    const token = generateToken(user.id, user.tokenVersion);
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000,
    });

    res.status(201).json(serializeUser(user));
  } catch (_error) {
    res.jsonApiError(500, [
      {
        status: '500',
        title: 'Internal Server Error',
        detail: 'An error occurred while registering the user',
      },
    ]);
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.jsonApiError(400, [
        { status: '400', title: 'Bad Request', detail: 'Username and password are required' },
      ]);
      return;
    }

    const user = await db.query.users.findFirst({
      where: eq(users.username, username.toLowerCase()),
    });
    if (!user) {
      logger.error('[LOGIN] Failed - user not found', { username });
      res.jsonApiError(401, [
        { status: '401', title: 'Unauthorized', detail: 'Invalid credentials' },
      ]);
      return;
    }

    const isValid = await argon2.verify(user.password, password);
    if (!isValid) {
      logger.error('[LOGIN] Failed - invalid password', { username });
      res.jsonApiError(401, [
        { status: '401', title: 'Unauthorized', detail: 'Invalid credentials' },
      ]);
      return;
    }

    const newTokenVersion = user.tokenVersion + 1;
    await db.update(users).set({ tokenVersion: newTokenVersion }).where(eq(users.id, user.id));

    const token = generateToken(user.id, newTokenVersion);
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 3600000,
    });

    logger.info('[LOGIN] Success', { username });
    res.status(200).send();
  } catch (error) {
    logger.error('[LOGIN] Error:', error);
    res.jsonApiError(500, [
      {
        status: '500',
        title: 'Internal Server Error',
        detail: 'An error occurred while logging in',
      },
    ]);
  }
};

export const logout = (_req: Request, res: Response): void => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  res.status(204).send();
};

export const getCurrentUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.jsonApiError(401, [
        { status: '401', title: 'Unauthorized', detail: 'User not found in request' },
      ]);
      return;
    }

    res.status(200).json({
      id: user.id,
      username: user.username,
      displayName: user.displayName || user.username,
    });
  } catch (error) {
    logger.error('[GET CURRENT USER] Error:', error);
    res.jsonApiError(500, [
      {
        status: '500',
        title: 'Internal Server Error',
        detail: 'An error occurred while fetching user data',
      },
    ]);
  }
};

export const authCheck = (_req: Request, res: Response): void => {
  res.status(200).send();
};
