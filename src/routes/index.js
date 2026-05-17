import { Router } from 'express';
import planeacionesRoutes from './planeaciones.routes.js';
import examenesRoutes from './examenes.routes.js';
import jerarquiaRoutes from './jerarquia.routes.js';
import listasCotejoRoutes from './listas_cotejo.routes.js';
import bibliotecaRoutes from './biblioteca.routes.js';
import anexosRoutes from './anexos.routes.js';

const router = Router();

router.use('/planeaciones', planeacionesRoutes);
router.use('/examenes', examenesRoutes);
router.use('/listas-cotejo', listasCotejoRoutes);
router.use('/biblioteca', bibliotecaRoutes);
router.use('/anexos', anexosRoutes);
router.use('/', jerarquiaRoutes);

export default router;
