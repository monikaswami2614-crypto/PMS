'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { getProjectSource, useProjects } from '@/context/ProjectContext';
import {
  CertificationPhase,
  ChecklistStatusesByScope,
  SubmissionRound,
  checklistStatusChangeEvent,
  feasibilitySelectionChangeEvent,
  getCertificationScopeKey,
  getManualPointsScopeStorageKey,
  getReviewResponseScopeStorageKey,
  getSelectedCreditsScopeStorageKey,
  readChecklistStatuses,
  updateChecklistStatusesForScope,
} from '@/utils/certificationWorkflow';
import styles from './page.module.css';

type ChecklistType = 'nb' | 'gh';
type RequirementStatus = 'pending' | 'missing' | 'checked' | 'overridden';

type ChecklistSheet = {
  name: string;
  rows: string[][];
};

type ChecklistWorkbook = {
  name: string;
  fileName: string;
  path: string;
  size: number;
  modifiedAt: string;
  sheets: ChecklistSheet[];
};

type ReviewRequirement = {
  id: string;
  status: RequirementStatus;
};

type ReviewItem = {
  creditName: string;
  subCreditName: string;
  preRequirements: ReviewRequirement[];
  finalRequirements: ReviewRequirement[];
};

type ReviewResponse = {
  project: {
    id: string;
    type: 'NB' | 'GH';
  };
  items: ReviewItem[];
};

type UploadedResponseCell = {
  expected: string[];
  pending: string[];
  denied: string[];
};

type UploadedResponseRecord = {
  fileName: string;
  parsedRows: string[][];
  mappedResponses: Record<string, UploadedResponseCell>;
  uploadedAt: string;
  autoSelectedCreditKeys?: string[];
};

type UploadedResponsesByScope = Record<string, UploadedResponseRecord>;

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:5000';

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
  return `${(bytes / 1024 ** index).toFixed(1)} ${sizes[index]}`;
};

const isFeasibilitySheet = (sheet: ChecklistSheet): boolean => (
  /feasib/i.test(sheet.name) || sheet.rows.some((row) => row.some((cell) => /feasib/i.test(cell)))
);

const getDefaultSheetIndex = (sheets: ChecklistSheet[], checklistType: ChecklistType): number => {
  if (checklistType === 'gh') {
    const ghIndex = sheets.findIndex((sheet) => sheet.name.trim().toLowerCase() === 'checklist gh v3');
    return ghIndex >= 0 ? ghIndex : 0;
  }

  const index = sheets.findIndex(isFeasibilitySheet);
  return index >= 0 ? index : 0;
};

const selectedCreditsStorageKey = 'pms-feasibility-selected-credit-keys-by-project';
const manualAchievableStorageKey = 'pms-feasibility-manual-achievable-by-project';
const manualDoubtfulStorageKey = 'pms-feasibility-manual-doubtful-by-project';
const reviewResponseStorageKey = 'pms-feasibility-review-response-by-project';
const currentStateStorageKey = 'feasibility_current_state';
type SelectedCreditsByProject = Record<ChecklistType, Record<string, Record<string, boolean>>>;
type ManualAchievableByProject = Record<ChecklistType, Record<string, Record<string, number>>>;
type ManualDoubtfulByProject = Record<ChecklistType, Record<string, Record<string, number>>>;

const creditPattern = /\b(?:[A-Z]{1,4}\s*(?:MR|CR|Cr|Credit|Mandatory\s+Requirement)\s*\d+(?:\.\d+)?|SA\s*Credit\s*\d+|Site\s*Credit\s*\d+|SSP\s*MR\s*\d+|ID\s*(?:Cr|Credit)\s*\d+(?:\.\d+)?|Credit\s*\d+(?:\.\d+)?)\b/i;

const isCreditRow = (row: string[], rowIndex: number): boolean => {
  const normalizedRow = normalizeHeader(row.join(' '));
  if (normalizedRow.includes('credit name') || normalizedRow.includes('points available')) return false;
  if (rowIndex <= 1 && !creditPattern.test(row.join(' '))) return false;
  const rowText = row.join(' ');
  return creditPattern.test(rowText);
};

const getCreditLabel = (row: string[]): string => (
  row.find((cell) => creditPattern.test(cell))
  || row.join(' ').match(creditPattern)?.[0]
  || row.find((cell) => cell.trim())
  || 'credit'
);

const normalizeCreditKey = (value: string): string => (
  (value
    .toLowerCase()
    .replace(/\bmandatory\s+requirements?\b/g, 'mr')
    .replace(/\bcredits?\b/g, 'cr')
    .match(/[a-z]+|\d+/g) ?? [])
    .map((token) => {
      if (token === 'rwh') return 'rhw';
      if (token === 'credit' || token === 'credits') return 'cr';
      if (token === 'mandatory' || token === 'requirement' || token === 'requirements') return 'mr';
      return token;
    })
    .join('')
);

const getCreditKey = (row: string[]): string => normalizeCreditKey(getCreditLabel(row));

const normalizeHeader = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const emptyResponseCell = (): UploadedResponseCell => ({ expected: [], pending: [], denied: [] });

const getResponseStatus = (value: string): keyof UploadedResponseCell | null => {
  const normalized = normalizeHeader(value);
  if (normalized.includes('expected')) return 'expected';
  if (normalized.includes('pending')) return 'pending';
  if (normalized.includes('denied')) return 'denied';
  return null;
};

const getCreditMatchKeys = (creditCode: string, rowText: string): string[] => {
  const keys = new Set<string>();
  const rowCreditCodes = Array.from(rowText.matchAll(new RegExp(creditPattern.source, 'gi')))
    .map((match) => match[0]);
  [creditCode, ...rowCreditCodes].forEach((value) => {
    const normalized = normalizeCreditKey(value);
    if (normalized) keys.add(normalized);
  });
  return Array.from(keys);
};

const isReviewResponseValue = (value: string): boolean => /^(?:y|n|\d+(?:\.\d+)?)$/i.test(value.trim());

const addResponseValue = (cell: UploadedResponseCell, status: keyof UploadedResponseCell, value: string) => {
  const cleaned = value.trim();
  if (isReviewResponseValue(cleaned) && !cell[status].includes(cleaned)) cell[status].push(cleaned);
};

const sanitizeResponseCell = (cell: UploadedResponseCell): UploadedResponseCell => ({
  expected: (cell.expected ?? []).filter(isReviewResponseValue),
  pending: (cell.pending ?? []).filter(isReviewResponseValue),
  denied: (cell.denied ?? []).filter(isReviewResponseValue),
});

const addResponseForKeys = (
  result: Record<string, UploadedResponseCell>,
  keys: string[],
  status: keyof UploadedResponseCell,
  value: string,
) => {
  keys.forEach((key) => {
    result[key] = result[key] ?? emptyResponseCell();
    addResponseValue(result[key], status, value);
  });
};

