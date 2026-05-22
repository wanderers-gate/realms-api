import { Router } from 'express';
import {
  addCanvasOperation,
  deleteCanvasOperations,
  getCanvas,
} from '../controllers/canvas.controller';
import { authenticateOptionalJwt } from '../middleware/optional-auth.middleware';

const canvasRouter = Router();

canvasRouter.use(authenticateOptionalJwt());

canvasRouter.get('/:roomId', getCanvas);
canvasRouter.post('/:roomId/operations', addCanvasOperation);
canvasRouter.delete('/:roomId/operations', deleteCanvasOperations);

export default canvasRouter;
