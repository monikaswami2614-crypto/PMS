import express, { Router } from 'express';
import { openFileEditor, openRawFile } from '../controllers/fileController.js';

const router: Router = express.Router();

router.get('/editor/:fileId/raw', openRawFile);
router.get('/editor/:fileId', openFileEditor);

export default router;
