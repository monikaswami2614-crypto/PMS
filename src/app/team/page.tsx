'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProjectSource, useProjects, TeamMember } from '@/context/ProjectContext';
import { Activity, BarChart2, Info, Mail, Plus, Trash2, Upload, Users, X } from 'lucide-react';
import styles from './page.module.css';

const SESSION_KEY = 'kamal-cogent-session';
const PROFILE_KEY = 'kamal-cogent-user-profile';
const PROFILE_REQUIRED_KEY = 'kamal-cogent-profile-required';
const DELETED_PROFILES_KEY = 'pms_deleted_team_profiles';

export default function TeamPage() {
  const { team, tasks, addTeamMember, deleteTeamMember, selectedProject, projects, sourceFilter } = useProjects();
  const router = useRouter();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [profileRequiredMessage, setProfileRequiredMessage] = useState('');
  const [contextMenu, setContextMenu] = useState<{ member: TeamMember; x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (window.localStorage.getItem(PROFILE_REQUIRED_KEY) === 'true') {
      setProfileRequiredMessage('Please create your member profile to continue using the workspace.');
      setIsInviteOpen(true);
    }
  }, []);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Handle invitation form submission
  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !role.trim() || !email.trim()) return;

    addTeamMember({
      name: name.trim(),
      role: role.trim(),
      email: email.trim(),
      avatarUrl: avatarUrl.trim(),
    });

    setName('');
    setRole('');
    setEmail('');
    setAvatarUrl('');
    setProfileRequiredMessage('');
    window.localStorage.removeItem(PROFILE_REQUIRED_KEY);
    setIsInviteOpen(false);
  };

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteMember = (member: TeamMember) => {
    const storedDeletedProfiles = window.localStorage.getItem(DELETED_PROFILES_KEY);
    let deletedProfiles: TeamMember[] = [];

    if (storedDeletedProfiles) {
      try {
        deletedProfiles = JSON.parse(storedDeletedProfiles) as TeamMember[];
      } catch {
        deletedProfiles = [];
      }
    }

    const nextDeletedProfiles = [
      ...deletedProfiles.filter((profile) => profile.id !== member.id),
      member,
    ];

    window.localStorage.setItem(DELETED_PROFILES_KEY, JSON.stringify(nextDeletedProfiles));
    window.localStorage.removeItem(PROFILE_KEY);
    window.localStorage.setItem(PROFILE_REQUIRED_KEY, 'true');
    window.localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new CustomEvent('kamal-cogent-profile-updated'));

    deleteTeamMember(member.id);
    setContextMenu(null);
    router.push('/login');
  };

  // Get status color
  const getStatusColor = (status: TeamMember['status']) => {
    switch (status) {
      case 'active':
        return 'var(--status-done)';
      case 'away':
        return 'var(--status-inprogress)';
      case 'offline':
        return 'var(--text-muted)';
      default:
        return 'var(--text-muted)';
    }
  };

  const sourceByProjectId = new Map(projects.map((project) => [project.id, getProjectSource(project)]));

  return (
    <div className={styles.container}>
      {/* Top Banner Toolbar */}
      <div className={`${styles.toolbar} glassmorphic`}>
        <div className={styles.toolbarInfo}>
          <Users className={styles.toolbarIcon} />
          <div>
            <h3>Project Team Resource Management</h3>
            <p>Manage member availability, check workload distribution, and invite new resources.</p>
          </div>
        </div>
        <button className={styles.inviteBtn} onClick={() => setIsInviteOpen(true)}>
          <Plus size={16} />
          <span>Invite Member</span>
        </button>
      </div>

      {/* Grid of Team Cards */}
      {profileRequiredMessage && (
        <div className={`${styles.profilePrompt} glassmorphic`}>
          <Info size={16} />
          <span>{profileRequiredMessage}</span>
        </div>
      )}

      {team.length === 0 ? (
        <div className={`${styles.emptyState} glassmorphic`}>
          <Users size={28} className={styles.emptyIcon} />
          <h3>No team profiles yet</h3>
          <p>Use Invite Member to add your profile details. After a member is added, their progress and work activity will appear here.</p>
          <button className={styles.inviteBtn} onClick={() => setIsInviteOpen(true)}>
            <Plus size={16} />
            <span>Invite Member</span>
          </button>
        </div>
      ) : (
        <div className={styles.grid}>
        {team.map((member) => {
          // Calculate tasks for this member
          const memberTasks = tasks.filter((task) => {
            if (task.assigneeId !== member.id) return false;
            if (selectedProject !== 'all' && task.project !== selectedProject) return false;
            if (sourceFilter && sourceByProjectId.get(task.project) !== sourceFilter) return false;
            return true;
          });

          const activeTasksCount = memberTasks.filter(t => t.status !== 'done').length;
          const completedTasksCount = memberTasks.filter(t => t.status === 'done').length;
          const totalCount = memberTasks.length;
          const progress = totalCount > 0 
            ? Math.round((completedTasksCount / totalCount) * 100)
            : 0;
          const recentTasks = memberTasks.slice(0, 3);

          return (
            <div
              key={member.id}
              className={`${styles.card} glassmorphic glow-on-hover`}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenu({ member, x: event.clientX, y: event.clientY });
              }}
            >
              {/* Profile Card Header */}
              <div className={styles.cardHeader}>
                <div className={styles.avatarWrapper}>
                  <img src={member.avatarUrl} alt={member.name} className={styles.avatar} />
                  <span 
                    className={styles.statusIndicator} 
                    style={{ 
                      backgroundColor: getStatusColor(member.status),
                      boxShadow: `0 0 6px ${getStatusColor(member.status)}`
                    }}
                    title={`Status: ${member.status}`}
                  />
                </div>
                <div className={styles.profileText}>
                  <h4 className={styles.memberName}>{member.name}</h4>
                  <span className={styles.memberRole}>{member.role}</span>
                </div>
              </div>

              {/* Email link */}
              <a href={`mailto:${member.email}`} className={styles.emailLink}>
                <Mail size={14} />
                <span>{member.email}</span>
              </a>

              <div className={styles.divider} />

              {/* Workload Stats */}
              <div className={styles.statsSection}>
                <div className={styles.statsHeader}>
                  <div className={styles.statLabel}>
                    <BarChart2 size={14} />
                    <span>Workload Activity</span>
                  </div>
                  <span className={styles.progressText}>{progress}% done</span>
                </div>

                <div className={styles.progressBar}>
                  <div 
                    className={styles.progressFill} 
                    style={{ 
                      width: `${progress}%`,
                      background: progress > 70 ? 'var(--status-done)' : progress > 35 ? 'var(--accent-gradient)' : 'var(--status-inprogress)'
                    }} 
                  />
                </div>

                <div className={styles.statsFooter}>
                  <span className={styles.statCount}>
                    <strong>{activeTasksCount}</strong> Active
                  </span>
                  <span className={styles.statCount}>
                    <strong>{completedTasksCount}</strong> Completed
                  </span>
                </div>
              </div>

              <div className={styles.activitySection}>
                <div className={styles.statLabel}>
                  <Activity size={14} />
                  <span>Work Activity</span>
                </div>
                {recentTasks.length > 0 ? (
                  <div className={styles.activityList}>
                    {recentTasks.map((task) => (
                      <div key={task.id} className={styles.activityItem}>
                        <span>{task.title}</span>
                        <strong>{task.status.replace('_', ' ')}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.noActivity}>No work activity assigned yet.</p>
                )}
              </div>
            </div>
          );
        })}
        </div>
      )}

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className={`${styles.contextMenu} glassmorphic`}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button type="button" onClick={() => handleDeleteMember(contextMenu.member)}>
            <Trash2 size={14} />
            <span>Delete Profile</span>
          </button>
        </div>
      )}

      {/* Invite Member Drawer Modal */}
      {isInviteOpen && (
        <div className={styles.overlay} onClick={() => setIsInviteOpen(false)}>
          <div className={`${styles.drawer} glassmorphic animate-slide-in-right`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <h3 className={styles.drawerTitle}>Create Member Profile</h3>
              <button className={styles.closeBtn} onClick={() => setIsInviteOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className={styles.form}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Full Name</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Liam Neeson" 
                  className={styles.input}
                  required 
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Designation</label>
                <select 
                  value={role} 
                  onChange={(e) => setRole(e.target.value)}
                  className={styles.select}
                  required
                >
                  <option value="">Select Designation...</option>
                  <option value="Project Manager">Project Manager</option>
                  <option value="Manager">Manager</option>
                  <option value="Engineer">Engineer</option>
                  <option value="Site Engineer">Site Engineer</option>
                  <option value="Architect">Architect</option>
                  <option value="Consultant">Consultant</option>
                  <option value="Coordinator">Coordinator</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Document Controller">Document Controller</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Email Address</label>
                <input 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. liam.n@kamalcogent.com" 
                  className={styles.input}
                  required 
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Profile Photo URL</label>
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://example.com/photo.jpg"
                  className={styles.input}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Upload Profile Photo</label>
                <label className={styles.uploadBox}>
                  <Upload size={16} />
                  <span>Choose photo</span>
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} />
                </label>
                {avatarUrl && (
                  <img src={avatarUrl} alt="Profile preview" className={styles.uploadPreview} />
                )}
              </div>

              <div className={styles.infoBox}>
                <Info size={16} className={styles.infoIcon} />
                <p className={styles.infoText}>
                  After saving, this member profile will appear on the Team Members screen with progress and work activity.
                </p>
              </div>

              <div className={styles.drawerActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => setIsInviteOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className={styles.submitBtn}>
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
