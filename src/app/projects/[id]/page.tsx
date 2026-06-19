"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type FileNode = { id: string; name: string; path: string; relativePath: string; extension?: string; size?: number };
type FolderNode = { id: string; name: string; path: string; relativePath: string; children: FolderNode[]; files: FileNode[] };

const getApiBase = (): string => {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) return process.env.NEXT_PUBLIC_API_BASE_URL;
  return 'http://127.0.0.1:5000';
};

export default function ProjectExplorerPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = (params as any)?.id as string;

  const [tree, setTree] = useState<FolderNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(`${getApiBase()}/api/projects/${projectId}/tree/public`);
        if (!res.ok) {
          throw new Error(`Failed to load project tree (${res.status})`);
        }
        const json = await res.json();
        setTree(json.data || []);
      } catch (err: any) {
        setError(err.message || 'Unable to load project tree');
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  return (
    <div style={{ padding: 20 }}>
      <button onClick={() => router.back()} style={{ marginBottom: 12 }}>Back</button>
      <h2>Project Explorer</h2>
      {loading && <div>Loading project contents…</div>}
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {!loading && !error && tree && tree.length === 0 && <div>No folders found for this project.</div>}
      <div>
        {tree && tree.map((folder) => (
          <div key={folder.id} style={{ border: '1px solid rgba(255,255,255,0.04)', padding: 12, marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>{folder.name}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>{folder.relativePath || folder.path}</div>
            <div style={{ marginTop: 8 }}>
              {folder.files && folder.files.length > 0 ? (
                <ul>
                  {folder.files.map((f) => (
                    <li key={f.id}>{f.name} {f.extension ? `· ${f.extension}` : ''}</li>
                  ))}
                </ul>
              ) : (
                <div style={{ fontStyle: 'italic', color: 'var(--muted)' }}>No files in this folder</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
