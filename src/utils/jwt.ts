import type { Request } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import config from '../config/config';

interface TokenPayload extends JwtPayload {
  userId: string;
  tokenVersion: number;
}

export const generateToken = (userId: string, tokenVersion: number): string => {
  const secret = config.jwtSecret;
  if (!secret) throw new Error('JWT_SECRET is not defined');
  return jwt.sign({ userId, tokenVersion }, secret, { expiresIn: '1h' });
};

export function getTokenFromHeaders(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

export const verifyJwt = <T extends TokenPayload = TokenPayload>(token: string): T | null => {
  try {
    const secret = config.jwtSecret;
    if (!secret) throw new Error('JWT_SECRET is not defined');
    // eslint-disable-next-line no-console
    console.log('[JWT] Verifying token with secret:', secret ? 'Secret exists' : 'No secret');

    const decoded = jwt.verify(token, secret) as T;
    // eslint-disable-next-line no-console
    console.log('[JWT] Token decoded successfully:', {
      userId: decoded.userId,
      tokenVersion: decoded.tokenVersion,
      exp: decoded.exp,
      iat: decoded.iat,
    });
    return decoded;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      '[JWT] Token verification failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return null;
  }
};
