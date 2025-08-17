import type { Request, Response } from 'express';
import { UserModel } from '../models/user-model';
import { serializeUser } from '../serializers/user.serializer';
import { generateToken } from '../utils/jwt';
import logger from '../utils/logger';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, firstName, lastName, displayName } = req.body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName) {
      res.jsonApiError(400, [
        {
          status: '400',
          title: 'Bad Request',
          detail: 'Email, password, firstName, and lastName are required',
        },
      ]);
      return;
    }

    // Validate displayName if provided
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

    // Check if user already exists
    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      res.jsonApiError(400, [
        {
          status: '400',
          title: 'Bad Request',
          detail: 'User already exists',
        },
      ]);
      return;
    }

    // Create new user
    const user = new UserModel({
      email,
      password,
      firstName,
      lastName,
      displayName: displayName ? displayName.trim() : undefined, // Optional field
    });

    await user.save();

    // Generate token with initial tokenVersion
    const token = generateToken(user._id.toString(), user.tokenVersion);

    // Set token in cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000, // 1 hour
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
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      res.status(400).json({
        errors: [
          {
            status: '400',
            title: 'Bad Request',
            detail: 'Email and password are required',
          },
        ],
      });
      return;
    }

    // Find user
    const user = await UserModel.findOne({ email });
    if (!user) {
      logger.error('[LOGIN] Failed - user not found', { email });
      res.status(401).json({
        errors: [
          {
            status: '401',
            title: 'Unauthorized',
            detail: 'Invalid credentials',
          },
        ],
      });
      return;
    }

    // Verify password
    const isValid = await user.comparePassword(password);
    if (!isValid) {
      logger.error('[LOGIN] Failed - invalid password', { email });
      res.status(401).json({
        errors: [
          {
            status: '401',
            title: 'Unauthorized',
            detail: 'Invalid credentials',
          },
        ],
      });
      return;
    }

    // Increment tokenVersion and save
    user.tokenVersion += 1;
    await user.save();

    // Generate new token with updated tokenVersion
    const token = generateToken(user._id.toString(), user.tokenVersion);

    // Set token in cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 3600000, // 1 hour
    });

    logger.info('[LOGIN] Success', { email });
    res.status(200).send();
  } catch (error) {
    logger.error('[LOGIN] Error:', error);
    res.status(500).json({
      errors: [
        {
          status: '500',
          title: 'Internal Server Error',
          detail: 'An error occurred while logging in',
        },
      ],
    });
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
    // The user should be available from the authentication middleware
    const user = req.user;

    if (!user) {
      res.status(401).json({
        errors: [
          {
            status: '401',
            title: 'Unauthorized',
            detail: 'User not found in request',
          },
        ],
      });
      return;
    }

    // Return user information with displayName fallback
    res.status(200).json({
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName || `${user.firstName} ${user.lastName}`,
    });
  } catch (error) {
    logger.error('[GET CURRENT USER] Error:', error);
    res.status(500).json({
      errors: [
        {
          status: '500',
          title: 'Internal Server Error',
          detail: 'An error occurred while fetching user data',
        },
      ],
    });
  }
};

export const authCheck = async (_req: Request, res: Response): Promise<void> => {
  try {
    // Since this route is now behind the authentication middleware,
    // if the request made it here, the user is already authenticated

    // Simply return success status
    res.status(200).send();
  } catch (error) {
    logger.error('[AUTH CHECK] Error:', error);
    res.status(500).json({
      errors: [
        {
          status: '500',
          title: 'Internal Server Error',
          detail: 'An error occurred while checking auth',
        },
      ],
    });
  }
};
