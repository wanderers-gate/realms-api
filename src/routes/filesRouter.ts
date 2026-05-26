import { Router } from 'express';
import {
  deleteFile,
  fileUpload,
  listFiles,
  listFolders,
  uploadFile,
} from '../controllers/files.controller';
import { authenticate } from '../middleware/auth.middleware';

const filesRouter = Router();

filesRouter.get('/:roomId/folders', listFolders);
filesRouter.get('/:roomId', listFiles);
filesRouter.post('/:roomId/upload', authenticate, fileUpload.single('file'), uploadFile);
filesRouter.delete('/:roomId', authenticate, deleteFile);

export default filesRouter;
