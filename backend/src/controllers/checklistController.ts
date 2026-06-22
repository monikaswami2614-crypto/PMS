import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import crypto from 'crypto';
import path from 'path';
import XLSX from 'xlsx';
import prisma from '../config/prisma.js';

const CHECKLIST_ROOT = process.env.CHECKLIST_ROOT || 'C:\\Users\\monika.swami\\Desktop\\Leed Project';
const CHECKLIST_REVIEW_ROOT = process.env.CHECKLIST_REVIEW_ROOT || 'C:\\Users\\monika.swami\\Desktop\\Leed Project\\checklist-review';

const checklistFolders: Record<string, { name: string; folderName: string }> = {
  nb: { name: 'NB Checklist', folderName: 'NB Checklist' },
  gh: { name: 'GH Checklist', folderName: 'GH Checklist' }
};

const documentUnderstandingCache = new Map<string, DocumentUnderstanding>();

type ChecklistSheet = {
  name: string;
  rows: string[][];
};

type ChecklistType = 'NB' | 'GH';

type ParsedChecklistItem = {
  creditName: string;
  subCreditName: string;
  preCertificationRequirement: string;
  finalCertificationRequirement: string;
  sortOrder: number;
  sourceSheet: string;
  sourceRow: number;
};

type ReviewChecklistRow = ParsedChecklistItem & {
  preRequirements: ReviewRequirement[];
  finalRequirements: ReviewRequirement[];
};

type RequirementStatus = 'pending' | 'missing' | 'checked' | 'overridden';

type ReviewRequirement = {
  id: string;
  text: string;
  pointNumber: number;
};

type MatchedFile = {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  extension: string | null;
  size: number;
};

type ReviewProject = {
  id: string;
  name: string;
  category: string | null;
  rootPath: string | null;
  files: MatchedFile[];
};

type DocumentUnderstanding = {
  text: string[];
  tables: string[];
  headings: string[];
  stamps: string[];
  keywords: string[];
  drawingTitle: string | null;
  sheetName: string | null;
  layers: string[];
  metadata: string[];
};

type SuggestedFileName = {
  fileId: string;
  currentName: string;
  suggestedName: string;
  confidence: number;
  extractedSignals: DocumentUnderstanding;
};

type AiFilteredFile = {
  fileId: string;
  matchScore: number;
  matchReason: string;
};

type ClientDataMatch = AiFilteredFile & {
  groupId: string;
  requirementId: string;
  requirementName: string;
};

const findWorkbookPath = async (folderPath: string): Promise<string> => {
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  const workbook = entries.find((entry) => {
    const extension = path.extname(entry.name).toLowerCase();
    return entry.isFile() && !entry.name.startsWith('~$') && ['.xlsx', '.xls'].includes(extension);
  });

  if (!workbook) {
    throw new Error('No checklist workbook found in this folder');
  }

  return path.join(folderPath, workbook.name);
};

const normalizeRows = (rows: unknown[][]): string[][] => {
  return rows
    .map((row) => row.map((cell) => (cell === null || cell === undefined ? '' : String(cell).trimEnd())))
    .filter((row) => row.some((cell) => cell.trim() !== ''));
};

const readChecklistWorkbook = (workbookPath: string): ChecklistSheet[] => {
  const workbook = XLSX.readFile(workbookPath, { cellDates: true });

  return workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: '',
      blankrows: false,
      raw: false
    });

    return {
      name: sheetName,
      rows: normalizeRows(rows)
    };
  }).filter((sheet) => sheet.rows.length > 0);
};

const getChecklistTypeFromProject = (project: { name: string; category: string | null; rootPath: string | null }): ChecklistType => {
  const searchableText = `${project.name ?? ''} ${project.category ?? ''} ${project.rootPath ?? ''}`.toLowerCase();

  if (searchableText.includes('green homes') || searchableText.includes('green_homes') || searchableText.includes('igbc gh') || searchableText.includes(' gh ')) {
    return 'GH';
  }

  return 'NB';
};

const normalizeHeader = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const findColumnIndex = (header: string[], options: string[]): number => {
  const normalizedOptions = options.map(normalizeHeader);
  return header.findIndex((cell) => {
    const normalizedCell = normalizeHeader(cell);
    return normalizedOptions.some((option) => normalizedCell.includes(option));
  });
};

const isChecklistCreditCode = (value: string): boolean => /\b(?:mr|cr|m|credit)\s*\d+(?:\.\d+)?\b/i.test(value);

