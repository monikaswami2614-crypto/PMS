'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { getProjectSource, useProjects } from '@/context/ProjectContext';
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

type UploadedResponsesByProject = Record<string, Record<string, UploadedResponseCell>>;

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
const feasibilitySelectionChangeEvent = 'pms-feasibility-selection-change';
type SelectedCreditsByProject = Record<ChecklistType, Record<string, Record<string, boolean>>>;
type ManualAchievableByProject = Record<ChecklistType, Record<string, Record<string, number>>>;
type ManualDoubtfulByProject = Record<ChecklistType, Record<string, Record<string, number>>>;

const creditPattern = /\b(?:[A-Z]{1,4}\s*(?:MR|CR|Cr|Credit)\s*\d+(?:\.\d+)?|SA\s*Credit\s*\d+|Site\s*Credit\s*\d+|SSP\s*MR\s*\d+|ID\s*(?:Cr|Credit)\s*\d+(?:\.\d+)?|Credit\s*\d+(?:\.\d+)?)\b/i;

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
  (value.toLowerCase().match(/[a-z]+|\d+/g) ?? [])
    .map((token) => {
      if (token === 'rwh') return 'rhw';
      if (token === 'credit' || token === 'credits') return 'cr';
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
  [creditCode, rowText, `${creditCode} ${rowText}`].forEach((value) => {
    const normalized = normalizeCreditKey(value);
    if (normalized) keys.add(normalized);
  });
  return Array.from(keys);
};

const parseReviewResponseRows = (rows: string[][]): Record<string, UploadedResponseCell> => {
  const header = rows[0]?.map(normalizeHeader) ?? [];
  const hasHeader = header.some(Boolean);
  const creditColumn = header.findIndex((cell) => /credit|code|mr|cr/.test(cell));
  const statusColumn = header.findIndex((cell) => /status|category|type/.test(cell));
  const commentColumn = header.findIndex((cell) => /comment|remark|observation|description|query|response/.test(cell));
  const responseColumns: Record<keyof UploadedResponseCell, number> = {
    expected: header.findIndex((cell) => cell.includes('expected')),
    pending: header.findIndex((cell) => cell.includes('pending')),
    denied: header.findIndex((cell) => cell.includes('denied')),
  };
  const result: Record<string, UploadedResponseCell> = {};

  rows.slice(hasHeader ? 1 : 0).forEach((row) => {
    const rowText = row.join(' ').trim();
    if (!rowText) return;

    const creditText = creditColumn >= 0 ? row[creditColumn] ?? '' : rowText;
    const creditMatch = creditText.match(creditPattern) ?? rowText.match(creditPattern);
    if (!creditMatch) return;

    const creditCode = creditMatch[0];
    const keys = getCreditMatchKeys(creditCode, rowText);
    const hasSeparateColumns = Object.values(responseColumns).some((index) => index >= 0 && (row[index] ?? '').trim());

    if (hasSeparateColumns) {
      keys.forEach((key) => {
        result[key] = result[key] ?? emptyResponseCell();
        (Object.entries(responseColumns) as Array<[keyof UploadedResponseCell, number]>).forEach(([status, index]) => {
          const comment = index >= 0 ? (row[index] ?? '').trim() : '';
          if (comment && !result[key][status].includes(comment)) result[key][status].push(comment);
        });
      });
      return;
    }

    const status = statusColumn >= 0
      ? getResponseStatus(row[statusColumn] ?? '')
      : row.map(getResponseStatus).find(Boolean) ?? null;
    if (!status) return;

    const comment = (commentColumn >= 0 ? row[commentColumn] : '')
      || row.filter((cell) => {
        const normalized = normalizeHeader(cell);
        return cell.trim()
          && !creditPattern.test(cell)
          && getResponseStatus(cell) === null
          && !['accepted', 'approved', 'completed'].some((ignored) => normalized.includes(ignored));
      }).join(' | ');
    const trimmedComment = comment.trim();
    if (!trimmedComment) return;

    keys.forEach((key) => {
      result[key] = result[key] ?? emptyResponseCell();
      if (!result[key][status].includes(trimmedComment)) result[key][status].push(trimmedComment);
    });
  });

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

const getReviewCreditStatus = (item?: ReviewItem): 'checked' | 'missing' | 'pending' => {
  if (!item) return 'missing';
  const statuses = [...item.preRequirements, ...item.finalRequirements].map((requirement) => requirement.status);
  if (statuses.some((status) => status === 'checked' || status === 'overridden')) return 'checked';
  if (statuses.some((status) => status === 'missing')) return 'missing';
  return 'pending';
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
  const { projects } = useProjects();
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
  const [reviewResponses, setReviewResponses] = useState<UploadedResponsesByProject>({});
  const [uploadMessage, setUploadMessage] = useState('');

  const projectOptions = useMemo(() => (
    projects.filter((project) => {
      if (project.id === 'all') return false;
      const source = getProjectSource(project);
      return checklistType === 'gh' ? source === 'GREEN_HOMES' : source === 'NB';
    })
  ), [checklistType, projects]);

  useEffect(() => {
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
      setReviewResponses(storedResponses ? JSON.parse(storedResponses) as UploadedResponsesByProject : {});
    } catch {
      window.localStorage.removeItem(reviewResponseStorageKey);
      setReviewResponses({});
    }

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

  useEffect(() => {
    setSelectedProjectId((currentProjectId) => {
      if (projectOptions.some((project) => project.id === currentProjectId)) return currentProjectId;
      return projectOptions[0]?.id ?? '';
    });
  }, [projectOptions]);

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
  const selectedCreditsForProject = selectedCredits[checklistType]?.[selectedProjectId] ?? {};
  const manualAchievableForProject = manualAchievable[checklistType]?.[selectedProjectId] ?? {};
  const manualDoubtfulForProject = manualDoubtful[checklistType]?.[selectedProjectId] ?? {};
  const reviewResponsesForProject = reviewResponses[selectedProjectId] ?? {};
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

    const reviewStatus = getReviewCreditStatus(getMatchedReviewItem(row));
    return reviewStatus === 'checked' ? String(availablePoints) : '0';
  };

  const getNotTargetedPoints = (row: string[], rowIndex: number, sheet: ChecklistSheet): string => {
    if (!isCreditRow(row, rowIndex)) return '';
    if (isRequiredRow(row, sheet)) return 'Required';

    const availablePoints = getAvailablePoints(row, sheet);
    if (availablePoints === null) return '';

    const achievablePoints = Number(getAchievablePoints(row, rowIndex, sheet));
    return String(Math.max(0, availablePoints - clampAchievablePoints(achievablePoints, availablePoints)));
  };

  const getDoubtfulPoints = (row: string[], rowIndex: number, sheet: ChecklistSheet): string => {
    if (!isCreditRow(row, rowIndex)) return getCreditRowValue(row, sheet, 'doubtful');
    if (isRequiredRow(row, sheet)) return 'Required';

    const availablePoints = getAvailablePoints(row, sheet);
    if (availablePoints === null) return getCreditRowValue(row, sheet, 'doubtful');

    const creditKey = getCreditKey(row);
    const manualValue = manualDoubtfulForProject[creditKey];
    return typeof manualValue === 'number' ? String(clampAchievablePoints(manualValue, availablePoints)) : '0';
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
          notTargeted: activeSectionTotals.notTargeted + Math.max(0, availablePoints - achievablePoints),
        };
        return;
      }

      if (activeSectionTotals && isSubtotalRow(row, rowIndex, activeSheet)) {
        rows.set(rowIndex, activeSectionTotals);
        activeSectionTotals = null;
      }
    });

    return rows;
  }, [activeSheet, manualAchievableForProject, manualDoubtfulForProject, reviewItemsByCreditKey]);

  const summary = useMemo(() => {
    if (!activeSheet) return { available: 0, achievable: 0, notTargeted: 0, selected: 0 };

    const totals = activeSheet.rows.reduce((nextTotals, row, rowIndex) => {
      if (!isCreditRow(row, rowIndex) || isRequiredRow(row, activeSheet)) return nextTotals;

      const availablePoints = getAvailablePoints(row, activeSheet);
      if (availablePoints === null) return nextTotals;

      const achievablePoints = clampAchievablePoints(Number(getAchievablePoints(row, rowIndex, activeSheet)), availablePoints);
      return {
        available: nextTotals.available + availablePoints,
        achievable: nextTotals.achievable + achievablePoints,
        notTargeted: nextTotals.notTargeted + Math.max(0, availablePoints - achievablePoints),
        selected: nextTotals.selected + (selectedCreditsForProject[getCreditKey(row)] ? 1 : 0),
      };
    }, { available: 0, achievable: 0, notTargeted: 0, selected: 0 });

    const cappedAvailable = Math.min(100, totals.available);
    const cappedAchievable = Math.min(cappedAvailable, totals.achievable);
    return {
      ...totals,
      available: cappedAvailable,
      achievable: cappedAchievable,
      notTargeted: Math.max(0, cappedAvailable - cappedAchievable),
    };
  }, [activeSheet, manualAchievableForProject, reviewItemsByCreditKey, selectedCreditsForProject]);

  const toggleAllCredits = () => {
    if (activeCreditKeys.length === 0 || !selectedProjectId) return;
    setSelectedCredits((current) => {
      const nextProjects = { ...(current[checklistType] ?? {}) };
      const nextForProject = { ...(nextProjects[selectedProjectId] ?? {}) };
      activeCreditKeys.forEach((key) => {
        nextForProject[key] = !areAllCreditsSelected;
      });
      return { ...current, [checklistType]: { ...nextProjects, [selectedProjectId]: nextForProject } };
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
      const nextProject = { ...(nextType[selectedProjectId] ?? {}) };
      nextProject[creditKey] = nextValue;
      return { ...current, [checklistType]: { ...nextType, [selectedProjectId]: nextProject } };
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
      const nextProject = { ...(nextType[selectedProjectId] ?? {}) };
      nextProject[creditKey] = nextValue;
      return { ...current, [checklistType]: { ...nextType, [selectedProjectId]: nextProject } };
    });
  };

  const getReviewResponseForRow = (row: string[]): UploadedResponseCell | null => {
    const creditCode = getCreditLabel(row);
    const keys = getCreditMatchKeys(creditCode, row.join(' '));
    const exactMatch = keys.map((key) => reviewResponsesForProject[key]).find(Boolean);
    if (exactMatch) return exactMatch;

    const fuzzyKey = Object.keys(reviewResponsesForProject).find((responseKey) => (
      keys.some((key) => responseKey === key || responseKey.includes(key) || key.includes(responseKey))
    ));
    return fuzzyKey ? reviewResponsesForProject[fuzzyKey] : null;
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
      setReviewResponses((current) => ({ ...current, [selectedProjectId]: mapped }));
      setUploadMessage(Object.keys(mapped).length > 0
        ? `Review response uploaded. ${Object.keys(mapped).length} matched rows found.`
        : 'Review response uploaded, but no Expected/Pending/Denied data was found.');
    } catch {
      setUploadMessage('Failed to upload review response. Please confirm backend is running.');
    }
  };

  return (
    <div className={styles.container}>
      <section className={`${styles.toolbar} glassmorphism`}>
        <div className={styles.titleBlock}>
          <h2>{checklistType.toUpperCase()} Feasibility Checklist</h2>
          <span>C:\Users\monika.swami\Desktop\Leed Project</span>
        </div>
        <div className={styles.topControls}>
          <select
            className={styles.projectSelect}
            value={selectedProjectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
            aria-label="Select feasibility project"
          >
            {projectOptions.length === 0 ? (
              <option value="">No projects available</option>
            ) : projectOptions.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
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
        <span>Total Available Points <strong>{summary.available}</strong></span>
        <span>Total Achievable / Targeted Points <strong>{summary.achievable}</strong></span>
        <span>Total Not Targeted Points <strong>{summary.notTargeted}</strong></span>
        <span>Rating <strong>{getRating(summary.achievable)}</strong></span>
        {uploadMessage && <span>{uploadMessage}</span>}
        {isReviewLoading && <span>Refreshing checklist status...</span>}
      </section>

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
                                  [selectedProjectId]: {
                                    ...((current[checklistType] ?? {})[selectedProjectId] ?? {}),
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
                          <td className={`${styles.reviewResponseCell} ${styles.reviewResponseHeader}`}>Expected</td>
                          <td className={`${styles.reviewResponseCell} ${styles.reviewResponseHeader}`}>Pending</td>
                          <td className={`${styles.reviewResponseCell} ${styles.reviewResponseHeader}`}>Denied</td>
                        </>
                      ) : isCredit ? (
                        <>
                          <td className={`${styles.reviewResponseCell} ${styles.reviewResponseDivider}`}>
                            {response ? renderResponseCell(response.expected, '-') : <span className={styles.noResponse}>No response</span>}
                          </td>
                          <td className={styles.reviewResponseCell}>{response ? renderResponseCell(response.pending) : <span className={styles.noResponse}>-</span>}</td>
                          <td className={styles.reviewResponseCell}>{response ? renderResponseCell(response.denied) : <span className={styles.noResponse}>-</span>}</td>
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
