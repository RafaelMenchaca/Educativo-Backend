import { Router } from 'express';
import planeacionesRoutes from './planeaciones.routes.js';
import examenesRoutes from './examenes.routes.js';
import jerarquiaRoutes from './jerarquia.routes.js';

const router = Router();

router.use('/planeaciones', planeacionesRoutes);
router.use('/examenes', examenesRoutes);
router.use('/', jerarquiaRoutes);

export default router;
