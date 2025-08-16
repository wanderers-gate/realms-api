# Room API Documentation

## Overview

The Room API provides endpoints for creating, managing, and joining virtual tabletop rooms. All responses follow the JSON:API specification format.

**Base URL**: `http://localhost:3001/api/rooms`

## Authentication

- **Public Endpoints**: Room listing and viewing
- **Protected Endpoints**: Room creation, updates, and deletion require authentication
- **Authentication Method**: JWT token via HTTP-only cookie
- **Token Format**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

## Data Models

### Room Object

```json
{
  "type": "room",
  "id": "507f1f77bcf86cd799439011",
  "attributes": {
    "name": "Dungeon Master's Lair",
    "description": "A room for epic D&D adventures",
    "roomId": "ABC123",
    "isActive": true,
    "maxPlayers": 8,
    "currentPlayers": 3,
    "settings": {
      "isPrivate": false,
      "allowGuests": true,
      "gridSize": 50
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z",
    "lastActivity": "2024-01-15T10:30:00.000Z"
  },
  "relationships": {
    "createdBy": {
      "data": {
        "type": "user",
        "id": "507f1f77bcf86cd799439012"
      }
    }
  }
}
```

### Room Settings

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `isPrivate` | boolean | false | false | Whether the room requires an invite |
| `allowGuests` | boolean | false | true | Whether non-authenticated users can join |
| `gridSize` | number | false | 50 | Grid size for the virtual tabletop (10-100) |

## Endpoints

### 1. List Rooms

**GET** `/api/rooms`

Retrieve a list of public rooms with pagination and search capabilities.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number for pagination |
| `limit` | number | 20 | Number of rooms per page (max 50) |
| `search` | string | - | Search rooms by name or description |

#### Request Example

```bash
curl -X GET "http://localhost:3001/api/rooms?page=1&limit=10&search=dungeon" \
  -H "Content-Type: application/vnd.api+json"
```

#### Response Example

```json
{
  "data": [
    {
      "type": "room",
      "id": "507f1f77bcf86cd799439011",
      "attributes": {
        "name": "Dungeon Master's Lair",
        "description": "A room for epic D&D adventures",
        "roomId": "ABC123",
        "isActive": true,
        "maxPlayers": 8,
        "currentPlayers": 3,
        "settings": {
          "isPrivate": false,
          "allowGuests": true,
          "gridSize": 50
        },
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-15T10:30:00.000Z",
        "lastActivity": "2024-01-15T10:30:00.000Z"
      },
      "relationships": {
        "createdBy": {
          "data": {
            "type": "user",
            "id": "507f1f77bcf86cd799439012"
          }
        }
      }
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "pages": 3
    }
  }
}
```

#### Notes

- Unauthenticated users only see rooms with `allowGuests: true`
- Authenticated users see all public rooms
- Results are sorted by `lastActivity` (most recent first)

### 2. Get Room

**GET** `/api/rooms/{roomId}`

Retrieve details of a specific room by its unique room ID.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `roomId` | string | 6-character unique room identifier |

#### Request Example

```bash
curl -X GET "http://localhost:3001/api/rooms/ABC123" \
  -H "Content-Type: application/vnd.api+json"
```

#### Response Example

```json
{
  "data": {
    "type": "room",
    "id": "507f1f77bcf86cd799439011",
    "attributes": {
      "name": "Dungeon Master's Lair",
      "description": "A room for epic D&D adventures",
      "roomId": "ABC123",
      "isActive": true,
      "maxPlayers": 8,
      "currentPlayers": 3,
      "settings": {
        "isPrivate": false,
        "allowGuests": true,
        "gridSize": 50
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z",
      "lastActivity": "2024-01-15T10:30:00.000Z"
    },
    "relationships": {
      "createdBy": {
        "data": {
          "type": "user",
          "id": "507f1f77bcf86cd799439012"
        }
      }
    }
  }
}
```

#### Error Responses

- **404 Not Found**: Room doesn't exist or is inactive
- **403 Forbidden**: Room doesn't allow guest access and user is not authenticated

### 3. Create Room

**POST** `/api/rooms`

Create a new room. Requires authentication.

#### Request Headers

```
Content-Type: application/vnd.api+json
Cookie: token=<jwt_token>
```

#### Request Body

```json
{
  "data": {
    "type": "room",
    "attributes": {
      "name": "My New Room",
      "description": "A description of the room",
      "maxPlayers": 8,
      "settings": {
        "isPrivate": false,
        "allowGuests": true,
        "gridSize": 50
      }
    }
  }
}
```

#### Request Example

```bash
curl -X POST "http://localhost:3001/api/rooms" \
  -H "Content-Type: application/vnd.api+json" \
  -H "Cookie: token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "data": {
      "type": "room",
      "attributes": {
        "name": "My New Room",
        "description": "A description of the room",
        "maxPlayers": 8,
        "settings": {
          "isPrivate": false,
          "allowGuests": true,
          "gridSize": 50
        }
      }
    }
  }'
```

#### Response Example

```json
{
  "data": {
    "type": "room",
    "id": "507f1f77bcf86cd799439011",
    "attributes": {
      "name": "My New Room",
      "description": "A description of the room",
      "roomId": "XYZ789",
      "isActive": true,
      "maxPlayers": 8,
      "currentPlayers": 0,
      "settings": {
        "isPrivate": false,
        "allowGuests": true,
        "gridSize": 50
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z",
      "lastActivity": "2024-01-15T10:30:00.000Z"
    },
    "relationships": {
      "createdBy": {
        "data": {
          "type": "user",
          "id": "507f1f77bcf86cd799439012"
        }
      }
    }
  },
  "included": [
    {
      "id": "507f1f77bcf86cd799439012",
      "type": "user",
      "attributes": {
        "firstName": "John",
        "lastName": "Doe",
        "displayName": "John Doe"
      }
    }
  ]
}
```

