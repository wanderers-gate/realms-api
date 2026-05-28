import type { User } from '../../types/express';
import type { JsonApiResourceObject } from '../../types/json-api';
import { deserializeUser, serializeUser } from '../user.serializer';

describe('User Serializer', () => {
  const mockUser: User = {
    id: 'user-uuid-123',
    username: 'johndoe',
    password: 'hashed_password',
    displayName: 'John Doe',
    role: 'gm',
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
            username: mockUser.username,
            displayName: mockUser.displayName,
            role: mockUser.role,
            createdAt: mockUser.createdAt,
            updatedAt: mockUser.updatedAt,
          },
        },
      });
    });

    it('should serialize an array of users', () => {
      const mockUsers: User[] = [
        mockUser,
        { ...mockUser, id: 'user-uuid-456', username: 'janedoe' },
      ];

      const result = serializeUser(mockUsers);

      expect(result).toEqual({
        data: [
          {
            id: mockUsers[0].id,
            type: 'user',
            attributes: {
              username: mockUsers[0].username,
              displayName: mockUsers[0].displayName,
              role: mockUsers[0].role,
              createdAt: mockUsers[0].createdAt,
              updatedAt: mockUsers[0].updatedAt,
            },
          },
          {
            id: mockUsers[1].id,
            type: 'user',
            attributes: {
              username: mockUsers[1].username,
              displayName: mockUsers[1].displayName,
              role: mockUsers[1].role,
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
          username: mockUser.username,
          displayName: mockUser.displayName,
        },
      };

      const result = deserializeUser(resource);

      expect(result).toEqual({
        username: mockUser.username,
        displayName: mockUser.displayName,
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
        attributes: { username: mockUser.username, unknownField: 'value' },
      };

      const result = deserializeUser(resource);
      expect(result).toEqual({ username: mockUser.username });
      expect(result).not.toHaveProperty('unknownField');
    });
  });
});
