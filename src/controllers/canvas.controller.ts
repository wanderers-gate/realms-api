import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CanvasModel } from '../models/canvas-model';
import { RoomModel } from '../models/room-model';
import { UserModel } from '../models/user-model';
import {
  serializeCanvas,
  serializeCanvasOperations,
  deserializeCanvas,
} from '../serializers/canvas.serializer';
import type { CanvasOperation, DrawingEvent } from '../types/canvas';
import { logger } from '../utils/logger';

// Get canvas state for a room
export const getCanvas = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;

    // Verify room exists and user has access
    const room = await RoomModel.findOne({ roomId, isActive: true });
    if (!room) {
      return res.status(404).json({
        errors: [
          {
            status: '404',
            title: 'Room Not Found',
            detail: 'Room not found or inactive',
          },
        ],
      });
    }

    // Check if user can access this room
    if (!req.userId && !room.settings?.allowGuests) {
      return res.status(403).json({
        errors: [
          {
            status: '403',
            title: 'Forbidden',
            detail: 'This room does not allow guests',
          },
        ],
      });
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
      return res.status(401).json({
        errors: [
          {
            status: '401',
            title: 'Unauthorized',
            detail: 'User must be authenticated to draw',
          },
        ],
      });
    }

    // Verify room exists and user has access
    const room = await RoomModel.findOne({ roomId, isActive: true });
    if (!room) {
      return res.status(404).json({
        errors: [
          {
            status: '404',
            title: 'Room Not Found',
            detail: 'Room not found or inactive',
          },
        ],
      });
    }

    // Deserialize the drawing operation
    const operationData = deserializeCanvas(req.body.data || req.body);

    if (
      !operationData.operations ||
      !Array.isArray(operationData.operations) ||
      operationData.operations.length === 0
    ) {
      return res.status(400).json({
        errors: [
          {
            status: '400',
            title: 'Bad Request',
            detail: 'Invalid operation data',
          },
        ],
      });
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

// Clear the canvas (remove all operations)
export const clearCanvas = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        errors: [
          {
            status: '401',
            title: 'Unauthorized',
            detail: 'User must be authenticated to clear canvas',
          },
        ],
      });
    }

    // Verify room exists and user is the creator
    const room = await RoomModel.findOne({ roomId, isActive: true });
    if (!room) {
      return res.status(404).json({
        errors: [
          {
            status: '404',
            title: 'Room Not Found',
            detail: 'Room not found or inactive',
          },
        ],
      });
    }

    // Only room creator can clear the canvas
    if (room.createdBy.toString() !== userId) {
      return res.status(403).json({
        errors: [
          {
            status: '403',
            title: 'Forbidden',
            detail: 'Only the room creator can clear the canvas',
          },
        ],
      });
    }

    // Clear the canvas
    const canvas = await CanvasModel.findOne({ roomId });
    if (canvas) {
      canvas.operations = [];
      await canvas.save();
    }

    res.status(204).json({});
  } catch (error) {
    logger.error('Error clearing canvas:', error);
    res.status(500).json({
      errors: [
        {
          status: '500',
          title: 'Internal Server Error',
          detail: 'Failed to clear canvas',
        },
      ],
    });
  }
};