const getPdfStatusValuesBeforeCredit = (cellsBeforeCredit: string[]): Partial<Record<keyof UploadedResponseCell, string>> => {
  const values = cellsBeforeCredit
    .map((cell) => cell.trim())
    .filter(isReviewResponseValue);

  if (values.length >= 3) {
    return { expected: values[0], pending: values[1], denied: values[2] };
  }

  if (values.length === 2) {
    return { expected: values[0], pending: values[1] };
  }

  if (values.length === 1) {
    return { pending: values[0] };
  }

  return {};
};

const parseFlattenedReviewResponseRows = (rows: string[][]): Record<string, UploadedResponseCell> => {
  const result: Record<string, UploadedResponseCell> = {};
  const lines = rows.map((row) => row.join(' ').trim()).filter(Boolean);

  lines.forEach((line, lineIndex) => {
    const creditMatch = line.match(creditPattern);
    if (!creditMatch) return;

    const creditCode = creditMatch[0];
    const keys = getCreditMatchKeys(creditCode, line);
    const nearbyValues = lines
      .slice(Math.max(0, lineIndex - 3), lineIndex)
      .filter(isReviewResponseValue);
    const statusValues = getPdfStatusValuesBeforeCredit(nearbyValues);

    (Object.entries(statusValues) as Array<[keyof UploadedResponseCell, string | undefined]>).forEach(([status, value]) => {
      if (value) addResponseForKeys(result, keys, status, value);
    });
  });

  return result;
};

const parseReviewResponseRows = (rows: string[][]): Record<string, UploadedResponseCell> => {
  const headerIndex = rows.findIndex((row) => {
    const statuses = new Set(row.map(getResponseStatus).filter(Boolean));
    return statuses.has('expected') && statuses.has('pending') && statuses.has('denied');
  });
  const header = headerIndex >= 0 ? rows[headerIndex].map(normalizeHeader) : [];
  const creditColumn = header.findIndex((cell) => /credit|code|mr|cr/.test(cell));
  const responseColumns: Record<keyof UploadedResponseCell, number> = {
    expected: header.findIndex((cell) => cell.includes('expected')),
    pending: header.findIndex((cell) => cell.includes('pending')),
    denied: header.findIndex((cell) => cell.includes('denied')),
  };
  const result: Record<string, UploadedResponseCell> = {};

  rows.slice(headerIndex >= 0 ? headerIndex + 1 : 0).forEach((row) => {
    const rowText = row.join(' ').trim();
    if (!rowText) return;

    const creditText = creditColumn >= 0 ? row[creditColumn] ?? '' : rowText;
    const creditMatch = creditText.match(creditPattern) ?? rowText.match(creditPattern);
    if (!creditMatch) return;

    const creditCode = creditMatch[0];
    const keys = getCreditMatchKeys(creditCode, rowText);
    if (headerIndex >= 0) {
      keys.forEach((key) => {
        result[key] = result[key] ?? emptyResponseCell();
        (Object.entries(responseColumns) as Array<[keyof UploadedResponseCell, number]>).forEach(([status, index]) => {
          const value = index >= 0 ? (row[index] ?? '').trim() : '';
          addResponseValue(result[key], status, value);
        });
      });
      return;
    }

    const creditCellIndex = row.findIndex((cell) => creditPattern.test(cell));
    const statusValues = getPdfStatusValuesBeforeCredit(creditCellIndex >= 0 ? row.slice(0, creditCellIndex) : []);
    (Object.entries(statusValues) as Array<[keyof UploadedResponseCell, string | undefined]>).forEach(([status, value]) => {
      if (value) addResponseForKeys(result, keys, status, value);
    });
  });

  if (headerIndex < 0) {
    const flattenedResult = parseFlattenedReviewResponseRows(rows);
    Object.entries(flattenedResult).forEach(([key, responseCell]) => {
      result[key] = result[key] ?? emptyResponseCell();
      (['expected', 'pending', 'denied'] as Array<keyof UploadedResponseCell>).forEach((status) => {
        responseCell[status].forEach((value) => addResponseValue(result[key], status, value));
      });
    });
  }

  return result;
};

const getPointColumnIndexes = (sheet: ChecklistSheet): { available: number; achievable: number; doubtful: number; notTargeted: number } => {
  const headerRow = sheet.rows.find((row) => row.some((cell) => normalizeHeader(cell).includes('points available'))) ?? [];
  const findIndex = (labels: string[]) => headerRow.findIndex((cell) => {
    const normalizedCell = normalizeHeader(cell);
    return labels.some((label) => normalizedCell.includes(label));
  });

  return {
    available: findIndex(['points available']),
    achievable: findIndex(['points achievable', 'points targeted']),
    doubtful: findIndex(['doubtful points', 'doubtful']),
    notTargeted: findIndex(['not targeted', 'not attempt']),
  };
};

const isNumericCell = (value: string): boolean => /^\d+(?:\.\d+)?$/.test(value.trim());

type PointTotals = {
  available: number;
  achievable: number;
  doubtful: number;
  notTargeted: number;
};

const getCreditRowValue = (row: string[], sheet: ChecklistSheet, key: 'available' | 'achievable' | 'doubtful'): string => {
  const pointColumns = getPointColumnIndexes(sheet);
  const index = pointColumns[key];
  return index >= 0 ? row[index] ?? '' : '';
};

const isRequiredRow = (row: string[], sheet: ChecklistSheet): boolean => (
  normalizeHeader(getCreditRowValue(row, sheet, 'available')).includes('required')
);

const getAvailablePoints = (row: string[], sheet: ChecklistSheet): number | null => {
  const value = getCreditRowValue(row, sheet, 'available').trim();
  if (!isNumericCell(value)) return null;
  return Math.min(100, Number(value));
};

const getReviewCreditStatus = (
  item: ReviewItem | undefined,
  phase: CertificationPhase,
  submissionRound: SubmissionRound,
  scopedStatuses: Record<string, RequirementStatus>,
): 'checked' | 'missing' | 'pending' => {
  if (!item) return 'missing';
  const requirements = phase === 'pre' ? item.preRequirements : item.finalRequirements;
  if (requirements.length === 0) return 'missing';
  const statuses = requirements.map((requirement) => (
    scopedStatuses[requirement.id]
      ?? (submissionRound === 'first' ? requirement.status : 'pending')
  ));
  const fulfilledCount = statuses.filter((status) => status === 'checked' || status === 'overridden').length;
  if (fulfilledCount === statuses.length) return 'checked';
  if (statuses.some((status) => status === 'pending') || fulfilledCount > 0) return 'pending';
  return 'missing';
};

const clampAchievablePoints = (value: number, availablePoints: number): number => (
  Math.max(0, Math.min(availablePoints, Number.isFinite(value) ? value : 0))
);

const getRating = (points: number): string => {
  if (points >= 75) return 'Platinum';
  if (points >= 60) return 'Gold';
  if (points >= 50) return 'Silver';
  if (points >= 40) return 'Certified';
  return 'Not Rated';
};

