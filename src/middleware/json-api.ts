import type { NextFunction, Request, Response } from 'express';
import type { JsonApiError, JsonApiRequest } from '../types/json-api';

export const jsonApiMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // For POST/PUT/PATCH requests, extract attributes from JSON:API format
  if (
    (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') &&
    req.body?.data?.attributes
  ) {
    req.body = req.body.data.attributes;
  }

  // Add JSON:API error response helper
  res.jsonApiError = (status: number, errors: JsonApiError[]): void => {
    res.status(status).json({ errors });
  };

  next();
};
