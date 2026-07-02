import express, { Router } from 'express';
import { filterChecklistFilesByRequirement, getChecklistFiltration, getChecklistReview, getChecklistTree, getFinalAwardResponse, matchClientDataToRequirements, parseReviewResponseFile, previewChecklistMatchedFile, previewChecklistMatchedFileRaw, saveFiltrationProjectFiles, saveFinalAwardResponse, suggestChecklistFileNames, updateChecklistReviewStatus } from '../controllers/checklistController.js';

const router: Router = express.Router();

router.post('/review-response/parse', express.raw({ type: 'application/octet-stream', limit: '20mb' }), parseReviewResponseFile);
router.get('/review/:projectId/final-award', getFinalAwardResponse);
router.post('/review/:projectId/final-award', express.raw({ type: 'application/octet-stream', limit: '20mb' }), saveFinalAwardResponse);
router.get('/review/:projectId', getChecklistReview);
router.get('/review/:projectId/filtration/:phase', getChecklistFiltration);
router.post('/review/:projectId/filtration/save', saveFiltrationProjectFiles);
router.post('/review/:projectId/files/ai-filter', filterChecklistFilesByRequirement);
router.post('/review/:projectId/files/match-client-data', matchClientDataToRequirements);
router.post('/review/:projectId/files/suggest-names', suggestChecklistFileNames);
router.patch('/review/:projectId/items/:itemId', updateChecklistReviewStatus);
router.get('/review/:projectId/files/:fileId/preview/raw', previewChecklistMatchedFileRaw);
router.get('/review/:projectId/files/:fileId/preview', previewChecklistMatchedFile);
router.get('/:type', getChecklistTree);

export default router;
