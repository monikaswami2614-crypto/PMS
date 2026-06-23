import express, { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getAllProjects,
  getProjectById,
  getProjectTree,
  createProject,
  updateProject,
  deleteProject,
  importProject,
  importPublicProject,
  createBlankPublicProject,
  getPublicProjects,
  getPublicProjectTree,
  moveProjectToFinalSubmission,
  moveProjectToReview,
  deletePublicProject,
} from '../controllers/projectController.js';

const router: Router = express.Router();

// Public endpoints (no auth) for frontend to consume imported projects
router.get('/public', getPublicProjects);
router.post('/import/public', importPublicProject);
router.post('/create-blank/public', createBlankPublicProject);
router.patch('/:id/stage/final-submission/public', moveProjectToFinalSubmission);
router.patch('/:id/stage/review/public', moveProjectToReview);
router.get('/:id/tree/public', getPublicProjectTree);
router.delete('/:id/public', deletePublicProject);

// Protected routes
router.use(authenticate);

router.get('/', getAllProjects);
router.post('/', createProject);
router.post('/import', importProject);
router.get('/:id/tree', getProjectTree);
router.get('/:id', getProjectById);
router.put('/:id', updateProject);
router.delete('/:id', deleteProject);

export default router;
