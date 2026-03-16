import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  getPlaneaciones,
  getPlaneacionesArchivadas,
  getPlaneacionById,
  updatePlaneacion,
  deletePlaneacion,
  archivePlaneacion,
  restorePlaneacion,
  archiveBatch,
  restoreBatch,
  deletePlaneacionPermanent,
  deleteBatchPermanent,
  generarPlaneaciones,
  getBatches,
  getPlaneacionesByBatch
} from '../controllers/planeaciones.controller.js';

const router = Router();

router.get('/', requireAuth, getPlaneaciones);
router.get('/archived', requireAuth, getPlaneacionesArchivadas);
router.get('/batches', requireAuth, getBatches);
router.patch('/batch/:batchId/archive', requireAuth, archiveBatch);
router.patch('/batch/:batchId/restore', requireAuth, restoreBatch);
router.delete('/batch/:batchId/permanent', requireAuth, deleteBatchPermanent);
router.get('/batch/:batch_id', requireAuth, getPlaneacionesByBatch);

router.post('/generate', requireAuth, generarPlaneaciones);

router.patch('/:id/archive', requireAuth, archivePlaneacion);
router.patch('/:id/restore', requireAuth, restorePlaneacion);
router.delete('/:id/permanent', requireAuth, deletePlaneacionPermanent);
router.get('/:id', requireAuth, getPlaneacionById);
router.put('/:id', requireAuth, updatePlaneacion);
router.delete('/:id', requireAuth, deletePlaneacion);

export default router;
