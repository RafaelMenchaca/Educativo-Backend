import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  getPlanteles,
  postPlantel,
  getGradosByPlantel,
  postGrado,
  getMateriasByGrado,
  postMateria,
  getUnidadesByMateria,
  postUnidad,
  getTemasByUnidad,
  postTemas,
  generarPlaneacionesPorUnidad,
  getPlaneacionByTema
} from '../controllers/jerarquia.controller.js';

const router = Router();

router.get('/planteles', requireAuth, getPlanteles);
router.post('/planteles', requireAuth, postPlantel);

router.get('/planteles/:plantelId/grados', requireAuth, getGradosByPlantel);
router.post('/grados', requireAuth, postGrado);

router.get('/grados/:gradoId/materias', requireAuth, getMateriasByGrado);
router.post('/materias', requireAuth, postMateria);

router.get('/materias/:materiaId/unidades', requireAuth, getUnidadesByMateria);
router.post('/unidades', requireAuth, postUnidad);

router.get('/unidades/:unidadId/temas', requireAuth, getTemasByUnidad);
router.post('/temas', requireAuth, postTemas);

router.post('/unidades/:unidadId/generar', requireAuth, generarPlaneacionesPorUnidad);

router.get('/temas/:temaId/planeacion', requireAuth, getPlaneacionByTema);

export default router;
