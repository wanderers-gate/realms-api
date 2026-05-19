import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { UserModel } from '../../models/user-model';
import { getTokenFromHeaders, verifyJwt } from '../../utils/jwt';
import { authenticateOptionalJwt } from '../authenticate';

jest.mock('../../utils/jwt');
jest.mock('../../models/user-model');

const mockResponse = {} as Response;
const mockNext = jest.fn() as unknown as NextFunction;

const mockRequest = (authHeader?: string) =>
  ({
    headers: authHeader ? { authorization: authHeader } : {},
    user: undefined,
    userId: undefined,
  }) as unknown as Request;

describe('authenticateOptionalJwt', () => {
  const middleware = authenticateOptionalJwt();
  const userId = new Types.ObjectId();
  const mockUser = { _id: userId, email: 'test@example.com', firstName: 'Test', lastName: 'User' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls next without setting user when no token is provided', async () => {
    const req = mockRequest();
    (getTokenFromHeaders as jest.Mock).mockReturnValue(null);

    await middleware(req, mockResponse, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
    expect(req.userId).toBeUndefined();
  });

  it('calls next without setting user when token is invalid', async () => {
    const req = mockRequest('Bearer bad-token');
    (getTokenFromHeaders as jest.Mock).mockReturnValue('bad-token');
    (verifyJwt as jest.Mock).mockReturnValue(null);

    await middleware(req, mockResponse, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
    expect(req.userId).toBeUndefined();
  });

  it('calls next without setting user when user is not found in the database', async () => {
    const req = mockRequest('Bearer valid-token');
    (getTokenFromHeaders as jest.Mock).mockReturnValue('valid-token');
    (verifyJwt as jest.Mock).mockReturnValue({ userId: userId.toString(), tokenVersion: 0 });
    (UserModel.findById as jest.Mock).mockResolvedValue(null);

    await middleware(req, mockResponse, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
    expect(req.userId).toBeUndefined();
  });

  it('sets req.user and req.userId when token is valid and user exists', async () => {
    const req = mockRequest('Bearer valid-token');
    (getTokenFromHeaders as jest.Mock).mockReturnValue('valid-token');
    (verifyJwt as jest.Mock).mockReturnValue({ userId: userId.toString(), tokenVersion: 0 });
    (UserModel.findById as jest.Mock).mockResolvedValue(mockUser);

    await middleware(req, mockResponse, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(req.user).toEqual(mockUser);
    expect(req.userId).toBe(userId.toString());
  });
});
