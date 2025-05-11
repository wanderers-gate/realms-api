import type { NextFunction, Request, Response } from 'express';
import type { JsonApiError, JsonApiRequest } from '../types/json-api';

export const jsonApiMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Only process JSON:API requests
  if (req.headers['content-type'] === 'application/vnd.api+json') {
    // For POST/PUT/PATCH requests, transform the body
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      if (req.body?.data) {
        // Extract attributes from the JSON:API format
        const { attributes } = req.body.data;
        if (attributes) {
          req.body = attributes;
        }
      }
    }

    // Set response content type to JSON:API
    res.setHeader('Content-Type', 'application/vnd.api+json');
  }

  // Parse JSON:API request body
  console.log('BODY: ', req.body);
  if (req.body?.data) {
    req.body = req.body as JsonApiRequest;
  }

  // Add JSON:API error response helper
  res.jsonApiError = (status: number, errors: JsonApiError[]): void => {
    res.status(status).json({ errors });
  };

  next();
};