const parseChecklistRows = (sheets: ChecklistSheet[]): ParsedChecklistItem[] => {
  const items: ParsedChecklistItem[] = [];
  let sortOrder = 1;

  for (const sheet of sheets) {
    const headerIndex = sheet.rows.findIndex((row) => {
      const headerText = row.map(normalizeHeader).join(' ');
      return headerText.includes('credit') && (headerText.includes('pre') || headerText.includes('final'));
    });

    if (headerIndex === -1) continue;

    const header = sheet.rows[headerIndex];
    const creditIndex = findColumnIndex(header, ['credit name', 'credit']);
    let subCreditIndex = findColumnIndex(header, ['module', 'sub credit module', 'sub credit name']);
    if (subCreditIndex === -1 && creditIndex === 0 && header.length > 1 && normalizeHeader(header[1]).includes('credit')) {
      subCreditIndex = 1;
    }
    const preIndex = findColumnIndex(header, ['pre certification', 'pre certification requirement']);
    const finalIndex = findColumnIndex(header, ['final certification', 'final certification requirement']);
    const combinedIndex = findColumnIndex(header, ['pre and final certification', 'data requirement list']);

    if (creditIndex === -1 || (preIndex === -1 && finalIndex === -1 && combinedIndex === -1)) continue;

    let lastCreditName = '';
    let lastSubCreditName = '';

    for (let rowIndex = headerIndex + 1; rowIndex < sheet.rows.length; rowIndex += 1) {
      const row = sheet.rows[rowIndex];
      const rowCreditName = (row[creditIndex] || '').trim();
      const rowSubCreditName = subCreditIndex === -1 ? '' : (row[subCreditIndex] || '').trim();
      const combinedRequirement = combinedIndex === -1 ? '' : (row[combinedIndex] || '').trim();
      const preCertificationRequirement = preIndex === -1 ? combinedRequirement : (row[preIndex] || '').trim();
      const finalCertificationRequirement = finalIndex === -1 ? combinedRequirement : (row[finalIndex] || '').trim();
      const hasRequirements = Boolean(preCertificationRequirement || finalCertificationRequirement);

      if (isChecklistCreditCode(rowCreditName)) {
        lastCreditName = rowCreditName;
        lastSubCreditName = rowSubCreditName;
      }

      const creditName = rowCreditName || (hasRequirements ? lastCreditName : '');
      const subCreditName = rowCreditName ? rowSubCreditName : (hasRequirements ? lastSubCreditName : rowSubCreditName);

      if (!creditName && !subCreditName && !preCertificationRequirement && !finalCertificationRequirement) continue;
      if (!isChecklistCreditCode(creditName)) continue;

      items.push({
        creditName,
        subCreditName,
        preCertificationRequirement,
        finalCertificationRequirement,
        sortOrder,
        sourceSheet: sheet.name,
        sourceRow: rowIndex + 1,
      });
      sortOrder += 1;
    }
  }

  return items;
};

const findReviewWorkbookPath = async (type: ChecklistType): Promise<string> => {
  const entries = await fs.readdir(CHECKLIST_REVIEW_ROOT, { withFileTypes: true });
  const workbook = entries.find((entry) => {
    const extension = path.extname(entry.name).toLowerCase();
    const name = entry.name.toLowerCase();
    const isWorkbook = entry.isFile() && !entry.name.startsWith('~$') && ['.xlsx', '.xls'].includes(extension);
    if (!isWorkbook) return false;

    if (type === 'NB') return name.includes('nb');
    return name.includes('gh') || name.includes('fc data') || name.includes('green');
  });

  if (!workbook) {
    throw new Error(`${type} checklist workbook not found in ${CHECKLIST_REVIEW_ROOT}`);
  }

  return path.join(CHECKLIST_REVIEW_ROOT, workbook.name);
};

const createStableChecklistId = (type: ChecklistType, row: ParsedChecklistItem, phase: 'PRE' | 'FINAL', pointIndex: number): string => {
  const hash = crypto
    .createHash('sha1')
    .update([type, row.sourceSheet, row.sourceRow, row.creditName, row.subCreditName, phase, pointIndex].join('|'))
    .digest('hex')
    .slice(0, 20);

  return `review_${type.toLowerCase()}_${phase.toLowerCase()}_${hash}`;
};

const splitRequirementPoints = (requirement: string): string[] => {
  const normalizedRequirement = requirement.trim();
  if (!normalizedRequirement) return [];

  const normalizedLines = normalizedRequirement
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const points: string[] = [];
  let currentPoint = '';
  const numberedPattern = /^(\d+|[a-z])[\.\)]\s+/i;

  for (const line of normalizedLines) {
    if (numberedPattern.test(line)) {
      if (currentPoint) points.push(currentPoint.trim());
      currentPoint = line;
      continue;
    }

    if (currentPoint) {
      currentPoint = `${currentPoint}\n${line}`;
    } else {
      points.push(line);
    }
  }

  if (currentPoint) points.push(currentPoint.trim());
  return points.length > 0 ? points : [normalizedRequirement];
};

