import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  getPlanteles,
  postPlantel,
  deletePlantel,
  getGradosByPlantel,
  postGrado,
  deleteGrado,
  getMateriasByGrado,
  postMateria,
  deleteMateria,
  getUnidadesByMateria,
  postUnidad,
  deleteUnidad,
  getTemasByUnidad,
  postTemas,
  deleteTema,
  generarPlaneacionesPorUnidad,
  getPlaneacionByTema
} from '../controllers/jerarquia.controller.js';

const router = Router();

router.get('/planteles', requireAuth, getPlanteles);
router.post('/planteles', requireAuth, postPlantel);
router.delete('/planteles/:plantelId', requireAuth, deletePlantel);

router.get('/planteles/:plantelId/grados', requireAuth, getGradosByPlantel);
router.post('/grados', requireAuth, postGrado);
router.delete('/grados/:gradoId', requireAuth, deleteGrado);

router.get('/grados/:gradoId/materias', requireAuth, getMateriasByGrado);
router.post('/materias', requireAuth, postMateria);
router.delete('/materias/:materiaId', requireAuth, deleteMateria);

router.get('/materias/:materiaId/unidades', requireAuth, getUnidadesByMateria);
router.post('/unidades', requireAuth, postUnidad);
router.delete('/unidades/:unidadId', requireAuth, deleteUnidad);

router.get('/unidades/:unidadId/temas', requireAuth, getTemasByUnidad);
router.post('/temas', requireAuth, postTemas);
router.delete('/temas/:temaId', requireAuth, deleteTema);

router.post('/unidades/:unidadId/generar', requireAuth, generarPlaneacionesPorUnidad);

router.get('/temas/:temaId/planeacion', requireAuth, getPlaneacionByTema);

export default router;
