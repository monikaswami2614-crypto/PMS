'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Clock3, FolderPlus, History, Mail, Palette, Plus, Settings, SlidersHorizontal, Upload, User, UserCheck, X } from 'lucide-react';
import { useProjects } from '@/context/ProjectContext';
import CreateNewProjectModal from './CreateNewProjectModal';
import styles from './Header.module.css';

type ThemePreference = 'dark' | 'light';
type SizePreference = 'compact' | 'default' | 'comfortable';

interface SystemNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
}

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:5000';
const demoTaskIds = new Set(['t-1', 't-2', 't-3', 't-4', 't-5', 't-6']);

const formatTimeAgo = (value: string) => {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (elapsedSeconds < 60) return 'Just now';

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `${elapsedDays}d ago`;

  return new Date(value).toLocaleDateString('en-GB');
};

const getNotificationIcon = (type: string) => {
  if (type === 'PROJECT_ADDED') return <FolderPlus size={16} />;
  if (type === 'PROJECT_ASSIGNED') return <UserCheck size={16} />;
  if (type === 'EMAIL_SENT' || type === 'EMAIL_FAILED') return <Mail size={16} />;
  return <Clock3 size={16} />;
};

export const Header: React.FC = () => {
  const pathname = usePathname();
  const { selectedProject, projects, tasks, team } = useProjects();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [userProfile, setUserProfile] = useState({
    name: 'Sarah Jenkins',
    email: '',
    designation: 'Product Manager',
    photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
  });
  const notificationRef = useRef<HTMLDivElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const PROFILE_KEY = 'kamal-cogent-user-profile';
  const USER_ID_KEY = 'kamal-cogent-user-id';
  const SESSION_KEY = 'kamal-cogent-session';

  const [theme, setTheme] = useState<ThemePreference>('dark');
  const [size, setSize] = useState<SizePreference>('default');
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  // Get active project details
  const activeProject = projects.find(p => p.id === selectedProject);

  const loadNotifications = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/api/notifications`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Failed to load notifications (${response.status})`);
      const payload = await response.json();
      const unreadNotifications = Array.isArray(payload.data) ? payload.data : [];
      setNotifications(unreadNotifications);
      setUnreadCount(Number(payload.unreadCount) || 0);
    } catch (error) {
      console.warn('Unable to load notifications:', error);
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncNotifications = async () => {
      try {
        await fetch(`${apiBase}/api/notifications/calendar-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deadlines: tasks
              .filter((task) => !demoTaskIds.has(task.id) && task.status !== 'done' && task.dueDate)
              .map((task) => {
                const assignee = team.find((member) => member.id === task.assigneeId);
                return {
                  id: task.id,
                  projectName: task.title,
                  dueDate: task.dueDate,
                  assignedTo: assignee?.name || task.managerName || '',
                  assigneeEmail: task.assigneeEmail || assignee?.email || '',
                };
              }),
          }),
        });
      } catch (error) {
        console.warn('Unable to sync calendar notifications:', error);
      }

      if (!cancelled) await loadNotifications();
    };

    void syncNotifications();
    return () => {
      cancelled = true;
    };
  }, [loadNotifications, tasks, team]);

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
        const profile = JSON.parse(savedProfile) as Partial<typeof userProfile>;
        setUserProfile((current) => ({
          ...current,
          ...profile,
          email: '',
        }));
      } catch {
        window.localStorage.removeItem(PROFILE_KEY);
      }
    } else {
      const savedUserId = window.localStorage.getItem(USER_ID_KEY);
      if (savedUserId) {
        setUserProfile((current) => ({ ...current, name: savedUserId }));
      }
    }

    setPreferencesLoaded(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const loginIdentity = window.localStorage.getItem(USER_ID_KEY)?.trim() ?? '';
    const matchingMember = team.find((member) => (
      member.email.toLowerCase() === loginIdentity.toLowerCase()
      || member.name.toLowerCase() === loginIdentity.toLowerCase()
    ));
    const loginEmail = loginIdentity.includes('@') ? loginIdentity : matchingMember?.email ?? '';

    setUserProfile((current) => (
      current.email === loginEmail ? current : { ...current, email: loginEmail }
    ));
  }, [team]);

  useEffect(() => {
    document.body.dataset.theme = theme;
    document.body.dataset.size = size;
    if (!preferencesLoaded) return;

    window.localStorage.setItem('pms-theme', theme);
    window.localStorage.setItem('pms-size', size);
  }, [preferencesLoaded, theme, size]);

  const handleNotificationDismiss = async (notificationId: string) => {
    const previousNotifications = notifications;
    const previousCount = unreadCount;
    setNotifications((current) => current.filter((notification) => notification.id !== notificationId));
    setUnreadCount((current) => Math.max(0, current - 1));

    try {
      const response = await fetch(`${apiBase}/api/notifications/${notificationId}/read`, {
        method: 'PATCH',
      });
      if (!response.ok) throw new Error(`Failed to mark notification as read (${response.status})`);
    } catch (error) {
      console.warn('Unable to mark notification as read:', error);
      setNotifications(previousNotifications);
      setUnreadCount(previousCount);
    }
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

  const handleProfilePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUserProfile((current) => ({ ...current, photo: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
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
        return 'Project Progress';
      case '/tasks':
        return 'All Project List';
      case '/checklist-review':
        return 'Checklist Review';
      case '/certification-filtration':
        return 'Data Filtration';
      case '/feasibility':
        return 'Feasibility';
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

        {/* Notifications */}
        <div className={styles.notificationWrapper} ref={notificationRef}>
          <button
            className={styles.iconBtn}
            aria-label="Notifications"
            onClick={() => {
              setShowNotifications((current) => !current);
              void loadNotifications();
            }}
          >
            <Bell size={20} />
            {unreadCount > 0 && <span className={styles.badge} />}
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
              {notificationsLoading ? (
                <div className={styles.notificationEmpty}>Loading notifications...</div>
              ) : notifications.length === 0 ? (
                <div className={styles.notificationEmpty}>No new notifications</div>
              ) : (
                notifications.map((item) => (
                  <div
                    className={`${styles.notificationItem} ${styles.notificationUnread}`}
                    key={item.id}
                  >
                    <div className={styles.notificationIcon}>{getNotificationIcon(item.type)}</div>
                    <div className={styles.notificationContent}>
                      <strong>{item.title}</strong>
                      <p>{item.message}</p>
                      <time className={styles.notificationTime} dateTime={item.createdAt}>
                        {formatTimeAgo(item.createdAt)}
                      </time>
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
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className={styles.hiddenPhotoInput}
                  onChange={handleProfilePhotoUpload}
                />
                <button
                  type="button"
                  className={styles.uploadPhotoButton}
                  onClick={() => photoInputRef.current?.click()}
                >
                  <Upload size={16} />
                  <span>Upload photo</span>
                </button>
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
                readOnly
                placeholder="No login email available"
                className={`${styles.profileInput} ${styles.readOnlyInput}`}
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