const ensureReviewChecklistItems = async (type: ChecklistType): Promise<ReviewChecklistRow[]> => {
  const workbookPath = await findReviewWorkbookPath(type);
  const rows = parseChecklistRows(readChecklistWorkbook(workbookPath));

  if (rows.length === 0) {
    throw new Error(`No checklist rows found in ${path.basename(workbookPath)}`);
  }

  const reviewRows: ReviewChecklistRow[] = [];

  for (const row of rows) {
    const preRequirements = splitRequirementPoints(row.preCertificationRequirement).map((text, index) => ({
      id: createStableChecklistId(type, row, 'PRE', index + 1),
      text,
      pointNumber: index + 1,
    }));
    const finalRequirements = splitRequirementPoints(row.finalCertificationRequirement).map((text, index) => ({
      id: createStableChecklistId(type, row, 'FINAL', index + 1),
      text,
      pointNumber: index + 1,
    }));

    for (const requirement of preRequirements) {
      await prisma.certificationChecklistItem.upsert({
        where: { id: requirement.id },
        create: {
          id: requirement.id,
          checklistType: type,
          creditCode: row.creditName,
          creditName: row.subCreditName,
          requirementName: requirement.text,
          documentName: requirement.text,
          keywords: [row.creditName, row.subCreditName, requirement.text].filter(Boolean),
          phase: 'PRE',
          sourceSheet: row.sourceSheet,
          sourceRow: row.sourceRow,
        },
        update: {
          creditCode: row.creditName,
          creditName: row.subCreditName,
          requirementName: requirement.text,
          documentName: requirement.text,
          keywords: [row.creditName, row.subCreditName, requirement.text].filter(Boolean),
          sourceSheet: row.sourceSheet,
          sourceRow: row.sourceRow,
        },
      });
    }

    for (const requirement of finalRequirements) {
      await prisma.certificationChecklistItem.upsert({
        where: { id: requirement.id },
        create: {
          id: requirement.id,
          checklistType: type,
          creditCode: row.creditName,
          creditName: row.subCreditName,
          requirementName: requirement.text,
          documentName: requirement.text,
          keywords: [row.creditName, row.subCreditName, requirement.text].filter(Boolean),
          phase: 'FINAL',
          sourceSheet: row.sourceSheet,
          sourceRow: row.sourceRow,
        },
        update: {
          creditCode: row.creditName,
          creditName: row.subCreditName,
          requirementName: requirement.text,
          documentName: requirement.text,
          keywords: [row.creditName, row.subCreditName, requirement.text].filter(Boolean),
          sourceSheet: row.sourceSheet,
          sourceRow: row.sourceRow,
        },
      });
    }

    reviewRows.push({ ...row, preRequirements, finalRequirements });
  }

  return reviewRows;
};

const tokenize = (value: string): string[] => {
  const stopWords = new Set(['and', 'or', 'the', 'for', 'with', 'from', 'site', 'document', 'documents', 'drawing', 'drawings', 'proof', 'final', 'pre', 'certification']);

  return Array.from(new Set(value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !stopWords.has(token))));
};

const getFileExtensionValue = (file: Pick<MatchedFile, 'name' | 'extension'>): string => (
  (file.extension || path.extname(file.name).replace('.', '') || '').toLowerCase()
);

const normalizeDocumentText = (value: string): string => value.replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, ' ');

const extractImportantKeywords = (value: string): string[] => tokenize(value).slice(0, 24);

const extractLines = (value: string): string[] => (
  normalizeDocumentText(value)
    .split(/\r?\n| {2,}/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 3)
    .slice(0, 80)
);

const createEmptyDocumentUnderstanding = (): DocumentUnderstanding => ({
  text: [],
  tables: [],
  headings: [],
  stamps: [],
  keywords: [],
  drawingTitle: null,
  sheetName: null,
  layers: [],
  metadata: [],
});

const inferDocumentUnderstanding = async (file: MatchedFile, options: { deep?: boolean } = {}): Promise<DocumentUnderstanding> => {
  const cacheKey = `${file.id}:${file.size ?? 0}:${file.path}:${options.deep ? 'deep' : 'quick'}`;
  const cached = documentUnderstandingCache.get(cacheKey);
  if (cached) return cached;

  const extension = getFileExtensionValue(file);
  const understanding = createEmptyDocumentUnderstanding();
  const fileContext = `${file.name} ${file.relativePath} ${file.path}`;

  understanding.keywords = extractImportantKeywords(fileContext);
  understanding.metadata = [file.name, file.relativePath, extension].filter(Boolean);

  try {
    const stats = await fs.stat(file.path);
    understanding.metadata.push(`size ${stats.size}`, `modified ${stats.mtime.toISOString()}`);

    if (options.deep && stats.size > 0 && stats.size <= 5 * 1024 * 1024 && ['txt', 'csv', 'doc', 'docx', 'pdf', 'dxf'].includes(extension)) {
      const fileHandle = await fs.open(file.path, 'r');
      const byteLength = Math.min(stats.size, 256 * 1024);
      const buffer = Buffer.alloc(byteLength);
      await fileHandle.read(buffer, 0, byteLength, 0);
      await fileHandle.close();
      const rawContent = buffer;
      const readableContent = normalizeDocumentText(rawContent.toString('utf8'));
      const lines = extractLines(readableContent);

      understanding.text = lines.slice(0, 36);
      understanding.tables = lines.filter((line) => line.includes('\t') || line.split('|').length >= 3 || line.split(',').length >= 4).slice(0, 12);
      understanding.headings = lines.filter((line) => /^[A-Z0-9 ._\-/()]{8,}$/.test(line) || /title|report|calculation|drawing|schedule/i.test(line)).slice(0, 12);
      understanding.stamps = lines.filter((line) => /approved|approval|issued|stamp|seal|signed|checked/i.test(line)).slice(0, 12);
      understanding.keywords = extractImportantKeywords(`${fileContext} ${lines.join(' ')}`);
    }

    if (options.deep && extension === 'dxf') {
      const dxfContent = normalizeDocumentText((await fs.readFile(file.path)).toString('utf8'));
      understanding.layers = Array.from(new Set(Array.from(dxfContent.matchAll(/\n\s*8\s*\n\s*([^\n\r]+)/g)).map((match) => match[1].trim()).filter(Boolean))).slice(0, 24);
    }
  } catch {
    understanding.metadata.push('file not available for deep extraction');
  }

  if (['dwg', 'dxf'].includes(extension)) {
    const baseName = path.basename(file.name, path.extname(file.name));
    understanding.drawingTitle = baseName;
    understanding.sheetName = file.relativePath.split(/[\\/]/).filter(Boolean).pop() ?? null;
  }

  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff'].includes(extension)) {
    understanding.text.push(...extractLines(fileContext).slice(0, 8));
    understanding.stamps.push(...extractLines(fileContext).filter((line) => /approved|stamp|drawing|site|photo/i.test(line)).slice(0, 6));
  }

  documentUnderstandingCache.set(cacheKey, understanding);
  return understanding;
};

