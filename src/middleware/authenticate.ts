import type { NextFunction, Request, Response } from 'express';
import type { UserDocument } from '../models/user-model';
import { UserModel } from '../models/user-model';
import { getTokenFromHeaders, verifyJwt } from '../utils/jwt';

export interface AuthenticatedRequest<T extends UserDocument = UserDocument> extends Request {
  user?: T;
  userId?: string;
}

export function authenticateOptionalJwt<T extends UserDocument = UserDocument>() {
  return async (req: AuthenticatedRequest<T>, _res: Response, next: NextFunction) => {
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

    const user = await UserModel.findById(payload.userId);
    if (!user) {
      next();
      return;
    }

    req.user = user as T;
    req.userId = payload.userId;
    next();
  };
}
