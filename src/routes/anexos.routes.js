import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  postGenerarAnexo,
  postRegenerarAnexo,
  getAnexosPorBatch,
  getAnexoPorPlaneacion,
  getAnexoById,
  deleteAnexoController
} from '../controllers/anexos.controller.js';

const router = Router();

router.post('/generate', requireAuth, postGenerarAnexo);
router.post('/:id/regenerate', requireAuth, postRegenerarAnexo);
router.get('/batch/:batchId', requireAuth, getAnexosPorBatch);
router.get('/planeacion/:planeacionId', requireAuth, getAnexoPorPlaneacion);
router.get('/:id', requireAuth, getAnexoById);
router.delete('/:id', requireAuth, deleteAnexoController);

export default router;