const getDisplayCell = (
  sheet: ChecklistSheet,
  row: string[],
  rowIndex: number,
  cellIndex: number,
  cell: string,
  displayValues: { achievable?: string; doubtful?: string; notTargeted?: string } = {},
): string => {
  const pointColumns = getPointColumnIndexes(sheet);
  const isTotalMaximumPointsRow = row.some((value) => /total maximum points/i.test(value));

  if (cellIndex === pointColumns.available && isTotalMaximumPointsRow && Number(cell) > 100) {
    return '100';
  }

  if (cellIndex === pointColumns.achievable && displayValues.achievable !== undefined) return displayValues.achievable;
  if (cellIndex === pointColumns.doubtful && displayValues.doubtful !== undefined) return displayValues.doubtful;

  if (cellIndex === pointColumns.notTargeted && displayValues.notTargeted !== undefined) return displayValues.notTargeted;

  return cell;
};

const isSectionRow = (row: string[], rowIndex: number): boolean => {
  if (rowIndex <= 1 || isCreditRow(row, rowIndex)) return false;
  const rowText = normalizeHeader(row.join(' '));
  const knownSection = [
    'sustainable architecture and design',
    'sustainable design',
    'site selection and planning',
    'water conservation',
    'water efficiency',
    'energy efficiency',
    'building materials and resources',
    'indoor environmental quality',
    'innovation and development',
    'innovation and decarbonisation',
  ].some((sectionName) => rowText.includes(sectionName));

  return knownSection || /\bmax(?:imum)?\s+\d+\s+points?\b/i.test(row.join(' '));
};

const isSubtotalRow = (row: string[], rowIndex: number, sheet: ChecklistSheet): boolean => {
  if (rowIndex <= 1 || isCreditRow(row, rowIndex) || isSectionRow(row, rowIndex)) return false;

  const pointColumns = getPointColumnIndexes(sheet);
  const pointColumnSet = new Set(Object.values(pointColumns).filter((index) => index >= 0));
  const hasPointNumber = Object.values(pointColumns).some((index) => index >= 0 && isNumericCell(row[index] ?? ''));
  if (!hasPointNumber) return false;

  return row.every((cell, index) => {
    const trimmed = cell.trim();
    return trimmed === '' || pointColumnSet.has(index) || /total/i.test(trimmed);
  });
};

