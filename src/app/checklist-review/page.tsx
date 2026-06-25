'use client';

import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ArrowRight, ClipboardCheck, Edit3, ExternalLink, FileText, Loader2, Save, Trash2, X } from 'lucide-react';
import { getProjectSource, useProjects } from '@/context/ProjectContext';
import { logClientActivity } from '@/utils/activityLog';
import ClientMailButton from '@/components/ClientMailButton';
import styles from './page.module.css';

type RequirementStatus = 'pending' | 'missing' | 'checked' | 'overridden';

type MatchedFile = {
  id: string;
  name: string;
  path: string;
  relativePath: string;
};

type RequirementPoint = {
  id: string;
  text: string;
  pointNumber: number;
  matched: boolean;
  status: RequirementStatus;
  matchedFiles: MatchedFile[];
};

type ReviewItem = {
  id: string;
  creditName: string;
  subCreditName: string;
  preRequirements: RequirementPoint[];
  finalRequirements: RequirementPoint[];
};

type ReviewResponse = {
  project: {
    id: string;
    name: string;
    type: 'NB' | 'GH';
  };
  items: ReviewItem[];
};

type ActiveRequirement = {
  requirement: RequirementPoint;
  phase: 'pre' | 'final';
};

type FiltrationPhase = 'pre' | 'final';

type FiltrationFile = MatchedFile & {
  extension?: string | null;
  size?: number;
  status: RequirementStatus;
  requirementId: string;
  requirementName: string;
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
};

type FiltrationResponse = {
  project: ReviewResponse['project'];
  phase: FiltrationPhase;
  groups: FiltrationGroup[];
};

type SheetFile = FiltrationFile & {
  clientId: string;
  creditName: string;
  subCreditName: string;
  displayName: string;
  dataNote?: string;
  isManual?: boolean;
};

type FileActionScope = 'filtration' | 'supporting' | 'final';

type FileContextMenu = {
  file: SheetFile;
  scope: FileActionScope;
  x: number;
  y: number;
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:5000';
const selectedProjectStorageKey = 'checklist-review-selected-project';
const selectedProjectChangeEvent = 'checklist-review-project-change';

const subscribeToSelectedProject = (onStoreChange: () => void) => {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(selectedProjectChangeEvent, onStoreChange);

  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(selectedProjectChangeEvent, onStoreChange);
  };
};

const getSelectedProjectSnapshot = () => window.localStorage.getItem(selectedProjectStorageKey) ?? '';
const statusOptions: RequirementStatus[] = ['pending', 'missing', 'checked', 'overridden'];
const emptySheets: Record<FiltrationPhase, SheetFile[]> = { pre: [], final: [] };
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

