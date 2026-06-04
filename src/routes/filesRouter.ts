import { Router } from 'express';
import {
  createFolder,
  deleteFile,
  fileUpload,
  getHandoutShares,
  listFiles,
  listFolders,
  moveFile,
  uploadFile,
} from '../controllers/files.controller';
import { authenticate } from '../middleware/auth.middleware';

const filesRouter = Router();

filesRouter.get('/:roomId/folders', listFolders);
filesRouter.get('/:roomId/handout-shares', getHandoutShares);
filesRouter.get('/:roomId', listFiles);
filesRouter.post('/:roomId/upload', authenticate, fileUpload.single('file'), uploadFile);
filesRouter.post('/:roomId/folder', authenticate, createFolder);
filesRouter.post('/:roomId/move', authenticate, moveFile);
filesRouter.delete('/:roomId', authenticate, deleteFile);

export default filesRouter;
