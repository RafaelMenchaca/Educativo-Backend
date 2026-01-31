import { Router } from 'express';
import planeacionesRoutes from './planeaciones.routes.js';

const router = Router();

router.use('/planeaciones', planeacionesRoutes);

export default router;
