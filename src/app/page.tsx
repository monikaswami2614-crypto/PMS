'use client';

import React, { useEffect, useState } from 'react';
import { getProjectSource, useProjects } from '@/context/ProjectContext';
import StatCard from '@/components/StatCard';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  TrendingUp,
  Calendar
} from 'lucide-react';
import styles from './page.module.css';

export default function DashboardPage() {
  const { tasks, selectedProject, projects, sourceFilter } = useProjects();
  const [displayName, setDisplayName] = useState('Sarah');

  useEffect(() => {
    const loadDisplayName = () => {
      const savedProfile = window.localStorage.getItem('kamal-cogent-user-profile');
      const savedUserId = window.localStorage.getItem('kamal-cogent-user-id');

      if (savedProfile) {
        try {
          const profile = JSON.parse(savedProfile) as { name?: string };
          setDisplayName(profile.name?.trim() || savedUserId || 'User');
          return;
        } catch {
          window.localStorage.removeItem('kamal-cogent-user-profile');
        }
      }

      setDisplayName(savedUserId || 'User');
    };

    loadDisplayName();

    const handleProfileUpdated = () => loadDisplayName();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'kamal-cogent-user-profile' || event.key === 'kamal-cogent-user-id') {
        loadDisplayName();
      }
    };

    window.addEventListener('kamal-cogent-profile-updated', handleProfileUpdated);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('kamal-cogent-profile-updated', handleProfileUpdated);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const sourceLabel = sourceFilter === 'NB' ? 'NB Projects' : sourceFilter === 'GREEN_HOMES' ? 'Green Homes' : null;
  const scopedProjects = projects.filter((project) => {
    if (project.id === 'all') return false;
    if (selectedProject !== 'all' && project.id !== selectedProject) return false;
    if (sourceFilter && getProjectSource(project) !== sourceFilter) return false;
    return true;
  });
  const isSourceDashboard = Boolean(sourceFilter);

  // Filter tasks based on selected project
  const sourceByProjectId = new Map(projects.map((project) => [project.id, getProjectSource(project)]));
  const filteredTasks = tasks.filter((task) => {
    if (selectedProject !== 'all' && task.project !== selectedProject) return false;
    if (sourceFilter && sourceByProjectId.get(task.project) !== sourceFilter) return false;
    return true;
  });

  // Compute Metrics
  const projectTotal = scopedProjects.length;
  const completedProjects = scopedProjects.filter((project) => ['FINAL_SUBMISSION', 'completed', 'done'].includes(project.checklistStage || project.status || '')).length;
  const activeProjects = scopedProjects.filter((project) => (project.status || 'active') === 'active').length;
  const awaitingReviewProjects = scopedProjects.filter((project) => (project.checklistStage || 'START_HERE') !== 'FINAL_SUBMISSION').length;

  const totalTasks = isSourceDashboard ? projectTotal : filteredTasks.length;
  const completedTasks = isSourceDashboard ? completedProjects : filteredTasks.filter(t => t.status === 'done').length;
  const inProgressTasks = isSourceDashboard ? activeProjects : filteredTasks.filter(t => t.status === 'in_progress').length;
  const reviewTasks = isSourceDashboard ? awaitingReviewProjects : filteredTasks.filter(t => t.status === 'review').length;
  const highPriorityTasks = isSourceDashboard ? scopedProjects.filter((project) => (project.fileCount ?? 0) > 0).length : filteredTasks.filter(t => t.priority === 'high' && t.status !== 'done').length;

  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Get project name
  const currentProjectName = sourceLabel || projects.find(p => p.id === selectedProject)?.name || 'All Projects';

  // SVG Chart Mock Data - Task Completions over 6 days
  const chartDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const chartValues = selectedProject === 'all' 
    ? [2, 5, 3, 7, 6, 8] // Seed values for all
    : selectedProject === 'alpha-portal'
      ? [1, 2, 1, 4, 3, 5]
      : [0, 2, 1, 2, 2, 3];

  const maxVal = Math.max(...chartValues, 10);
  const chartWidth = 500;
  const chartHeight = 180;
  const paddingLeft = 30;
  const paddingBottom = 25;
  const graphWidth = chartWidth - paddingLeft;
  const graphHeight = chartHeight - paddingBottom;

  // Generate SVG path for area/line chart
  const points = chartValues.map((val, idx) => {
    const x = paddingLeft + (idx / (chartValues.length - 1)) * graphWidth;
    const y = graphHeight - (val / maxVal) * graphHeight;
    return { x, y };
  });

  const linePath = points.reduce((acc, p, idx) => {
    return acc + `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y} `;
  }, '');

  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${graphHeight} L ${points[0].x} ${graphHeight} Z`
    : '';

  // Ring Chart / Don't chart variables for Priorities
  const priorityCounts = {
    high: filteredTasks.filter(t => t.priority === 'high').length,
    medium: filteredTasks.filter(t => t.priority === 'medium').length,
    low: filteredTasks.filter(t => t.priority === 'low').length,
  };
  
  const totalPriorityCount = priorityCounts.high + priorityCounts.medium + priorityCounts.low;
  
  const r = 50;
  const circumference = 2 * Math.PI * r;
  
  const highPercent = totalPriorityCount > 0 ? priorityCounts.high / totalPriorityCount : 0;
  const mediumPercent = totalPriorityCount > 0 ? priorityCounts.medium / totalPriorityCount : 0;
  const highOffset = circumference;
  const mediumOffset = circumference - (highPercent * circumference);
  const lowOffset = mediumOffset - (mediumPercent * circumference);

  return (
    <div className={styles.dashboardContainer}>
      {/* Dashboard Greeting Header */}
      <div className={styles.welcomeBanner}>
        <div className={styles.bannerText}>
          <h2 className={styles.greeting}>Welcome back, {displayName}!</h2>
          <p className={styles.subGreeting}>
            Here is the current operational status for <strong className="gradient-text">{currentProjectName}</strong>.
          </p>
        </div>
        <div className={styles.dateBadge}>
          <Calendar size={16} />
          <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className={styles.kpiGrid}>
        <StatCard 
          title="Project Completion" 
          value={`${completionRate}%`} 
          icon={<CheckCircle2 size={20} />} 
          trend={{ value: 12, isPositive: true }}
          glowColor="var(--status-done)"
        />
        <StatCard 
          title="Active Workload" 
          value={inProgressTasks} 
          icon={<Clock size={20} />} 
          trend={{ value: 4, isPositive: false }}
          glowColor="var(--status-inprogress)"
        />
        <StatCard 
          title="Awaiting Review" 
          value={reviewTasks} 
          icon={<TrendingUp size={20} />} 
          glowColor="var(--status-review)"
        />
        <StatCard 
          title="High Priority" 
          value={highPriorityTasks} 
          icon={<AlertCircle size={20} />} 
          glowColor="var(--priority-high)"
        />
      </div>

      {/* Analytics Charts Grid */}
      <div className={styles.chartsGrid}>
        {/* Activity Over Time (SVG area chart) */}
        <div className={`${styles.chartCard} glassmorphic`}>
          <div className={styles.chartHeader}>
            <h3>Weekly Deliverables</h3>
            <span className={styles.chartSub}>Task completions over time</span>
          </div>
          <div className={styles.chartWrapper}>
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className={styles.svgChart}>
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              
              {/* Horizontal helper grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                const y = ratio * graphHeight;
                return (
                  <line 
                    key={i} 
                    x1={paddingLeft} 
                    y1={y} 
                    x2={chartWidth} 
                    y2={y} 
                    stroke="rgba(255,255,255,0.04)" 
                    strokeDasharray="4"
                  />
                );
              })}

              {/* Area path */}
              {areaPath && <path d={areaPath} fill="url(#chartGradient)" />}

              {/* Line path */}
              {linePath && (
                <path 
                  d={linePath} 
                  fill="none" 
                  stroke="var(--primary)" 
                  strokeWidth="3" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                />
              )}

              {/* Data circles */}
              {points.map((p, idx) => (
                <g key={idx} className={styles.tooltipGroup}>
                  <circle 
                    cx={p.x} 
                    cy={p.y} 
                    r="4" 
                    fill="var(--bg-primary)" 
                    stroke="var(--primary)" 
                    strokeWidth="2.5" 
                  />
                  <circle 
                    cx={p.x} 
                    cy={p.y} 
                    r="9" 
                    fill="var(--primary)" 
                    opacity="0"
                    className={styles.hoverCircle}
                  />
                </g>
              ))}

              {/* X axis labels */}
              {chartDays.map((day, idx) => {
                const x = paddingLeft + (idx / (chartDays.length - 1)) * graphWidth;
                return (
                  <text 
                    key={idx} 
                    x={x} 
                    y={chartHeight - 5} 
                    textAnchor="middle" 
                    fill="var(--text-muted)" 
                    fontSize="10" 
                    fontWeight="500"
                  >
                    {day}
                  </text>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Priority Allocation (SVG Donut chart) */}
        <div className={`${styles.chartCard} glassmorphic`}>
          <div className={styles.chartHeader}>
            <h3>Priority Allocation</h3>
            <span className={styles.chartSub}>Distribution of all logged tasks</span>
          </div>
          <div className={styles.donutContainer}>
            {totalPriorityCount > 0 ? (
              <svg width="130" height="130" viewBox="0 0 130 130" className={styles.svgDonut}>
                {/* Background Ring */}
                <circle 
                  cx="65" 
                  cy="65" 
                  r={r} 
                  fill="transparent" 
                  stroke="rgba(255, 255, 255, 0.04)" 
                  strokeWidth="12" 
                />
                
                {/* Low Priority Ring (Cyan) */}
                {priorityCounts.low > 0 && (
                  <circle 
                    cx="65" 
                    cy="65" 
                    r={r} 
                    fill="transparent" 
                    stroke="var(--priority-low)" 
                    strokeWidth="12" 
                    strokeDasharray={circumference}
                    strokeDashoffset={lowOffset}
                    strokeLinecap="round"
                    transform="rotate(-90 65 65)"
                  />
                )}

                {/* Medium Priority Ring (Orange) */}
                {priorityCounts.medium > 0 && (
                  <circle 
                    cx="65" 
                    cy="65" 
                    r={r} 
                    fill="transparent" 
                    stroke="var(--priority-medium)" 
                    strokeWidth="12" 
                    strokeDasharray={circumference}
                    strokeDashoffset={mediumOffset}
                    strokeLinecap="round"
                    transform="rotate(-90 65 65)"
                  />
                )}

                {/* High Priority Ring (Red) */}
                {priorityCounts.high > 0 && (
                  <circle 
                    cx="65" 
                    cy="65" 
                    r={r} 
                    fill="transparent" 
                    stroke="var(--priority-high)" 
                    strokeWidth="12" 
                    strokeDasharray={circumference}
                    strokeDashoffset={highOffset}
                    strokeLinecap="round"
                    transform="rotate(-90 65 65)"
                  />
                )}
                
                {/* Inside center text */}
                <text x="65" y="62" textAnchor="middle" fill="var(--text-primary)" fontSize="18" fontWeight="700">
                  {totalTasks}
                </text>
                <text x="65" y="78" textAnchor="middle" fill="var(--text-muted)" fontSize="9" fontWeight="600" letterSpacing="0.5">
                  TASKS
                </text>
              </svg>
            ) : (
              <div className={styles.emptyDonut}>No Tasks</div>
            )}

            {/* Legend Details */}
            <div className={styles.legend}>
              <div className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.highDot}`} />
                <span className={styles.legendLabel}>High</span>
                <span className={styles.legendVal}>{priorityCounts.high}</span>
              </div>
              <div className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.mediumDot}`} />
                <span className={styles.legendLabel}>Medium</span>
                <span className={styles.legendVal}>{priorityCounts.medium}</span>
              </div>
              <div className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.lowDot}`} />
                <span className={styles.legendLabel}>Low</span>
                <span className={styles.legendVal}>{priorityCounts.low}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
