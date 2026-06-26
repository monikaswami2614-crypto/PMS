'use client';

import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ArrowRight, ClipboardCheck, Edit3, ExternalLink, FileText, FolderClosed, Loader2, Save, Search, Sparkles, Trash2, X } from 'lucide-react';
import { getProjectSource, useProjects } from '@/context/ProjectContext';
import ClientMailButton from '@/components/ClientMailButton';
import styles from '../checklist-review/page.module.css';

type RequirementStatus = 'pending' | 'missing' | 'checked' | 'overridden';

type FiltrationPhase = 'pre' | 'final';

type MatchedFile = {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  extension?: string | null;
  size?: number;
};

type FiltrationFile = MatchedFile & {
  status: RequirementStatus;
  requirementId: string;
  requirementName: string;
  matchConfidence?: number;
  matchReason?: string;
};

type FiltrationRequirement = {
  id: string;
  requirementName: string;
  pointNumber: number;
  status: RequirementStatus;
  matchedFiles: FiltrationFile[];
};

type FiltrationGroup = {
  id: string;
  creditName: string;
  subCreditName: string;
  requirements: FiltrationRequirement[];
  submissionFiles?: FiltrationFile[];
  supportingFiles?: FiltrationFile[];
};

type FiltrationResponse = {
  project: {
    id: string;
    name: string;
    type: 'NB' | 'GH';
  };
  phase: FiltrationPhase;
  groups: FiltrationGroup[];
};

type SheetFile = FiltrationFile & {
  clientId: string;
  creditName: string;
  subCreditName: string;
  displayName: string;
};

type SubmissionMode = 'first' | 'second';
type FileTypeFilter = 'all' | 'pdf' | 'doc' | 'excel' | 'autocad' | 'photos' | 'other';
type ClientDataFileFilter = 'all' | 'pdf' | 'doc' | 'excel' | 'autocad' | 'jpg' | 'png' | 'pak' | 'backup' | 'archive' | 'other';
type FileActionScope = 'filtration' | 'supporting' | 'final';
type SelectableFileScope = 'filtration' | 'supporting' | 'ai-filter';
type CreditViewMode = 'scrolling' | 'stepwise';

type FileContextMenu = {
  file: SheetFile;
  group: FiltrationGroup;
  scope: FileActionScope;
  x: number;
  y: number;
};

type AiSuggestedFileName = {
  fileId: string;
  currentName: string;
  suggestedName: string;
  confidence: number;
  extractedSignals?: {
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
};

type AiSuggestionPanel = {
  group: FiltrationGroup;
  files: SheetFile[];
  suggestions: AiSuggestedFileName[];
  isLoading: boolean;
  error: string;
};

type AiFilterState = {
  groupId: string;
  isLoading: boolean;
  error: string;
  files: SheetFile[];
};

type ProjectTreeFile = {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  extension?: string | null;
  size?: number;
};

type ProjectTreeFolder = {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  children: ProjectTreeFolder[];
  files: ProjectTreeFile[];
};

type ClientDataAiMatch = {
  groupId: string;
  fileId: string;
  requirementId: string;
  requirementName: string;
  matchScore: number;
  matchReason: string;
};

const flattenProjectTreeFiles = (folder: ProjectTreeFolder): ProjectTreeFile[] => [
  ...folder.files,
  ...folder.children.flatMap(flattenProjectTreeFiles),
];

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:5000';
const selectedProjectStorageKey = 'certification-filtration-selected-project';
const selectedProjectChangeEvent = 'certification-filtration-project-change';
const workflowFilesStoragePrefix = 'certification-filtration-workflow-files';
const selectedFeasibilityCreditsStorageKey = 'pms-feasibility-selected-credit-keys-by-project';
const feasibilitySelectionChangeEvent = 'pms-feasibility-selection-change';

const subscribeToSelectedProject = (onStoreChange: () => void) => {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(selectedProjectChangeEvent, onStoreChange);

  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(selectedProjectChangeEvent, onStoreChange);
  };
};

const getSelectedProjectSnapshot = () => window.localStorage.getItem(selectedProjectStorageKey) ?? '';

const fileTypeOrder: Record<string, number> = {
  pdf: 0,
  doc: 1,
  docx: 1,
  jpg: 2,
  jpeg: 2,
  png: 2,
  gif: 2,
  webp: 2,
  bmp: 2,
  tif: 2,
  tiff: 2,
  svg: 3,
  dwg: 3,
  dxf: 3,
  vsd: 3,
  vsdx: 3,
};

const mainCreditNames: Record<string, string> = {
  SD: 'Site Selection and Planning',
  WC: 'Water Conservation',
  EE: 'Energy efficiency',
  BMR: 'Building Materials and Resources',
  IEQ: 'Indoor Environmental Quality',
  ID: 'Innovation and Decarbonisation in Buildings',
  IN: 'Innovation and Decarbonisation in Buildings',
};

