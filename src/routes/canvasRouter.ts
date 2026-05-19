import { Router } from 'express';
import {
  addCanvasOperation,
  deleteCanvasOperations,
  getCanvas,
} from '../controllers/canvas.controller';
import { authenticateOptionalJwt } from '../middleware/authenticate';

const router = Router();

router.use(authenticateOptionalJwt());

// Canvas routes
router.get('/:roomId', getCanvas); // GET /api/canvas/:roomId
router.post('/:roomId/operations', addCanvasOperation); // POST /api/canvas/:roomId/operations
router.delete('/:roomId/operations', deleteCanvasOperations); // DELETE /api/canvas/:roomId/operations

export default router;