const buildFileUnderstandingSearchText = (file: MatchedFile, understanding: DocumentUnderstanding): string => (
  [
    file.name,
    file.relativePath,
    file.path,
    ...understanding.text,
    ...understanding.tables,
    ...understanding.headings,
    ...understanding.stamps,
    ...understanding.keywords,
    understanding.drawingTitle,
    understanding.sheetName,
    ...understanding.layers,
    ...understanding.metadata,
  ].filter(Boolean).join(' ').toLowerCase()
);

const getCreditCodeForName = (creditName: string): string => {
  const tokens = getFolderTokens(creditName);
  if (tokens.length >= 2) return `${tokens[0].toUpperCase()}-${tokens.slice(1).join('').toUpperCase()}`;
  return tokens[0]?.toUpperCase() ?? 'DOC';
};

const getDocumentRole = (file: MatchedFile, requirementName: string, understanding: DocumentUnderstanding): string => {
  const searchText = buildFileUnderstandingSearchText(file, understanding);
  const requirementText = requirementName.toLowerCase();

  if (searchText.includes('as built') || requirementText.includes('as built')) return 'As_Built_Drawing';
  if (searchText.includes('calculation') || requirementText.includes('calculation')) return 'Calculation_Report';
  if (searchText.includes('approval') || searchText.includes('approved') || requirementText.includes('approval')) return 'Approval_Document';
  if (searchText.includes('drawing') || searchText.includes('layout') || searchText.includes('plan')) return 'Drawing';
  if (searchText.includes('photo') || searchText.includes('image')) return 'Photograph';
  if (searchText.includes('report')) return 'Report';
  return 'Supporting_Document';
};

const sanitizeFileNamePart = (value: string): string => (
  value
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
);

const createAiSuggestedName = (file: MatchedFile, creditName: string, requirementName: string, understanding: DocumentUnderstanding): string => {
  const extension = getFileExtensionValue(file) || 'pdf';
  const creditCode = getCreditCodeForName(creditName);
  const role = sanitizeFileNamePart(getDocumentRole(file, requirementName, understanding));
  return `${creditCode}_${role}.${extension}`;
};

const deriveFiltrationStatus = (matchedFiles: MatchedFile[], manualStatus: unknown): RequirementStatus => {
  if (matchedFiles.length > 0) return 'checked';
  if (manualStatus === 'overridden') return 'overridden';
  return 'missing';
};

const formatKeywords = (keywords: unknown): string => {
  if (Array.isArray(keywords)) return keywords.join(' ');
  if (typeof keywords === 'string') return keywords;
  if (keywords && typeof keywords === 'object') return Object.values(keywords).join(' ');
  return '';
};

const buildRequirementText = (item: {
  requirementName: string;
  documentName: string;
  keywords: unknown;
}): string => {
  return [item.documentName, item.requirementName, formatKeywords(item.keywords)].filter(Boolean).join(' ');
};

const normalizeFolderName = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const getFilePathParts = (file: MatchedFile): string[] => {
  return `${file.relativePath || ''}/${file.path || ''}`.split(/[\\/]+/).filter(Boolean);
};

const getFolderTokens = (value: string): string[] => {
  return value.toLowerCase().match(/[a-z]+|\d+/g) ?? [];
};

const isClientDataFile = (file: MatchedFile): boolean => {
  return getFilePathParts(file).some((part) => {
    const tokens = getFolderTokens(part);
    return (tokens.includes('client') && tokens.includes('data')) || (tokens.includes('general') && tokens.includes('submittals'));
  });
};

const isCreditFolderFile = (file: MatchedFile, creditName: string): boolean => {
  const creditTokens = getFolderTokens(creditName);
  if (creditTokens.length === 0) return false;

  return getFilePathParts(file).some((part) => {
    const folderTokens = getFolderTokens(part);
    if (folderTokens.length < creditTokens.length) return false;
    return folderTokens.some((_, startIndex) => {
      return creditTokens.every((token, offset) => folderTokens[startIndex + offset] === token);
    });
  });
};

const getCreditFolderDepth = (file: MatchedFile, creditName: string): number | null => {
  const creditTokens = getFolderTokens(creditName);
  if (creditTokens.length === 0) return null;

  const pathParts = (file.relativePath || file.path || '').split(/[\\/]+/).filter(Boolean);
  const folderParts = pathParts.slice(0, -1);
  const creditFolderIndex = folderParts.findIndex((part) => {
    const folderTokens = getFolderTokens(part);
    if (folderTokens.length < creditTokens.length) return false;
    return folderTokens.some((_, startIndex) => (
      creditTokens.every((token, offset) => folderTokens[startIndex + offset] === token)
    ));
  });

  if (creditFolderIndex === -1) return null;
  return folderParts.length - creditFolderIndex - 1;
};

