'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Eye, Filter, Search, X } from 'lucide-react';
import { useProjects } from '@/context/ProjectContext';
import styles from './page.module.css';

type ActivityLog = {
  id: string;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  actionType: string;
  moduleName: string;
  projectId?: string | null;
  projectName?: string | null;
  description: string;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
};

const SESSION_KEY = 'kamal-cogent-session';
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:5000';

const jsonText = (value: unknown) => {
  if (value === null || value === undefined) return '-';
  return JSON.stringify(value, null, 2);
};

export default function ActivityLogsPage() {
  const router = useRouter();
  const { projects, team } = useProjects();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [projectId, setProjectId] = useState('');
  const [userId, setUserId] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [actionType, setActionType] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage.getItem(SESSION_KEY) !== 'active') {
      router.push('/login');
    }
  }, [router]);

  const moduleOptions = useMemo(() => Array.from(new Set(logs.map((log) => log.moduleName))).sort(), [logs]);
  const actionOptions = useMemo(() => Array.from(new Set(logs.map((log) => log.actionType))).sort(), [logs]);

  useEffect(() => {
    const controller = new AbortController();

    const fetchLogs = async () => {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
      });

      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (projectId) params.set('projectId', projectId);
      if (userId) params.set('userId', userId);
      if (moduleName) params.set('moduleName', moduleName);
      if (actionType) params.set('actionType', actionType);
      if (search.trim()) params.set('search', search.trim());

      try {
        const response = await fetch(`${apiBase}/api/activity-logs?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Failed to load activity logs');
        const payload = await response.json();
        setLogs(payload.data || []);
        setTotalPages(payload.pagination?.totalPages || 1);
      } catch (error) {
        if (!controller.signal.aborted) {
          setLogs([]);
          setTotalPages(1);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    fetchLogs();
    return () => controller.abort();
  }, [actionType, endDate, moduleName, page, projectId, search, startDate, userId]);

  const resetFilters = () => {
    setStartDate('');
    setEndDate('');
    setProjectId('');
    setUserId('');
    setModuleName('');
    setActionType('');
    setSearch('');
    setPage(1);
  };

  return (
    <div className={styles.container}>
      <div className={`${styles.toolbar} glassmorphic`}>
        <div className={styles.toolbarTitle}>
          <Filter size={18} />
          <div>
            <h2>Activity Logs</h2>
            <p>View-only audit trail of important project changes.</p>
          </div>
        </div>
      </div>

      <div className={`${styles.filters} glassmorphic`}>
        <label>
          <span>From</span>
          <input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} />
        </label>
        <label>
          <span>To</span>
          <input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} />
        </label>
        <label>
          <span>Project</span>
          <select value={projectId} onChange={(event) => { setProjectId(event.target.value); setPage(1); }}>
            <option value="">All Projects</option>
            {projects.filter((project) => project.id !== 'all').map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>User</span>
          <select value={userId} onChange={(event) => { setUserId(event.target.value); setPage(1); }}>
            <option value="">All Users</option>
            {team.map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Module</span>
          <select value={moduleName} onChange={(event) => { setModuleName(event.target.value); setPage(1); }}>
            <option value="">All Modules</option>
            {moduleOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label>
          <span>Action</span>
          <select value={actionType} onChange={(event) => { setActionType(event.target.value); setPage(1); }}>
            <option value="">All Actions</option>
            {actionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className={styles.searchField}>
          <span>Search</span>
          <div className={styles.searchBox}>
            <Search size={16} />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search logs..." />
          </div>
        </label>
        <button type="button" className={styles.clearBtn} onClick={resetFilters}>Clear</button>
      </div>

      <div className={`${styles.tableCard} glassmorphic`}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>User</th>
              <th>Project</th>
              <th>Module</th>
              <th>Action</th>
              <th>Description</th>
              <th>View</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} onClick={() => setSelectedLog(log)}>
                <td>{new Date(log.createdAt).toLocaleString()}</td>
                <td>{log.userName || log.userEmail || '-'}</td>
                <td>{log.projectName || '-'}</td>
                <td>{log.moduleName}</td>
                <td>{log.actionType}</td>
                <td>{log.description}</td>
                <td><Eye size={16} /></td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && logs.length === 0 && (
          <div className={styles.emptyState}>No activity logs found.</div>
        )}
        {loading && <div className={styles.emptyState}>Loading activity logs...</div>}
      </div>

      <div className={styles.pagination}>
        <button disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
        <span>Page {page} of {totalPages}</span>
        <button disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</button>
      </div>

      {selectedLog && (
        <div className={styles.overlay} onClick={() => setSelectedLog(null)}>
          <div className={`${styles.detailsModal} glassmorphic`} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <span><CalendarDays size={14} /> Exact Timestamp</span>
                <h2>{new Date(selectedLog.createdAt).toLocaleString()}</h2>
              </div>
              <button type="button" onClick={() => setSelectedLog(null)} aria-label="Close details">
                <X size={18} />
              </button>
            </div>

            <div className={styles.detailsGrid}>
              <div><span>User</span><strong>{selectedLog.userName || selectedLog.userEmail || '-'}</strong></div>
              <div><span>Project</span><strong>{selectedLog.projectName || '-'}</strong></div>
              <div><span>Module</span><strong>{selectedLog.moduleName}</strong></div>
              <div><span>Action</span><strong>{selectedLog.actionType}</strong></div>
              <div><span>IP Address</span><strong>{selectedLog.ipAddress || '-'}</strong></div>
              <div><span>User Agent</span><strong>{selectedLog.userAgent || '-'}</strong></div>
            </div>

            <div className={styles.jsonGrid}>
              <label><span>Old Value</span><pre>{jsonText(selectedLog.oldValue)}</pre></label>
              <label><span>New Value</span><pre>{jsonText(selectedLog.newValue)}</pre></label>
              <label><span>Metadata</span><pre>{jsonText(selectedLog.metadata)}</pre></label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
