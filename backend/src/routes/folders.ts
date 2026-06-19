import express, { Router } from 'express';
import { getFolderContents, getFileInfo } from '../controllers/folderController.js';

const router: Router = express.Router();

// Folder browsing is exposed as a public endpoint so the frontend can mount
// file system metadata without requiring authentication in the current UI.
router.get('/', getFolderContents);
router.get('/file', getFileInfo);

export default router;
