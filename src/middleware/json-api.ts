import type { NextFunction, Request, Response } from 'express';
import type { JsonApiError, JsonApiRequest } from '../types/json-api';

export const jsonApiMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Set JSON:API content type
  res.setHeader('Content-Type', 'application/vnd.api+json');

  // Parse JSON:API request body
  if (req.body?.data) {
    req.body = req.body as JsonApiRequest;
  }

  // Add JSON:API error response helper
  res.jsonApiError = (status: number, errors: JsonApiError[]): void => {
    res.status(status).json({ errors });
  };

  next();
};
