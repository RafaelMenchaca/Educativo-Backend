import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { getConjuntos, getConjunto } from '../controllers/biblioteca.controller.js';

const router = Router();

router.get('/conjuntos', requireAuth, getConjuntos);
router.get('/conjuntos/:batchId', requireAuth, getConjunto);

export default router;
