import { Router } from 'express';
import {
  createRoom,
  deleteRoom,
  getRoom,
  getRooms,
  updateRoom,
} from '../controllers/room.controller';
import { authenticate } from '../middleware/auth.middleware';

const roomRouter = Router();

// Public routes (no authentication required)
roomRouter.get('/', getRooms); // Get all public rooms
roomRouter.get('/:roomId', getRoom); // Get specific room

// Protected routes (require authentication)
roomRouter.post('/', authenticate, createRoom); // Create new room
roomRouter.put('/:roomId', authenticate, updateRoom); // Update room
roomRouter.delete('/:roomId', authenticate, deleteRoom); // Delete room

export default roomRouter;
