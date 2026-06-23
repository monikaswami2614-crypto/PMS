type ActivityLogInput = {
  actionType: string;
  moduleName: string;
  projectId?: string | null;
  projectName?: string | null;
  description: string;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: unknown;
};

const PROFILE_KEY = 'kamal-cogent-user-profile';
const USER_ID_KEY = 'kamal-cogent-user-id';

const getCurrentUser = () => {
  if (typeof window === 'undefined') return null;

  const userId = window.localStorage.getItem(USER_ID_KEY) || undefined;
  const profile = window.localStorage.getItem(PROFILE_KEY);

  if (!profile) return { id: userId, name: userId, email: undefined };

  try {
    const parsed = JSON.parse(profile) as { name?: string; email?: string };
    return {
      id: userId,
      name: parsed.name || userId,
      email: parsed.email,
    };
  } catch {
    return { id: userId, name: userId, email: undefined };
  }
};

export const logClientActivity = async (input: ActivityLogInput): Promise<void> => {
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:5000';
    await fetch(`${apiBase}/api/activity-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...input,
        user: getCurrentUser(),
      }),
    });
  } catch {
    // Activity logging should never block the user's main workflow.
  }
};
