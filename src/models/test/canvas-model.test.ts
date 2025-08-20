import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import mongoose from 'mongoose';
import type { CanvasOperation } from '../../types/canvas';
import { CanvasModel, MAX_CANVAS_OPERATIONS } from '../canvas-model';

describe('Canvas Model', () => {
  let mongoServer: MongoMemoryServer;
  let testUserId: Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await CanvasModel.deleteMany({});
    testUserId = new Types.ObjectId();
  });

  afterEach(async () => {
    await CanvasModel.deleteMany({});
  });

  describe('Schema Validation', () => {
    it('should create a canvas with valid data', async () => {
      const canvasData = {
        roomId: 'TEST123',
        operations: [],
        createdBy: testUserId,
      };

      const canvas = new CanvasModel(canvasData);
      await canvas.save();

      expect(canvas.roomId).toBe('TEST123');
      expect(canvas.operations).toEqual([]);
      expect(canvas.createdBy).toEqual(testUserId);
      expect(canvas.version).toBe(1);
      expect(canvas.lastModified).toBeDefined();
    });

    it('should fail to create canvas without required fields', async () => {
      const canvas = new CanvasModel({});

      await expect(canvas.save()).rejects.toThrow();
    });

    it('should enforce unique roomId constraint', async () => {
      const canvasData = {
        roomId: 'TEST123',
        operations: [],
        createdBy: testUserId,
      };

      const canvas1 = new CanvasModel(canvasData);
      await canvas1.save();

      const canvas2 = new CanvasModel(canvasData);
      await expect(canvas2.save()).rejects.toThrow();
    });
  });

  describe('Operations Management', () => {
    it('should store drawing operations correctly', async () => {
      const operation: CanvasOperation = {
        id: 'op1',
        type: 'draw',
        tool: 'pen',
        points: [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
        ],
        color: '#000000',
        size: 2,
        timestamp: new Date(),
        userId: 'user123',
      };

      const canvas = new CanvasModel({
        roomId: 'TEST123',
        operations: [operation],
        createdBy: testUserId,
      });

      await canvas.save();

      expect(canvas.operations).toHaveLength(1);
      expect(canvas.operations[0].id).toBe('op1');
      expect(canvas.operations[0].type).toBe('draw');
      expect(canvas.operations[0].points[0].x).toBe(10);
      expect(canvas.operations[0].points[0].y).toBe(20);
      expect(canvas.operations[0].points[1].x).toBe(30);
      expect(canvas.operations[0].points[1].y).toBe(40);
    });

    it('should validate operation types', async () => {
      const invalidOperation = {
        id: 'op1',
        type: 'invalid',
        tool: 'pen',
        points: [],
        color: '#000000',
        size: 2,
        timestamp: new Date(),
        userId: 'user123',
      };

      const canvas = new CanvasModel({
        roomId: 'TEST123',
        operations: [invalidOperation],
        createdBy: testUserId,
      });

      await expect(canvas.save()).rejects.toThrow();
    });

    it('should validate tool types', async () => {
      const invalidOperation = {
        id: 'op1',
        type: 'draw',
        tool: 'invalid',
        points: [],
        color: '#000000',
        size: 2,
        timestamp: new Date(),
        userId: 'user123',
      };

      const canvas = new CanvasModel({
        roomId: 'TEST123',
        operations: [invalidOperation],
        createdBy: testUserId,
      });

      await expect(canvas.save()).rejects.toThrow();
    });

    it('should validate operation size limits', async () => {
      const invalidOperation = {
        id: 'op1',
        type: 'draw',
        tool: 'pen',
        points: [],
        color: '#000000',
        size: 150, // Over the max limit of 100
        timestamp: new Date(),
        userId: 'user123',
      };

      const canvas = new CanvasModel({
        roomId: 'TEST123',
        operations: [invalidOperation],
        createdBy: testUserId,
      });

      await expect(canvas.save()).rejects.toThrow();
    });
  });

  describe('Operation Limits', () => {
    it('should enforce maximum operations limit', async () => {
      const operations: CanvasOperation[] = [];

      // Create more operations than the limit
      for (let i = 0; i < MAX_CANVAS_OPERATIONS + 50; i++) {
        operations.push({
          id: `op${i}`,
          type: 'draw',
          tool: 'pen',
          points: [{ x: i, y: i }],
          color: '#000000',
          size: 2,
          timestamp: new Date(),
          userId: 'user123',
        });
      }

      const canvas = new CanvasModel({
        roomId: 'TEST123',
        operations,
        createdBy: testUserId,
      });

      await canvas.save();

      // Should keep only the maximum allowed operations
      expect(canvas.operations).toHaveLength(MAX_CANVAS_OPERATIONS);

      // Should keep the latest operations (remove from beginning)
      expect(canvas.operations[0].id).toBe('op50'); // First 50 should be removed
      expect(canvas.operations[canvas.operations.length - 1].id).toBe(
        `op${MAX_CANVAS_OPERATIONS + 49}`
      );
    });

    it('should increment version on save', async () => {
      const canvas = new CanvasModel({
        roomId: 'TEST123',
        operations: [],
        createdBy: testUserId,
      });

      await canvas.save();
      const initialVersion = canvas.version;

      canvas.operations.push({
        id: 'op1',
        type: 'draw',
        tool: 'pen',
        points: [],
        color: '#000000',
        size: 2,
        timestamp: new Date(),
        userId: 'user123',
      });

      await canvas.save();
      expect(canvas.version).toBe(initialVersion + 1);
    });

    it('should update lastModified on save', async () => {
      const canvas = new CanvasModel({
        roomId: 'TEST123',
        operations: [],
        createdBy: testUserId,
      });

      await canvas.save();
      const initialModified = canvas.lastModified;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      canvas.operations.push({
        id: 'op1',
        type: 'draw',
        tool: 'pen',
        points: [],
        color: '#000000',
        size: 2,
        timestamp: new Date(),
        userId: 'user123',
      });

      await canvas.save();
      expect(canvas.lastModified.getTime()).toBeGreaterThan(initialModified.getTime());
    });
  });
});
