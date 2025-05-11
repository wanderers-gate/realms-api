import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import config from '../../config/config';
import { generateToken, getTokenFromHeaders, verifyJwt } from '../jwt';

// Mock the config module
jest.mock('../../config/config', () => ({
  __esModule: true,
  default: {
    jwtSecret: 'test-secret',
    port: 3000,
    nodeEnv: 'test',
    mongodb: {
      uri: 'mongodb://localhost:27017/test',
      options: {
        autoIndex: true,
      },
    },
  },
}));

// Define a type for the config object that allows modifying jwtSecret
interface ConfigWithModifiableSecret {
  jwtSecret: string | undefined;
}

describe('JWT Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token with tokenVersion', () => {
      const userId = 'test-user-id';
      const tokenVersion = 1;
      const token = generateToken(userId, tokenVersion);

      expect(token).toBeDefined();
      const decoded = jwt.verify(token, 'test-secret') as { userId: string; tokenVersion: number };
      expect(decoded.userId).toBe(userId);
      expect(decoded.tokenVersion).toBe(tokenVersion);
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
      const token = 'test-token';
      const req = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      } as Request;
      expect(getTokenFromHeaders(req)).toBe(token);
    });

    it('should return null for missing authorization header', () => {
      const req = {
        headers: {},
      } as Request;
      expect(getTokenFromHeaders(req)).toBeNull();
    });

    it('should return null for invalid authorization scheme', () => {
      const req = {
        headers: {
          authorization: 'Basic test-token',
        },
      } as Request;
      expect(getTokenFromHeaders(req)).toBeNull();
    });

    it('should return null for malformed authorization header', () => {
      const req = {
        headers: {
          authorization: 'Bearer',
        },
      } as Request;
      expect(getTokenFromHeaders(req)).toBeNull();
    });
  });

  describe('verifyJwt', () => {
    it('should verify and decode a valid token', () => {
      const userId = 'test-user-id';
      const tokenVersion = 1;
      const token = generateToken(userId, tokenVersion);
      const decoded = verifyJwt(token);

      expect(decoded).toBeDefined();
      expect(decoded?.userId).toBe(userId);
      expect(decoded?.tokenVersion).toBe(tokenVersion);
    });

    it('should return null for invalid token', () => {
      const decoded = verifyJwt('invalid-token');
      expect(decoded).toBeNull();
    });

    it('should return null for expired token', async () => {
      const userId = 'test-user-id';
      const tokenVersion = 1;
      const token = jwt.sign({ userId, tokenVersion }, 'test-secret', { expiresIn: '1ms' });

      // Wait for token to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      const decoded = verifyJwt(token);
      expect(decoded).toBeNull();
    });

    it('should support custom payload type', () => {
      interface CustomPayload {
        userId: string;
        tokenVersion: number;
        customField: string;
      }

      const payload: CustomPayload = {
        userId: 'test-user-id',
        tokenVersion: 1,
        customField: 'test',
      };

      const token = jwt.sign(payload, 'test-secret');
      const decoded = verifyJwt<CustomPayload>(token);

      expect(decoded).toBeDefined();
      expect(decoded?.userId).toBe(payload.userId);
      expect(decoded?.tokenVersion).toBe(payload.tokenVersion);
      expect(decoded?.customField).toBe(payload.customField);
    });
  });
});
