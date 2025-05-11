import type { NextFunction, Request, Response } from 'express';
import type { UserDocument } from '../models/user-model';
import { UserModel } from '../models/user-model';
import { getTokenFromHeaders, verifyJwt } from '../utils/jwt';

export interface AuthenticatedRequest<T extends UserDocument = UserDocument> extends Request {
  user?: T;
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
    next();
  };
}
