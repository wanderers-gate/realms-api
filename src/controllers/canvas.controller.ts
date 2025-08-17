import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CanvasModel } from '../models/canvas-model';
import { RoomModel } from '../models/room-model';
import { UserModel } from '../models/user-model';
import {
  deserializeCanvas,
  serializeCanvas,
  serializeCanvasOperations,
} from '../serializers/canvas.serializer';
import type { CanvasOperation, DrawingEvent } from '../types/canvas';
import logger from '../utils/logger';

// Get canvas state for a room
export const getCanvas = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;

    // Verify room exists and user has access
    const room = await RoomModel.findOne({ roomId, isActive: true });
    if (!room) {
      res.status(404).json({
        errors: [
          {
            status: '404',
            title: 'Room Not Found',
            detail: 'Room not found or inactive',
          },
        ],
      });
      return;
    }

    // Check if user can access this room
    if (!req.userId && !room.settings?.allowGuests) {
      res.status(403).json({
        errors: [
          {
            status: '403',
            title: 'Forbidden',
            detail: 'This room does not allow guests',
          },
        ],
      });
      return;
    }

    // Get or create canvas for this room
    let canvas = await CanvasModel.findOne({ roomId });

    if (!canvas) {
      // Create empty canvas if it doesn't exist
      canvas = new CanvasModel({
        roomId,
        operations: [],
        createdBy: room.createdBy,
      });
      await canvas.save();
    }

    const response = serializeCanvas(canvas);
    res.json(response);
  } catch (error) {
    logger.error('Error fetching canvas:', error);
    res.status(500).json({
      errors: [
        {
          status: '500',
          title: 'Internal Server Error',
          detail: 'Failed to fetch canvas',
        },
      ],
    });
  }
};

// Add a drawing operation to the canvas
export const addCanvasOperation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({
        errors: [
          {
            status: '401',
            title: 'Unauthorized',
            detail: 'User must be authenticated to draw',
          },
        ],
      });
      return;
    }

    // Verify room exists and user has access
    const room = await RoomModel.findOne({ roomId, isActive: true });
    if (!room) {
      res.status(404).json({
        errors: [
          {
            status: '404',
            title: 'Room Not Found',
            detail: 'Room not found or inactive',
          },
        ],
      });
      return;
    }

    // Deserialize the drawing operation
    const operationData = deserializeCanvas(req.body.data || req.body);

    if (
      !operationData.operations ||
      !Array.isArray(operationData.operations) ||
      operationData.operations.length === 0
    ) {
      res.status(400).json({
        errors: [
          {
            status: '400',
            title: 'Bad Request',
            detail: 'Invalid operation data',
          },
        ],
      });
      return;
    }

    // Get or create canvas
    let canvas = await CanvasModel.findOne({ roomId });
    if (!canvas) {
      canvas = new CanvasModel({
        roomId,
        operations: [],
        createdBy: room.createdBy,
      });
    }

    // Add the new operation with metadata
    const newOperation: CanvasOperation = {
      ...operationData.operations[0],
      id: uuidv4(),
      timestamp: new Date(),
      userId,
    };

    canvas.operations.push(newOperation);
    await canvas.save();

    const response = serializeCanvasOperations([newOperation]);
    res.status(201).json(response);
  } catch (error) {
    logger.error('Error adding canvas operation:', error);
    res.status(500).json({
      errors: [
        {
          status: '500',
          title: 'Internal Server Error',
          detail: 'Failed to add drawing operation',
        },
      ],
    });
  }
};

// Delete canvas operations by IDs
export const deleteCanvasOperations = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({
        errors: [
          {
            status: '401',
            title: 'Unauthorized',
            detail: 'User must be authenticated to delete operations',
          },
        ],
      });
      return;
    }

    // Verify room exists and user has access
    const room = await RoomModel.findOne({ roomId, isActive: true });
    if (!room) {
      res.status(404).json({
        errors: [
          {
            status: '404',
            title: 'Room Not Found',
            detail: 'Room not found or inactive',
          },
        ],
      });
      return;
    }

    // Get operation IDs from request body
    const { operationIds } = req.body;

    if (!operationIds || !Array.isArray(operationIds) || operationIds.length === 0) {
      res.status(400).json({
        errors: [
          {
            status: '400',
            title: 'Bad Request',
            detail: 'Operation IDs array is required',
          },
        ],
      });
      return;
    }

    // Find and update canvas
    const canvas = await CanvasModel.findOne({ roomId });
    if (!canvas) {
      res.status(404).json({
        errors: [
          {
            status: '404',
            title: 'Canvas Not Found',
            detail: 'Canvas not found for this room',
          },
        ],
      });
      return;
    }

    // Filter out operations with the specified IDs
    const initialCount = canvas.operations.length;
    canvas.operations = canvas.operations.filter((op) => !operationIds.includes(op.id));
    const deletedCount = initialCount - canvas.operations.length;

    // Save the updated canvas
    await canvas.save();

    logger.info(
      `[CANVAS] Deleted ${deletedCount} operations from room ${roomId} by user ${userId}`
    );

    res.status(200).json({
      data: {
        deletedCount,
        remainingOperations: canvas.operations.length,
      },
    });
  } catch (error) {
    logger.error('Error deleting canvas operations:', error);
    res.status(500).json({
      errors: [
        {
          status: '500',
          title: 'Internal Server Error',
          detail: 'Failed to delete canvas operations',
        },
      ],
    });
  }
};
