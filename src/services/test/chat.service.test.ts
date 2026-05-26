import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

jest.mock('../../db', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { drizzle } = require('drizzle-orm/better-sqlite3');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { migrate } = require('drizzle-orm/better-sqlite3/migrator');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const schema = require('../../db/schema');
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(__dirname, '../../../drizzle') });
  return { db };
});

import { db } from '../../db';
import { chatMessages, rooms, users } from '../../db/schema';
import { chatService } from '../chat.service';

let testRoomId: string;

// Insert messages with explicit staggered timestamps so ordering is deterministic
// (timestamp mode stores seconds — messages within the same second are unordered)
const insertMessage = (message: string, secondsOffset: number) =>
  db.insert(chatMessages).values({
    roomId: testRoomId,
    userId: 'user1',
    username: 'User1',
    message,
    timestamp: new Date(Date.now() + secondsOffset * 1000),
  }).returning().then(([m]) => m);

beforeEach(async () => {
  const [user] = await db.insert(users).values({
    email: 'test@example.com',
    password: 'hashed',
    firstName: 'Test',
    lastName: 'User',
  }).returning();

  const [room] = await db.insert(rooms).values({
    name: 'Test Room',
    slug: 'test-room',
    roomCode: 'TST001',
    createdById: user.id,
  }).returning();

  testRoomId = room.id;
});

afterEach(async () => {
  await db.delete(chatMessages);
  await db.delete(rooms);
  await db.delete(users);
});

describe('Chat Service', () => {
  describe('saveMessage', () => {
    it('should save a message and return it', async () => {
      const msg = await chatService.saveMessage(testRoomId, 'user-123', 'TestUser', 'Hello!');

      expect(msg.roomId).toBe(testRoomId);
      expect(msg.userId).toBe('user-123');
      expect(msg.username).toBe('TestUser');
      expect(msg.message).toBe('Hello!');
      expect(msg.timestamp).toBeInstanceOf(Date);
      expect(msg.id).toBeDefined();
    });

    it('should save a message with a dice roll', async () => {
      const diceRoll = { notation: '1d6', groups: [], modifier: 0, total: 4 };
      const msg = await chatService.saveMessage(testRoomId, 'user-123', 'TestUser', '/roll 1d6', diceRoll);

      expect(msg.diceRoll).toEqual(diceRoll);
    });
  });

  describe('getRecentMessages', () => {
    beforeEach(async () => {
      for (let i = 1; i <= 5; i++) {
        await insertMessage(`Message ${i}`, i);
      }
    });

    it('should return messages in chronological order', async () => {
      const messages = await chatService.getRecentMessages(testRoomId, 10);

      expect(messages).toHaveLength(5);
      expect(messages[0].message).toBe('Message 1');
      expect(messages[4].message).toBe('Message 5');
    });

    it('should respect the limit and return the most recent', async () => {
      const messages = await chatService.getRecentMessages(testRoomId, 3);

      expect(messages).toHaveLength(3);
      expect(messages[0].message).toBe('Message 3');
      expect(messages[2].message).toBe('Message 5');
    });

    it('should return empty array for unknown room', async () => {
      const messages = await chatService.getRecentMessages('nonexistent-room-id');
      expect(messages).toHaveLength(0);
    });
  });

  describe('getMessagesBefore', () => {
    it('should return messages before the given message id', async () => {
      const msgs = [];
      for (let i = 1; i <= 5; i++) {
        msgs.push(await insertMessage(`Message ${i}`, i));
      }

      // beforeId = msgs[2] (Message 3) → should return Messages 1 and 2
      const older = await chatService.getMessagesBefore(testRoomId, msgs[2].id, 10);

      expect(older).toHaveLength(2);
      expect(older[0].message).toBe('Message 1');
      expect(older[1].message).toBe('Message 2');
    });

    it('should return empty array for unknown beforeId', async () => {
      const result = await chatService.getMessagesBefore(testRoomId, 'nonexistent-id', 10);
      expect(result).toHaveLength(0);
    });
  });
});
