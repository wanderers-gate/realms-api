import type { Response } from 'express';

export const sendError = (res: Response, status: number, title: string, detail: string): void => {
  res.status(status).json({ errors: [{ status: String(status), title, detail }] });
};
