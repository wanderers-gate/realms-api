import { Router } from 'express';
import { authenticateOptionalJwt } from '../middleware/authenticate';
import { jsonApiMiddleware } from '../middleware/json-api';
import { getCanvas, addCanvasOperation, deleteCanvasOperations } from '../controllers/canvas.controller';

const router = Router();

// Apply middleware
router.use(jsonApiMiddleware);
router.use(authenticateOptionalJwt()); // Allow guests to view canvas if room allows

// Canvas routes
router.get('/:roomId', getCanvas); // GET /api/canvas/:roomId
router.post('/:roomId/operations', addCanvasOperation); // POST /api/canvas/:roomId/operations
router.delete('/:roomId/operations', deleteCanvasOperations); // DELETE /api/canvas/:roomId/operations

export default router;