const getCreditScopedFiles = (files: MatchedFile[], item: ReviewChecklistRow): MatchedFile[] => {
  return files.filter((file) => isClientDataFile(file) || isCreditFolderFile(file, item.creditName));
};

const createPathContainsWhere = (term: string) => ({
  OR: [
    { relativePath: { contains: term, mode: 'insensitive' as const } },
    { path: { contains: term, mode: 'insensitive' as const } },
  ],
});

const getCreditFolderSearchTerms = (creditName: string): string[] => {
  const tokens = getFolderTokens(creditName);
  if (tokens.length === 0) return [];

  const terms = new Set<string>([
    creditName,
    tokens.join(' '),
    tokens.join('-'),
  ]);

  if (tokens.length >= 3 && /^\d+$/.test(tokens[tokens.length - 1])) {
    const prefix = tokens.slice(0, -1).join(' ');
    const number = tokens[tokens.length - 1];
    terms.add(`${prefix}${number}`);
    terms.add(`${prefix}-${number}`);
    terms.add(`${prefix} ${number}`);
  }

  return Array.from(terms).filter(Boolean);
};

const getFilesForChecklistCredit = async (projectId: string, item: ReviewChecklistRow): Promise<MatchedFile[]> => {
  const searchTerms = new Set<string>(['General Submittals', 'Client Data']);
  getCreditFolderSearchTerms(item.creditName).forEach((term) => searchTerms.add(term));

  const files = await prisma.file.findMany({
    where: {
      projectId,
      OR: Array.from(searchTerms).map(createPathContainsWhere),
    },
    select: { id: true, name: true, relativePath: true, path: true, extension: true, size: true },
  });

  return getCreditScopedFiles(files.map((file) => ({
    id: file.id,
    name: file.name,
    path: file.path,
    relativePath: file.relativePath,
    extension: file.extension,
    size: file.size,
  })), item);
};

const getFilePhase = (file: MatchedFile): 'pre' | 'final' | null => {
  const pathParts = getFilePathParts(file);

  for (const part of pathParts) {
    const normalizedPart = normalizeFolderName(part);
    if (normalizedPart.includes('precertification')) return 'pre';
    if (normalizedPart.includes('finalcertification')) return 'final';
  }

  return null;
};

const uniqueFilesById = (files: MatchedFile[]): MatchedFile[] => {
  return Array.from(new Map(files.map((file) => [file.id, file])).values());
};

const getMatchedFiles = async (requirement: string, files: MatchedFile[]): Promise<{ matchedFiles: MatchedFile[]; status: RequirementStatus }> => {
  const tokens = tokenize(requirement);
  if (tokens.length === 0) return { matchedFiles: [], status: 'missing' };
  const coveredTokens = new Set<string>();
  const requiredMatches = Math.min(tokens.length, 2);

  const analyzedFiles = await Promise.all(files.map(async (file) => ({
    file,
    understanding: await inferDocumentUnderstanding(file),
  })));

  const matchedFiles = analyzedFiles
    .map(({ file, understanding }) => {
      const searchText = buildFileUnderstandingSearchText(file, understanding);
      const score = tokens.filter((token) => searchText.includes(token)).length;
      const matchedTokens = tokens.filter((token) => searchText.includes(token));
      return { file, score, matchedTokens };
    })
    .filter(({ score }) => score >= requiredMatches)
    .map((match) => {
      match.matchedTokens.forEach((token) => coveredTokens.add(token));
      return match;
    })
    .sort((a, b) => b.score - a.score)
    .map(({ file }) => file);

  if (coveredTokens.size === tokens.length) {
    return { matchedFiles: uniqueFilesById(matchedFiles), status: 'checked' };
  }

  if (coveredTokens.size > 0) {
    return { matchedFiles: uniqueFilesById(matchedFiles), status: 'pending' };
  }

  return { matchedFiles: [], status: 'missing' };
};

const getProjectReviewContext = async (projectId: string): Promise<{
  project: ReviewProject | null;
  type: ChecklistType | null;
  items: ReviewChecklistRow[];
  statusByItemId: Map<string, { preCertificationStatus: string | null; finalCertificationStatus: string | null }>;
}> => {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, category: true, rootPath: true },
  });

  if (!project) {
    return {
      project: null,
      type: null,
      items: [],
      statusByItemId: new Map(),
    };
  }

  const type = getChecklistTypeFromProject(project);
  const [items, statuses] = await Promise.all([
    ensureReviewChecklistItems(type),
    prisma.projectChecklistStatus.findMany({
      where: { projectId },
      select: { checklistItemId: true, preCertificationStatus: true, finalCertificationStatus: true },
    }),
  ]);
  return {
    project: { ...project, files: [] },
    type,
    items,
    statusByItemId: new Map(statuses.map((status) => [status.checklistItemId, status])),
  };
};

