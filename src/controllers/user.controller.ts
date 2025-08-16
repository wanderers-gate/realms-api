import type { Request, Response } from 'express';
import { UserModel } from '../models/user-model';
import { deserializeUser, serializeUser } from '../serializers/user.serializer';
import logger from '../utils/logger';

export const index = async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await UserModel.find();
    res.json(serializeUser(users));
  } catch (error) {
    logger.error('[USER INDEX] Error fetching users:', error);
    res.jsonApiError(500, [
      {
        status: '500',
        title: 'Internal Server Error',
        detail: 'Failed to fetch users',
      },
    ]);
  }
};

export const show = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await UserModel.findById(req.params.id);
    if (!user) {
      res.jsonApiError(404, [
        {
          status: '404',
          title: 'Not Found',
          detail: 'User not found',
        },
      ]);
      return;
    }
    res.json(serializeUser(user));
  } catch (error) {
    logger.error('[USER SHOW] Error fetching user:', error);
    res.jsonApiError(500, [
      {
        status: '500',
        title: 'Internal Server Error',
        detail: 'Failed to fetch user',
      },
    ]);
  }
};

export const create = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await UserModel.create(req.body);
    res.status(201).json(serializeUser(user));
  } catch (error) {
    logger.error('[USER CREATE] Error creating user:', error);
    res.jsonApiError(400, [
      {
        status: '400',
        title: 'Bad Request',
        detail: 'Failed to create user',
      },
    ]);
  }
};

export const update = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await UserModel.findByIdAndUpdate(req.params.id, req.body, { new: true });

    if (!user) {
      res.jsonApiError(404, [
        {
          status: '404',
          title: 'Not Found',
          detail: 'User not found',
        },
      ]);
      return;
    }

    res.json(serializeUser(user));
  } catch (error) {
    logger.error('[USER UPDATE] Error updating user:', error);
    res.jsonApiError(400, [
      {
        status: '400',
        title: 'Bad Request',
        detail: 'Failed to update user',
      },
    ]);
  }
};

export const destroy = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await UserModel.findByIdAndDelete(req.params.id);
    if (!user) {
      res.jsonApiError(404, [
        {
          status: '404',
          title: 'Not Found',
          detail: 'User not found',
        },
      ]);
      return;
    }
    res.status(204).send();
  } catch (error) {
    logger.error('[USER DELETE] Error deleting user:', error);
    res.jsonApiError(500, [
      {
        status: '500',
        title: 'Internal Server Error',
        detail: 'Failed to delete user',
      },
    ]);
  }
};
