import { Router } from 'express';
import planeacionesRoutes from './planeaciones.routes.js';
import jerarquiaRoutes from './jerarquia.routes.js';

const router = Router();

router.use('/planeaciones', planeacionesRoutes);
router.use('/', jerarquiaRoutes);

export default router;
