import { Router } from 'express';
import {
  createPlayer,
  getPlayers,
  getRoomPlayers,
  joinRoom,
  verifyPlayerPassword,
} from '../controllers/player.controller';

const playerRouter = Router();

playerRouter.get('/', getPlayers);
playerRouter.post('/', createPlayer);
playerRouter.post('/verify', verifyPlayerPassword);
playerRouter.get('/room/:roomId', getRoomPlayers);
playerRouter.post('/room/:roomId/:playerId/join', joinRoom);

export default playerRouter;
