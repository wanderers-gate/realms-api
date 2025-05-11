import type { NextFunction, Request, Response } from 'express';
import { getTokenFromHeaders, verifyJwt } from '../utils/jwt';

export interface AuthenticatedRequest<T = Record<string, unknown>> extends Request {
  user?: T;
}

export function authenticateJwt<T = Record<string, unknown>>() {
  return (req: AuthenticatedRequest<T>, res: Response, next: NextFunction) => {
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

    const payload = verifyJwt<T>(token);
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

    req.user = payload;
    next();
  };
}