export const getChecklistTree = async (req: Request, res: Response): Promise<void> => {
  try {
    const checklist = checklistFolders[req.params.type];

    if (!checklist) {
      res.status(404).json({ error: 'Checklist type not found' });
      return;
    }

    const folderPath = path.join(CHECKLIST_ROOT, checklist.folderName);
    const workbookPath = await findWorkbookPath(folderPath);
    const workbookStats = await fs.stat(workbookPath);
    const sheets = readChecklistWorkbook(workbookPath);

    res.json({
      message: `${checklist.name} retrieved successfully`,
      data: {
        name: checklist.name,
        fileName: path.basename(workbookPath),
        path: workbookPath,
        size: workbookStats.size,
        modifiedAt: workbookStats.mtime.toISOString(),
        sheets
      }
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to read checklist files' });
  }
};

export const getChecklistReview = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, category: true, rootPath: true },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const type = getChecklistTypeFromProject(project);
    const [items, statuses] = await Promise.all([
      ensureReviewChecklistItems(type),
      prisma.projectChecklistStatus.findMany({ where: { projectId } }),
    ]);

    if (items.length === 0) {
      res.status(404).json({ error: `${type} checklist data was not found in the database` });
      return;
    }

    const statusByItemId = new Map(statuses.map((status) => [status.checklistItemId, status]));
    const reviewItems = await Promise.all(items.map(async (item) => {
      const creditFiles = await getFilesForChecklistCredit(projectId, item);
      const scopedFilesByPhase = {
        pre: creditFiles.filter((file) => getFilePhase(file) === 'pre'),
        final: creditFiles.filter((file) => getFilePhase(file) === 'final'),
      };

      const mapRequirement = async (requirement: ReviewRequirement, phase: 'pre' | 'final') => {
        const submissionFiles = scopedFilesByPhase[phase].filter((file) => (
          getCreditFolderDepth(file, item.creditName) === 0
        ));
        const matchResult = await getMatchedFiles(requirement.text, submissionFiles);
        const matchedFiles = matchResult.matchedFiles;
        const matched = matchedFiles.length > 0;
        const status = statusByItemId.get(requirement.id);
        const manualStatus = phase === 'pre' ? status?.preCertificationStatus : status?.finalCertificationStatus;

        return {
          id: requirement.id,
          text: requirement.text,
          pointNumber: requirement.pointNumber,
          matched,
          status: deriveFiltrationStatus(matchedFiles, manualStatus),
          matchedFiles,
        };
      };

      return {
        id: `${type}-${item.sourceSheet}-${item.sourceRow}`,
        creditName: item.creditName,
        subCreditName: item.subCreditName,
        preRequirements: await Promise.all(item.preRequirements.map((requirement) => mapRequirement(requirement, 'pre'))),
        finalRequirements: await Promise.all(item.finalRequirements.map((requirement) => mapRequirement(requirement, 'final'))),
      };
    }));

    res.json({
      message: 'Checklist review retrieved',
      data: {
        project: {
          id: project.id,
          name: project.name,
          type,
        },
        items: reviewItems,
        activityHistory: statuses.flatMap((status) => ([
          status.preCertificationStatus ? {
            id: `${status.id}-pre`,
            requirementId: status.checklistItemId,
            phase: 'pre',
            status: status.preCertificationStatus,
            timestamp: status.updatedAt,
          } : null,
          status.finalCertificationStatus ? {
            id: `${status.id}-final`,
            requirementId: status.checklistItemId,
            phase: 'final',
            status: status.finalCertificationStatus,
            timestamp: status.updatedAt,
          } : null,
        ].filter(Boolean))),
      },
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load checklist review' });
  }
};

export const getChecklistFiltration = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId, phase: phaseParam } = req.params;
    const phase = phaseParam === 'pre' || phaseParam === 'final' ? phaseParam : null;

    if (!phase) {
      res.status(400).json({ error: 'Phase must be pre or final' });
      return;
    }

    const { project, type, items, statusByItemId } = await getProjectReviewContext(projectId);

    if (!project || !type) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    if (items.length === 0) {
      res.status(404).json({ error: `${type} checklist data was not found in the database` });
      return;
    }

    const collectionKey = phase === 'pre' ? 'preRequirements' : 'finalRequirements';
    const manualStatusKey = phase === 'pre' ? 'preCertificationStatus' : 'finalCertificationStatus';
    const groups = (await Promise.all(items
      .map(async (item) => {
        const creditFiles = await getFilesForChecklistCredit(projectId, item);
        const scopedFiles = creditFiles.filter((file) => getFilePhase(file) === phase);
        const submissionScopedFiles = uniqueFilesById(scopedFiles.filter((file) => (
          getCreditFolderDepth(file, item.creditName) === 0
        )));
        const supportingScopedFiles = uniqueFilesById(scopedFiles.filter((file) => {
          const depth = getCreditFolderDepth(file, item.creditName);
          return depth !== null && depth > 0;
        }));
        const requirements = await Promise.all(item[collectionKey]
          .map(async (requirement) => {
            const matchResult = await getMatchedFiles(requirement.text, submissionScopedFiles);
            const status = deriveFiltrationStatus(
              matchResult.matchedFiles,
              statusByItemId.get(requirement.id)?.[manualStatusKey]
            );

            return {
              id: requirement.id,
              requirementName: requirement.text,
              pointNumber: requirement.pointNumber,
              status,
              matchedFiles: matchResult.matchedFiles.map((file) => ({
                ...file,
                status,
                requirementId: requirement.id,
                requirementName: requirement.text,
              })),
            };
          }));
        const fallbackRequirement = requirements[0];
        const submissionFiles = submissionScopedFiles
          .map((file) => ({
            ...file,
            status: fallbackRequirement?.status ?? 'missing',
            requirementId: fallbackRequirement?.id ?? `${type}-${phase}-${item.sourceSheet}-${item.sourceRow}-submission`,
            requirementName: fallbackRequirement?.requirementName ?? (item.subCreditName || item.creditName),
          }));
        const supportingFiles = supportingScopedFiles.map((file) => ({
          ...file,
          status: 'pending' as RequirementStatus,
          requirementId: fallbackRequirement?.id ?? `${type}-${phase}-${item.sourceSheet}-${item.sourceRow}-supporting`,
          requirementName: fallbackRequirement?.requirementName ?? (item.subCreditName || item.creditName),
        }));

        return {
          id: `${type}-${phase}-${item.sourceSheet}-${item.sourceRow}`,
          creditName: item.creditName,
          subCreditName: item.subCreditName,
          requirements,
          submissionFiles,
          supportingFiles,
        };
      })));

    res.json({
      message: `${phase === 'pre' ? 'Pre' : 'Final'} certification filtration retrieved`,
      data: {
        project: {
          id: project.id,
          name: project.name,
          type,
        },
        phase,
        groups,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load checklist filtration' });
  }
};

export const updateChecklistReviewStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId, itemId } = req.params;
    const { phase, status: nextStatus, preCertificationChecked, finalCertificationChecked } = req.body as {
      phase?: 'pre' | 'final';
      status?: RequirementStatus;
      preCertificationChecked?: boolean;
      finalCertificationChecked?: boolean;
    };

    const data: {
      preCertificationChecked?: boolean;
      finalCertificationChecked?: boolean;
      preCertificationStatus?: RequirementStatus;
      finalCertificationStatus?: RequirementStatus;
    } = {};

    if (nextStatus && !['pending', 'missing', 'checked', 'overridden'].includes(nextStatus)) {
      res.status(400).json({ error: 'Status must be pending, missing, checked, or overridden' });
      return;
    }

    if (nextStatus && phase === 'pre') {
      data.preCertificationStatus = nextStatus;
      data.preCertificationChecked = nextStatus === 'checked' || nextStatus === 'overridden';
    }

    if (nextStatus && phase === 'final') {
      data.finalCertificationStatus = nextStatus;
      data.finalCertificationChecked = nextStatus === 'checked' || nextStatus === 'overridden';
    }

    if (typeof preCertificationChecked === 'boolean') data.preCertificationChecked = preCertificationChecked;
    if (typeof finalCertificationChecked === 'boolean') data.finalCertificationChecked = finalCertificationChecked;

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'No checklist status fields provided' });
      return;
    }

    const status = await prisma.projectChecklistStatus.upsert({
      where: { projectId_checklistItemId: { projectId, checklistItemId: itemId } },
      create: {
        projectId,
        checklistItemId: itemId,
        ...data,
      },
      update: data,
    });

    res.json({ message: 'Checklist status saved', data: status });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save checklist status' });
  }
};

