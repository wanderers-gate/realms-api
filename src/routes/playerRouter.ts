import { Router } from 'express';
import {
  changeOwnPassword,
  createPlayer,
  getPlayers,
  getRoomPlayers,
  joinRoom,
  kickPlayer,
  renamePlayer,
  resetPlayerPassword,
  updateOwnProfile,
  verifyPlayerPassword,
} from '../controllers/player.controller';
import { authenticate } from '../middleware/auth.middleware';

const playerRouter = Router();

playerRouter.get('/', getPlayers);
playerRouter.post('/', createPlayer);
playerRouter.post('/verify', verifyPlayerPassword);
playerRouter.get('/room/:roomId', getRoomPlayers);
playerRouter.post('/room/:roomId/:playerId/join', joinRoom);
// /me routes before /:playerId so "me" isn't matched as an ID
playerRouter.patch('/me/profile', authenticate, updateOwnProfile);
playerRouter.patch('/me/password', authenticate, changeOwnPassword);
playerRouter.patch('/:playerId/password', authenticate, resetPlayerPassword);
playerRouter.patch('/:playerId/rename', authenticate, renamePlayer);
playerRouter.delete('/:playerId', authenticate, kickPlayer);

export default playerRouter;