export default function ChecklistReviewPage() {
  const { projects } = useProjects();
  const reviewProjects = useMemo(() => projects.filter((project) => project.id !== 'all'), [projects]);
  const selectedProjectId = useSyncExternalStore(subscribeToSelectedProject, getSelectedProjectSnapshot, () => '');
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [activeRequirement, setActiveRequirement] = useState<ActiveRequirement | null>(null);
  const [error, setError] = useState('');
  const [filtrationPhase, setFiltrationPhase] = useState<FiltrationPhase | null>(null);
  const [filtrationData, setFiltrationData] = useState<FiltrationResponse | null>(null);
  const [isFiltrationLoading, setIsFiltrationLoading] = useState(false);
  const [filtrationError, setFiltrationError] = useState('');
  const [supportingSheets, setSupportingSheets] = useState<Record<FiltrationPhase, SheetFile[]>>(emptySheets);
  const [finalSheets, setFinalSheets] = useState<Record<FiltrationPhase, SheetFile[]>>(emptySheets);
  const [creditStatusOverrides, setCreditStatusOverrides] = useState<Record<string, RequirementStatus>>({});
  const [selectedFiles, setSelectedFiles] = useState<Record<string, boolean>>({});
  const [currentCreditIndex, setCurrentCreditIndex] = useState(0);
  const [fileNameOverrides, setFileNameOverrides] = useState<Record<string, string>>({});
  const [hiddenFiltrationFiles, setHiddenFiltrationFiles] = useState<Record<string, boolean>>({});
  const [fileContextMenu, setFileContextMenu] = useState<FileContextMenu | null>(null);
  const [activeFileInfo, setActiveFileInfo] = useState<SheetFile | null>(null);

  const effectiveSelectedProjectId = reviewProjects.some((project) => project.id === selectedProjectId)
    ? selectedProjectId
    : reviewProjects[0]?.id || '';

  useEffect(() => {
    if (!effectiveSelectedProjectId) return;

    const controller = new AbortController();

    const loadReview = async () => {
      setIsLoading(true);
      setError('');

      try {
        const response = await fetch(`${apiBase}/api/checklists/review/${effectiveSelectedProjectId}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || 'Failed to load checklist review');
        }

        const payload = await response.json();
        setReview(payload.data);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Failed to load checklist review');
          setReview(null);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadReview();

    return () => controller.abort();
  }, [effectiveSelectedProjectId]);

  const selectedProject = reviewProjects.find((project) => project.id === effectiveSelectedProjectId);
  const inferredType = selectedProject ? getProjectSource(selectedProject) : null;
  const preRequirements = review?.items.flatMap((item) => item.preRequirements) ?? [];
  const finalRequirements = review?.items.flatMap((item) => item.finalRequirements) ?? [];
  const completedPre = preRequirements.filter((requirement) => requirement.status === 'checked' || requirement.status === 'overridden').length;
  const completedFinal = finalRequirements.filter((requirement) => requirement.status === 'checked' || requirement.status === 'overridden').length;
  const logChecklistActivity = (
    actionType: string,
    description: string,
    details?: { oldValue?: unknown; newValue?: unknown; metadata?: unknown },
  ) => {
    void logClientActivity({
      actionType,
      moduleName: 'CHECKLIST_REVIEW',
      projectId: review?.project.id || effectiveSelectedProjectId || null,
      projectName: review?.project.name || selectedProject?.name || null,
      description,
      oldValue: details?.oldValue,
      newValue: details?.newValue,
      metadata: details?.metadata,
    });
  };

  const updateRequirementStatus = async (requirementId: string, phase: 'pre' | 'final', status: RequirementStatus) => {
    if (!review) return;

    const previousReview = review;
    const collectionKey = phase === 'pre' ? 'preRequirements' : 'finalRequirements';
    const previousRequirement = review.items
      .flatMap((item) => item[collectionKey])
      .find((requirement) => requirement.id === requirementId);
    setSavingKey(`${requirementId}-${phase}`);
    setReview({
      ...review,
      items: review.items.map((item) => ({
        ...item,
        [collectionKey]: item[collectionKey].map((requirement) => (
          requirement.id === requirementId ? { ...requirement, status } : requirement
        )),
      })),
    });

    try {
      const response = await fetch(`${apiBase}/api/checklists/review/${review.project.id}/items/${requirementId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase, status }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to save checklist status');
      }
      logChecklistActivity(
        'Checklist status updated',
        `${phase === 'pre' ? 'Pre' : 'Final'} certification requirement status changed from ${previousRequirement?.status || 'unknown'} to ${status}.`,
        {
          oldValue: { requirementId, phase, status: previousRequirement?.status },
          newValue: { requirementId, phase, status },
          metadata: { requirementText: previousRequirement?.text || '' },
        },
      );
    } catch (err) {
      setReview(previousReview);
      setError(err instanceof Error ? err.message : 'Failed to save checklist status');
    } finally {
      setSavingKey(null);
    }
  };

  const openFilePreview = (fileId: string) => {
    if (!review) return;
    window.open(`${apiBase}/api/checklists/review/${review.project.id}/files/${fileId}/preview`, '_blank', 'noopener,noreferrer');
  };

  const toSheetFile = (file: FiltrationFile, group: FiltrationGroup): SheetFile => ({
    ...file,
    clientId: `${group.id}-${file.requirementId}-${file.id}`,
    creditName: group.creditName,
    subCreditName: group.subCreditName,
    displayName: file.name,
  });

  const openFiltration = async (phase: FiltrationPhase) => {
    if (!effectiveSelectedProjectId) return;
    setFiltrationPhase(phase);
    setIsFiltrationLoading(true);
    setFiltrationError('');
    setSelectedFiles({});
    setCurrentCreditIndex(0);

    try {
      const response = await fetch(`${apiBase}/api/checklists/review/${effectiveSelectedProjectId}/filtration/${phase}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to load filtration data');
      }

      const payload = await response.json();
      const data = payload.data as FiltrationResponse;
      setFiltrationData(data);
      setCurrentCreditIndex(0);
    } catch (err) {
      setFiltrationError(err instanceof Error ? err.message : 'Failed to load filtration data');
      setFiltrationData(null);
    } finally {
      setIsFiltrationLoading(false);
    }
  };

  const getDisplayName = (file: SheetFile) => fileNameOverrides[file.clientId] ?? file.displayName ?? file.name;

  const getMainCreditName = (creditName?: string) => {
    if (!creditName) return '';
    const prefix = creditName.trim().split(/\s+/)[0]?.toUpperCase();
    return mainCreditNames[prefix] ?? '';
  };

  const getCreditTitle = (group?: FiltrationGroup | null) => {
    if (!group) return `Credit ${currentCreditIndex + 1}`;
    const mainCreditName = getMainCreditName(group.creditName);
    return mainCreditName ? `${group.creditName} (${mainCreditName})` : group.creditName;
  };

  const getCreditStatus = (group?: FiltrationGroup | null): RequirementStatus => {
    if (!group) return 'pending';
    const override = creditStatusOverrides[group.id];
    if (override) return override;
    const statuses = group.requirements.map((requirement) => requirement.status);
    if (statuses.length > 0 && statuses.every((status) => status === 'checked')) return 'checked';
    if (statuses.some((status) => status === 'missing')) return 'missing';
    return 'pending';
  };

  const getGroupFiles = (group: FiltrationGroup): SheetFile[] => (
    group.requirements.flatMap((requirement) => requirement.matchedFiles.map((file) => toSheetFile(file, group)))
  );

  const getScopePrefix = (scope: 'filtration' | 'supporting') => (
    filtrationPhase && currentCreditGroup ? `${filtrationPhase}-${currentCreditGroup.id}-${scope}-` : ''
  );

  const getSelectedKeys = (scope: 'filtration' | 'supporting') => {
    const prefix = getScopePrefix(scope);
    if (!prefix) return [];
    return Object.entries(selectedFiles)
      .filter(([key, selected]) => selected && key.startsWith(prefix))
      .map(([key]) => key.replace(prefix, ''));
  };

  const setFilesSelected = (scope: 'filtration' | 'supporting', files: SheetFile[], selected: boolean) => {
    const prefix = getScopePrefix(scope);
    if (!prefix) return;
    setSelectedFiles((current) => {
      const next = { ...current };
      files.forEach((file) => {
        next[`${prefix}${file.clientId}`] = selected;
      });
      return next;
    });
  };

  const clearSelection = (scope: 'filtration' | 'supporting') => {
    const prefix = getScopePrefix(scope);
    if (!prefix) return;
    setSelectedFiles((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(prefix))));
  };

  const moveSelectedToSupporting = () => {
    if (!filtrationPhase) return;
    const selectedKeys = new Set(getSelectedKeys('filtration'));
    if (selectedKeys.size === 0) return;
    const files = availableFiltrationFiles.filter((file) => selectedKeys.has(file.clientId));

    setSupportingSheets((current) => {
      const existing = new Set(current[filtrationPhase].map((file) => file.clientId));
      return {
        ...current,
        [filtrationPhase]: [
          ...current[filtrationPhase],
          ...files.filter((file) => !existing.has(file.clientId)).map((file) => ({ ...file, displayName: getDisplayName(file) })),
        ],
      };
    });
    clearSelection('filtration');
    logChecklistActivity(
      'Checklist files moved',
      `${files.length} file${files.length === 1 ? '' : 's'} moved to Supporting Document.`,
      {
        newValue: files.map((file) => ({ id: file.id, name: getDisplayName(file) })),
        metadata: { phase: filtrationPhase, destination: 'supporting' },
      },
    );
  };

  const moveFileToSupporting = (file: SheetFile) => {
    if (!filtrationPhase) return;

    setSupportingSheets((current) => {
      const existing = new Set(current[filtrationPhase].map((item) => item.clientId));
      if (existing.has(file.clientId)) return current;

      return {
        ...current,
        [filtrationPhase]: [...current[filtrationPhase], { ...file, displayName: getDisplayName(file) }],
      };
    });
    setHiddenFiltrationFiles((current) => {
      if (!current[file.clientId]) return current;
      const next = { ...current };
      delete next[file.clientId];
      return next;
    });
    setFileContextMenu(null);
    logChecklistActivity(
      'Checklist file moved',
      `"${getDisplayName(file)}" moved to Supporting Document.`,
      {
        newValue: { fileId: file.id, fileName: getDisplayName(file), destination: 'supporting' },
        metadata: { phase: filtrationPhase },
      },
    );
  };

  const moveSelectedToFinal = () => {
    if (!filtrationPhase) return;
    const selectedKeys = new Set(getSelectedKeys('supporting'));
    if (selectedKeys.size === 0) return;
    const files = currentSupportingFiles.filter((file) => selectedKeys.has(file.clientId));

    setFinalSheets((current) => {
      const existing = new Set(current[filtrationPhase].map((file) => file.clientId));
      return {
        ...current,
        [filtrationPhase]: [
          ...current[filtrationPhase],
          ...files.filter((file) => !existing.has(file.clientId)).map((file) => ({ ...file, displayName: getDisplayName(file) })),
        ],
      };
    });
    setSupportingSheets((current) => ({
      ...current,
      [filtrationPhase]: current[filtrationPhase].filter((file) => !selectedKeys.has(file.clientId)),
    }));
    clearSelection('supporting');
    logChecklistActivity(
      'Checklist files moved',
      `${files.length} file${files.length === 1 ? '' : 's'} moved to IGBC submission.`,
      {
        newValue: files.map((file) => ({ id: file.id, name: getDisplayName(file) })),
        metadata: { phase: filtrationPhase, destination: 'final' },
      },
    );
  };

  const moveFileToFinal = (file: SheetFile) => {
    if (!filtrationPhase) return;

    setFinalSheets((current) => {
      const existing = new Set(current[filtrationPhase].map((item) => item.clientId));
      if (existing.has(file.clientId)) return current;

      return {
        ...current,
        [filtrationPhase]: [...current[filtrationPhase], { ...file, displayName: getDisplayName(file) }],
      };
    });
    setSupportingSheets((current) => ({
      ...current,
      [filtrationPhase]: current[filtrationPhase].filter((item) => item.clientId !== file.clientId),
    }));
    setSelectedFiles((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.endsWith(file.clientId))));
    setFileContextMenu(null);
    logChecklistActivity(
      'Checklist file moved',
      `"${getDisplayName(file)}" moved to IGBC submission.`,
      {
        newValue: { fileId: file.id, fileName: getDisplayName(file), destination: 'final' },
        metadata: { phase: filtrationPhase },
      },
    );
  };

  const updateFileDisplayName = (file: SheetFile) => {
    const previousName = getDisplayName(file);
    const nextName = window.prompt('Edit file name', previousName);
    const trimmedName = nextName?.trim();
    if (!trimmedName) return;

    setFileNameOverrides((current) => ({ ...current, [file.clientId]: trimmedName }));
    setSupportingSheets((current) => ({
      pre: current.pre.map((item) => (item.clientId === file.clientId ? { ...item, displayName: trimmedName } : item)),
      final: current.final.map((item) => (item.clientId === file.clientId ? { ...item, displayName: trimmedName } : item)),
    }));
    setFinalSheets((current) => ({
      pre: current.pre.map((item) => (item.clientId === file.clientId ? { ...item, displayName: trimmedName } : item)),
      final: current.final.map((item) => (item.clientId === file.clientId ? { ...item, displayName: trimmedName } : item)),
    }));
    setFileContextMenu(null);
    logChecklistActivity(
      'Checklist file renamed',
      `Checklist file renamed from "${previousName}" to "${trimmedName}".`,
      {
        oldValue: { fileId: file.id, displayName: previousName },
        newValue: { fileId: file.id, displayName: trimmedName },
        metadata: { phase: filtrationPhase },
      },
    );
  };

  const removeFileToPreviousStep = (file: SheetFile, scope: FileActionScope) => {
    if (!filtrationPhase) return;

    if (scope === 'final') {
      setFinalSheets((current) => ({
        ...current,
        [filtrationPhase]: current[filtrationPhase].filter((item) => item.clientId !== file.clientId),
      }));
      setSupportingSheets((current) => {
        const existing = new Set(current[filtrationPhase].map((item) => item.clientId));
        if (existing.has(file.clientId)) return current;

        return {
          ...current,
          [filtrationPhase]: [...current[filtrationPhase], { ...file, displayName: getDisplayName(file) }],
        };
      });
    }

    if (scope === 'supporting') {
      setSupportingSheets((current) => ({
        ...current,
        [filtrationPhase]: current[filtrationPhase].filter((item) => item.clientId !== file.clientId),
      }));
      setHiddenFiltrationFiles((current) => {
        if (!current[file.clientId]) return current;
        const next = { ...current };
        delete next[file.clientId];
        return next;
      });
    }

    setSelectedFiles((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.endsWith(file.clientId))));
    setFileContextMenu(null);
    logChecklistActivity(
      'Checklist file removed',
      `"${getDisplayName(file)}" removed from ${scope === 'final' ? 'IGBC submission' : 'Supporting Document'} and returned to the previous step.`,
      {
        oldValue: { fileId: file.id, fileName: getDisplayName(file), scope },
        newValue: { destination: scope === 'final' ? 'supporting' : 'filtration' },
        metadata: { phase: filtrationPhase },
      },
    );
  };

  const openFileEditor = (fileId: string, target: '_blank' | '_self') => {
    if (target === '_blank') {
      window.open(`/files/editor/${fileId}`, '_blank', 'noopener,noreferrer');
      return;
    }

    window.location.href = `/files/editor/${fileId}`;
  };

  const saveFinalSheet = () => {
    if (!filtrationPhase) return;
    const currentGroup = filtrationData?.groups[currentCreditIndex];
    const files = currentGroup
      ? finalSheets[filtrationPhase].filter((file) => file.creditName === currentGroup.creditName && file.subCreditName === currentGroup.subCreditName)
      : finalSheets[filtrationPhase];
    const payload = {
      projectId: effectiveSelectedProjectId,
      phase: filtrationPhase,
      creditName: currentGroup?.creditName ?? '',
      subCreditName: currentGroup?.subCreditName ?? '',
      files: files.map((file, index) => ({
        order: index + 1,
        id: file.id,
        displayName: getDisplayName(file),
        status: getCreditStatus(currentGroup),
        path: file.path,
        relativePath: file.relativePath,
        creditName: file.creditName,
        subCreditName: file.subCreditName,
        requirementId: file.requirementId,
        requirementName: file.requirementName,
        dataNote: file.dataNote ?? '',
        isManual: Boolean(file.isManual),
      })),
    };
    console.log('IGBC Pre Submission payload', payload);
    logChecklistActivity(
      'Checklist final sheet saved',
      `${filtrationPhase === 'pre' ? 'Pre' : 'Final'} certification sheet saved with ${files.length} file${files.length === 1 ? '' : 's'}.`,
      {
        newValue: payload,
        metadata: { phase: filtrationPhase, creditName: currentGroup?.creditName || '' },
      },
    );
  };

  const renderStatusSelect = (requirement: RequirementPoint, phase: 'pre' | 'final') => {
    const saving = savingKey === `${requirement.id}-${phase}`;

    return (
      <div className={styles.statusControl}>
        <select
          value={requirement.status}
          onChange={(event) => updateRequirementStatus(requirement.id, phase, event.target.value as RequirementStatus)}
          className={`${styles.statusSelect} ${styles[`status-${requirement.status}`]}`}
          disabled={saving}
          aria-label={`${phase === 'pre' ? 'Pre' : 'Final'} requirement status`}
        >
          {statusOptions.map((option) => (
            <option key={option} value={option}>
              {option[0].toUpperCase() + option.slice(1)}
            </option>
          ))}
        </select>
        {saving && <Loader2 size={14} className={styles.savingIcon} />}
      </div>
    );
  };

  const renderRequirements = (requirements: RequirementPoint[], phase: 'pre' | 'final') => {
    if (requirements.length === 0) return <span className={styles.emptyRequirement}>-</span>;

    return (
      <div className={styles.requirementList}>
        {requirements.map((requirement) => (
          <div key={requirement.id} className={`${styles.requirementPoint} ${styles[`point-${requirement.status}`]}`}>
            <button
              type="button"
              className={styles.requirementTextButton}
              onClick={() => setActiveRequirement({ requirement, phase })}
            >
              {requirement.text}
            </button>
            {renderStatusSelect(requirement, phase)}
          </div>
        ))}
      </div>
    );
  };

  const renderFileRow = (file: SheetFile, scope: FileActionScope) => {
    const selectionKey = filtrationPhase && currentCreditGroup ? `${filtrationPhase}-${currentCreditGroup.id}-${scope}-${file.clientId}` : file.clientId;
    const isSelectable = scope !== 'final';

    return (
      <div
        key={`${scope}-${file.clientId}`}
        className={`${styles.filtrationFileRow} ${!isSelectable ? styles.finalFileRow : ''}`}
        onClick={() => {
          setActiveFileInfo(file);
          setFileContextMenu(null);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          setActiveFileInfo(null);
          setFileContextMenu({ file, scope, x: event.clientX, y: event.clientY });
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

  const renderFileList = (files: SheetFile[], scope: FileActionScope, emptyMessage: string) => {
    if (files.length === 0) return <p className={styles.noFiles}>{emptyMessage}</p>;
    return files.map((file) => renderFileRow(file, scope));
  };

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

  const selectedCount = (scope: 'filtration' | 'supporting') => getSelectedKeys(scope).length;

  const currentCreditGroup = filtrationData?.groups[currentCreditIndex] ?? null;
  const currentRequirementTitle = currentCreditGroup?.requirements.map((requirement) => requirement.requirementName).filter(Boolean).join(' | ') ?? '';
  const currentGroupFiles = currentCreditGroup ? getGroupFiles(currentCreditGroup) : [];
  const currentSupportingFiles = filtrationPhase && currentCreditGroup
    ? supportingSheets[filtrationPhase].filter((file) => file.creditName === currentCreditGroup.creditName && file.subCreditName === currentCreditGroup.subCreditName)
    : [];
  const currentFinalFiles = filtrationPhase && currentCreditGroup
    ? finalSheets[filtrationPhase].filter((file) => file.creditName === currentCreditGroup.creditName && file.subCreditName === currentCreditGroup.subCreditName)
    : [];
  const stagedKeys = new Set([...currentSupportingFiles, ...currentFinalFiles].map((file) => file.clientId));
  const availableFiltrationFiles = sortFilesForDisplay(currentGroupFiles.filter((file) => !stagedKeys.has(file.clientId) && !hiddenFiltrationFiles[file.clientId]));

  return (
    <div className={styles.container}>
      <div className={`${styles.toolbar} glassmorphism`}>
        <div className={styles.selectorGroup}>
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

        <div className={styles.summaryGroup}>
          <ClientMailButton
            projectId={effectiveSelectedProjectId}
            projectName={review?.project.name || selectedProject?.name}
            projectType={review?.project.type || (inferredType === 'GREEN_HOMES' ? 'GH' : inferredType || undefined)}
            disabled={isLoading || !review}
          />
          <span className={styles.summaryPill}>{review?.project.type ?? (inferredType === 'GREEN_HOMES' ? 'GH' : inferredType ?? 'Project')}</span>
          <span className={styles.summaryPill}>Pre {completedPre}/{preRequirements.length}</span>
          <span className={styles.summaryPill}>Final {completedFinal}/{finalRequirements.length}</span>
        </div>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      <div className={`${styles.tableCard} glassmorphism`}>
        {isLoading ? (
          <div className={styles.loadingState}>
            <Loader2 size={28} className={styles.loadingIcon} />
            <span>Loading checklist review</span>
          </div>
        ) : review && review.items.length > 0 ? (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Credit Name</th>
                  <th>Sub Credit / Module Name</th>
                  <th>Pre Certification</th>
                  <th>Final Certification</th>
                </tr>
              </thead>
              <tbody>
                {review.items.map((item) => (
                  <tr key={item.id}>
                    <td className={styles.creditCell}>{item.creditName || '-'}</td>
                    <td>{item.subCreditName || '-'}</td>
                    <td>{renderRequirements(item.preRequirements, 'pre')}</td>
                    <td>{renderRequirements(item.finalRequirements, 'final')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <ClipboardCheck size={42} />
            <h3>No checklist rows available</h3>
            <p>Select a project with an NB or GH checklist source.</p>
          </div>
        )}
      </div>

      {activeRequirement && (
        <div className={styles.modalOverlay} onClick={() => setActiveRequirement(null)}>
          <div className={`${styles.modal} glassmorphism`} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>Requirement Details</h2>
                <span className={`${styles.statusBadge} ${styles[`status-${activeRequirement.requirement.status}`]}`}>
                  {activeRequirement.requirement.status}
                </span>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setActiveRequirement(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.modalSection}>
                <h3>Requirement</h3>
                <p>{activeRequirement.requirement.text}</p>
              </div>

              <div className={styles.modalSection}>
                <h3>Matched Files</h3>
                {activeRequirement.requirement.matchedFiles.length > 0 ? (
                  <div className={styles.fileList}>
                    {activeRequirement.requirement.matchedFiles.map((file) => (
                      <button key={file.id} type="button" className={styles.fileButton} onClick={() => openFilePreview(file.id)}>
                        <span>{file.name}</span>
                        <ExternalLink size={14} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className={styles.noFiles}>No matched files found</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {filtrationPhase && (
        <div className={styles.modalOverlay} onClick={() => setFiltrationPhase(null)}>
          <div className={`${styles.filtrationModal} glassmorphism`} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>{filtrationPhase === 'pre' ? 'Pre Certification Filtration' : 'Final Certification Filtration'}</h2>
                <span className={styles.modalCaption}>{filtrationData?.project.name ?? selectedProject?.name ?? 'Selected project'}</span>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setFiltrationPhase(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {filtrationError && <div className={styles.filtrationError}>{filtrationError}</div>}

            {isFiltrationLoading ? (
              <div className={styles.loadingState}>
                <Loader2 size={28} className={styles.loadingIcon} />
                <span>Loading filtration data</span>
              </div>
            ) : (
              <>
                <div className={styles.currentCreditBar}>
                  <div>
                    <h3>{getCreditTitle(currentCreditGroup)}</h3>
                    {currentRequirementTitle && <span>{currentRequirementTitle}</span>}
                  </div>
                  <select
                    value={getCreditStatus(currentCreditGroup)}
                    onChange={(event) => {
                      if (!currentCreditGroup) return;
                      setCreditStatusOverrides((current) => ({
                        ...current,
                        [currentCreditGroup.id]: event.target.value as RequirementStatus,
                      }));
                    }}
                    className={`${styles.statusSelect} ${styles[`status-${getCreditStatus(currentCreditGroup)}`]}`}
                    aria-label="Credit performance status"
                  >
                    {statusOptions.map((option) => (
                      <option key={option} value={option}>
                        {option[0].toUpperCase() + option.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.filtrationBody}>
                  <section className={styles.filtrationPane}>
                    <div className={styles.filtrationPaneHeader}>
                      <h3>Filtration</h3>
                      <span>{filtrationPhase === 'pre' ? 'Pre Certification folder only' : 'Final Certification folder only'}</span>
                    </div>
                    <div className={styles.bulkActionBar}>
                      <button type="button" onClick={() => setFilesSelected('filtration', availableFiltrationFiles, true)} disabled={availableFiltrationFiles.length === 0}>
                        Select All
                      </button>
                      <button type="button" onClick={() => clearSelection('filtration')} disabled={selectedCount('filtration') === 0}>
                        Clear
                      </button>
                      <button type="button" className={styles.moveButton} onClick={moveSelectedToSupporting} disabled={selectedCount('filtration') === 0}>
                        Move Selected <ArrowRight size={14} />
                      </button>
                    </div>
                    <div className={styles.filtrationScroll}>
                      {renderFileList(availableFiltrationFiles, 'filtration', 'No filtered files found')}
                    </div>
                  </section>

                  <div className={styles.rightPaneStack}>
                    <section className={`${styles.filtrationPane} ${styles.supportingPane}`}>
                      <div className={styles.filtrationPaneHeader}>
                        <h3>Supporting Document</h3>
                        <span>{currentSupportingFiles.length} files</span>
                      </div>
                      <div className={styles.bulkActionBar}>
                        <button type="button" onClick={() => setFilesSelected('supporting', currentSupportingFiles, true)} disabled={currentSupportingFiles.length === 0}>
                          Select All
                        </button>
                        <button type="button" onClick={() => clearSelection('supporting')} disabled={selectedCount('supporting') === 0}>
                          Clear
                        </button>
                        <button type="button" className={styles.moveButton} onClick={moveSelectedToFinal} disabled={selectedCount('supporting') === 0}>
                          Move Selected <ArrowRight size={14} />
                        </button>
                      </div>
                      <div className={styles.filtrationScroll}>
                        {renderFileList(currentSupportingFiles, 'supporting', 'No supporting files selected')}
                      </div>
                    </section>

                    <section className={`${styles.filtrationPane} ${styles.finalSubmissionPane}`}>
                      <div className={styles.filtrationPaneHeader}>
                        <h3>IGBC Pre Submission</h3>
                        <span>{currentFinalFiles.length} files</span>
                      </div>
                      <div className={styles.filtrationScroll}>
                        {renderFileList(currentFinalFiles, 'final', 'No files added to IGBC Pre Submission')}
                      </div>
                      <div className={styles.finalSheetFooter}>
                        <button type="button" className={styles.saveSheetButton} onClick={saveFinalSheet}>
                          <Save size={16} />
                          Save
                        </button>
                      </div>
                    </section>
                  </div>
                </div>

                <div className={styles.bottomNavigator}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFiles({});
                      setCurrentCreditIndex((index) => Math.max(index - 1, 0));
                    }}
                    disabled={currentCreditIndex === 0}
                  >
                    Back
                  </button>
                  <span>{currentCreditIndex + 1} / {filtrationData?.groups.length ?? 0}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFiles({});
                      setCurrentCreditIndex((index) => Math.min(index + 1, (filtrationData?.groups.length ?? 1) - 1));
                    }}
                    disabled={!filtrationData || currentCreditIndex >= filtrationData.groups.length - 1}
                  >
                    Next
                  </button>
                </div>

                {fileContextMenu && (
                  <div
                    className={styles.fileContextMenu}
                    style={{ left: fileContextMenu.x, top: fileContextMenu.y }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {fileContextMenu.scope === 'filtration' ? (
                      <button type="button" onClick={() => moveFileToSupporting(fileContextMenu.file)}>
                        <ArrowRight size={14} />
                        Move to Supporting
                      </button>
                    ) : (
                      <>
                        <button type="button" onClick={() => updateFileDisplayName(fileContextMenu.file)}>
                          <Edit3 size={14} />
                          Edit file name
                        </button>
                        <button type="button" onClick={() => openFilePreview(fileContextMenu.file.id)}>
                          <ExternalLink size={14} />
                          View file
                        </button>
                        {fileContextMenu.scope === 'supporting' && (
                          <button type="button" onClick={() => moveFileToFinal(fileContextMenu.file)}>
                            <ArrowRight size={14} />
                            Move to IGBC
                          </button>
                        )}
                        <button type="button" onClick={() => openFileEditor(fileContextMenu.file.id, '_blank')}>
                          <FileText size={14} />
                          Edit file internal data
                        </button>
                        <button type="button" className={styles.dangerMenuItem} onClick={() => removeFileToPreviousStep(fileContextMenu.file, fileContextMenu.scope)}>
                          <Trash2 size={14} />
                          Delete file
                        </button>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {activeFileInfo && (
        <div className={styles.fileInfoOverlay} onClick={() => setActiveFileInfo(null)}>
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
                <dd>{activeFileInfo.extension || 'Unknown'}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{activeFileInfo.status}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
