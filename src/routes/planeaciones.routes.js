import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  getPlaneaciones,
  getPlaneacionById,
  updatePlaneacion,
  deletePlaneacion
} from '../controllers/planeaciones.controller.js';

const router = Router();

router.get('/', requireAuth, getPlaneaciones);
router.get('/:id', requireAuth, getPlaneacionById);
router.put('/:id', requireAuth, updatePlaneacion);
router.delete('/:id', requireAuth, deletePlaneacion);

export default router;
