import { eq } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import { db } from '../db';
import { users } from '../db/schema';
import { getTokenFromHeaders, verifyJwt } from '../utils/jwt';

export async function authenticateOptionalJwt(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = getTokenFromHeaders(req);
  if (!token) {
    next();
    return;
  }

  const payload = verifyJwt(token);
  if (!payload) {
    next();
    return;
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, payload.userId) });
  if (!user) {
    next();
    return;
  }

  req.user = user;
  req.userId = payload.userId;
  next();
}
