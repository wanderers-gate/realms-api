import type { NextFunction, Request, Response } from 'express';
import { UserModel } from '../models/user-model';
import { verifyJwt } from '../utils/jwt';

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.cookies.token;
    // eslint-disable-next-line no-console
    console.log('[AUTH] Token from cookie:', token ? 'Token exists' : 'No token');

    if (!token) {
      res.status(401).json({
        errors: [
          {
            status: '401',
            title: 'Unauthorized',
            detail: 'No token provided',
          },
        ],
      });
      return;
    }

    const decoded = verifyJwt(token);
    if (!decoded) {
      res.status(401).json({
        errors: [
          {
            status: '401',
            title: 'Unauthorized',
            detail: 'Invalid token',
          },
        ],
      });
      return;
    }

    const user = await UserModel.findById(decoded.userId);
    if (!user) {
      // eslint-disable-next-line no-console
      console.error('[AUTH] User not found for ID:', decoded.userId);
      res.status(401).json({
        errors: [
          {
            status: '401',
            title: 'Unauthorized',
            detail: 'User not found',
          },
        ],
      });
      return;
    }

    // Log token versions for debugging
    // eslint-disable-next-line no-console
    console.log('[AUTH] Token versions:', {
      decodedVersion: decoded.tokenVersion,
      userVersion: user.tokenVersion,
      userId: user._id.toString(),
    });

    // Check if token version matches
    if (user.tokenVersion !== decoded.tokenVersion) {
      // eslint-disable-next-line no-console
      console.error('[AUTH] Token version mismatch:', {
        decodedVersion: decoded.tokenVersion,
        userVersion: user.tokenVersion,
        userId: user._id.toString(),
      });
      res.status(401).json({
        errors: [
          {
            status: '401',
            title: 'Unauthorized',
            detail: 'Invalid token',
          },
        ],
      });
      return;
    }

    // Add user to request object
    req.user = user;
    next();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      '[AUTH] Error during authentication:',
      error instanceof Error ? error.message : 'Unknown error'
    );
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
