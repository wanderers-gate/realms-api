import { Router } from 'express';
import {
  addCanvasOperation,
  deleteCanvasOperations,
  getCanvas,
  mapUpload,
  removeMap,
  uploadMap,
} from '../controllers/canvas.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authenticateOptionalJwt } from '../middleware/optional-auth.middleware';

const canvasRouter = Router();

canvasRouter.use(authenticateOptionalJwt);

canvasRouter.get('/:roomId', getCanvas);
canvasRouter.post('/:roomId/operations', addCanvasOperation);
canvasRouter.delete('/:roomId/operations', deleteCanvasOperations);
canvasRouter.post('/:roomId/map', authenticate, mapUpload.single('map'), uploadMap);
canvasRouter.delete('/:roomId/map', authenticate, removeMap);

export default canvasRouter;
