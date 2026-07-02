'use client';

import React, { useEffect, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ProjectProvider } from '@/context/ProjectContext';
import { useProjects } from '@/context/ProjectContext';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import ChecklistModal from '@/components/ChecklistModal';

const SESSION_KEY = 'kamal-cogent-session';

const AppContent = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  const pathname = usePathname();
  const { setSelectedProject, setSourceFilter } = useProjects();
  const [activeChecklist, setActiveChecklist] = React.useState<{ type: 'nb' | 'gh'; title: string } | null>(null);

  useEffect(() => {
    const handleOpenProjectManagementList = (event: Event) => {
      const customEvent = event as CustomEvent<{ sourceName: string }>;
      const sourceName = customEvent.detail.sourceName.toLowerCase();

      setSelectedProject('all');

      if (sourceName.includes('green')) {
        setSourceFilter('GREEN_HOMES');
        return;
      }

      if (sourceName.includes('nb')) {
        setSourceFilter('NB');
      }
    };

    window.addEventListener('open-project-management-list', handleOpenProjectManagementList as EventListener);
    return () => window.removeEventListener('open-project-management-list', handleOpenProjectManagementList as EventListener);
  }, [setSelectedProject, setSourceFilter]);

  useEffect(() => {
    if (pathname === '/' || pathname === '/calendar') {
      setSelectedProject('all');
      setSourceFilter(null);
    }
  }, [pathname, setSelectedProject, setSourceFilter]);

  useEffect(() => {
    const handleOpenChecklist = (event: Event) => {
      const customEvent = event as CustomEvent<{ type: 'nb' | 'gh'; title: string }>;
      setActiveChecklist(customEvent.detail);
    };

    window.addEventListener('open-checklist-files', handleOpenChecklist as EventListener);
    return () => window.removeEventListener('open-checklist-files', handleOpenChecklist as EventListener);
  }, []);

  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-wrapper">
        <Header />
        <main className="content-container">{children}</main>
      </div>
      {activeChecklist && (
        <ChecklistModal
          isOpen={Boolean(activeChecklist)}
          onClose={() => setActiveChecklist(null)}
          checklistType={activeChecklist.type}
          title={activeChecklist.title}
        />
      )}
    </div>
  );
};

export default function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === '/login';
  const isAuthenticated = useSyncExternalStore<boolean | null>(
    (onStoreChange) => {
      window.addEventListener('storage', onStoreChange);

      return () => window.removeEventListener('storage', onStoreChange);
    },
    () => window.localStorage.getItem(SESSION_KEY) === 'active',
    () => null,
  );

  useEffect(() => {
    if (!isLoginPage && isAuthenticated === false) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoginPage, router]);

  if (isLoginPage) {
    return <main className="auth-container">{children}</main>;
  }

  if (isAuthenticated !== true) {
    return <main className="auth-loading" aria-label="Checking login session" />;
  }

  return (
    <ProjectProvider>
      <AppContent>{children}</AppContent>
    </ProjectProvider>
  );
}
