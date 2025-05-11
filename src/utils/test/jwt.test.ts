import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import config from '../../config/config';
import { generateToken, getTokenFromHeaders, verifyJwt } from '../jwt';

// Mock the config module
jest.mock('../../config/config', () => ({
  jwtSecret: 'test-secret',
}));

// Define a type for the config object that allows modifying jwtSecret
interface ConfigWithModifiableSecret {
  jwtSecret: string | undefined;
}

describe('JWT Utils', () => {
  describe('generateToken', () => {
    it('should generate a valid JWT token with tokenVersion', () => {
      const userId = 'test-user-id';
      const tokenVersion = 1;
      const token = generateToken(userId, tokenVersion);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      // Verify the token can be decoded
      const decoded = jwt.verify(token, 'test-secret') as { userId: string; tokenVersion: number; iat: number };
      expect(decoded.userId).toBe(userId);
      expect(decoded.tokenVersion).toBe(tokenVersion);
      expect(typeof decoded.iat).toBe('number');
      expect(decoded.iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
    });

    it('should throw error if JWT_SECRET is not defined', () => {
      // Temporarily set jwtSecret to undefined
      const originalSecret = config.jwtSecret;
      (config as ConfigWithModifiableSecret).jwtSecret = undefined;

      expect(() => generateToken('test-user-id', 1)).toThrow('JWT_SECRET is not defined');

      // Restore the original secret
      (config as ConfigWithModifiableSecret).jwtSecret = originalSecret;
    });
  });

  describe('getTokenFromHeaders', () => {
    it('should extract token from Bearer authorization header', () => {
      const mockReq = {
        headers: {
          authorization: 'Bearer test-token',
        },
      } as Request;

      const token = getTokenFromHeaders(mockReq);
      expect(token).toBe('test-token');
    });

    it('should return null for missing authorization header', () => {
      const mockReq = {
        headers: {},
      } as Request;

      const token = getTokenFromHeaders(mockReq);
      expect(token).toBeNull();
    });

    it('should return null for invalid authorization scheme', () => {
      const mockReq = {
        headers: {
          authorization: 'Basic test-token',
        },
      } as Request;

      const token = getTokenFromHeaders(mockReq);
      expect(token).toBeNull();
    });

    it('should return null for malformed authorization header', () => {
      const mockReq = {
        headers: {
          authorization: 'Bearer',
        },
      } as Request;

      const token = getTokenFromHeaders(mockReq);
      expect(token).toBeNull();
    });
  });

  describe('verifyJwt', () => {
    it('should verify and decode a valid token', () => {
      const payload = { userId: 'test-user-id', tokenVersion: 1 };
      const token = jwt.sign(payload, 'test-secret');

      const decoded = verifyJwt(token);
      expect(decoded).toEqual(
        expect.objectContaining({
          ...payload,
          iat: expect.any(Number),
        })
      );
    });

    it('should return null for invalid token', () => {
      const decoded = verifyJwt('invalid-token');
      expect(decoded).toBeNull();
    });

    it('should return null for expired token', () => {
      const payload = { userId: 'test-user-id', tokenVersion: 1 };
      const token = jwt.sign(payload, 'test-secret', { expiresIn: '0s' });

      // Wait for token to expire
      setTimeout(() => {
        const decoded = verifyJwt(token);
        expect(decoded).toBeNull();
      }, 1000);
    });

    it('should support custom payload type', () => {
      interface CustomPayload {
        userId: string;
        role: string;
        tokenVersion: number;
      }

      const payload: CustomPayload = { userId: 'test-user-id', role: 'admin', tokenVersion: 1 };
      const token = jwt.sign(payload, 'test-secret');

      const decoded = verifyJwt<CustomPayload & { iat: number }>(token);
      expect(decoded).toEqual(
        expect.objectContaining({
          ...payload,
          iat: expect.any(Number),
        })
      );
    });
  });
});
