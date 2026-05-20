import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  postGenerateExamen,
  getExamenGenerationJob,
  getExamenesByUnidad,
  getExamenById,
  deleteExamen
} from '../controllers/examenes.controller.js';

const router = Router();

router.post('/generate', requireAuth, postGenerateExamen);
router.post('/generar', requireAuth, postGenerateExamen);
router.get('/generacion/:jobId', requireAuth, getExamenGenerationJob);
router.get('/unidad/:unidadId', requireAuth, getExamenesByUnidad);
router.get('/:id', requireAuth, getExamenById);
router.delete('/:id', requireAuth, deleteExamen);

export default router;