export const suggestChecklistFileNames = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { files } = req.body as {
      files?: Array<{
        id?: string;
        creditName?: string;
        requirementName?: string;
      }>;
    };

    if (!Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: 'At least one selected supporting file is required' });
      return;
    }

    const fileIds = Array.from(new Set(files.map((file) => file.id).filter((id): id is string => Boolean(id))));
    const fileContextById = new Map(files.map((file) => [file.id, file]));
    const storedFiles = await prisma.file.findMany({
      where: { projectId, id: { in: fileIds } },
      select: { id: true, name: true, relativePath: true, path: true, extension: true, size: true },
    });

    const suggestions: SuggestedFileName[] = await Promise.all(storedFiles.map(async (file) => {
      const context = fileContextById.get(file.id);
      const matchedFile: MatchedFile = {
        id: file.id,
        name: file.name,
        path: file.path,
        relativePath: file.relativePath,
        extension: file.extension,
        size: file.size,
      };
      const extractedSignals = await inferDocumentUnderstanding(matchedFile, { deep: true });
      const creditName = context?.creditName || file.relativePath || file.name;
      const requirementName = context?.requirementName || file.name;

      return {
        fileId: file.id,
        currentName: file.name,
        suggestedName: createAiSuggestedName(matchedFile, creditName, requirementName, extractedSignals),
        confidence: extractedSignals.text.length > 0 || extractedSignals.drawingTitle ? 82 : 64,
        extractedSignals,
      };
    }));

    res.json({
      message: 'AI file name suggestions generated',
      data: suggestions,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate AI suggested names' });
  }
};

