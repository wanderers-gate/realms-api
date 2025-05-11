import { Types } from 'mongoose';
import type { UserDocument } from '../../models/user-model';
import type { JsonApiResourceObject } from '../../types/json-api';
import { deserializeUser, serializeUser } from '../user.serializer';

describe('User Serializer', () => {
  const mockUser: Partial<UserDocument> = {
    _id: new Types.ObjectId(),
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    password: 'hashed_password',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  describe('serializeUser', () => {
    it('should serialize a single user', () => {
      const result = serializeUser(mockUser as UserDocument);

      expect(result).toEqual({
        data: {
          id: mockUser._id?.toString(),
          type: 'user',
          attributes: {
            email: mockUser.email,
            firstName: mockUser.firstName,
            lastName: mockUser.lastName,
            createdAt: mockUser.createdAt,
            updatedAt: mockUser.updatedAt,
          },
        },
      });
    });

    it('should serialize an array of users', () => {
      const mockUsers = [
        mockUser,
        {
          ...mockUser,
          _id: new Types.ObjectId(),
          email: 'test2@example.com',
        },
      ] as UserDocument[];

      const result = serializeUser(mockUsers);

      expect(result).toEqual({
        data: [
          {
            id: mockUsers[0]._id?.toString(),
            type: 'user',
            attributes: {
              email: mockUsers[0].email,
              firstName: mockUsers[0].firstName,
              lastName: mockUsers[0].lastName,
              createdAt: mockUsers[0].createdAt,
              updatedAt: mockUsers[0].updatedAt,
            },
          },
          {
            id: mockUsers[1]._id?.toString(),
            type: 'user',
            attributes: {
              email: mockUsers[1].email,
              firstName: mockUsers[1].firstName,
              lastName: mockUsers[1].lastName,
              createdAt: mockUsers[1].createdAt,
              updatedAt: mockUsers[1].updatedAt,
            },
          },
        ],
      });
    });

    it('should exclude password from serialized output', () => {
      const result = serializeUser(mockUser as UserDocument);
      const data = result.data as JsonApiResourceObject;

      expect(data.attributes).not.toHaveProperty('password');
    });

    it('should handle missing optional fields', () => {
      const partialUser = {
        _id: new Types.ObjectId(),
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      } as UserDocument;

      const result = serializeUser(partialUser);
      const data = result.data as JsonApiResourceObject;

      expect(data.attributes).not.toHaveProperty('createdAt');
      expect(data.attributes).not.toHaveProperty('updatedAt');
    });
  });

  describe('deserializeUser', () => {
    it('should deserialize a user resource', () => {
      const resource: JsonApiResourceObject = {
        id: mockUser._id?.toString() ?? '',
        type: 'user',
        attributes: {
          email: mockUser.email ?? '',
          firstName: mockUser.firstName ?? '',
          lastName: mockUser.lastName ?? '',
          createdAt: mockUser.createdAt ?? new Date(),
          updatedAt: mockUser.updatedAt ?? new Date(),
        },
      };

      const result = deserializeUser(resource);

      expect(result).toEqual({
        _id: mockUser._id,
        email: mockUser.email,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
      });
    });

    it('should handle missing attributes', () => {
      const resource: JsonApiResourceObject = {
        id: mockUser._id?.toString() ?? '',
        type: 'user',
        attributes: {},
      };

      const result = deserializeUser(resource);

      expect(result).toEqual({
        _id: mockUser._id,
      });
    });

    it('should ignore unknown attributes', () => {
      const resource: JsonApiResourceObject = {
        id: mockUser._id?.toString() ?? '',
        type: 'user',
        attributes: {
          email: mockUser.email ?? '',
          unknownField: 'value',
        },
      };

      const result = deserializeUser(resource);

      expect(result).toEqual({
        _id: mockUser._id,
        email: mockUser.email,
      });
      expect(result).not.toHaveProperty('unknownField');
    });

    it('should handle missing id', () => {
      const resource = {
        type: 'user',
        attributes: {
          email: mockUser.email ?? '',
        },
      } as unknown as JsonApiResourceObject;

      const result = deserializeUser(resource);

      expect(result).toEqual({
        email: mockUser.email,
      });
      expect(result).not.toHaveProperty('_id');
    });
  });
});
