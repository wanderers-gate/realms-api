import { Router } from 'express';
import { create, destroy, index, show, update } from '../controllers/user.controller';

const router = Router();

router.get('/', index);
router.get('/:id', show);
router.post('/', create);
router.put('/:id', update);
router.delete('/:id', destroy);

export default router;
