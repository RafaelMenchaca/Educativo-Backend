import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  getPlanteles,
  postPlantel,
  patchPlantel,
  deletePlantel,
  archivePlantel,
  getGradosByPlantel,
  postGrado,
  patchGrado,
  deleteGrado,
  archiveGrado,
  getMateriasByGrado,
  postMateria,
  deleteMateria,
  archiveMateria,
  getUnidadesByMateria,
  postUnidad,
  patchUnidad,
  deleteUnidad,
  archiveUnidad,
  getTemasByUnidad,
  postTemas,
  deleteTema,
  generarPlaneacionesPorUnidad,
  getPlaneacionByTema
} from '../controllers/jerarquia.controller.js';

const router = Router();

router.get('/planteles', requireAuth, getPlanteles);
router.post('/planteles', requireAuth, postPlantel);
router.patch('/planteles/:plantelId', requireAuth, patchPlantel);
router.patch('/planteles/:plantelId/archive', requireAuth, archivePlantel);
router.delete('/planteles/:plantelId', requireAuth, deletePlantel);

router.get('/planteles/:plantelId/grados', requireAuth, getGradosByPlantel);
router.post('/grados', requireAuth, postGrado);
router.patch('/grados/:gradoId', requireAuth, patchGrado);
router.patch('/grados/:gradoId/archive', requireAuth, archiveGrado);
router.delete('/grados/:gradoId', requireAuth, deleteGrado);

router.get('/grados/:gradoId/materias', requireAuth, getMateriasByGrado);
router.post('/materias', requireAuth, postMateria);
router.patch('/materias/:materiaId/archive', requireAuth, archiveMateria);
router.delete('/materias/:materiaId', requireAuth, deleteMateria);

router.get('/materias/:materiaId/unidades', requireAuth, getUnidadesByMateria);
router.post('/unidades', requireAuth, postUnidad);
router.patch('/unidades/:unidadId', requireAuth, patchUnidad);
router.patch('/unidades/:unidadId/archive', requireAuth, archiveUnidad);
router.delete('/unidades/:unidadId', requireAuth, deleteUnidad);

router.get('/unidades/:unidadId/temas', requireAuth, getTemasByUnidad);
router.post('/temas', requireAuth, postTemas);
router.delete('/temas/:temaId', requireAuth, deleteTema);

router.post('/unidades/:unidadId/generar', requireAuth, generarPlaneacionesPorUnidad);

router.get('/temas/:temaId/planeacion', requireAuth, getPlaneacionByTema);

export default router;
