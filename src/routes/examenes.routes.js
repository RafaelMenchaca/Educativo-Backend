import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  postGenerateExamen,
  getExamenesByUnidad,
  getExamenById
} from '../controllers/examenes.controller.js';

const router = Router();

router.post('/generate', requireAuth, postGenerateExamen);
router.get('/unidad/:unidadId', requireAuth, getExamenesByUnidad);
router.get('/:id', requireAuth, getExamenById);

export default router;
