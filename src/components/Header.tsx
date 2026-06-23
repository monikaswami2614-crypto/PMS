'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Bell, CheckCircle2, Clock3, History, Palette, Search, Plus, Settings, SlidersHorizontal, User, X } from 'lucide-react';
import { getProjectSource, useProjects } from '@/context/ProjectContext';
import CreateNewProjectModal from './CreateNewProjectModal';
import styles from './Header.module.css';

type ThemePreference = 'dark' | 'light';
type SizePreference = 'compact' | 'default' | 'comfortable';

export const Header: React.FC = () => {
  const pathname = usePathname();
  const { selectedProject, projects, tasks, team, sourceFilter } = useProjects();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationDismissed, setNotificationDismissed] = useState<string[]>([]);
  const [userProfile, setUserProfile] = useState({
    name: 'Sarah Jenkins',
    email: 'sarah.j@kamalcogent.com',
    designation: 'Product Manager',
    photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
  });
  const notificationRef = useRef<HTMLDivElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const PROFILE_KEY = 'kamal-cogent-user-profile';
  const USER_ID_KEY = 'kamal-cogent-user-id';
  const SESSION_KEY = 'kamal-cogent-session';

  const [theme, setTheme] = useState<ThemePreference>('dark');
  const [size, setSize] = useState<SizePreference>('default');
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  // Get active project details
  const activeProject = projects.find(p => p.id === selectedProject);
  const sourceByProjectId = new Map(projects.map((project) => [project.id, getProjectSource(project)]));
  const activeTasks = tasks.filter((task) => {
    if (selectedProject !== 'all' && task.project !== selectedProject) return false;
    if (sourceFilter && sourceByProjectId.get(task.project) !== sourceFilter) return false;
    return true;
  });

  const notifications = useMemo(() => {
    const dueSoon = activeTasks
      .filter((task) => task.status !== 'done')
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 2);
    const reviewCount = activeTasks.filter((task) => task.status === 'review').length;
    const doneCount = activeTasks.filter((task) => task.status === 'done').length;

    const generated = [
      ...dueSoon.map((task, index) => ({
        id: `deadline-${task.id}`,
        icon: <Clock3 size={16} />,
        title: 'Project deadline',
        message: `${task.title} is due on ${new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`,
        isNew: true,
      })),
      {
        id: 'progress-summary',
        icon: <SlidersHorizontal size={16} />,
        title: 'Project progress',
        message: `${reviewCount} project${reviewCount === 1 ? '' : 's'} waiting for review.`,
        isNew: false,
      },
      {
        id: 'completion-summary',
        icon: <CheckCircle2 size={16} />,
        title: 'Completion update',
        message: `${doneCount} project${doneCount === 1 ? '' : 's'} completed successfully.`,
        isNew: false,
      },
    ];

    return generated.filter((item) => !notificationDismissed.includes(item.id));
  }, [activeTasks, notificationDismissed]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedTheme = window.localStorage.getItem('pms-theme') as ThemePreference | null;
    const savedSize = window.localStorage.getItem('pms-size') as SizePreference | null;
    const savedProfile = window.localStorage.getItem(PROFILE_KEY);

    if (savedTheme) {
      setTheme(savedTheme);
    }

    if (savedSize) {
      setSize(savedSize);
    }

    if (savedProfile) {
      try {
        setUserProfile(JSON.parse(savedProfile));
      } catch {
        window.localStorage.removeItem(PROFILE_KEY);
      }
    } else {
      const savedUserId = window.localStorage.getItem(USER_ID_KEY);
      if (savedUserId) {
        setUserProfile((current) => ({ ...current, name: savedUserId }));
      }
    }

    const savedSearch = searchParams?.get('search') ?? '';
    if (savedSearch) {
      setSearchQuery(savedSearch);
    }

    setPreferencesLoaded(true);
  }, [searchParams]);

  useEffect(() => {
    document.body.dataset.theme = theme;
    document.body.dataset.size = size;
    if (!preferencesLoaded) return;

    window.localStorage.setItem('pms-theme', theme);
    window.localStorage.setItem('pms-size', size);
  }, [preferencesLoaded, theme, size]);

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    const params = new URLSearchParams(searchParams as URLSearchParams);
    params.set('search', query);
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleNotificationDismiss = (notificationId: string) => {
    setNotificationDismissed((current) => [...current, notificationId]);
  };

  const handleSignOut = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(SESSION_KEY);
    }
    router.push('/login');
  };

  const handleProfileSave = (profile: typeof userProfile) => {
    setUserProfile(profile);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      window.dispatchEvent(new CustomEvent('kamal-cogent-profile-updated', { detail: profile }));
    }
    setShowProfileEditor(false);
  };

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;

      if (showNotifications && notificationRef.current && !notificationRef.current.contains(target)) {
        setShowNotifications(false);
      }

      if (showProfileMenu && profileMenuRef.current && !profileMenuRef.current.contains(target)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    return () => document.removeEventListener('mousedown', handleDocumentClick);
  }, [showNotifications, showProfileMenu]);

  // Map route pathnames to friendly titles
  const getPageTitle = () => {
    switch (pathname) {
      case '/':
        return 'Dashboard Overview';
      case '/board':
        return 'Projects Activity Board';
      case '/tasks':
        return 'Project Management List';
      case '/calendar':
        return 'Project Calendar';
      case '/team':
        return 'Team Members';
      case '/activity-logs':
        return 'Activity Logs';
      default:
        return 'Project Manager';
    }
  };

  return (
    <header className={`${styles.header} glassmorphic`}>
      {/* Title & Project Context */}
      <div className={styles.titleContainer}>
        <h1 className={styles.pageTitle}>{getPageTitle()}</h1>
        {activeProject && selectedProject !== 'all' && (
          <div className={styles.projectTag}>
            <span className={styles.dot} />
            {activeProject.name}
          </div>
        )}
      </div>

      {/* Right Controls */}
      <div className={styles.actions}>
        {/* Quick Add Button */}
        <button 
          className={styles.addBtn} 
          onClick={() => setIsModalOpen(true)}
        >
          <Plus size={18} />
          <span>New Project</span>
        </button>

        {/* Search Bar */}
        <form className={styles.searchForm} onSubmit={handleSearchSubmit}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search dashboard..."
            className={styles.searchInput}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <button type="submit" className={styles.searchSubmit} aria-label="Search dashboard">
            Search
          </button>
        </form>

        {/* Notifications */}
        <div className={styles.notificationWrapper} ref={notificationRef}>
          <button
            className={styles.iconBtn}
            aria-label="Notifications"
            onClick={() => setShowNotifications((current) => !current)}
          >
            <Bell size={20} />
            <span className={styles.badge} />
          </button>

          {showNotifications && (
            <div className={`${styles.notificationDropdown} glassmorphic`}>
              <div className={styles.dropdownTop}>
                <h3>Notifications</h3>
                <button
                  type="button"
                  className={styles.closeMenuButton}
                  onClick={() => setShowNotifications(false)}
                  aria-label="Close notifications"
                >
                  <X size={15} />
                </button>
              </div>
              {notifications.length === 0 ? (
                <div className={styles.notificationEmpty}>All notifications cleared.</div>
              ) : (
                notifications.map((item) => (
                  <div
                    className={`${styles.notificationItem} ${item.isNew ? styles.notificationUnread : ''}`}
                    key={item.id}
                  >
                    <div className={styles.notificationIcon}>{item.icon}</div>
                    <div className={styles.notificationContent}>
                      <strong>{item.title}</strong>
                      <p>{item.message}</p>
                    </div>
                    <button
                      type="button"
                      className={styles.notificationDelete}
                      onClick={() => handleNotificationDismiss(item.id)}
                      aria-label="Dismiss notification"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className={styles.profileWrapper} ref={profileMenuRef}>
          <button 
            className={styles.avatarBtn} 
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            aria-label="User Profile"
          >
            <img 
              src={userProfile.photo}
              alt={userProfile.name}
              className={styles.avatar} 
            />
          </button>
          
          {showProfileMenu && (
            <div className={`${styles.profileDropdown} glassmorphic`}>
              <div className={styles.dropdownHeader}>
                <p className={styles.userName}>{userProfile.name}</p>
                <p className={styles.userEmail}>{userProfile.email}</p>
              </div>
              <div className={styles.dropdownDivider} />
              <button
                className={styles.dropdownItem}
                type="button"
                onClick={() => {
                  setShowProfileEditor(true);
                  setShowProfileMenu(false);
                }}
              >
                <User size={16} />
                <span>My Profile</span>
              </button>
              <button
                className={styles.dropdownItem}
                type="button"
                onClick={() => {
                  setShowPreferences(true);
                  setShowProfileMenu(false);
                }}
              >
                <Settings size={16} />
                <span>System Preferences</span>
              </button>
              <button
                className={styles.dropdownItem}
                type="button"
                onClick={() => {
                  setShowProfileMenu(false);
                  router.push('/activity-logs');
                }}
              >
                <History size={16} />
                <span>Activity Logs</span>
              </button>
              <div className={styles.dropdownDivider} />
              <button className={styles.logoutBtn} type="button" onClick={handleSignOut}>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      {showProfileEditor && (
        <div className={styles.preferencesOverlay} role="dialog" aria-modal="true" aria-label="Edit profile">
          <div className={`${styles.preferencesPanel} glassmorphic`}>
            <div className={styles.preferencesHeader}>
              <div>
                <span>My Profile</span>
                <h2>Edit Profile</h2>
              </div>
              <button
                type="button"
                className={styles.closeMenuButton}
                onClick={() => setShowProfileEditor(false)}
                aria-label="Close profile editor"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.preferenceGroup}>
              <div className={styles.preferenceLabel}>
                <span>Profile photo</span>
              </div>
              <div className={styles.profilePhotoRow}>
                <img src={userProfile.photo} className={styles.profilePhotoPreview} alt="Profile preview" />
                <input
                  type="text"
                  value={userProfile.photo}
                  onChange={(event) => setUserProfile((current) => ({ ...current, photo: event.target.value }))}
                  placeholder="Profile image URL"
                  className={styles.profileInput}
                />
              </div>
            </div>

            <div className={styles.preferenceGroup}>
              <label className={styles.preferenceLabel} htmlFor="profile-name">
                <span>Name</span>
              </label>
              <input
                id="profile-name"
                type="text"
                value={userProfile.name}
                onChange={(event) => setUserProfile((current) => ({ ...current, name: event.target.value }))}
                className={styles.profileInput}
              />
            </div>

            <div className={styles.preferenceGroup}>
              <label className={styles.preferenceLabel} htmlFor="profile-email">
                <span>Email</span>
              </label>
              <input
                id="profile-email"
                type="email"
                value={userProfile.email}
                onChange={(event) => setUserProfile((current) => ({ ...current, email: event.target.value }))}
                className={styles.profileInput}
              />
            </div>

            <div className={styles.preferenceGroup}>
              <label className={styles.preferenceLabel} htmlFor="profile-designation">
                <span>Designation</span>
              </label>
              <input
                id="profile-designation"
                type="text"
                value={userProfile.designation}
                onChange={(event) => setUserProfile((current) => ({ ...current, designation: event.target.value }))}
                className={styles.profileInput}
              />
            </div>

            <button
              type="button"
              className={styles.saveProfileBtn}
              onClick={() => handleProfileSave(userProfile)}
            >
              Save profile
            </button>
          </div>
        </div>
      )}

      <CreateNewProjectModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      {showPreferences && (
        <div className={styles.preferencesOverlay} role="dialog" aria-modal="true" aria-label="System preferences">
          <div className={`${styles.preferencesPanel} glassmorphic`}>
            <div className={styles.preferencesHeader}>
              <div>
                <span>Preferences</span>
                <h2>System Preferences</h2>
              </div>
              <button
                type="button"
                className={styles.closeMenuButton}
                onClick={() => setShowPreferences(false)}
                aria-label="Close preferences"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.preferenceGroup}>
              <div className={styles.preferenceLabel}>
                <Palette size={17} />
                <span>Theme</span>
              </div>
              <div className={styles.segmentedControl}>
                <button
                  type="button"
                  className={theme === 'dark' ? styles.activeSegment : ''}
                  onClick={() => setTheme('dark')}
                >
                  Dark
                </button>
                <button
                  type="button"
                  className={theme === 'light' ? styles.activeSegment : ''}
                  onClick={() => setTheme('light')}
                >
                  Light
                </button>
              </div>
            </div>

            <div className={styles.preferenceGroup}>
              <div className={styles.preferenceLabel}>
                <SlidersHorizontal size={17} />
                <span>Interface Size</span>
              </div>
              <div className={styles.segmentedControl}>
                {(['compact', 'default', 'comfortable'] as SizePreference[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={size === option ? styles.activeSegment : ''}
                    onClick={() => setSize(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
export default Header;
