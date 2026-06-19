import express, { Router } from 'express';
import { openFileEditor } from '../controllers/fileController.js';

const router: Router = express.Router();

router.get('/editor/:fileId', openFileEditor);

export default router;
