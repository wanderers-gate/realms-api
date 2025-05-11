import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { Request } from 'express';
import config from '../config/config';

export const generateToken = (userId: string): string => {
  const secret = config.jwtSecret;
  if (!secret) throw new Error('JWT_SECRET is not defined');
  return jwt.sign({ userId }, secret, { expiresIn: '1h' });
};

const getSecret = (): string => {
  const secret = config.jwtSecret;
  if (!secret) throw new Error('JWT_SECRET is not defined');
  return secret;
};

export function getTokenFromHeaders(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

export const verifyJwt = <T = JwtPayload>(token: string): T | null => {
  try {
    return jwt.verify(token, getSecret()) as T;
  } catch {
    return null;
  }
};
