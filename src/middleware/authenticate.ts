import type { NextFunction, Request, Response } from 'express';
import type { UserDocument } from '../models/user-model';
import { UserModel } from '../models/user-model';
import { getTokenFromHeaders, verifyJwt } from '../utils/jwt';

export interface AuthenticatedRequest<T extends UserDocument = UserDocument> extends Request {
  user?: T;
  userId?: string;
}

export function authenticateJwt<T extends UserDocument = UserDocument>() {
  return async (req: AuthenticatedRequest<T>, res: Response, next: NextFunction) => {
    const token = getTokenFromHeaders(req);
    if (!token) {
      return res.status(401).json({
        errors: [
          {
            status: '401',
            title: 'Unauthorized',
            detail: 'No token provided',
          },
        ],
      });
    }

    const payload = verifyJwt(token);
    if (!payload) {
      return res.status(401).json({
        errors: [
          {
            status: '401',
            title: 'Unauthorized',
            detail: 'Invalid token',
          },
        ],
      });
    }

    const user = await UserModel.findById(payload.userId);
    if (!user) {
      return res.status(401).json({
        errors: [
          {
            status: '401',
            title: 'Unauthorized',
            detail: 'User not found',
          },
        ],
      });
    }

    req.user = user as T;
    // Also set userId for compatibility with other middleware
    req.userId = payload.userId;
    next();
  };
}

export function authenticateOptionalJwt<T extends UserDocument = UserDocument>() {
  return async (req: AuthenticatedRequest<T>, _res: Response, next: NextFunction) => {
    const token = getTokenFromHeaders(req);
    if (!token) {
      // No token, continue without authentication
      next();
      return;
    }

    const payload = verifyJwt(token);
    if (!payload) {
      // Invalid token, continue without authentication
      next();
      return;
    }

    const user = await UserModel.findById(payload.userId);
    if (!user) {
      // User not found, continue without authentication
      next();
      return;
    }

    // Set user and userId for compatibility
    req.user = user as T;
    req.userId = payload.userId;
    next();
  };
}
