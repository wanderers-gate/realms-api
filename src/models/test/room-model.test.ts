import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import mongoose from 'mongoose';
import { RoomModel } from '../room-model';

describe('Room Model', () => {
  let mongoServer: MongoMemoryServer;
  let testUserId: Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await RoomModel.deleteMany({});
    testUserId = new Types.ObjectId();
  });

  afterEach(async () => {
    await RoomModel.deleteMany({});
  });

  describe('Schema Validation', () => {
    it('should create a room with valid data', async () => {
      const room = new RoomModel({
        name: 'Test Room',
        createdBy: testUserId,
        settings: { isPrivate: false, allowGuests: true },
      });
      await room.save();

      expect(room.name).toBe('Test Room');
      expect(room.isActive).toBe(true);
      expect(room.currentPlayers).toBe(0);
      expect(room.settings.allowGuests).toBe(true);
    });

    it('should fail without a name', async () => {
      const room = new RoomModel({ createdBy: testUserId });
      await expect(room.save()).rejects.toThrow();
    });

    it('should fail without createdBy', async () => {
      const room = new RoomModel({ name: 'Test Room' });
      await expect(room.save()).rejects.toThrow();
    });

    it('should default isActive to true and currentPlayers to 0', async () => {
      const room = new RoomModel({ name: 'Test Room', createdBy: testUserId });
      await room.save();

      expect(room.isActive).toBe(true);
      expect(room.currentPlayers).toBe(0);
    });

    it('should enforce unique roomId constraint at the database level', async () => {
      const room = new RoomModel({ name: 'Room 1', createdBy: testUserId });
      await room.save();

      // Bypass the pre-save hook (which auto-generates unique IDs) to prove
      // the DB index is the final safeguard
      await expect(
        RoomModel.collection.insertOne({
          name: 'Room 2',
          roomId: room.roomId,
          createdBy: testUserId,
          isActive: true,
          currentPlayers: 0,
          settings: { isPrivate: false, allowGuests: true, gridSize: 50 },
          userPermissions: [],
          lastActivity: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      ).rejects.toThrow();
    });
  });

  describe('roomId generation', () => {
    it('should auto-generate a 6-character uppercase roomId on create', async () => {
      const room = new RoomModel({ name: 'Test Room', createdBy: testUserId });
      await room.save();

      expect(room.roomId).toMatch(/^[A-Z0-9]{6}$/);
    });

    it('should generate unique roomIds for different rooms', async () => {
      const room1 = new RoomModel({ name: 'Room 1', createdBy: testUserId });
      const room2 = new RoomModel({ name: 'Room 2', createdBy: testUserId });
      await room1.save();
      await room2.save();

      expect(room1.roomId).not.toBe(room2.roomId);
    });

    it('should not regenerate roomId on subsequent saves', async () => {
      const room = new RoomModel({ name: 'Test Room', createdBy: testUserId });
      await room.save();
      const originalRoomId = room.roomId;

      room.name = 'Updated Name';
      await room.save();

      expect(room.roomId).toBe(originalRoomId);
    });
  });

  describe('lastActivity tracking', () => {
    it('should set lastActivity on create', async () => {
      const before = new Date();
      const room = new RoomModel({ name: 'Test Room', createdBy: testUserId });
      await room.save();
      const after = new Date();

      expect(room.lastActivity.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(room.lastActivity.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should update lastActivity on each save', async () => {
      const room = new RoomModel({ name: 'Test Room', createdBy: testUserId });
      await room.save();
      const firstActivity = room.lastActivity.getTime();

      await new Promise((r) => setTimeout(r, 10));
      room.name = 'Updated Name';
      await room.save();

      expect(room.lastActivity.getTime()).toBeGreaterThan(firstActivity);
    });
  });
});
