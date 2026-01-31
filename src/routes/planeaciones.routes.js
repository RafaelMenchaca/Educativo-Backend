import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  getPlaneaciones,
  getPlaneacionById,
  updatePlaneacion,
  deletePlaneacion,
  generarPlaneaciones,
  getBatches,
  getPlaneacionesByBatch
} from '../controllers/planeaciones.controller.js';

const router = Router();

router.get('/', requireAuth, getPlaneaciones);
router.get('/batches', requireAuth, getBatches);
router.get('/batch/:batch_id', requireAuth, getPlaneacionesByBatch);

router.post('/generate', requireAuth, generarPlaneaciones);

router.get('/:id', requireAuth, getPlaneacionById);
router.put('/:id', requireAuth, updatePlaneacion);
router.delete('/:id', requireAuth, deletePlaneacion);

export default router;
