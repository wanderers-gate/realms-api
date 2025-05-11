import type { Request, Response } from 'express';
import { UserModel } from '../models/user-model';
import { generateToken } from '../utils/jwt';
import { serializeUser } from '../serializers/user.serializer';

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
    console.log('[REGISTER] user.tokenVersion:', user.tokenVersion);

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
    // eslint-disable-next-line no-console
    console.log('[LOGIN] user.tokenVersion before:', user.tokenVersion);

    // Increment tokenVersion and save
    user.tokenVersion += 1;
    await user.save();

    // Log tokenVersion after increment
    // eslint-disable-next-line no-console
    console.log('[LOGIN] user.tokenVersion after:', user.tokenVersion);

    // Generate new token with updated tokenVersion
    const token = generateToken(user._id.toString(), user.tokenVersion);

    // Set token in cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000, // 1 hour
    });

    res.json(serializeUser(user));
  } catch (_error) {
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
    sameSite: 'strict'
  });
  res.status(204).send();
};