export default function CertificationFiltrationPage() {
  const { projects } = useProjects();
  const reviewProjects = useMemo(() => projects.filter((project) => project.id !== 'all'), [projects]);
  const selectedProjectId = useSyncExternalStore(subscribeToSelectedProject, getSelectedProjectSnapshot, () => '');
  const [filtrationData, setFiltrationData] = useState<FiltrationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<FiltrationPhase>('pre');
  const [submissionMode, setSubmissionMode] = useState<SubmissionMode>('first');
  const [fileTypeFilters, setFileTypeFilters] = useState<Record<string, FileTypeFilter>>({});
  const [selectedFiles, setSelectedFiles] = useState<Record<string, boolean>>({});
  const [supportingFiles, setSupportingFiles] = useState<SheetFile[]>([]);
  const [finalFiles, setFinalFiles] = useState<SheetFile[]>([]);
  const [fileNameOverrides, setFileNameOverrides] = useState<Record<string, string>>({});
  const [activeFileInfo, setActiveFileInfo] = useState<SheetFile | null>(null);
  const [activeFileInfoCreditId, setActiveFileInfoCreditId] = useState<string | null>(null);
  const [fileContextMenu, setFileContextMenu] = useState<FileContextMenu | null>(null);
  const [aiSuggestionPanel, setAiSuggestionPanel] = useState<AiSuggestionPanel | null>(null);
  const [aiFilters, setAiFilters] = useState<Record<string, AiFilterState>>({});
  const [creditSearch, setCreditSearch] = useState('');
  const [creditViewMode, setCreditViewMode] = useState<CreditViewMode>('scrolling');
  const [activeCreditIndex, setActiveCreditIndex] = useState(0);
  const [clientDataFolder, setClientDataFolder] = useState<ProjectTreeFolder | null>(null);
  const [isClientDataLoading, setIsClientDataLoading] = useState(false);
  const [clientDataError, setClientDataError] = useState('');
  const [selectedClientFiles, setSelectedClientFiles] = useState<Record<string, boolean>>({});
  const [isCreditPickerOpen, setIsCreditPickerOpen] = useState(false);
  const [clientFiltrationFiles, setClientFiltrationFiles] = useState<SheetFile[]>([]);
  const [removedFiltrationFileIds, setRemovedFiltrationFileIds] = useState<Record<string, boolean>>({});
  const [aiMatchedClientFiles, setAiMatchedClientFiles] = useState<SheetFile[]>([]);
  const [isClientAiMatching, setIsClientAiMatching] = useState(false);
  const [clientAiError, setClientAiError] = useState('');
  const [manuallyCheckedRequirementIds, setManuallyCheckedRequirementIds] = useState<Record<string, boolean>>({});
  const [clientDataFileFilter, setClientDataFileFilter] = useState<ClientDataFileFilter>('all');
  const [hydratedWorkflowKey, setHydratedWorkflowKey] = useState('');
  const [selectedFeasibilityCredits, setSelectedFeasibilityCredits] = useState<Record<'nb' | 'gh', Record<string, Record<string, boolean>>>>({ nb: {}, gh: {} });

  const effectiveSelectedProjectId = reviewProjects.some((project) => project.id === selectedProjectId)
    ? selectedProjectId
    : reviewProjects[0]?.id || '';
  const selectedProject = reviewProjects.find((project) => project.id === effectiveSelectedProjectId);
  const inferredType = selectedProject ? getProjectSource(selectedProject) : null;
  const workflowFilesStorageKey = effectiveSelectedProjectId
    ? `${workflowFilesStoragePrefix}:${effectiveSelectedProjectId}:${phase}:${submissionMode}`
    : '';

  useEffect(() => {
    if (!workflowFilesStorageKey) return;

    try {
      const savedWorkflow = window.localStorage.getItem(workflowFilesStorageKey);
      const parsed = savedWorkflow
        ? JSON.parse(savedWorkflow) as { supportingFiles?: SheetFile[]; finalFiles?: SheetFile[] }
        : null;
      setSupportingFiles(parsed?.supportingFiles ?? []);
      setFinalFiles(parsed?.finalFiles ?? []);
    } catch {
      window.localStorage.removeItem(workflowFilesStorageKey);
      setSupportingFiles([]);
      setFinalFiles([]);
    }

    setHydratedWorkflowKey(workflowFilesStorageKey);
  }, [workflowFilesStorageKey]);

  useEffect(() => {
    if (!workflowFilesStorageKey || hydratedWorkflowKey !== workflowFilesStorageKey) return;
    window.localStorage.setItem(workflowFilesStorageKey, JSON.stringify({ supportingFiles, finalFiles }));
  }, [finalFiles, hydratedWorkflowKey, supportingFiles, workflowFilesStorageKey]);

  useEffect(() => {
    const loadSelectedFeasibilityCredits = () => {
      try {
        const storedSelection = window.localStorage.getItem(selectedFeasibilityCreditsStorageKey);
        const parsed = storedSelection
          ? JSON.parse(storedSelection) as Partial<Record<'nb' | 'gh', Record<string, Record<string, boolean>>>>
          : null;
        setSelectedFeasibilityCredits({ nb: parsed?.nb ?? {}, gh: parsed?.gh ?? {} });
      } catch {
        window.localStorage.removeItem(selectedFeasibilityCreditsStorageKey);
        setSelectedFeasibilityCredits({ nb: {}, gh: {} });
      }
    };

    loadSelectedFeasibilityCredits();
    window.addEventListener('storage', loadSelectedFeasibilityCredits);
    window.addEventListener(feasibilitySelectionChangeEvent, loadSelectedFeasibilityCredits);
    return () => {
      window.removeEventListener('storage', loadSelectedFeasibilityCredits);
      window.removeEventListener(feasibilitySelectionChangeEvent, loadSelectedFeasibilityCredits);
    };
  }, []);

  useEffect(() => {
    if (!effectiveSelectedProjectId) {
      setClientDataFolder(null);
      return;
    }

    const controller = new AbortController();

    const findClientDataFolder = (folders: ProjectTreeFolder[]): ProjectTreeFolder | null => {
      const candidates: Array<{ folder: ProjectTreeFolder; depth: number }> = [];
      let currentLevel = folders;
      let depth = 0;

      while (currentLevel.length > 0) {
        currentLevel.forEach((folder) => {
          if (/^0\.\s*/.test(folder.name.trim())) candidates.push({ folder, depth });
        });
        currentLevel = currentLevel.flatMap((folder) => folder.children ?? []);
        depth += 1;
      }

      const submissionPattern = submissionMode === 'second'
        ? /(^|[^a-z0-9])(2nd|second|2\s*submission)/i
        : /(^|[^a-z0-9])(1st|first|1\s*submission)/i;
      const minimumDepth = Math.min(...candidates.map((candidate) => candidate.depth));
      const nearestCandidates = candidates.filter((candidate) => candidate.depth === minimumDepth);
      const preferredCandidates = nearestCandidates.filter(({ folder }) => (
        submissionPattern.test(`${folder.relativePath} ${folder.path}`)
      ));
      const availableCandidates = preferredCandidates.length > 0 ? preferredCandidates : nearestCandidates;

      return availableCandidates[0]?.folder ?? null;
    };

    const loadClientData = async () => {
      setIsClientDataLoading(true);
      setClientDataError('');
      setClientDataFolder(null);
      setSelectedClientFiles({});
      setIsCreditPickerOpen(false);
      setClientFiltrationFiles([]);
      setRemovedFiltrationFileIds({});
      setAiMatchedClientFiles([]);
      setIsClientAiMatching(false);
      setClientAiError('');

      try {
        const response = await fetch(`${apiBase}/api/projects/${effectiveSelectedProjectId}/tree/public`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Failed to load client data');

        const payload = await response.json();
        setClientDataFolder(findClientDataFolder(payload.data ?? []));
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setClientDataError(err instanceof Error ? err.message : 'Failed to load client data');
        }
      } finally {
        setIsClientDataLoading(false);
      }
    };

    loadClientData();
    return () => controller.abort();
  }, [effectiveSelectedProjectId, submissionMode]);

  useEffect(() => {
    if (!effectiveSelectedProjectId) return;

    const controller = new AbortController();

    const loadFiltration = async () => {
      setIsLoading(true);
      setError('');
      setSelectedFiles({});
      setAiFilters({});

      try {
        const response = await fetch(`${apiBase}/api/checklists/review/${effectiveSelectedProjectId}/filtration/${phase}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || 'Failed to load filtration data');
        }

        const payload = await response.json();
        setFiltrationData(payload.data);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Failed to load filtration data');
          setFiltrationData(null);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadFiltration();

    return () => controller.abort();
  }, [effectiveSelectedProjectId, phase]);

  useEffect(() => {
    if (
      !clientDataFolder
      || !filtrationData
      || filtrationData.project.id !== effectiveSelectedProjectId
      || filtrationData.phase !== phase
    ) return;

    const clientFiles = flattenProjectTreeFiles(clientDataFolder);
    if (clientFiles.length === 0 || filtrationData.groups.length === 0) {
      setAiMatchedClientFiles([]);
      return;
    }

    const controller = new AbortController();

    const matchClientData = async () => {
      setIsClientAiMatching(true);
      setClientAiError('');
      setAiMatchedClientFiles([]);

      try {
        const response = await fetch(`${apiBase}/api/checklists/review/${effectiveSelectedProjectId}/files/match-client-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            files: clientFiles.map((file) => ({ id: file.id })),
            groups: filtrationData.groups.map((group) => ({
              id: group.id,
              requirements: group.requirements.map((requirement) => ({
                id: requirement.id,
                requirementName: requirement.requirementName,
              })),
            })),
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || 'Failed to match client data');
        }

        const payload = await response.json();
        const filesById = new Map(clientFiles.map((file) => [file.id, file]));
        const groupsById = new Map(filtrationData.groups.map((group) => [group.id, group]));
        const matchedFiles = (payload.data as ClientDataAiMatch[] ?? []).flatMap((match) => {
          const file = filesById.get(match.fileId);
          const group = groupsById.get(match.groupId);
          if (!file || !group) return [];

          return [{
            ...file,
            status: 'pending' as RequirementStatus,
            requirementId: match.requirementId,
            requirementName: match.requirementName,
            matchConfidence: match.matchScore,
            matchReason: match.matchReason,
            clientId: `${group.id}-ai-client-${file.id}`,
            creditName: group.creditName,
            subCreditName: group.subCreditName,
            displayName: file.name,
          }];
        });

        setAiMatchedClientFiles(matchedFiles);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setClientAiError(err instanceof Error ? err.message : 'Failed to match client data');
        }
      } finally {
        if (!controller.signal.aborted) setIsClientAiMatching(false);
      }
    };

    matchClientData();
    return () => controller.abort();
  }, [clientDataFolder, effectiveSelectedProjectId, filtrationData, phase]);

  const pageTitle = phase === 'pre' ? 'Pre Certification Filtration' : 'Final Certification Filtration';

  const toSheetFile = (file: FiltrationFile, group: FiltrationGroup): SheetFile => ({
    ...file,
    clientId: `${group.id}-${file.requirementId}-${file.id}`,
    creditName: group.creditName,
    subCreditName: group.subCreditName,
    displayName: file.name,
  });

  const getDisplayName = (file: SheetFile) => fileNameOverrides[file.clientId] ?? file.displayName ?? file.name;

  const getMainCreditName = (creditName?: string) => {
    if (!creditName) return '';
    const prefix = creditName.trim().split(/\s+/)[0]?.toUpperCase();
    return mainCreditNames[prefix] ?? '';
  };

  const getCreditTitle = (group?: FiltrationGroup | null) => {
    if (!group) return 'Credit';
    const mainCreditName = getMainCreditName(group.creditName);
    return mainCreditName ? `${group.creditName} (${mainCreditName})` : group.creditName;
  };

  const normalizeCreditKey = (value: string): string => (
    (value.toLowerCase().match(/[a-z]+|\d+/g) ?? [])
      .map((token) => {
        if (token === 'rwh') return 'rhw';
        if (token === 'credit' || token === 'credits') return 'cr';
        return token;
      })
      .join('')
  );

  const getCreditColorClass = (group: FiltrationGroup) => {
    const creditText = `${group.creditName} ${group.subCreditName}`.trim().toLowerCase();

    if (creditText.startsWith('sd') || creditText.startsWith('ssp') || creditText.startsWith('site credit')) return styles.creditCategorySd;
    if (creditText.startsWith('wc') || creditText.startsWith('we') || creditText.startsWith('water credit')) return styles.creditCategoryWc;
    if (creditText.startsWith('ee') || creditText.startsWith('energy credit')) return styles.creditCategoryEe;
    if (creditText.startsWith('mr') || creditText.startsWith('bmr') || creditText.startsWith('material') || creditText.startsWith('building materials')) return styles.creditCategoryMr;
    if (creditText.startsWith('rhw') || creditText.startsWith('ieq')) return styles.creditCategoryRhw;
    if (creditText.startsWith('id') || creditText.startsWith('in') || creditText.startsWith('credit')) return styles.creditCategoryId;

    return styles.creditCategoryDefault;
  };

  const formatFileSize = (size?: number) => {
    if (!size) return '';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const selectedClientFileCount = Object.values(selectedClientFiles).filter(Boolean).length;

  const getClientFileExtension = (file: ProjectTreeFile) => (
    (file.extension || file.name.split('.').pop() || '').toLowerCase()
  );

  const matchesClientFileType = (file: ProjectTreeFile) => {
    const extension = getClientFileExtension(file);
    if (clientDataFileFilter === 'all') return true;
    if (clientDataFileFilter === 'pdf') return extension === 'pdf';
    if (clientDataFileFilter === 'doc') return ['doc', 'docx'].includes(extension);
    if (clientDataFileFilter === 'excel') return ['xls', 'xlsx', 'xlsm', 'csv'].includes(extension);
    if (clientDataFileFilter === 'autocad') return ['dwg', 'dxf'].includes(extension);
    if (clientDataFileFilter === 'jpg') return ['jpg', 'jpeg'].includes(extension);
    if (clientDataFileFilter === 'png') return extension === 'png';
    if (clientDataFileFilter === 'pak') return extension === 'pak';
    if (clientDataFileFilter === 'backup') return ['bak', 'backup'].includes(extension);
    if (clientDataFileFilter === 'archive') return ['zip', 'rar', '7z', 'tar', 'gz'].includes(extension);
    return ![
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'xlsm', 'csv', 'dwg', 'dxf',
      'jpg', 'jpeg', 'png', 'pak', 'bak', 'backup', 'zip', 'rar', '7z', 'tar', 'gz',
    ].includes(extension);
  };

  const hasVisibleClientFiles = (folder: ProjectTreeFolder): boolean => (
    folder.files.some(matchesClientFileType) || folder.children.some(hasVisibleClientFiles)
  );

  const visibleClientFileCount = clientDataFolder
    ? flattenProjectTreeFiles(clientDataFolder).filter(matchesClientFileType).length
    : 0;

  const moveClientFilesToCredit = (group: FiltrationGroup) => {
    if (!clientDataFolder) return;

    const files = flattenProjectTreeFiles(clientDataFolder).filter((file) => selectedClientFiles[file.id]);
    if (files.length === 0) return;

    const fallbackRequirement = group.requirements[0];
    const stagedFiles: SheetFile[] = files.map((file) => ({
      ...file,
      status: 'pending',
      requirementId: fallbackRequirement?.id ?? group.id,
      requirementName: fallbackRequirement?.requirementName ?? group.subCreditName,
      clientId: `${group.id}-client-data-${file.id}`,
      creditName: group.creditName,
      subCreditName: group.subCreditName,
      displayName: file.name,
    }));

    setClientFiltrationFiles((current) => uniqueFilesByClientId([...current, ...stagedFiles]));
    setSelectedClientFiles({});
    setIsCreditPickerOpen(false);
  };

  const renderClientFolder = (folder: ProjectTreeFolder, depth = 0): React.ReactNode => (
    <div key={folder.id} className={styles.clientFolder} style={{ '--client-depth': depth } as React.CSSProperties}>
      {depth > 0 && (
        <div className={styles.clientFolderName}>
          <FolderClosed size={15} />
          <span>{folder.name}</span>
        </div>
      )}
      {folder.files.filter(matchesClientFileType).map((file) => (
        <div key={file.id} className={styles.clientFile} title={file.relativePath || file.path}>
          <input
            type="checkbox"
            checked={Boolean(selectedClientFiles[file.id])}
            onChange={(event) => setSelectedClientFiles((current) => ({ ...current, [file.id]: event.target.checked }))}
            aria-label={`Select ${file.name}`}
          />
          <button type="button" className={styles.clientFileOpen} onClick={() => openFilePreview(file.id)}>
            <FileText size={14} />
            <span>{file.name}</span>
          </button>
          {file.size ? <small>{formatFileSize(file.size)}</small> : null}
        </div>
      ))}
      {folder.children.filter(hasVisibleClientFiles).map((child) => renderClientFolder(child, depth + 1))}
    </div>
  );

  const visibleGroups = (() => {
    const query = creditSearch.trim().toLowerCase();
    const groups = filtrationData?.groups ?? [];
    const checklistType = (filtrationData?.project.type === 'GH' || inferredType === 'GREEN_HOMES') ? 'gh' : 'nb';
    const selectedCreditKeys = selectedFeasibilityCredits[checklistType]?.[effectiveSelectedProjectId] ?? {};
    const activeSelectedCreditKeys = Object.entries(selectedCreditKeys)
      .filter(([, selected]) => selected)
      .map(([key]) => key);
    const feasibilityFilteredGroups = activeSelectedCreditKeys.length === 0
      ? groups
      : groups.filter((group) => {
        const groupCreditKey = normalizeCreditKey(group.creditName);
        return activeSelectedCreditKeys.some((selectedKey) => groupCreditKey === selectedKey || groupCreditKey.endsWith(selectedKey));
      });

    if (!query) return feasibilityFilteredGroups;

    return feasibilityFilteredGroups.filter((group) => (
      group.creditName.toLowerCase().includes(query)
      || group.subCreditName.toLowerCase().includes(query)
      || getCreditTitle(group).toLowerCase().includes(query)
    ));
  })();

  const moveSelectedClientFiles = () => {
    if (creditViewMode === 'stepwise') {
      const visibleCredit = visibleGroups[Math.min(activeCreditIndex, visibleGroups.length - 1)];
      if (visibleCredit) moveClientFilesToCredit(visibleCredit);
      return;
    }

    setIsCreditPickerOpen(true);
  };

  useEffect(() => {
    setActiveCreditIndex(0);
  }, [creditSearch, effectiveSelectedProjectId, phase, creditViewMode, selectedFeasibilityCredits]);

  const sortFilesForDisplay = (files: SheetFile[]) => (
    [...files].sort((firstFile, secondFile) => {
      const firstType = (firstFile.extension || firstFile.name.split('.').pop() || '').toLowerCase();
      const secondType = (secondFile.extension || secondFile.name.split('.').pop() || '').toLowerCase();
      const firstOrder = fileTypeOrder[firstType] ?? 4;
      const secondOrder = fileTypeOrder[secondType] ?? 4;

      if (firstOrder !== secondOrder) return firstOrder - secondOrder;
      return getDisplayName(firstFile).localeCompare(getDisplayName(secondFile));
    })
  );

  const getFileExtension = (file: SheetFile): string => (
    (file.extension || file.name.split('.').pop() || '').toLowerCase()
  );

  const matchesFileType = (file: SheetFile, filter: FileTypeFilter): boolean => {
    const extension = getFileExtension(file);
    const knownExtensions = new Set([
      'pdf',
      'doc',
      'docx',
      'xls',
      'xlsx',
      'xlsm',
      'csv',
      'dwg',
      'jpg',
      'jpeg',
      'png',
      'gif',
      'webp',
      'bmp',
      'tif',
      'tiff',
      'svg',
      'heic',
      'heif',
    ]);

    if (filter === 'all') return true;
    if (filter === 'pdf') return extension === 'pdf';
    if (filter === 'doc') return ['doc', 'docx'].includes(extension);
    if (filter === 'excel') return ['xls', 'xlsx', 'xlsm', 'csv'].includes(extension);
    if (filter === 'autocad') return extension === 'dwg';
    if (filter === 'photos') return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'svg', 'heic', 'heif'].includes(extension);
    return !knownExtensions.has(extension);
  };

  const matchesSubmissionMode = (file: SheetFile): boolean => {
    const searchablePath = `${file.relativePath} ${file.path}`.toLowerCase();
    const isFirstSubmission = /(^|[^a-z0-9])(1st|first|1\s*submission)/.test(searchablePath);
    const isSecondSubmission = /(^|[^a-z0-9])(2nd|second|2\s*submission)/.test(searchablePath);
    if (submissionMode === 'second') return isFirstSubmission || isSecondSubmission;
    return isFirstSubmission;
  };

  const getGroupFiles = (group: FiltrationGroup): SheetFile[] => (
    Array.from(
      group.requirements
        .flatMap((requirement) => requirement.matchedFiles.map((file) => toSheetFile(file, group)))
        .reduce((filesById, file) => {
          const currentFile = filesById.get(file.id);
          if (!currentFile || (file.matchConfidence ?? 0) > (currentFile.matchConfidence ?? 0)) {
            filesById.set(file.id, file);
          }
          return filesById;
        }, new Map<string, SheetFile>())
        .values()
    )
  );

  const getSupportingFiles = (group: FiltrationGroup): SheetFile[] => {
    const manuallyStagedFiles = supportingFiles.filter((file) => (
      file.creditName === group.creditName && file.subCreditName === group.subCreditName
    ));
    const finalFileIds = new Set(getFinalFiles(group).map((file) => file.id));
    const nestedCreditFiles = [
      ...getCreditSupportingFiles(group),
      ...getCreditSubmissionFiles(group),
    ].filter((file) => (
      matchesSubmissionMode(file)
      && getCreditFolderDepth(file, group.creditName) !== null
      && (getCreditFolderDepth(file, group.creditName) ?? 0) > 0
      && !finalFileIds.has(file.id)
    ));

    return uniqueFilesByFileId(uniqueFilesByClientId([...manuallyStagedFiles, ...nestedCreditFiles]));
  };

  const getFinalFiles = (group: FiltrationGroup): SheetFile[] => (
    finalFiles.filter((file) => file.creditName === group.creditName && file.subCreditName === group.subCreditName)
  );

  const getCreditScopedFiles = (group: FiltrationGroup, files: FiltrationFile[] = [], scope: 'submission' | 'supporting'): SheetFile[] => (
    files.map((file) => ({
      ...toSheetFile(file, group),
      clientId: `${group.id}-${scope}-${file.id}`,
    }))
  );

  const getCreditSubmissionFiles = (group: FiltrationGroup): SheetFile[] => (
    getCreditScopedFiles(group, group.submissionFiles, 'submission')
  );

  const getCreditSupportingFiles = (group: FiltrationGroup): SheetFile[] => (
    getCreditScopedFiles(group, group.supportingFiles, 'supporting')
  );

  const getFolderTokens = (value: string): string[] => (
    (value.toLowerCase().match(/[a-z]+|\d+/g) ?? [])
      .map((token) => {
        if (token === 'rwh') return 'rhw';
        if (token === 'credit' || token === 'credits') return 'cr';
        return token;
      })
  );

  const containsTokenSequence = (folderTokens: string[], creditTokens: string[]): boolean => {
    if (folderTokens.length < creditTokens.length) return false;
    return folderTokens.some((_, startIndex) => (
      creditTokens.every((token, offset) => folderTokens[startIndex + offset] === token)
    ));
  };

  const folderMatchesCreditTokens = (folderTokens: string[], creditTokens: string[]): boolean => {
    if (containsTokenSequence(folderTokens, creditTokens)) return true;

    const creditIndex = creditTokens.indexOf('cr');
    if (creditIndex === -1) return false;

    const prefixTokens = creditTokens.slice(0, creditIndex + 1);
    const numberTokens = creditTokens.slice(creditIndex + 1).filter((token) => /^\d+$/.test(token));
    if (numberTokens.length === 0 || !containsTokenSequence(folderTokens, prefixTokens)) return false;

    let searchIndex = folderTokens.indexOf(prefixTokens[prefixTokens.length - 1]) + 1;
    return numberTokens.every((token) => {
      const foundIndex = folderTokens.indexOf(token, searchIndex);
      if (foundIndex === -1) return false;
      searchIndex = foundIndex + 1;
      return true;
    });
  };

  const getCreditFolderDepth = (file: SheetFile, creditName: string): number | null => {
    const creditTokens = getFolderTokens(creditName);
    if (creditTokens.length === 0) return null;

    const pathParts = (file.relativePath || file.path || '').split(/[\\/]+/).filter(Boolean);
    const folderParts = pathParts.slice(0, -1);
    const creditFolderIndex = folderParts.findIndex((part) => {
      const folderTokens = getFolderTokens(part);
      return folderMatchesCreditTokens(folderTokens, creditTokens);
    });

    if (creditFolderIndex === -1) return null;
    return folderParts.length - creditFolderIndex - 1;
  };

  const uniqueFilesByClientId = (files: SheetFile[]): SheetFile[] => (
    Array.from(new Map(files.map((file) => [file.clientId, file])).values())
  );

  const uniqueFilesByFileId = (files: SheetFile[]): SheetFile[] => (
    Array.from(new Map(files.map((file) => [file.id, file])).values())
  );

  const getSubmissionFiles = (group: FiltrationGroup): SheetFile[] => (
    uniqueFilesByFileId(uniqueFilesByClientId([
      ...getFinalFiles(group),
      ...getCreditSubmissionFiles(group).filter((file) => (
        matchesSubmissionMode(file) && getCreditFolderDepth(file, group.creditName) === 0
      )),
      ...getGroupFiles(group).filter((file) => (
        matchesSubmissionMode(file) && getCreditFolderDepth(file, group.creditName) === 0
      )),
    ]))
  );

  const isRequirementSatisfied = (requirement: FiltrationRequirement, submissionFiles: SheetFile[]): boolean => {
    const matchedFileIds = new Set(requirement.matchedFiles.map((file) => file.id));

    return submissionFiles.some((file) => (
      matchedFileIds.has(file.id)
      || (file.requirementId === requirement.id && typeof file.matchConfidence === 'number')
    ));
  };

  const getCreditStatus = (group?: FiltrationGroup | null): RequirementStatus => {
    if (!group) return 'missing';
    const submissionFiles = getSubmissionFiles(group);
    if (group.requirements.length > 0 && group.requirements.every((requirement) => isRequirementSatisfied(requirement, submissionFiles))) return 'checked';
    if (group.requirements.some((requirement) => isRequirementSatisfied(requirement, submissionFiles))) return 'pending';
    return 'missing';
  };

  const updateManualRequirementOverride = async (
    requirement: FiltrationRequirement,
    selectionKey: string,
    checked: boolean
  ) => {
    const previousValue = Object.prototype.hasOwnProperty.call(manuallyCheckedRequirementIds, selectionKey)
      ? manuallyCheckedRequirementIds[selectionKey]
      : requirement.status === 'overridden';

    setManuallyCheckedRequirementIds((current) => ({ ...current, [selectionKey]: checked }));

    try {
      const response = await fetch(`${apiBase}/api/checklists/review/${effectiveSelectedProjectId}/items/${requirement.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase, status: checked ? 'overridden' : 'missing' }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to save requirement override');
      }
    } catch (err) {
      setManuallyCheckedRequirementIds((current) => ({ ...current, [selectionKey]: previousValue }));
      setError(err instanceof Error ? err.message : 'Failed to save requirement override');
    }
  };

  const getAvailableFiltrationFiles = (group: FiltrationGroup): SheetFile[] => {
    const stagedKeys = new Set([...getSupportingFiles(group), ...getSubmissionFiles(group)].map((file) => file.clientId));
    const fileTypeFilter = fileTypeFilters[group.id] ?? 'all';
    const matchedFiles = aiMatchedClientFiles.filter((file) => (
      file.creditName === group.creditName && file.subCreditName === group.subCreditName
    ));
    const assignedClientFiles = clientFiltrationFiles.filter((file) => (
      file.creditName === group.creditName && file.subCreditName === group.subCreditName
    ));

    return sortFilesForDisplay(uniqueFilesByFileId(uniqueFilesByClientId([...matchedFiles, ...assignedClientFiles])).filter((file) => (
      !stagedKeys.has(file.clientId)
      && !removedFiltrationFileIds[file.clientId]
      && matchesFileType(file, fileTypeFilter)
    )));
  };

  const getSelectionKey = (group: FiltrationGroup, scope: SelectableFileScope, file: SheetFile) => (
    `${phase}-${group.id}-${scope}-${file.clientId}`
  );

  const getSelectedKeys = (group: FiltrationGroup, scope: SelectableFileScope) => {
    const prefix = `${phase}-${group.id}-${scope}-`;
    return Object.entries(selectedFiles)
      .filter(([key, selected]) => selected && key.startsWith(prefix))
      .map(([key]) => key.replace(prefix, ''));
  };

  const setFilesSelected = (group: FiltrationGroup, scope: SelectableFileScope, files: SheetFile[], selected: boolean) => {
    setSelectedFiles((current) => {
      const next = { ...current };
      files.forEach((file) => {
        next[getSelectionKey(group, scope, file)] = selected;
      });
      return next;
    });
  };

  const clearSelection = (group: FiltrationGroup, scope: SelectableFileScope) => {
    const prefix = `${phase}-${group.id}-${scope}-`;
    setSelectedFiles((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(prefix))));
  };

  const addFilesToSupporting = (files: SheetFile[]) => {
    setSupportingFiles((current) => {
      const existing = new Set(current.map((file) => file.clientId));
      return [...current, ...files.filter((file) => !existing.has(file.clientId)).map((file) => ({ ...file, displayName: getDisplayName(file) }))];
    });
  };

  const moveSelectedToSupporting = (group: FiltrationGroup) => {
    const selectedKeys = new Set(getSelectedKeys(group, 'filtration'));
    if (selectedKeys.size === 0) return;
    const files = getAvailableFiltrationFiles(group).filter((file) => selectedKeys.has(file.clientId));

    addFilesToSupporting(files);
    clearSelection(group, 'filtration');
  };

  const moveSelectedToFinal = (group: FiltrationGroup) => {
    const selectedKeys = new Set(getSelectedKeys(group, 'supporting'));
    if (selectedKeys.size === 0) return;
    const files = getSupportingFiles(group).filter((file) => selectedKeys.has(file.clientId));

    setFinalFiles((current) => {
      const existing = new Set(current.map((file) => file.clientId));
      return [...current, ...files.filter((file) => !existing.has(file.clientId))];
    });
    setSupportingFiles((current) => current.filter((file) => !selectedKeys.has(file.clientId)));
    clearSelection(group, 'supporting');
  };

  const moveFileToSupporting = (file: SheetFile) => {
    setSupportingFiles((current) => {
      const existing = new Set(current.map((item) => item.clientId));
      if (existing.has(file.clientId)) return current;
      return [...current, { ...file, displayName: getDisplayName(file) }];
    });
    setFileContextMenu(null);
  };

  const moveFileToFinal = (file: SheetFile) => {
    setFinalFiles((current) => {
      const existing = new Set(current.map((item) => item.clientId));
      if (existing.has(file.clientId)) return current;
      return [...current, { ...file, displayName: getDisplayName(file) }];
    });
    setSupportingFiles((current) => current.filter((item) => item.clientId !== file.clientId));
    setSelectedFiles((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.endsWith(file.clientId))));
    setFileContextMenu(null);
  };

  const updateFileDisplayName = (file: SheetFile) => {
    const nextName = window.prompt('Edit file name', getDisplayName(file));
    const trimmedName = nextName?.trim();
    if (!trimmedName) return;

    setFileNameOverrides((current) => ({ ...current, [file.clientId]: trimmedName }));
    setSupportingFiles((current) => current.map((item) => (item.clientId === file.clientId ? { ...item, displayName: trimmedName } : item)));
    setFinalFiles((current) => current.map((item) => (item.clientId === file.clientId ? { ...item, displayName: trimmedName } : item)));
    setFileContextMenu(null);
  };

  const deleteFileFromSection = (file: SheetFile, scope: FileActionScope) => {
    if (!window.confirm(`Delete "${getDisplayName(file)}" from this section?`)) return;

    if (scope === 'filtration') {
      setRemovedFiltrationFileIds((current) => ({ ...current, [file.clientId]: true }));
      setClientFiltrationFiles((current) => current.filter((item) => item.clientId !== file.clientId));
    }
    if (scope === 'supporting') setSupportingFiles((current) => current.filter((item) => item.clientId !== file.clientId));
    if (scope === 'final') setFinalFiles((current) => current.filter((item) => item.clientId !== file.clientId));

    setSelectedFiles((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.endsWith(file.clientId))));
    setFileContextMenu(null);
  };

  const openFilePreview = (fileId: string) => {
    if (!filtrationData) return;
    window.open(`${apiBase}/api/checklists/review/${filtrationData.project.id}/files/${fileId}/preview`, '_blank', 'noopener,noreferrer');
  };

  const openFileEditor = (fileId: string) => {
    window.open(`/files/editor/${fileId}`, '_blank', 'noopener,noreferrer');
  };

  const moveSelectedAiFilesToSupporting = (group: FiltrationGroup) => {
    const aiFilter = aiFilters[group.id];
    if (!aiFilter) return;

    const selectedKeys = new Set(getSelectedKeys(group, 'ai-filter'));
    if (selectedKeys.size === 0) return;

    addFilesToSupporting(aiFilter.files.filter((file) => selectedKeys.has(file.clientId)));
    clearSelection(group, 'ai-filter');
  };

  const openAiSuggestionPanel = async (group: FiltrationGroup) => {
    const selectedKeys = new Set(getSelectedKeys(group, 'supporting'));
    const files = getSupportingFiles(group).filter((file) => selectedKeys.has(file.clientId));
    if (files.length === 0) return;

    setAiSuggestionPanel({ group, files, suggestions: [], isLoading: true, error: '' });

    try {
      const response = await fetch(`${apiBase}/api/checklists/review/${effectiveSelectedProjectId}/files/suggest-names`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: files.map((file) => ({
            id: file.id,
            creditName: file.creditName,
            requirementName: file.requirementName,
          })),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to generate AI suggested names');
      }

      const payload = await response.json();
      setAiSuggestionPanel({ group, files, suggestions: payload.data || [], isLoading: false, error: '' });
    } catch (err) {
      setAiSuggestionPanel({ group, files, suggestions: [], isLoading: false, error: err instanceof Error ? err.message : 'Failed to generate AI suggested names' });
    }
  };

  const applyAiSuggestedNames = () => {
    if (!aiSuggestionPanel) return;

    const suggestionByFileId = new Map(aiSuggestionPanel.suggestions.map((suggestion) => [suggestion.fileId, suggestion]));
    const nextOverrides = Object.fromEntries(aiSuggestionPanel.files
      .map((file) => {
        const suggestion = suggestionByFileId.get(file.id);
        return suggestion ? [file.clientId, suggestion.suggestedName] : null;
      })
      .filter((entry): entry is [string, string] => Boolean(entry)));

    setFileNameOverrides((current) => ({ ...current, ...nextOverrides }));
    setSupportingFiles((current) => current.map((file) => (
      nextOverrides[file.clientId] ? { ...file, displayName: nextOverrides[file.clientId] } : file
    )));
    setFinalFiles((current) => current.map((file) => (
      nextOverrides[file.clientId] ? { ...file, displayName: nextOverrides[file.clientId] } : file
    )));
    clearSelection(aiSuggestionPanel.group, 'supporting');
    setAiSuggestionPanel(null);
  };

  const saveCreditSections = (group: FiltrationGroup) => {
    const currentSupportingFiles = getSupportingFiles(group);
    const currentSubmissionFiles = getSubmissionFiles(group);
    const payload = {
      projectId: effectiveSelectedProjectId,
      phase,
      submissionMode,
      creditName: group.creditName,
      subCreditName: group.subCreditName,
      folders: {
        supportingDocuments: currentSupportingFiles.map((file, index) => ({
          order: index + 1,
          id: file.id,
          displayName: getDisplayName(file),
          status: getCreditStatus(group),
          path: file.path,
          relativePath: file.relativePath,
          requirementId: file.requirementId,
          requirementName: file.requirementName,
        })),
        igbcSubmission: currentSubmissionFiles.map((file, index) => ({
          order: index + 1,
          id: file.id,
          displayName: getDisplayName(file),
          status: getCreditStatus(group),
          path: file.path,
          relativePath: file.relativePath,
          requirementId: file.requirementId,
          requirementName: file.requirementName,
        })),
      },
    };
    console.log('Certification filtration save payload', payload);
  };

  const selectedCount = (group: FiltrationGroup, scope: SelectableFileScope) => getSelectedKeys(group, scope).length;

  const renderFileRow = (group: FiltrationGroup, file: SheetFile, scope: 'filtration' | 'supporting' | 'final' | 'ai-filter') => {
    const isSelectable = scope === 'filtration' || scope === 'supporting' || scope === 'ai-filter';
    const selectionKey = isSelectable ? getSelectionKey(group, scope, file) : '';
    const matchSummary = [
      typeof file.matchConfidence === 'number' ? `${file.matchConfidence}% match` : '',
      file.matchReason,
    ].filter(Boolean).join(' - ');

    return (
      <div
        key={`${scope}-${file.clientId}`}
        className={`${styles.filtrationFileRow} ${!isSelectable ? styles.finalFileRow : ''}`}
        title={matchSummary || undefined}
        onClick={() => {
          setActiveFileInfoCreditId(group.id);
          setActiveFileInfo(file);
          setFileContextMenu(null);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          const creditCard = event.currentTarget.closest<HTMLElement>('[data-credit-card]');
          const cardRect = creditCard?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
          setActiveFileInfo(null);
          setActiveFileInfoCreditId(null);
          setFileContextMenu({
            file,
            group,
            scope: scope === 'ai-filter' ? 'filtration' : scope,
            x: Math.max(8, Math.min(event.clientX - cardRect.left, cardRect.width - 198)),
            y: Math.max(8, Math.min(event.clientY - cardRect.top, cardRect.height - 226)),
          });
        }}
        role="button"
        tabIndex={0}
      >
        {isSelectable && (
          <input
            type="checkbox"
            checked={Boolean(selectedFiles[selectionKey])}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setSelectedFiles((current) => ({ ...current, [selectionKey]: event.target.checked }))}
            aria-label={`Select ${getDisplayName(file)}`}
          />
        )}
        <div className={styles.filtrationFileMeta}>
          <strong>{getDisplayName(file)}</strong>
          {matchSummary && <span>{matchSummary}</span>}
        </div>
        <button
          type="button"
          className={styles.iconActionButton}
          onClick={(event) => {
            event.stopPropagation();
            openFilePreview(file.id);
          }}
          aria-label={`Open ${getDisplayName(file)}`}
        >
          <ExternalLink size={15} />
        </button>
      </div>
    );
  };

  const renderFileList = (group: FiltrationGroup, files: SheetFile[], scope: 'filtration' | 'supporting' | 'final' | 'ai-filter', emptyMessage: string) => {
    if (files.length === 0) return <p className={styles.noFiles}>{emptyMessage}</p>;
    return files.map((file) => renderFileRow(group, file, scope));
  };

  const renderCreditCard = (group: FiltrationGroup) => {
    const availableFiles = getAvailableFiltrationFiles(group);
    const groupSupportingFiles = getSupportingFiles(group);
    const groupFinalFiles = getSubmissionFiles(group);
    const aiFilter = aiFilters[group.id];
    const phaseLabel = phase === 'pre' ? 'Pre Certification folder only' : 'Final Certification folder only';
    const submissionLabel = phase === 'pre' ? 'IGBC Pre Submission' : 'IGBC Final Submission';
    const getSelectionKey = (requirementId: string) => `${effectiveSelectedProjectId}-${phase}-${group.id}-${requirementId}`;

    return (
      <section
        key={group.id}
        className={`${styles.certificationCreditCard} ${getCreditColorClass(group)}`}
        data-credit-card
      >
        <div className={`${styles.currentCreditBar} ${styles.certificationCreditHeader}`}>
          <div>
            <h3>{getCreditTitle(group)}</h3>
            {group.requirements.length > 0 && (
              <div className={styles.requirementCompletionList}>
                {group.requirements.map((requirement) => {
                  const isMatched = isRequirementSatisfied(requirement, groupFinalFiles);
                  const selectionKey = getSelectionKey(requirement.id);
                  const hasLocalOverride = Object.prototype.hasOwnProperty.call(manuallyCheckedRequirementIds, selectionKey);
                  const isManuallyChecked = !isMatched && (
                    hasLocalOverride ? manuallyCheckedRequirementIds[selectionKey] : requirement.status === 'overridden'
                  );
                  const colorClass = isManuallyChecked
                    ? styles.requirementManuallyChecked
                    : isMatched
                      ? styles.requirementChecked
                      : styles.requirementMissing;

                  return (
                    <label key={requirement.id} className={`${styles.requirementCompletionItem} ${colorClass}`}>
                      <input
                        type="checkbox"
                        checked={isMatched || isManuallyChecked}
                        onChange={(event) => {
                          if (isMatched) return;
                          updateManualRequirementOverride(requirement, selectionKey, event.target.checked);
                        }}
                        aria-label={`${isMatched ? 'Matched' : 'Manually select'} requirement: ${requirement.requirementName}`}
                      />
                      <span className={styles.requirementCompletionText}>{requirement.requirementName}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <div className={styles.certificationCreditActions}>
            <button
              type="button"
              className={styles.saveSheetButton}
              onClick={() => saveCreditSections(group)}
              aria-label={`Save ${group.creditName} sections`}
              title="Save Supporting and IGBC sections"
            >
              <Save size={15} />
              Save
            </button>
          </div>
        </div>

        <div className={styles.filtrationBody} style={{ paddingTop: 4 }}>
          <section className={styles.filtrationPane}>
            <div className={styles.filtrationPaneHeader}>
              <h3>Filtration</h3>
              <span>{phaseLabel}</span>
            </div>
            <div className={styles.bulkActionBar}>
              <button type="button" onClick={() => setFilesSelected(group, 'filtration', availableFiles, true)} disabled={availableFiles.length === 0}>
                Select All
              </button>
              <button type="button" onClick={() => clearSelection(group, 'filtration')} disabled={selectedCount(group, 'filtration') === 0}>
                Clear
              </button>
              <select
                value={fileTypeFilters[group.id] ?? 'all'}
                onChange={(event) => {
                  setFileTypeFilters((current) => ({ ...current, [group.id]: event.target.value as FileTypeFilter }));
                  clearSelection(group, 'filtration');
                  setAiFilters((current) => Object.fromEntries(Object.entries(current).filter(([groupId]) => groupId !== group.id)));
                }}
                className={styles.projectSelect}
                style={{ width: 154, minHeight: 30, padding: '5px 30px 5px 9px', fontSize: '0.76rem' }}
                aria-label={`${group.creditName} file type filter`}
              >
                <option value="all">All Files</option>
                <option value="pdf">PDF</option>
                <option value="doc">DOC</option>
                <option value="excel">Excel</option>
                <option value="autocad">AutoCAD Drawings</option>
                <option value="photos">Photos</option>
                <option value="other">Other Files</option>
              </select>
              <button type="button" className={styles.moveButton} onClick={() => moveSelectedToSupporting(group)} disabled={selectedCount(group, 'filtration') === 0}>
                Move Selected <ArrowRight size={14} />
              </button>
            </div>
            <div className={styles.filtrationScroll} style={{ maxHeight: 320 }}>
              {isClientAiMatching ? (
                <div className={styles.aiFilterLoading}>
                  <Loader2 size={18} className={styles.loadingIcon} />
                  <span>AI is matching Client Data to requirements</span>
                </div>
              ) : clientAiError ? (
                <div className={styles.filtrationError}>{clientAiError}</div>
              ) : (
                renderFileList(group, availableFiles, 'filtration', 'No Client Data files match this credit requirement.')
              )}
            </div>
            {aiFilter && (
              <div className={styles.aiFilterResults}>
                <div className={styles.aiFilterHeader}>
                  <h4>AI Matched Files</h4>
                  <span>{aiFilter.files.length} files</span>
                </div>
                {aiFilter.error ? (
                  <div className={styles.filtrationError} style={{ margin: 0 }}>{aiFilter.error}</div>
                ) : (
                  <>
                    <div className={styles.bulkActionBar}>
                      <button type="button" onClick={() => setFilesSelected(group, 'ai-filter', aiFilter.files, true)} disabled={aiFilter.files.length === 0}>
                        Select All
                      </button>
                      <button type="button" onClick={() => clearSelection(group, 'ai-filter')} disabled={selectedCount(group, 'ai-filter') === 0}>
                        Clear
                      </button>
                      <button type="button" className={styles.moveButton} onClick={() => moveSelectedAiFilesToSupporting(group)} disabled={selectedCount(group, 'ai-filter') === 0}>
                        Move Selected <ArrowRight size={14} />
                      </button>
                    </div>
                    <div className={styles.aiFilterScroll}>
                      {aiFilter.isLoading ? (
                        <div className={styles.aiFilterLoading}>
                          <Loader2 size={18} className={styles.loadingIcon} />
                          <span>Analyzing visible files</span>
                        </div>
                      ) : renderFileList(group, aiFilter.files, 'ai-filter', 'No AI matched files found')}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>

          <div className={styles.rightPaneStack}>
            <section className={`${styles.filtrationPane} ${styles.supportingPane}`}>
              <div className={styles.filtrationPaneHeader}>
                <h3>Supporting Document</h3>
                <span>{groupSupportingFiles.length} files</span>
              </div>
              <div className={styles.bulkActionBar}>
                <button type="button" onClick={() => setFilesSelected(group, 'supporting', groupSupportingFiles, true)} disabled={groupSupportingFiles.length === 0}>
                  Select All
                </button>
                <button type="button" onClick={() => clearSelection(group, 'supporting')} disabled={selectedCount(group, 'supporting') === 0}>
                  Clear
                </button>
                <button type="button" onClick={() => openAiSuggestionPanel(group)} disabled={selectedCount(group, 'supporting') === 0}>
                  <Sparkles size={14} />
                  AI Names
                </button>
                <button type="button" className={styles.moveButton} onClick={() => moveSelectedToFinal(group)} disabled={selectedCount(group, 'supporting') === 0}>
                  Move Selected <ArrowRight size={14} />
                </button>
              </div>
              <div className={styles.filtrationScroll} style={{ maxHeight: 190 }}>
                {renderFileList(group, groupSupportingFiles, 'supporting', 'No supporting files selected')}
              </div>
            </section>

            <section className={`${styles.filtrationPane} ${styles.finalSubmissionPane}`}>
              <div className={styles.filtrationPaneHeader}>
                <h3>{submissionLabel}</h3>
                <span>{groupFinalFiles.length} files</span>
              </div>
              <div className={styles.filtrationScroll} style={{ maxHeight: 150 }}>
                {renderFileList(group, groupFinalFiles, 'final', `No files added to ${submissionLabel}`)}
              </div>
            </section>
          </div>
        </div>

        {fileContextMenu && fileContextMenu.group.id === group.id && (
          <div
            className={`${styles.fileContextMenu} ${styles.creditFileContextMenu}`}
            style={{ left: fileContextMenu.x, top: fileContextMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" onClick={() => updateFileDisplayName(fileContextMenu.file)}>
              <Edit3 size={14} />
              Rename file
            </button>
            <button type="button" onClick={() => {
              openFilePreview(fileContextMenu.file.id);
              setFileContextMenu(null);
            }}>
              <ExternalLink size={14} />
              View file
            </button>
            {fileContextMenu.scope === 'filtration' && (
              <button type="button" onClick={() => moveFileToSupporting(fileContextMenu.file)}>
                <ArrowRight size={14} />
                Move to Supporting
              </button>
            )}
            {fileContextMenu.scope === 'supporting' && (
              <button type="button" onClick={() => moveFileToFinal(fileContextMenu.file)}>
                <ArrowRight size={14} />
                Move to IGBC
              </button>
            )}
            <button type="button" onClick={() => openFileEditor(fileContextMenu.file.id)}>
              <FileText size={14} />
              Edit file internal data
            </button>
            <button type="button" className={styles.dangerMenuItem} onClick={() => deleteFileFromSection(fileContextMenu.file, fileContextMenu.scope)}>
              <Trash2 size={14} />
              Delete file
            </button>
          </div>
        )}

        {activeFileInfo && activeFileInfoCreditId === group.id && (
          <div className={styles.creditFileInfoOverlay} onClick={() => setActiveFileInfo(null)}>
            <div className={`${styles.fileInfoPopup} glassmorphism`} onClick={(event) => event.stopPropagation()}>
              <div className={styles.fileInfoHeader}>
                <h3>File Information</h3>
                <button type="button" className={styles.closeButton} onClick={() => setActiveFileInfo(null)} aria-label="Close">
                  <X size={16} />
                </button>
              </div>
              <dl className={styles.fileInfoList}>
                <div>
                  <dt>Name</dt>
                  <dd>{getDisplayName(activeFileInfo)}</dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>{activeFileInfo.path || activeFileInfo.relativePath || 'Not available'}</dd>
                </div>
                <div>
                  <dt>Requirement</dt>
                  <dd>{activeFileInfo.requirementName || 'Not available'}</dd>
                </div>
                <div>
                  <dt>Credit</dt>
                  <dd>{activeFileInfo.creditName} {activeFileInfo.subCreditName ? `- ${activeFileInfo.subCreditName}` : ''}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>{activeFileInfo.extension || getFileExtension(activeFileInfo) || 'Unknown'}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{activeFileInfo.status}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className={styles.container} onClick={() => setFileContextMenu(null)}>
      <div className={styles.certificationPageColumns}>
        <main className={styles.certificationMainColumn}>
          <div className={`${styles.toolbar} ${styles.certificationToolbar} glassmorphism`}>
        <div className={styles.certificationFilterLeft}>
          <div className={`${styles.selectorGroup} ${styles.certificationProjectSelector}`}>
            <ClipboardCheck size={18} className={styles.toolbarIcon} />
            <select
              value={effectiveSelectedProjectId}
              onChange={(event) => {
                window.localStorage.setItem(selectedProjectStorageKey, event.target.value);
                window.dispatchEvent(new Event(selectedProjectChangeEvent));
              }}
              className={styles.projectSelect}
            >
              {reviewProjects.length === 0 && <option value="">No projects available</option>}
              {reviewProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.certificationMetaPills}>
            <span className={styles.summaryPill}>{filtrationData?.project.type ?? (inferredType === 'GREEN_HOMES' ? 'GH' : inferredType ?? 'Project')}</span>
            <span className={styles.summaryPill}>{filtrationData?.groups.length ?? 0} Credits</span>
          </div>
        </div>

        <div className={`${styles.summaryGroup} ${styles.certificationFilterRight}`}>
          <ClientMailButton
            projectId={effectiveSelectedProjectId}
            projectName={filtrationData?.project.name || selectedProject?.name}
            projectType={filtrationData?.project.type || (inferredType === 'GREEN_HOMES' ? 'GH' : inferredType || undefined)}
            disabled={isLoading || !filtrationData}
          />
          <select
            value={submissionMode}
            onChange={(event) => {
              setSubmissionMode(event.target.value as SubmissionMode);
              setSelectedFiles({});
            }}
            className={styles.projectSelect}
            style={{ minWidth: 190, minHeight: 34, padding: '7px 34px 7px 11px' }}
            aria-label="Submission filter"
          >
            <option value="first">First Submission</option>
            <option value="second">Second Submission</option>
          </select>
          <select
            value={phase}
            onChange={(event) => setPhase(event.target.value as FiltrationPhase)}
            className={styles.projectSelect}
            style={{ minWidth: 210, minHeight: 34, padding: '7px 34px 7px 11px' }}
            aria-label="Certification filtration phase"
          >
            <option value="pre">Pre Certification</option>
            <option value="final">Final Certification</option>
          </select>
        </div>
          </div>

          {error && <div className={styles.errorBox}>{error}</div>}

          <div className={`${styles.filtrationModal} glassmorphism`} style={{ width: '100%', height: 'auto', minHeight: 'calc(100vh - 174px)' }}>
        {isLoading ? (
          <div className={styles.loadingState}>
            <Loader2 size={28} className={styles.loadingIcon} />
            <span>Loading filtration data</span>
          </div>
        ) : filtrationData && filtrationData.groups.length > 0 ? (
          <div className={`${styles.certificationCreditList} ${creditViewMode === 'stepwise' ? styles.stepwiseCreditList : ''}`}>
            <div className={styles.creditSearchBar}>
              <Search size={16} />
              <input
                type="search"
                value={creditSearch}
                onChange={(event) => setCreditSearch(event.target.value)}
                placeholder="Search credits by ID or name"
                aria-label="Search credits by ID or name"
              />
              <div className={styles.creditSearchActions}>
                <div className={styles.viewModeToggle} aria-label="Credit view mode">
                  <button
                    type="button"
                    className={creditViewMode === 'scrolling' ? styles.activeViewMode : ''}
                    onClick={() => setCreditViewMode('scrolling')}
                  >
                    Scrolling
                  </button>
                  <button
                    type="button"
                    className={creditViewMode === 'stepwise' ? styles.activeViewMode : ''}
                    onClick={() => setCreditViewMode('stepwise')}
                  >
                    Step Wise
                  </button>
                </div>
                <span>{visibleGroups.length}/{filtrationData.groups.length}</span>
              </div>
            </div>

            {creditViewMode === 'scrolling' ? (
              visibleGroups.map((group) => renderCreditCard(group))
            ) : visibleGroups.length > 0 ? (
              <>
                <div className={styles.stepwiseCreditContent}>
                  {renderCreditCard(visibleGroups[Math.min(activeCreditIndex, visibleGroups.length - 1)])}
                </div>
                <div className={styles.bottomNavigator}>
                  <button
                    type="button"
                    onClick={() => setActiveCreditIndex((current) => Math.max(0, current - 1))}
                    disabled={activeCreditIndex === 0}
                  >
                    Back
                  </button>
                  <span>{Math.min(activeCreditIndex + 1, visibleGroups.length)} / {visibleGroups.length}</span>
                  <button
                    type="button"
                    onClick={() => setActiveCreditIndex((current) => Math.min(visibleGroups.length - 1, current + 1))}
                    disabled={activeCreditIndex >= visibleGroups.length - 1}
                  >
                    Next
                  </button>
                </div>
              </>
            ) : null}
            {visibleGroups.length === 0 && (
              <div className={styles.emptyState}>
                <Search size={34} />
                <h3>No credits match your search</h3>
                <p>Search by credit ID or credit name.</p>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <ClipboardCheck size={42} />
            <h3>No filtration rows available</h3>
            <p>Select a project with checklist filtration data.</p>
          </div>
        )}
          </div>
        </main>

        <aside className={`${styles.clientDataPanel} glassmorphism`}>
          <div className={styles.clientDataHeader}>
            <div>
              <h2>Client data</h2>
              <span>{selectedProject?.name ?? 'Selected project'}</span>
            </div>
            <button
              type="button"
              className={styles.clientMoveButton}
              disabled={selectedClientFileCount === 0 || !filtrationData?.groups.length || (creditViewMode === 'stepwise' && visibleGroups.length === 0)}
              onClick={moveSelectedClientFiles}
            >
              Move Selected ({selectedClientFileCount})
            </button>
          </div>
          <div className={styles.clientDataControls}>
            <select
              value={clientDataFileFilter}
              onChange={(event) => {
                setClientDataFileFilter(event.target.value as ClientDataFileFilter);
                setSelectedClientFiles({});
              }}
              aria-label="Filter Client Data files by type"
            >
              <option value="all">All Files</option>
              <option value="autocad">DWG</option>
              <option value="excel">Excel</option>
              <option value="doc">DOC</option>
              <option value="pdf">PDF</option>
              <option value="jpg">JPG / JPEG</option>
              <option value="png">PNG</option>
              <option value="pak">PAK</option>
              <option value="backup">Backup (BAK)</option>
              <option value="archive">Archives</option>
              <option value="other">Other</option>
            </select>
            <span>{visibleClientFileCount} files</span>
          </div>
          <div className={styles.clientDataBody}>
            {isClientDataLoading ? (
              <div className={styles.clientDataState}>
                <Loader2 size={20} className={styles.loadingIcon} />
                <span>Loading client data</span>
              </div>
            ) : clientDataError ? (
              <div className={styles.clientDataState}>{clientDataError}</div>
            ) : clientDataFolder && visibleClientFileCount > 0 ? (
              renderClientFolder(clientDataFolder)
            ) : clientDataFolder ? (
              <div className={styles.clientDataState}>No files match this filter.</div>
            ) : (
              <div className={styles.clientDataState}>No folder beginning with 0. was found for this project.</div>
            )}
          </div>
        </aside>
      </div>

      {isCreditPickerOpen && (
        <div className={styles.fileInfoOverlay} onClick={() => setIsCreditPickerOpen(false)}>
          <div className={`${styles.creditPickerModal} glassmorphism`} onClick={(event) => event.stopPropagation()}>
            <div className={styles.fileInfoHeader}>
              <div>
                <h3>Select credit</h3>
                <span className={styles.modalCaption}>Move {selectedClientFileCount} selected file{selectedClientFileCount === 1 ? '' : 's'} to Filtration</span>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setIsCreditPickerOpen(false)} aria-label="Close credit selection">
                <X size={16} />
              </button>
            </div>
            <div className={styles.creditPickerList}>
              {(filtrationData?.groups ?? []).map((group) => (
                <button type="button" key={group.id} onClick={() => moveClientFilesToCredit(group)}>
                  <strong>{group.creditName}</strong>
                  {group.subCreditName && <span>{group.subCreditName}</span>}
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {aiSuggestionPanel && (
        <div className={styles.fileInfoOverlay} onClick={() => setAiSuggestionPanel(null)}>
          <div className={`${styles.aiSuggestionModal} glassmorphism`} onClick={(event) => event.stopPropagation()}>
            <div className={styles.fileInfoHeader}>
              <div>
                <h3>AI Suggested Names</h3>
                <span className={styles.modalCaption}>{aiSuggestionPanel.group.creditName} supporting files</span>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setAiSuggestionPanel(null)} aria-label="Close AI suggestions">
                <X size={16} />
              </button>
            </div>

            <div className={styles.aiSuggestionBody}>
              {aiSuggestionPanel.isLoading ? (
                <div className={styles.loadingState} style={{ minHeight: 180 }}>
                  <Loader2 size={24} className={styles.loadingIcon} />
                  <span>Understanding selected documents</span>
                </div>
              ) : aiSuggestionPanel.error ? (
                <div className={styles.errorBox}>{aiSuggestionPanel.error}</div>
              ) : (
                <>
                  <div className={styles.aiSuggestionTable}>
                    <div className={styles.aiSuggestionHeader}>
                      <span>Current File Name</span>
                      <span>AI Suggested Name</span>
                    </div>
                    {aiSuggestionPanel.files.map((file) => {
                      const suggestion = aiSuggestionPanel.suggestions.find((item) => item.fileId === file.id);

                      return (
                        <div key={file.clientId} className={styles.aiSuggestionRow}>
                          <span>{getDisplayName(file)}</span>
                          <strong>{suggestion?.suggestedName ?? file.name}</strong>
                        </div>
                      );
                    })}
                  </div>

                  <button type="button" className={styles.applyAiNamesButton} onClick={applyAiSuggestedNames} disabled={aiSuggestionPanel.suggestions.length === 0}>
                    <Sparkles size={15} />
                    Apply AI Suggested Names
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
