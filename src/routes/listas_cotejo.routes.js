import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  postGenerateListasCotejo,
  getListasCotejoPorUnidad,
  getListaCotejoById,
  getListaCotejoPorPlaneacion
} from '../controllers/listas_cotejo.controller.js';

const router = Router();

router.post('/generate', requireAuth, postGenerateListasCotejo);
router.get('/unidad/:unidadId', requireAuth, getListasCotejoPorUnidad);
router.get('/planeacion/:planeacionId', requireAuth, getListaCotejoPorPlaneacion);
router.get('/:id', requireAuth, getListaCotejoById);

export default router;