export const filterChecklistFilesByRequirement = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { requirement, files } = req.body as {
      requirement?: string;
      files?: Array<{ id?: string }>;
    };

    if (!requirement?.trim()) {
      res.status(400).json({ error: 'Credit requirement is required' });
      return;
    }

    if (!Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: 'At least one filtration file is required' });
      return;
    }

    const requirementGroups = requirement
      .split(/\r?\n+/)
      .map((line) => tokenize(line))
      .filter((tokens) => tokens.length > 0);

    if (requirementGroups.length === 0) {
      res.json({ message: 'AI filter applied', data: [] });
      return;
    }

    const fileIds = Array.from(new Set(files.map((file) => file.id).filter((id): id is string => Boolean(id))));
    const storedFiles = await prisma.file.findMany({
      where: { projectId, id: { in: fileIds } },
      select: { id: true, name: true, relativePath: true, path: true, extension: true, size: true },
    });

    const filteredFiles: AiFilteredFile[] = (await Promise.all(storedFiles.map(async (file) => {
      const matchedFile: MatchedFile = {
        id: file.id,
        name: file.name,
        path: file.path,
        relativePath: file.relativePath,
        extension: file.extension,
        size: file.size,
      };
      const understanding = await inferDocumentUnderstanding(matchedFile, { deep: true });
      const searchText = buildFileUnderstandingSearchText(matchedFile, understanding);
      const matchingRequirement = requirementGroups.find((tokens) => tokens.every((token) => searchText.includes(token)));

      if (!matchingRequirement) return null;

      return {
        fileId: file.id,
        matchScore: 100,
        matchReason: `100% requirement token match (${matchingRequirement.length}/${matchingRequirement.length})`,
      };
    }))).filter((file): file is AiFilteredFile => Boolean(file));

    res.json({
      message: 'AI filter applied',
      data: filteredFiles,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to apply AI filter' });
  }
};

export const matchClientDataToRequirements = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { files, groups } = req.body as {
      files?: Array<{ id?: string }>;
      groups?: Array<{
        id?: string;
        requirements?: Array<{ id?: string; requirementName?: string }>;
      }>;
    };

    if (!Array.isArray(files) || files.length === 0 || !Array.isArray(groups) || groups.length === 0) {
      res.json({ message: 'Client data AI matching completed', data: [] });
      return;
    }

    const preparedGroups = groups
      .filter((group): group is { id: string; requirements: Array<{ id?: string; requirementName?: string }> } => (
        Boolean(group.id) && Array.isArray(group.requirements)
      ))
      .map((group) => ({
        id: group.id,
        requirements: group.requirements
          .filter((requirement) => Boolean(requirement.id && requirement.requirementName?.trim()))
          .map((requirement) => ({
            id: requirement.id as string,
            name: requirement.requirementName as string,
            tokens: tokenize(requirement.requirementName as string),
          }))
          .filter((requirement) => requirement.tokens.length > 0),
      }));

    const fileIds = Array.from(new Set(files.map((file) => file.id).filter((id): id is string => Boolean(id))));
    const storedFiles = await prisma.file.findMany({
      where: { projectId, id: { in: fileIds } },
      select: { id: true, name: true, relativePath: true, path: true, extension: true, size: true },
    });

    const analyzedFiles = await Promise.all(storedFiles.map(async (file) => {
      const matchedFile: MatchedFile = { ...file };
      const understanding = await inferDocumentUnderstanding(matchedFile, { deep: true });
      return { file: matchedFile, searchText: buildFileUnderstandingSearchText(matchedFile, understanding) };
    }));

    const matches: ClientDataMatch[] = [];
    for (const group of preparedGroups) {
      for (const { file, searchText } of analyzedFiles) {
        const candidates = group.requirements
          .map((requirement) => {
            const matchedTokens = requirement.tokens.filter((token) => searchText.includes(token));
            return {
              ...requirement,
              matchedTokens,
              score: Math.round((matchedTokens.length / requirement.tokens.length) * 100),
            };
          })
          .filter((requirement) => (
            requirement.matchedTokens.length >= Math.min(requirement.tokens.length, 2)
            && requirement.score >= 50
          ))
          .sort((first, second) => second.score - first.score);

        const bestMatch = candidates[0];
        if (!bestMatch) continue;

        matches.push({
          groupId: group.id,
          fileId: file.id,
          requirementId: bestMatch.id,
          requirementName: bestMatch.name,
          matchScore: bestMatch.score,
          matchReason: `AI matched ${bestMatch.matchedTokens.length}/${bestMatch.tokens.length} requirement keywords`,
        });
      }
    }

    res.json({ message: 'Client data AI matching completed', data: matches });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to match client data' });
  }
};

export const previewChecklistMatchedFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId, fileId } = req.params;
    const file = await prisma.file.findFirst({
      where: { id: fileId, projectId },
      select: { name: true, path: true },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const filePath = path.resolve(file.path);
    try {
      await fs.access(filePath);
    } catch {
      res.status(200).type('html').send(`
        <!doctype html>
        <html>
          <head><title>File Preview</title></head>
          <body style="font-family: system-ui, sans-serif; background: #0f172a; color: #e5e7eb; padding: 32px;">
            <h1 style="font-size: 20px;">File preview unavailable</h1>
            <p>The matched file record exists, but the file was not found on disk.</p>
            <p><strong>${file.name}</strong></p>
          </body>
        </html>
      `);
      return;
    }

    res.setHeader('Content-Disposition', `inline; filename="${file.name.replace(/"/g, '')}"`);
    res.sendFile(filePath);
  } catch (error) {
    res.status(500).json({ error: 'Failed to open file preview' });
  }
};
