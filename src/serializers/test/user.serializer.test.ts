import type { User } from '../../types/express';
import type { JsonApiResourceObject } from '../../types/json-api';
import { deserializeUser, serializeUser } from '../user.serializer';

describe('User Serializer', () => {
  const mockUser: User = {
    id: 'user-uuid-123',
    username: 'johndoe',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    password: 'hashed_password',
    displayName: null,
    tokenVersion: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  describe('serializeUser', () => {
    it('should serialize a single user', () => {
      const result = serializeUser(mockUser);

      expect(result).toEqual({
        data: {
          id: mockUser.id,
          type: 'user',
          attributes: {
            email: mockUser.email,
            firstName: mockUser.firstName,
            lastName: mockUser.lastName,
            displayName: mockUser.displayName,
            createdAt: mockUser.createdAt,
            updatedAt: mockUser.updatedAt,
          },
        },
      });
    });

    it('should serialize an array of users', () => {
      const mockUsers: User[] = [
        mockUser,
        { ...mockUser, id: 'user-uuid-456', email: 'test2@example.com' },
      ];

      const result = serializeUser(mockUsers);

      expect(result).toEqual({
        data: [
          {
            id: mockUsers[0].id,
            type: 'user',
            attributes: {
              email: mockUsers[0].email,
              firstName: mockUsers[0].firstName,
              lastName: mockUsers[0].lastName,
              displayName: mockUsers[0].displayName,
              createdAt: mockUsers[0].createdAt,
              updatedAt: mockUsers[0].updatedAt,
            },
          },
          {
            id: mockUsers[1].id,
            type: 'user',
            attributes: {
              email: mockUsers[1].email,
              firstName: mockUsers[1].firstName,
              lastName: mockUsers[1].lastName,
              displayName: mockUsers[1].displayName,
              createdAt: mockUsers[1].createdAt,
              updatedAt: mockUsers[1].updatedAt,
            },
          },
        ],
      });
    });

    it('should exclude password from serialized output', () => {
      const result = serializeUser(mockUser);
      const data = result.data as JsonApiResourceObject;
      expect(data.attributes).not.toHaveProperty('password');
    });
  });

  describe('deserializeUser', () => {
    it('should deserialize a user resource', () => {
      const resource: JsonApiResourceObject = {
        id: mockUser.id,
        type: 'user',
        attributes: {
          email: mockUser.email,
          firstName: mockUser.firstName,
          lastName: mockUser.lastName,
        },
      };

      const result = deserializeUser(resource);

      expect(result).toEqual({
        email: mockUser.email,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
      });
    });

    it('should handle missing attributes', () => {
      const resource: JsonApiResourceObject = {
        id: mockUser.id,
        type: 'user',
        attributes: {},
      };

      const result = deserializeUser(resource);
      expect(result).toEqual({});
    });

    it('should ignore unknown attributes', () => {
      const resource: JsonApiResourceObject = {
        id: mockUser.id,
        type: 'user',
        attributes: { email: mockUser.email, unknownField: 'value' },
      };

      const result = deserializeUser(resource);
      expect(result).toEqual({ email: mockUser.email });
      expect(result).not.toHaveProperty('unknownField');
    });
  });
});