#### Error Responses

- **401 Unauthorized**: No valid authentication token
- **404 Not Found**: User not found
- **400 Bad Request**: Invalid room data

### 4. Update Room

**PUT** `/api/rooms/{roomId}`

Update an existing room. Only the room creator can update the room.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `roomId` | string | 6-character unique room identifier |

#### Request Headers

```
Content-Type: application/vnd.api+json
Cookie: token=<jwt_token>
```

#### Request Body

```json
{
  "data": {
    "type": "room",
    "attributes": {
      "name": "Updated Room Name",
      "description": "Updated description",
      "maxPlayers": 10,
      "settings": {
        "isPrivate": true,
        "allowGuests": false,
        "gridSize": 75
      }
    }
  }
}
```

#### Request Example

```bash
curl -X PUT "http://localhost:3001/api/rooms/ABC123" \
  -H "Content-Type: application/vnd.api+json" \
  -H "Cookie: token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "data": {
      "type": "room",
      "attributes": {
        "name": "Updated Room Name",
        "description": "Updated description"
      }
    }
  }'
```

#### Response Example

```json
{
  "data": {
    "type": "room",
    "id": "507f1f77bcf86cd799439011",
    "attributes": {
      "name": "Updated Room Name",
      "description": "Updated description",
      "roomId": "ABC123",
      "isActive": true,
      "maxPlayers": 8,
      "currentPlayers": 3,
      "settings": {
        "isPrivate": true,
        "allowGuests": false,
        "gridSize": 75
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:35:00.000Z",
      "lastActivity": "2024-01-15T10:35:00.000Z"
    },
    "relationships": {
      "createdBy": {
        "data": {
          "type": "user",
          "id": "507f1f77bcf86cd799439012"
        }
      }
    }
  }
}
```

#### Error Responses

- **401 Unauthorized**: No valid authentication token
- **403 Forbidden**: User is not the room creator
- **404 Not Found**: Room doesn't exist or is inactive

### 5. Delete Room

**DELETE** `/api/rooms/{roomId}`

Delete (deactivate) a room. Only the room creator can delete the room.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `roomId` | string | 6-character unique room identifier |

#### Request Headers

```
Cookie: token=<jwt_token>
```

#### Request Example

```bash
curl -X DELETE "http://localhost:3001/api/rooms/ABC123" \
  -H "Cookie: token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

#### Response

- **204 No Content**: Room successfully deleted

#### Error Responses

- **401 Unauthorized**: No valid authentication token
- **403 Forbidden**: User is not the room creator
- **404 Not Found**: Room doesn't exist or is inactive

## Error Responses

All error responses follow the JSON:API error format:

```json
{
  "errors": [
    {
      "status": "400",
      "title": "Bad Request",
      "detail": "Detailed error message"
    }
  ]
}
```

### Common Error Codes

| Status | Title | Description |
|--------|-------|-------------|
| 400 | Bad Request | Invalid request data or validation error |
| 401 | Unauthorized | Authentication required or invalid token |
| 403 | Forbidden | User lacks permission for the operation |
| 404 | Not Found | Resource doesn't exist |
| 500 | Internal Server Error | Server error occurred |

## Room ID Generation

- Room IDs are automatically generated as 6-character alphanumeric strings
- Format: `[A-Z0-9]{6}` (e.g., "ABC123", "XYZ789")
- Guaranteed to be unique across all rooms
- Generated before saving to ensure uniqueness

## Player Count Management

The API includes a utility function for managing player counts:

```javascript
// Update player count (for socket connections)
await updatePlayerCount(roomId, true);  // Increment
await updatePlayerCount(roomId, false); // Decrement
```

This function:
- Validates room exists and is active
- Checks against max player limit
- Updates the `currentPlayers` field
- Returns `true` on success, `false` on failure

## Usage Examples

### Frontend Integration

```javascript
// Create a room
const createRoom = async (roomData) => {
  const response = await fetch('/api/rooms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/vnd.api+json',
    },
    credentials: 'include', // Include cookies
    body: JSON.stringify({
      data: {
        type: 'room',
        attributes: roomData
      }
    })
  });
  return response.json();
};

// List rooms with search
const listRooms = async (page = 1, search = '') => {
  const params = new URLSearchParams({ page, limit: 20 });
  if (search) params.append('search', search);
  
  const response = await fetch(`/api/rooms?${params}`);
  return response.json();
};

// Join room via URL
const joinRoom = (roomId) => {
  window.location.href = `/room/${roomId}`;
};
```

### Room URL Format

Rooms can be accessed via URL using the room ID:
```
http://localhost:3000/room/ABC123
```

## Rate Limiting

Currently, no rate limiting is implemented. Consider implementing rate limiting for production use.

## Security Considerations

1. **Authentication**: All modification operations require valid JWT tokens
2. **Authorization**: Only room creators can modify their rooms
3. **Input Validation**: All inputs are validated and sanitized
4. **SQL Injection**: Protected through Mongoose ODM
5. **XSS**: JSON:API format helps prevent XSS attacks

## Future Enhancements

- Room templates and presets
- Room categories and tags
- Advanced search filters
- Room activity logs
- Room sharing and invitations
- Room backup and restore
- Room analytics and statistics
