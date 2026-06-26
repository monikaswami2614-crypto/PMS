'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  KanbanSquare,
  ListTodo,
  Calendar,
  Users,
  History,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  SlidersHorizontal,
  BadgeCheck,
} from 'lucide-react';
import styles from './Sidebar.module.css';

const projectSources = [
  {
    id: 'nb',
    label: 'NB Project',
    sourceName: 'NB Project source',
    sourcePath: 'C:\\Users\\monika.swami\\Desktop\\Leed Project\\NB Projects',
  },
  {
    id: 'green-homes',
    label: 'Green Homes',
    sourceName: 'Green Homes source',
    sourcePath: 'C:\\Users\\monika.swami\\Desktop\\Leed Project\\Green Homes',
  },
];

const checklistSources = [
  { id: 'nb', label: 'NB Checklist', type: 'nb' as const },
  { id: 'gh', label: 'GH Checklist', type: 'gh' as const },
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Project Progress', path: '/board', icon: KanbanSquare },
    { name: 'All Project List', path: '/tasks', icon: ListTodo },
    { name: 'Checklist Review', path: '/checklist-review', icon: ClipboardCheck },
    { name: 'Data Filtration', path: '/certification-filtration', icon: SlidersHorizontal },
    { name: 'Feasibility', path: '/feasibility', icon: BadgeCheck },
    { name: 'Calendar', path: '/calendar', icon: Calendar },
    { name: 'Team Members', path: '/team', icon: Users },
    { name: 'Activity Logs', path: '/activity-logs', icon: History },
  ];

  const handleOpenProjectManagement = (sourceName: string, sourcePath: string) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open-project-management-list', { detail: { sourceName, sourcePath } }));
    }
  };

  const handleOpenChecklist = (type: 'nb' | 'gh', title: string) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open-checklist-files', { detail: { type, title } }));
    }
  };

  return (
    <aside className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
      {/* Brand Header */}
      <div className={styles.brand}>
        <div className={styles.logoContainer}>
          <Image
            src="/kamal-cogent-lotus.png"
            alt="Kamal Cogent lotus"
            width={40}
            height={40}
            className={styles.logoImage}
          />
        </div>
        {!isCollapsed && (
          <span className={`${styles.brandName} gradient-text`}>Kamal Cogent PMS</span>
        )}
      </div>

      {/* Collapse Toggle */}
      <button 
        className={styles.toggleBtn} 
        onClick={() => setIsCollapsed(!isCollapsed)}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      {/* Project Source Selector */}
      <div className={styles.projectSelectorSection}>
        {!isCollapsed && <label className={styles.selectorLabel}>Project Sources</label>}
        <div className={styles.projectButtonGroup}>
          {projectSources.map((source) => (
            <button
              key={source.id}
              type="button"
              className={styles.projectButton}
              onClick={() => handleOpenProjectManagement(source.sourceName, source.sourcePath)}
              title={source.label}
            >
              <span className={styles.projectButtonIcon} />
              {!isCollapsed && <span>{source.label}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className={styles.nav}>
        <ul className={styles.navList}>
          {menuItems.map((item) => {
            const isActive = pathname === item.path;
            const Icon = item.icon;
            
            return (
              <li key={item.path} className={styles.navItem}>
                <Link 
                  href={item.path} 
                  className={`${styles.navLink} ${isActive ? styles.activeLink : ''}`}
                >
                  <Icon size={20} className={styles.navIcon} />
                  {!isCollapsed && <span className={styles.navText}>{item.name}</span>}
                  {isActive && !isCollapsed && <div className={styles.activeIndicator} />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={styles.checklistSection}>
        {!isCollapsed && <label className={styles.selectorLabel}>Checklists</label>}
        <div className={styles.projectButtonGroup}>
          {checklistSources.map((source) => (
            <button
              key={source.id}
              type="button"
              className={styles.projectButton}
              onClick={() => handleOpenChecklist(source.type, source.label)}
              title={source.label}
            >
              <ClipboardCheck size={16} className={styles.checklistIcon} />
              {!isCollapsed && <span>{source.label}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Footer metadata */}
      {!isCollapsed && (
        <div className={styles.footer}>
          <div className={styles.footerInner}>
            <div className={styles.userStatus}>
              <div className={styles.userIndicator} />
              <span>System Online</span>
            </div>
            <span className={styles.footerVer}>v1.0.4</span>
          </div>
        </div>
      )}
    </aside>
  );
};
export default Sidebar;
