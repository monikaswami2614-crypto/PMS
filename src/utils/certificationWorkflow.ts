export type CertificationPhase = 'pre' | 'final';
export type SubmissionRound = 'first' | 'second';
export type WorkflowChecklistType = 'nb' | 'gh';
export type WorkflowRequirementStatus = 'pending' | 'missing' | 'checked' | 'overridden';

export const feasibilitySelectionChangeEvent = 'pms-feasibility-selection-change';
export const checklistStatusChangeEvent = 'pms-checklist-status-change';
export const checklistStatusesStorageKey = 'pms-checklist-review-statuses-by-scope';

export const getCertificationScopeKey = (
  projectId: string,
  checklistType: WorkflowChecklistType,
  phase: CertificationPhase,
  submissionRound: SubmissionRound,
): string => `${projectId}_${checklistType.toUpperCase()}_${phase}_${submissionRound}`;

export const getSelectedCreditsScopeStorageKey = (scopeKey: string): string => (
  `feasibility_selected_credits_${scopeKey}`
);

export const getManualPointsScopeStorageKey = (scopeKey: string): string => (
  `feasibility_manual_points_${scopeKey}`
);

export const getReviewResponseScopeStorageKey = (scopeKey: string): string => (
  `feasibility_review_response_${scopeKey}`
);

export type ChecklistStatusesByScope = Record<string, Record<string, WorkflowRequirementStatus>>;

export const readChecklistStatuses = (): ChecklistStatusesByScope => {
  try {
    const stored = window.localStorage.getItem(checklistStatusesStorageKey);
    return stored ? JSON.parse(stored) as ChecklistStatusesByScope : {};
  } catch {
    window.localStorage.removeItem(checklistStatusesStorageKey);
    return {};
  }
};

export const writeChecklistStatuses = (statuses: ChecklistStatusesByScope): void => {
  window.localStorage.setItem(checklistStatusesStorageKey, JSON.stringify(statuses));
  window.dispatchEvent(new CustomEvent(checklistStatusChangeEvent));
};

export const updateChecklistStatusesForScope = (
  scopeKey: string,
  updates: Record<string, WorkflowRequirementStatus>,
): ChecklistStatusesByScope => {
  const current = readChecklistStatuses();
  const next = {
    ...current,
    [scopeKey]: {
      ...(current[scopeKey] ?? {}),
      ...updates,
    },
  };
  writeChecklistStatuses(next);
  return next;
};

export const removeChecklistStatusesForScope = (
  scopeKey: string,
  requirementIds: string[],
): ChecklistStatusesByScope => {
  const current = readChecklistStatuses();
  const nextScope = { ...(current[scopeKey] ?? {}) };
  requirementIds.forEach((requirementId) => {
    delete nextScope[requirementId];
  });
  const next = { ...current, [scopeKey]: nextScope };
  writeChecklistStatuses(next);
  return next;
};
