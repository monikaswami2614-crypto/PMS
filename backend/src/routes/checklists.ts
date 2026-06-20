import express, { Router } from 'express';
import { filterChecklistFilesByRequirement, getChecklistFiltration, getChecklistReview, getChecklistTree, matchClientDataToRequirements, previewChecklistMatchedFile, suggestChecklistFileNames, updateChecklistReviewStatus } from '../controllers/checklistController.js';

const router: Router = express.Router();

router.get('/review/:projectId', getChecklistReview);
router.get('/review/:projectId/filtration/:phase', getChecklistFiltration);
router.post('/review/:projectId/files/ai-filter', filterChecklistFilesByRequirement);
router.post('/review/:projectId/files/match-client-data', matchClientDataToRequirements);
router.post('/review/:projectId/files/suggest-names', suggestChecklistFileNames);
router.patch('/review/:projectId/items/:itemId', updateChecklistReviewStatus);
router.get('/review/:projectId/files/:fileId/preview', previewChecklistMatchedFile);
router.get('/:type', getChecklistTree);

export default router;
