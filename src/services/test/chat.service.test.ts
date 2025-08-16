import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { ChatMessageModel } from '../../models/chat-message-model';
import { chatService } from '../chat.service';

describe('Chat Service', () => {
  let mongoServer: MongoMemoryServer;

  beforeEach(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterEach(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe('saveMessage', () => {
    it('should save a message to the database', async () => {
      const roomId = 'TEST123';
      const userId = 'user123';
      const username = 'TestUser';
      const message = 'Hello, world!';

      const savedMessage = await chatService.saveMessage(roomId, userId, username, message);

      expect(savedMessage.roomId).toBe(roomId);
      expect(savedMessage.userId).toBe(userId);
      expect(savedMessage.username).toBe(username);
      expect(savedMessage.message).toBe(message);
      expect(savedMessage.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('getRecentMessages', () => {
    it('should return recent messages for a room', async () => {
      const roomId = 'TEST123';

      // Create some test messages
      const messages = [
        { roomId, userId: 'user1', username: 'User1', message: 'Message 1' },
        { roomId, userId: 'user2', username: 'User2', message: 'Message 2' },
        { roomId, userId: 'user1', username: 'User1', message: 'Message 3' },
      ];

      for (const msg of messages) {
        await chatService.saveMessage(msg.roomId, msg.userId, msg.username, msg.message);
      }

      const recentMessages = await chatService.getRecentMessages(roomId, 10);

      expect(recentMessages).toHaveLength(3);
      expect(recentMessages[0].message).toBe('Message 1');
      expect(recentMessages[1].message).toBe('Message 2');
      expect(recentMessages[2].message).toBe('Message 3');
    });

    it('should limit the number of messages returned', async () => {
      const roomId = 'TEST123';

      // Create 5 test messages
      for (let i = 1; i <= 5; i++) {
        await chatService.saveMessage(roomId, `user${i}`, `User${i}`, `Message ${i}`);
      }

      const recentMessages = await chatService.getRecentMessages(roomId, 3);

      expect(recentMessages).toHaveLength(3);
      expect(recentMessages[0].message).toBe('Message 1');
      expect(recentMessages[1].message).toBe('Message 2');
      expect(recentMessages[2].message).toBe('Message 3');
    });
  });

  describe('cleanupOldMessages', () => {
    it('should remove old messages when limit is exceeded', async () => {
      const roomId = 'TEST123';

      // Create 15 test messages
      for (let i = 1; i <= 15; i++) {
        await chatService.saveMessage(roomId, `user${i}`, `User${i}`, `Message ${i}`);
      }

      // Clean up old messages, keep only 10
      await chatService.cleanupOldMessages(roomId, 10);

      const remainingMessages = await chatService.getRecentMessages(roomId, 20);
      expect(remainingMessages.length).toBeLessThanOrEqual(10);
    });
  });
});
