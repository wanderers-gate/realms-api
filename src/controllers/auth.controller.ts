import type { Request, Response } from 'express';
import { UserModel } from '../models/user-model';
import { serializeUser } from '../serializers/user.serializer';
import { generateToken } from '../utils/jwt';
import logger from '../utils/logger';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // Check if user already exists
    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      res.status(400).json({
        errors: [
          {
            status: '400',
            title: 'Bad Request',
            detail: 'User already exists',
          },
        ],
      });
      return;
    }

    // Create new user
    const user = new UserModel({
      email,
      password,
      firstName,
      lastName,
    });

    await user.save();

    // Log tokenVersion after registration
    // eslint-disable-next-line no-console
    logger.info('[REGISTER] user.tokenVersion:', user.tokenVersion);

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
    res.status(500).json({
      errors: [
        {
          status: '500',
          title: 'Internal Server Error',
          detail: 'An error occurred while registering the user',
        },
      ],
    });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

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

    // Log tokenVersion before increment
    logger.info('[LOGIN] user.tokenVersion before:', user.tokenVersion);

    // Increment tokenVersion and save
    user.tokenVersion += 1;
    await user.save();

    // Log tokenVersion after increment
    logger.info('[LOGIN] user.tokenVersion after:', user.tokenVersion);

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

export const authCheck = async (req: Request, res: Response): Promise<void> => {
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
