import { Router } from 'express';
import {
  createSheet,
  deleteSheet,
  getRoomSheets,
  getSheet,
  updateSheet,
} from '../controllers/characterSheet.controller';
import { authenticate } from '../middleware/auth.middleware';

const characterSheetRouter = Router();

characterSheetRouter.use(authenticate);

characterSheetRouter.post('/', createSheet);
characterSheetRouter.get('/room/:roomId', getRoomSheets);
characterSheetRouter.get('/:id', getSheet);
characterSheetRouter.patch('/:id', updateSheet);
characterSheetRouter.delete('/:id', deleteSheet);

export default characterSheetRouter;