export default function FeasibilityPage() {
  const { projects, setSelectedProject } = useProjects();
  const [checklistType, setChecklistType] = useState<ChecklistType>('nb');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [workbook, setWorkbook] = useState<ChecklistWorkbook | null>(null);
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isReviewLoading, setIsReviewLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedCredits, setSelectedCredits] = useState<SelectedCreditsByProject>({ nb: {}, gh: {} });
  const [manualAchievable, setManualAchievable] = useState<ManualAchievableByProject>({ nb: {}, gh: {} });
  const [manualDoubtful, setManualDoubtful] = useState<ManualDoubtfulByProject>({ nb: {}, gh: {} });
  const [reviewResponses, setReviewResponses] = useState<UploadedResponsesByScope>({});
  const [uploadMessage, setUploadMessage] = useState('');
  const [hydratedScopeKey, setHydratedScopeKey] = useState('');
  const [reviewFileMenu, setReviewFileMenu] = useState<{ x: number; y: number } | null>(null);
  const [certificationPhase, setCertificationPhase] = useState<CertificationPhase>('pre');
  const [submissionRound, setSubmissionRound] = useState<SubmissionRound>('first');
  const [workflowStatuses, setWorkflowStatuses] = useState<ChecklistStatusesByScope>({});

  const projectOptions = useMemo(() => (
    projects.filter((project) => {
      if (project.id === 'all') return false;
      const source = getProjectSource(project);
      return checklistType === 'gh' ? source === 'GREEN_HOMES' : source === 'NB';
    })
  ), [checklistType, projects]);

  useEffect(() => {
    try {
      const storedState = window.localStorage.getItem(currentStateStorageKey);
      const parsedState = storedState ? JSON.parse(storedState) as Partial<{
        selectedProjectId: string;
        checklistType: ChecklistType;
        certificationPhase: CertificationPhase;
        submissionRound: SubmissionRound;
      }> : null;
      if (parsedState?.checklistType === 'nb' || parsedState?.checklistType === 'gh') {
        setChecklistType(parsedState.checklistType);
      }
      if (parsedState?.selectedProjectId) {
        setSelectedProjectId(parsedState.selectedProjectId);
      }
      if (parsedState?.certificationPhase === 'pre' || parsedState?.certificationPhase === 'final') {
        setCertificationPhase(parsedState.certificationPhase);
      }
      if (parsedState?.submissionRound === 'first' || parsedState?.submissionRound === 'second') {
        setSubmissionRound(parsedState.submissionRound);
      }
    } catch {
      window.localStorage.removeItem(currentStateStorageKey);
    }

    try {
      const storedChecks = window.localStorage.getItem(selectedCreditsStorageKey);
      const parsed = storedChecks ? JSON.parse(storedChecks) as Partial<SelectedCreditsByProject> : null;
      setSelectedCredits({ nb: parsed?.nb ?? {}, gh: parsed?.gh ?? {} });
    } catch {
      window.localStorage.removeItem(selectedCreditsStorageKey);
      setSelectedCredits({ nb: {}, gh: {} });
    }

    try {
      const storedManual = window.localStorage.getItem(manualAchievableStorageKey);
      const parsed = storedManual ? JSON.parse(storedManual) as Partial<ManualAchievableByProject> : null;
      setManualAchievable({ nb: parsed?.nb ?? {}, gh: parsed?.gh ?? {} });
    } catch {
      window.localStorage.removeItem(manualAchievableStorageKey);
      setManualAchievable({ nb: {}, gh: {} });
    }

    try {
      const storedDoubtful = window.localStorage.getItem(manualDoubtfulStorageKey);
      const parsed = storedDoubtful ? JSON.parse(storedDoubtful) as Partial<ManualDoubtfulByProject> : null;
      setManualDoubtful({ nb: parsed?.nb ?? {}, gh: parsed?.gh ?? {} });
    } catch {
      window.localStorage.removeItem(manualDoubtfulStorageKey);
      setManualDoubtful({ nb: {}, gh: {} });
    }

    try {
      const storedResponses = window.localStorage.getItem(reviewResponseStorageKey);
      setReviewResponses(storedResponses ? JSON.parse(storedResponses) as UploadedResponsesByScope : {});
    } catch {
      window.localStorage.removeItem(reviewResponseStorageKey);
      setReviewResponses({});
    }

    const loadWorkflowStatuses = () => setWorkflowStatuses(readChecklistStatuses());
    loadWorkflowStatuses();
    window.addEventListener('storage', loadWorkflowStatuses);
    window.addEventListener(checklistStatusChangeEvent, loadWorkflowStatuses);
    return () => {
      window.removeEventListener('storage', loadWorkflowStatuses);
      window.removeEventListener(checklistStatusChangeEvent, loadWorkflowStatuses);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(selectedCreditsStorageKey, JSON.stringify(selectedCredits));
    window.dispatchEvent(new CustomEvent(feasibilitySelectionChangeEvent));
  }, [selectedCredits]);

  useEffect(() => {
    window.localStorage.setItem(manualAchievableStorageKey, JSON.stringify(manualAchievable));
  }, [manualAchievable]);

  useEffect(() => {
    window.localStorage.setItem(manualDoubtfulStorageKey, JSON.stringify(manualDoubtful));
  }, [manualDoubtful]);

  useEffect(() => {
    window.localStorage.setItem(reviewResponseStorageKey, JSON.stringify(reviewResponses));
  }, [reviewResponses]);

  const currentScopeKey = selectedProjectId
    ? getCertificationScopeKey(selectedProjectId, checklistType, certificationPhase, submissionRound)
    : '';

  useEffect(() => {
    if (!selectedProjectId) return;
    window.localStorage.setItem(currentStateStorageKey, JSON.stringify({
      selectedProjectId,
      checklistType,
      certificationPhase,
      submissionRound,
    }));
  }, [certificationPhase, checklistType, selectedProjectId, submissionRound]);

  useEffect(() => {
    if (!currentScopeKey || !selectedProjectId) return;
    setHydratedScopeKey('');

    try {
      const scopedSelected = window.localStorage.getItem(getSelectedCreditsScopeStorageKey(currentScopeKey));
      if (scopedSelected) {
        const parsed = JSON.parse(scopedSelected) as Record<string, boolean>;
        setSelectedCredits((current) => ({
          ...current,
          [checklistType]: {
            ...(current[checklistType] ?? {}),
            [currentScopeKey]: parsed,
          },
        }));
      }
    } catch {
      window.localStorage.removeItem(getSelectedCreditsScopeStorageKey(currentScopeKey));
    }

    try {
      const scopedManual = window.localStorage.getItem(getManualPointsScopeStorageKey(currentScopeKey));
      if (scopedManual) {
        const parsed = JSON.parse(scopedManual) as Partial<{ achievable: Record<string, number>; doubtful: Record<string, number> }>;
        setManualAchievable((current) => ({
          ...current,
          [checklistType]: {
            ...(current[checklistType] ?? {}),
            [currentScopeKey]: parsed.achievable ?? {},
          },
        }));
        setManualDoubtful((current) => ({
          ...current,
          [checklistType]: {
            ...(current[checklistType] ?? {}),
            [currentScopeKey]: parsed.doubtful ?? {},
          },
        }));
      }
    } catch {
      window.localStorage.removeItem(getManualPointsScopeStorageKey(currentScopeKey));
    }

    try {
      const scopedResponse = window.localStorage.getItem(getReviewResponseScopeStorageKey(currentScopeKey));
      if (scopedResponse) {
        const parsed = JSON.parse(scopedResponse) as UploadedResponseRecord;
        setReviewResponses((current) => ({ ...current, [currentScopeKey]: parsed }));
      } else if (submissionRound === 'second') {
        const firstSubmissionScopeKey = getCertificationScopeKey(
          selectedProjectId,
          checklistType,
          certificationPhase,
          'first',
        );
        const firstSubmissionResponse = window.localStorage.getItem(
          getReviewResponseScopeStorageKey(firstSubmissionScopeKey),
        );
        if (firstSubmissionResponse) {
          const parsed = JSON.parse(firstSubmissionResponse) as UploadedResponseRecord;
          setReviewResponses((current) => ({ ...current, [firstSubmissionScopeKey]: parsed }));
        }
      }
    } catch {
      window.localStorage.removeItem(getReviewResponseScopeStorageKey(currentScopeKey));
    }
    setHydratedScopeKey(currentScopeKey);
  }, [certificationPhase, checklistType, currentScopeKey, selectedProjectId, submissionRound]);

  useEffect(() => {
    if (!currentScopeKey || !selectedProjectId || hydratedScopeKey !== currentScopeKey) return;
    const selectedForScope = selectedCredits[checklistType]?.[currentScopeKey] ?? {};
    window.localStorage.setItem(getSelectedCreditsScopeStorageKey(currentScopeKey), JSON.stringify(selectedForScope));
  }, [checklistType, currentScopeKey, hydratedScopeKey, selectedCredits, selectedProjectId]);

  useEffect(() => {
    if (!currentScopeKey || !selectedProjectId || hydratedScopeKey !== currentScopeKey) return;
    window.localStorage.setItem(getManualPointsScopeStorageKey(currentScopeKey), JSON.stringify({
      achievable: manualAchievable[checklistType]?.[currentScopeKey] ?? {},
      doubtful: manualDoubtful[checklistType]?.[currentScopeKey] ?? {},
    }));
  }, [checklistType, currentScopeKey, hydratedScopeKey, manualAchievable, manualDoubtful, selectedProjectId]);

  useEffect(() => {
    if (!currentScopeKey || hydratedScopeKey !== currentScopeKey) return;
    const responseForScope = reviewResponses[currentScopeKey];
    if (responseForScope) {
      window.localStorage.setItem(getReviewResponseScopeStorageKey(currentScopeKey), JSON.stringify(responseForScope));
    }
  }, [currentScopeKey, hydratedScopeKey, reviewResponses]);

  useEffect(() => {
    setSelectedProjectId((currentProjectId) => {
      if (projectOptions.some((project) => project.id === currentProjectId)) return currentProjectId;
      try {
        const storedState = window.localStorage.getItem(currentStateStorageKey);
        const parsedState = storedState ? JSON.parse(storedState) as Partial<{ selectedProjectId: string; checklistType: ChecklistType }> : null;
        if (parsedState?.checklistType === checklistType && projectOptions.some((project) => project.id === parsedState.selectedProjectId)) {
          return parsedState.selectedProjectId ?? '';
        }
      } catch {
        window.localStorage.removeItem(currentStateStorageKey);
      }
      return projectOptions[0]?.id ?? '';
    });
  }, [projectOptions]);

  useEffect(() => {
    if (selectedProjectId) {
      setSelectedProject(selectedProjectId);
    }
  }, [selectedProjectId, setSelectedProject]);

  useEffect(() => {
    const controller = new AbortController();

    const loadWorkbook = async () => {
      setIsLoading(true);
      setError('');
      setWorkbook(null);
      setActiveSheetIndex(0);

      try {
        const response = await fetch(`${apiBase}/api/checklists/${checklistType}`, {
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load feasibility checklist');
        }

        const nextWorkbook = payload?.data ?? null;
        setWorkbook(nextWorkbook);
        setActiveSheetIndex(nextWorkbook ? getDefaultSheetIndex(nextWorkbook.sheets, checklistType) : 0);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Failed to load feasibility checklist');
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    loadWorkbook();
    return () => controller.abort();
  }, [checklistType]);

  useEffect(() => {
    if (!selectedProjectId) {
      setReview(null);
      return;
    }

    const controller = new AbortController();

    const loadReview = async () => {
      setIsReviewLoading(true);
      setError('');

      try {
        const response = await fetch(`${apiBase}/api/checklists/review/${selectedProjectId}`, {
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load checklist review status');
        }

        setReview(payload?.data ?? null);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setReview(null);
          setError(err instanceof Error ? err.message : 'Failed to load checklist review status');
        }
      } finally {
        if (!controller.signal.aborted) setIsReviewLoading(false);
      }
    };

    loadReview();
    return () => controller.abort();
  }, [selectedProjectId]);

  const visibleSheets = useMemo(() => {
    if (!workbook) return [];
    if (checklistType === 'gh') {
      const ghSheet = workbook.sheets.find((sheet) => sheet.name.trim().toLowerCase() === 'checklist gh v3');
      return ghSheet ? [ghSheet] : [];
    }

    const feasibilitySheets = workbook.sheets.filter(isFeasibilitySheet);
    return feasibilitySheets.length > 0 ? feasibilitySheets : workbook.sheets;
  }, [checklistType, workbook]);

  const activeSheet = workbook?.sheets[activeSheetIndex];
  const reviewItemsByCreditKey = useMemo(() => {
    const items = review?.items ?? [];
    return new Map(items.flatMap((item) => {
      const keys = new Set([
        normalizeCreditKey(item.creditName),
        normalizeCreditKey(`${item.creditName} ${item.subCreditName}`),
      ]);
      return Array.from(keys).map((key) => [key, item] as const);
    }));
  }, [review]);
  const activeCreditKeys = useMemo(() => {
    if (!activeSheet) return [];
    return Array.from(new Set(activeSheet.rows
      .map((row, rowIndex) => (isCreditRow(row, rowIndex) ? getCreditKey(row) : ''))
      .filter(Boolean)));
  }, [activeSheet]);
  const selectedCreditsForProject = selectedCredits[checklistType]?.[currentScopeKey] ?? {};
  const manualAchievableForProject = manualAchievable[checklistType]?.[currentScopeKey] ?? {};
  const manualDoubtfulForProject = manualDoubtful[checklistType]?.[currentScopeKey] ?? {};
  const firstSubmissionScopeKey = selectedProjectId
    ? getCertificationScopeKey(selectedProjectId, checklistType, certificationPhase, 'first')
    : '';
  const currentReviewResponseScopeKey = reviewResponses[currentScopeKey]
    ? currentScopeKey
    : submissionRound === 'second'
      ? firstSubmissionScopeKey
      : currentScopeKey;
  const currentReviewResponse = currentReviewResponseScopeKey
    ? reviewResponses[currentReviewResponseScopeKey]
    : undefined;
  const reviewResponsesForProject = currentReviewResponse?.mappedResponses ?? {};
  const scopedWorkflowStatuses = workflowStatuses[currentScopeKey] ?? {};
  const selectedCreditCount = activeCreditKeys.filter((key) => selectedCreditsForProject[key]).length;
  const areAllCreditsSelected = Boolean(selectedProjectId) && activeCreditKeys.length > 0 && selectedCreditCount === activeCreditKeys.length;

  const getMatchedReviewItem = (row: string[]): ReviewItem | undefined => {
    const rowCreditKey = getCreditKey(row);
    return reviewItemsByCreditKey.get(rowCreditKey)
      ?? Array.from(reviewItemsByCreditKey.entries()).find(([key]) => key === rowCreditKey || key.endsWith(rowCreditKey))?.[1];
  };

  const getAchievablePoints = (row: string[], rowIndex: number, sheet: ChecklistSheet): string => {
    if (!isCreditRow(row, rowIndex)) return getCreditRowValue(row, sheet, 'achievable');
    if (isRequiredRow(row, sheet)) return 'Required';

    const availablePoints = getAvailablePoints(row, sheet);
    if (availablePoints === null) return getCreditRowValue(row, sheet, 'achievable');

    const creditKey = getCreditKey(row);
    const manualValue = manualAchievableForProject[creditKey];
    if (typeof manualValue === 'number') return String(clampAchievablePoints(manualValue, availablePoints));

    const reviewStatus = getReviewCreditStatus(
      getMatchedReviewItem(row),
      certificationPhase,
      submissionRound,
      scopedWorkflowStatuses,
    );
    return reviewStatus === 'checked' ? String(availablePoints) : '0';
  };

  const getNotTargetedPoints = (row: string[], rowIndex: number, sheet: ChecklistSheet): string => {
    if (!isCreditRow(row, rowIndex)) return '';
    if (isRequiredRow(row, sheet)) return 'Required';

    const availablePoints = getAvailablePoints(row, sheet);
    if (availablePoints === null) return '';

    const achievablePoints = Number(getAchievablePoints(row, rowIndex, sheet));
    const doubtfulPoints = Number(getDoubtfulPoints(row, rowIndex, sheet));
    return String(Math.max(
      0,
      availablePoints
        - clampAchievablePoints(achievablePoints, availablePoints)
        - clampAchievablePoints(doubtfulPoints, availablePoints),
    ));
  };

  const getDoubtfulPoints = (row: string[], rowIndex: number, sheet: ChecklistSheet): string => {
    if (!isCreditRow(row, rowIndex)) return getCreditRowValue(row, sheet, 'doubtful');
    if (isRequiredRow(row, sheet)) return 'Required';

    const availablePoints = getAvailablePoints(row, sheet);
    if (availablePoints === null) return getCreditRowValue(row, sheet, 'doubtful');

    const creditKey = getCreditKey(row);
    const manualValue = manualDoubtfulForProject[creditKey];
    if (typeof manualValue === 'number') return String(clampAchievablePoints(manualValue, availablePoints));

    const reviewStatus = getReviewCreditStatus(
      getMatchedReviewItem(row),
      certificationPhase,
      submissionRound,
      scopedWorkflowStatuses,
    );
    return reviewStatus === 'pending' ? String(availablePoints) : '0';
  };

  const subtotalRows = useMemo(() => {
    const rows = new Map<number, PointTotals>();
    if (!activeSheet) return rows;

    let activeSectionTotals: PointTotals | null = null;

    activeSheet.rows.forEach((row, rowIndex) => {
      if (isSectionRow(row, rowIndex)) {
        activeSectionTotals = { available: 0, achievable: 0, doubtful: 0, notTargeted: 0 };
        return;
      }

      if (activeSectionTotals && isCreditRow(row, rowIndex) && !isRequiredRow(row, activeSheet)) {
        const availablePoints = getAvailablePoints(row, activeSheet);
        if (availablePoints === null) return;

        const achievablePoints = clampAchievablePoints(Number(getAchievablePoints(row, rowIndex, activeSheet)), availablePoints);
        const doubtfulPoints = clampAchievablePoints(Number(getDoubtfulPoints(row, rowIndex, activeSheet)), availablePoints);
        activeSectionTotals = {
          available: activeSectionTotals.available + availablePoints,
          achievable: activeSectionTotals.achievable + achievablePoints,
          doubtful: activeSectionTotals.doubtful + doubtfulPoints,
          notTargeted: activeSectionTotals.notTargeted + Math.max(0, availablePoints - achievablePoints - doubtfulPoints),
        };
        return;
      }

      if (activeSectionTotals && isSubtotalRow(row, rowIndex, activeSheet)) {
        rows.set(rowIndex, activeSectionTotals);
        activeSectionTotals = null;
      }
    });

    return rows;
  }, [
    activeSheet,
    certificationPhase,
    manualAchievableForProject,
    manualDoubtfulForProject,
    reviewItemsByCreditKey,
    scopedWorkflowStatuses,
    submissionRound,
  ]);

  const summary = useMemo(() => {
    if (!activeSheet) return { available: 0, achievable: 0, doubtful: 0, notTargeted: 0, selected: 0 };

    const totals = activeSheet.rows.reduce((nextTotals, row, rowIndex) => {
      if (!isCreditRow(row, rowIndex) || isRequiredRow(row, activeSheet)) return nextTotals;

      const availablePoints = getAvailablePoints(row, activeSheet);
      if (availablePoints === null) return nextTotals;

      const achievablePoints = clampAchievablePoints(Number(getAchievablePoints(row, rowIndex, activeSheet)), availablePoints);
      const doubtfulPoints = clampAchievablePoints(Number(getDoubtfulPoints(row, rowIndex, activeSheet)), availablePoints);
      return {
        available: nextTotals.available + availablePoints,
        achievable: nextTotals.achievable + achievablePoints,
        doubtful: nextTotals.doubtful + doubtfulPoints,
        notTargeted: nextTotals.notTargeted + Math.max(0, availablePoints - achievablePoints - doubtfulPoints),
        selected: nextTotals.selected + (selectedCreditsForProject[getCreditKey(row)] ? 1 : 0),
      };
    }, { available: 0, achievable: 0, doubtful: 0, notTargeted: 0, selected: 0 });

    const cappedAvailable = Math.min(100, totals.available);
    const cappedAchievable = Math.min(cappedAvailable, totals.achievable);
    const cappedDoubtful = Math.min(cappedAvailable - cappedAchievable, totals.doubtful);
    return {
      ...totals,
      available: cappedAvailable,
      achievable: cappedAchievable,
      doubtful: cappedDoubtful,
      notTargeted: Math.max(0, cappedAvailable - cappedAchievable - cappedDoubtful),
    };
  }, [
    activeSheet,
    certificationPhase,
    manualAchievableForProject,
    manualDoubtfulForProject,
    reviewItemsByCreditKey,
    scopedWorkflowStatuses,
    selectedCreditsForProject,
    submissionRound,
  ]);

  const toggleAllCredits = () => {
    if (activeCreditKeys.length === 0 || !selectedProjectId) return;
    setSelectedCredits((current) => {
      const nextProjects = { ...(current[checklistType] ?? {}) };
      const nextForProject = { ...(nextProjects[currentScopeKey] ?? {}) };
      activeCreditKeys.forEach((key) => {
        nextForProject[key] = !areAllCreditsSelected;
      });
      return { ...current, [checklistType]: { ...nextProjects, [currentScopeKey]: nextForProject } };
    });
  };

  const updateManualAchievable = (row: string[], value: string) => {
    if (!selectedProjectId || !activeSheet) return;
    const availablePoints = getAvailablePoints(row, activeSheet);
    if (availablePoints === null) return;

    const creditKey = getCreditKey(row);
    const nextValue = clampAchievablePoints(Number(value), availablePoints);
    setManualAchievable((current) => {
      const nextType = { ...(current[checklistType] ?? {}) };
      const nextProject = { ...(nextType[currentScopeKey] ?? {}) };
      nextProject[creditKey] = nextValue;
      return { ...current, [checklistType]: { ...nextType, [currentScopeKey]: nextProject } };
    });
  };

  const updateManualDoubtful = (row: string[], value: string) => {
    if (!selectedProjectId || !activeSheet) return;
    const availablePoints = getAvailablePoints(row, activeSheet);
    if (availablePoints === null) return;

    const creditKey = getCreditKey(row);
    const nextValue = clampAchievablePoints(Number(value), availablePoints);
    setManualDoubtful((current) => {
      const nextType = { ...(current[checklistType] ?? {}) };
      const nextProject = { ...(nextType[currentScopeKey] ?? {}) };
      nextProject[creditKey] = nextValue;
      return { ...current, [checklistType]: { ...nextType, [currentScopeKey]: nextProject } };
    });
  };

  const getReviewResponseForRow = (row: string[]): UploadedResponseCell | null => {
    const creditCode = getCreditLabel(row);
    const keys = getCreditMatchKeys(creditCode, row.join(' '));
    const exactMatch = keys.map((key) => reviewResponsesForProject[key]).find(Boolean);
    if (exactMatch) return sanitizeResponseCell(exactMatch);

    const fuzzyKey = Object.keys(reviewResponsesForProject).find((responseKey) => (
      keys.some((key) => responseKey === key || responseKey.includes(key) || key.includes(responseKey))
    ));
    return fuzzyKey ? sanitizeResponseCell(reviewResponsesForProject[fuzzyKey]) : null;
  };

  const handleReviewResponseUpload = async (file: File | null) => {
    if (!file || !selectedProjectId) return;
    setUploadMessage('');

    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.doc') || fileName.endsWith('.docx')) {
      setUploadMessage('Word upload accepted. This version extracts response columns from Excel/CSV/PDF files.');
      return;
    }

    try {
      const response = await fetch(`${apiBase}/api/checklists/review-response/parse?fileName=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: await file.arrayBuffer(),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setUploadMessage(payload?.error || 'Failed to parse review response file.');
        return;
      }

      const rows = Array.isArray(payload?.data) ? payload.data as string[][] : [];
      const mapped = parseReviewResponseRows(rows);
      if (!currentScopeKey) return;

      const pendingCreditKeys = Object.entries(mapped)
        .filter(([, responseCell]) => responseCell.pending.some((value) => Number(value) > 0))
        .map(([creditKey]) => creditKey);
      let autoSelectedCreditKeys: string[] = [];
      if (pendingCreditKeys.length > 0) {
        const secondSubmissionScopeKey = getCertificationScopeKey(
          selectedProjectId,
          checklistType,
          certificationPhase,
          'second',
        );
        const storageKey = getSelectedCreditsScopeStorageKey(secondSubmissionScopeKey);
        let storedSelection: Record<string, boolean> = {};
        try {
          const stored = window.localStorage.getItem(storageKey);
          storedSelection = stored ? JSON.parse(stored) as Record<string, boolean> : {};
        } catch {
          window.localStorage.removeItem(storageKey);
        }
        autoSelectedCreditKeys = pendingCreditKeys.filter((creditKey) => !storedSelection[creditKey]);
        const nextSelection = { ...storedSelection };
        pendingCreditKeys.forEach((creditKey) => {
          nextSelection[creditKey] = true;
        });
        window.localStorage.setItem(storageKey, JSON.stringify(nextSelection));
        setSelectedCredits((current) => ({
          ...current,
          [checklistType]: {
            ...(current[checklistType] ?? {}),
            [secondSubmissionScopeKey]: nextSelection,
          },
        }));
        window.dispatchEvent(new CustomEvent(feasibilitySelectionChangeEvent));
      }

      setReviewResponses((current) => ({
        ...current,
        [currentScopeKey]: {
          fileName: file.name,
          parsedRows: rows,
          mappedResponses: mapped,
          uploadedAt: new Date().toISOString(),
          autoSelectedCreditKeys,
        },
      }));

      setUploadMessage(Object.keys(mapped).length > 0
        ? `Review response uploaded: ${file.name}. ${Object.keys(mapped).length} matched rows found.`
        : 'Review response uploaded, but no Expected/Pending/Denied data was found.');
    } catch {
      setUploadMessage('Failed to upload review response. Please confirm backend is running.');
    }
  };

  const deleteUploadedReviewResponse = () => {
    if (!currentReviewResponseScopeKey || !currentReviewResponse) return;
    const pendingCreditKeys = Object.entries(currentReviewResponse.mappedResponses)
      .filter(([, responseCell]) => responseCell.pending.some((value) => Number(value) > 0))
      .map(([creditKey]) => creditKey);
    const autoSelectedCreditKeys = currentReviewResponse.autoSelectedCreditKeys ?? pendingCreditKeys;
    const secondSubmissionScopeKey = getCertificationScopeKey(
      selectedProjectId,
      checklistType,
      certificationPhase,
      'second',
    );

    if (autoSelectedCreditKeys.length > 0) {
      const storageKey = getSelectedCreditsScopeStorageKey(secondSubmissionScopeKey);
      let storedSelection: Record<string, boolean> = {};
      try {
        const stored = window.localStorage.getItem(storageKey);
        storedSelection = stored ? JSON.parse(stored) as Record<string, boolean> : {};
      } catch {
        window.localStorage.removeItem(storageKey);
      }
      const nextSelection = { ...storedSelection };
      autoSelectedCreditKeys.forEach((creditKey) => {
        delete nextSelection[creditKey];
      });
      window.localStorage.setItem(storageKey, JSON.stringify(nextSelection));
      setSelectedCredits((current) => ({
        ...current,
        [checklistType]: {
          ...(current[checklistType] ?? {}),
          [secondSubmissionScopeKey]: nextSelection,
        },
      }));

      const requirementIds = new Set<string>();
      autoSelectedCreditKeys.forEach((creditKey) => {
        const matchedItem = reviewItemsByCreditKey.get(creditKey)
          ?? Array.from(reviewItemsByCreditKey.entries())
            .find(([itemKey]) => itemKey === creditKey || itemKey.endsWith(creditKey) || creditKey.endsWith(itemKey))?.[1];
        const requirements = certificationPhase === 'pre'
          ? matchedItem?.preRequirements
          : matchedItem?.finalRequirements;
        requirements?.forEach((requirement) => requirementIds.add(requirement.id));
      });
      updateChecklistStatusesForScope(
        secondSubmissionScopeKey,
        Object.fromEntries(Array.from(requirementIds).map((requirementId) => [requirementId, 'pending'])),
      );
      window.dispatchEvent(new CustomEvent(feasibilitySelectionChangeEvent));
    }

    setReviewResponses((current) => {
      const next = { ...current };
      delete next[currentReviewResponseScopeKey];
      return next;
    });
    window.localStorage.removeItem(getReviewResponseScopeStorageKey(currentReviewResponseScopeKey));
    setReviewFileMenu(null);
    setUploadMessage('Uploaded review response deleted.');
  };

  return (
    <div className={styles.container} onClick={() => setReviewFileMenu(null)}>
      <section className={`${styles.toolbar} glassmorphism`}>
        <div className={`${styles.topControls} ${styles.fullTopControls}`}>
          <select
            className={styles.projectSelect}
            value={selectedProjectId}
            onChange={(event) => {
              setSelectedProjectId(event.target.value);
              window.localStorage.setItem('certification-filtration-selected-project', event.target.value);
              window.localStorage.setItem('checklist-review-selected-project', event.target.value);
            }}
            aria-label="Select feasibility project"
          >
            {projectOptions.length === 0 ? (
              <option value="">No projects available</option>
            ) : projectOptions.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <select
            className={`${styles.projectSelect} ${styles.workflowSelect}`}
            value={certificationPhase}
            onChange={(event) => setCertificationPhase(event.target.value as CertificationPhase)}
            aria-label="Select certification phase"
          >
            <option value="pre">Pre Certification</option>
            <option value="final">Final Certification</option>
          </select>
          <select
            className={`${styles.projectSelect} ${styles.workflowSelect}`}
            value={submissionRound}
            onChange={(event) => setSubmissionRound(event.target.value as SubmissionRound)}
            aria-label="Select submission round"
          >
            <option value="first">First Submission</option>
            <option value="second">Second Submission</option>
          </select>
          <label className={styles.uploadButton}>
            <Upload size={15} />
            Upload Review Response
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.txt,.pdf,.doc,.docx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={!selectedProjectId}
              onChange={(event) => {
                void handleReviewResponseUpload(event.target.files?.[0] ?? null);
                event.target.value = '';
              }}
            />
          </label>
          <div className={styles.filterGroup} aria-label="Feasibility checklist filter">
            {(['nb', 'gh'] as ChecklistType[]).map((type) => (
              <button
                key={type}
                type="button"
                className={`${styles.filterButton} ${checklistType === type ? styles.activeFilter : ''}`}
                onClick={() => setChecklistType(type)}
              >
                <BadgeCheck size={15} />
                {type.toUpperCase()} Feasibility
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.summaryBar} glassmorphism`}>
        <span>Total Credits <strong>{activeCreditKeys.length}</strong></span>
        <span>Total Available Points <strong>{summary.available}</strong></span>
        <span>Total Achievable / Targeted Points <strong>{summary.achievable}</strong></span>
        <span>Total Doubtful Points <strong>{summary.doubtful}</strong></span>
        <span>Total Not Targeted Points <strong>{summary.notTargeted}</strong></span>
        <span>Rating <strong>{getRating(summary.achievable)}</strong></span>
        {currentReviewResponse?.fileName && (
          <span
            className={styles.reviewFilePill}
            onContextMenu={(event) => {
              event.preventDefault();
              setReviewFileMenu({ x: event.clientX, y: event.clientY });
            }}
          >
            Review Response <strong>{currentReviewResponse.fileName}</strong>
          </span>
        )}
        {uploadMessage && <span>{uploadMessage}</span>}
        {isReviewLoading && <span>Refreshing checklist status...</span>}
      </section>

      {reviewFileMenu && currentReviewResponse && (
        <div
          className={styles.reviewFileContextMenu}
          style={{ left: reviewFileMenu.x, top: reviewFileMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={deleteUploadedReviewResponse}>
            Delete uploaded file
          </button>
        </div>
      )}

      <section className={`${styles.panel} glassmorphism`}>
        {isLoading ? (
          <div className={styles.state}>
            <div>
              <Loader2 size={26} className="loading-icon" />
              <div>Loading feasibility checklist</div>
            </div>
          </div>
        ) : error ? (
          <div className={`${styles.state} ${styles.error}`}>{error}</div>
        ) : workbook && activeSheet ? (
          <>
            <div className={styles.workbookBar}>
              <div className={styles.workbookMeta}>
                <FileSpreadsheet size={18} />
                <div>
                  <strong>{workbook.fileName}</strong>
                  <span>{formatBytes(workbook.size)} - {new Date(workbook.modifiedAt).toLocaleString()}</span>
                </div>
              </div>
              <button
                type="button"
                className={styles.selectAllButton}
                onClick={toggleAllCredits}
                disabled={activeCreditKeys.length === 0 || !selectedProjectId}
              >
                {areAllCreditsSelected ? 'Clear All Credits' : 'Select All Credits'}
                <span>{selectedCreditCount}/{activeCreditKeys.length}</span>
              </button>
            </div>

            {visibleSheets.length > 1 && (
              <div className={styles.sheetTabs}>
                {visibleSheets.map((sheet) => {
                  const sourceIndex = workbook.sheets.findIndex((item) => item.name === sheet.name);
                  return (
                    <button
                      key={sheet.name}
                      type="button"
                      className={sourceIndex === activeSheetIndex ? styles.activeSheet : ''}
                      onClick={() => setActiveSheetIndex(sourceIndex)}
                    >
                      {sheet.name}
                    </button>
                  );
                })}
              </div>
            )}

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th
                      className={styles.feasibilityDataTitle}
                      colSpan={Math.max(1, ...activeSheet.rows.map((row) => row.length)) + 1}
                    >
                      Feasibility Checklist
                    </th>
                    <th className={styles.reviewDataTitle} colSpan={3}>Review Data</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSheet.rows.map((row, rowIndex) => {
                    const sectionRow = isSectionRow(row, rowIndex);
                    const isColumnHeaderRow = row.some((value) => normalizeHeader(value).includes('points available'));
                    const isCredit = isCreditRow(row, rowIndex);
                    const response = isCredit ? getReviewResponseForRow(row) : null;
                    const renderResponseCell = (items?: string[], fallback = '-') => (
                      items && items.length > 0 ? (
                        <ul className={styles.responseList}>
                          {items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{item}</li>)}
                        </ul>
                      ) : <span className={styles.noResponse}>{fallback}</span>
                    );
                    return (
                    <tr key={`${activeSheet.name}-${rowIndex}`} className={sectionRow ? styles.sectionRow : ''}>
                      <td className={styles.checkboxCell}>
                        {selectedProjectId && isCreditRow(row, rowIndex) && !sectionRow && (
                          <input
                            type="checkbox"
                            checked={Boolean(selectedCreditsForProject[getCreditKey(row)])}
                            onChange={(event) => {
                              const checkKey = getCreditKey(row);
                              setSelectedCredits((current) => ({
                                ...current,
                                [checklistType]: {
                                  ...(current[checklistType] ?? {}),
                                  [currentScopeKey]: {
                                    ...((current[checklistType] ?? {})[currentScopeKey] ?? {}),
                                    [checkKey]: event.target.checked,
                                  },
                                },
                              }));
                            }}
                            aria-label={`Mark ${getCreditLabel(row)} complete`}
                          />
                        )}
                      </td>
                      {row.map((cell, cellIndex) => {
                        const hasRowText = row.some((value) => value.trim() !== '');
                        const isHeading = rowIndex <= 1 || (cellIndex === 0 && hasRowText);
                        const isColumnHeader = row.some((value) => normalizeHeader(value).includes('points available'));
                        const pointColumns = getPointColumnIndexes(activeSheet);
                        const isCredit = isCreditRow(row, rowIndex);
                        const requiredRow = isRequiredRow(row, activeSheet);
                        const availablePoints = getAvailablePoints(row, activeSheet);
                        const subtotal = subtotalRows.get(rowIndex);
                        const displayValues = isCredit ? {
                          achievable: getAchievablePoints(row, rowIndex, activeSheet),
                          doubtful: getDoubtfulPoints(row, rowIndex, activeSheet),
                          notTargeted: getNotTargetedPoints(row, rowIndex, activeSheet),
                        } : subtotal ? {
                          achievable: String(subtotal.achievable),
                          doubtful: String(subtotal.doubtful),
                          notTargeted: String(subtotal.notTargeted),
                        } : {};
                        const displayCell = cellIndex === pointColumns.available && subtotal
                          ? String(subtotal.available)
                          : cell;
                        const canEditAchievable = isCredit && !requiredRow && availablePoints !== null && cellIndex === pointColumns.achievable;
                        const canEditDoubtful = isCredit && !requiredRow && availablePoints !== null && cellIndex === pointColumns.doubtful;

                        return (
                          <td
                            key={`${activeSheet.name}-${rowIndex}-${cellIndex}`}
                            className={`${isHeading ? styles.headingCell : ''} ${isColumnHeader ? styles.stickyHeaderCell : ''}`}
                          >
                            {canEditAchievable ? (
                              <input
                                className={styles.pointsInput}
                                type="number"
                                min={0}
                                max={availablePoints}
                                value={getAchievablePoints(row, rowIndex, activeSheet)}
                                onChange={(event) => updateManualAchievable(row, event.target.value)}
                                aria-label={`Edit achievable points for ${getCreditLabel(row)}`}
                              />
                            ) : canEditDoubtful ? (
                              <input
                                className={styles.pointsInput}
                                type="number"
                                min={0}
                                max={availablePoints}
                                value={getDoubtfulPoints(row, rowIndex, activeSheet)}
                                onChange={(event) => updateManualDoubtful(row, event.target.value)}
                                aria-label={`Edit doubtful points for ${getCreditLabel(row)}`}
                              />
                            ) : getDisplayCell(
                              activeSheet,
                              row,
                              rowIndex,
                              cellIndex,
                              displayCell,
                              displayValues,
                            )}
                          </td>
                        );
                      })}
                      {isColumnHeaderRow ? (
                        <>
                          <td className={`${styles.reviewResponseCell} ${styles.reviewResponseHeader} ${styles.expectedHeader}`}>Expected</td>
                          <td className={`${styles.reviewResponseCell} ${styles.reviewResponseHeader} ${styles.pendingHeader}`}>Pending</td>
                          <td className={`${styles.reviewResponseCell} ${styles.reviewResponseHeader} ${styles.deniedHeader}`}>Denied</td>
                        </>
                      ) : isCredit ? (
                        <>
                          <td className={`${styles.reviewResponseCell} ${styles.reviewResponseDivider} ${response?.expected.length ? styles.expectedResponse : ''}`}>
                            {response ? renderResponseCell(response.expected, '-') : <span className={styles.noResponse}>No response</span>}
                          </td>
                          <td className={`${styles.reviewResponseCell} ${response?.pending.length ? styles.pendingResponse : ''}`}>
                            {response ? renderResponseCell(response.pending) : <span className={styles.noResponse}>-</span>}
                          </td>
                          <td className={`${styles.reviewResponseCell} ${response?.denied.length ? styles.deniedResponse : ''}`}>
                            {response ? renderResponseCell(response.denied) : <span className={styles.noResponse}>-</span>}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className={`${styles.reviewResponseCell} ${styles.reviewResponseDivider}`}></td>
                          <td className={styles.reviewResponseCell}></td>
                          <td className={styles.reviewResponseCell}></td>
                        </>
                      )}
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className={styles.state}>No feasibility checklist data found.</div>
        )}
      </section>
    </div>
  );
}
