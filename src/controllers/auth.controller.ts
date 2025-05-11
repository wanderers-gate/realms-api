import type { Request, Response } from 'express';
import config from '../config/config';
import { UserModel } from '../models/user-model';
import { serializeUser } from '../serializers/user.serializer';
import { generateToken } from '../utils/jwt';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const existingUser = await UserModel.findOne({ email: req.body.email });

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

    const user = await UserModel.create({ ...req.body });

    res.status(201).json(serializeUser(user));
  } catch (_error) {
    res.jsonApiError(500, [
      {
        status: '500',
        title: 'Internal Server Error',
        detail: 'Failed to register user',
      },
    ]);
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  const user = await UserModel.findOne({ email });

  if (!user) {
    res.jsonApiError(401, [
      {
        status: '401',
        title: 'Unauthorized',
        detail: 'Invalid credentials',
      },
    ]);
    return;
  }

  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    res.jsonApiError(401, [
      {
        status: '401',
        title: 'Unauthorized',
        detail: 'Invalid credentials',
      },
    ]);
    return;
  }

  const token = generateToken(user._id.toString());

  res.status(200).json({ user: serializeUser(user), token });
};

export const logout = async (_req: Request, res: Response): Promise<void> => {
  res.clearCookie('token');
  res.status(200).json({ message: 'Logged out successfully' });
};
