import { eq } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import { db } from '../db';
import { users } from '../db/schema';
import { verifyJwt } from '../utils/jwt';

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.cookies.token;

    if (!token) {
      res.status(401).json({
        errors: [{ status: '401', title: 'Unauthorized', detail: 'No token provided' }],
      });
      return;
    }

    const decoded = verifyJwt(token);
    if (!decoded) {
      res.status(401).json({
        errors: [{ status: '401', title: 'Unauthorized', detail: 'Invalid token' }],
      });
      return;
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, decoded.userId) });
    if (!user) {
      res.status(401).json({
        errors: [{ status: '401', title: 'Unauthorized', detail: 'User not found' }],
      });
      return;
    }

    if (user.tokenVersion !== decoded.tokenVersion) {
      res.status(401).json({
        errors: [{ status: '401', title: 'Unauthorized', detail: 'Invalid token' }],
      });
      return;
    }

    req.userId = decoded.userId;
    req.user = user;
    next();
  } catch (_error) {
    res.status(500).json({
      errors: [
        {
          status: '500',
          title: 'Internal Server Error',
          detail: 'An error occurred while verifying the token',
        },
      ],
    });
  }
};
