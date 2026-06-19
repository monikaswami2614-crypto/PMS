'use client';

import React, { useState } from 'react';

type TreeNode = {
  id?: string;
  name: string;
  path?: string;
  relativePath?: string;
  children?: TreeNode[];
  files?: { id?: string; name: string; path?: string; relativePath?: string }[];
};

const getApiBase = (): string => {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) return process.env.NEXT_PUBLIC_API_BASE_URL.replace(/\/$/, '');
  return 'http://127.0.0.1:5000';
};

export default function ImportPage() {
  const [pathInput, setPathInput] = useState('C:\\Users\\monika.swami\\Desktop\\Leed Project\\NB Projects');
  const [loading, setLoading] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importProject = async () => {
    setLoading(true);
    setError(null);
    setTree(null);
    try {
      const res = await fetch(`${getApiBase()}/api/projects/import/public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ absolutePath: pathInput })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.error || 'Import failed');
      }

      const data = await res.json();
      setProjectId(data.data?.projectId || data?.data?.projectId || data.projectId || null);
      if (data.data?.projectId) {
        await fetchTree(data.data.projectId);
      }
    } catch (e: any) {
      setError(e?.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fetchTree = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/projects/${id}/tree/public`);
      if (!res.ok) throw new Error('Failed to fetch tree');
      const json = await res.json();
      setTree(json.data || null);
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch tree');
    } finally {
      setLoading(false);
    }
  };

  const renderNode = (node: TreeNode, depth = 0) => (
    <div key={node.id || node.name} style={{ marginLeft: depth * 16 }}>
      <div style={{ fontWeight: '600' }}>{node.name}</div>
      {node.files && node.files.map(f => (
        <div key={f.id || f.name} style={{ marginLeft: 12 }}>{f.name}</div>
      ))}
      {node.children && node.children.map(child => renderNode(child, depth + 1))}
    </div>
  );

  return (
    <div style={{ padding: 20 }}>
      <h2>Import Local Project</h2>
      <p>Enter the absolute Windows folder path to import into the system.</p>
      <input value={pathInput} onChange={(e) => setPathInput(e.target.value)} style={{ width: '100%', padding: 8 }} />
      <div style={{ marginTop: 12 }}>
        <button onClick={importProject} disabled={loading} style={{ padding: '8px 12px' }}>
          {loading ? 'Importing...' : 'Import Project'}
        </button>
      </div>

      {error && <div style={{ color: 'red', marginTop: 12 }}>{error}</div>}

      {projectId && <div style={{ marginTop: 12 }}>Imported project id: {projectId}</div>}

      {tree && (
        <div style={{ marginTop: 16 }}>
          <h3>Project Tree</h3>
          {tree.map(node => renderNode(node))}
        </div>
      )}
    </div>
  );
}
