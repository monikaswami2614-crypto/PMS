'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, Sparkles, UserRound, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

const PASSWORD_KEY = 'kamal-cogent-password';
const USER_ID_KEY = 'kamal-cogent-user-id';
const SESSION_KEY = 'kamal-cogent-session';
const PROFILE_REQUIRED_KEY = 'kamal-cogent-profile-required';

export default function LoginPage() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const isSetupMode = !savedPassword;

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('pms-theme');
    if (savedTheme) document.body.dataset.theme = savedTheme;
    setUserId(window.localStorage.getItem(USER_ID_KEY) ?? '');
    setSavedPassword(window.localStorage.getItem(PASSWORD_KEY));
  }, []);

  const passwordStrength = useMemo(() => {
    let score = 0;

    if (password.length >= 6) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    return score;
  }, [password]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSuccess(false);

    if (!userId.trim()) {
      setMessage('Please enter your user ID.');
      return;
    }

    if (isSetupMode) {
      if (password.length < 6) {
        setMessage('Create a password with at least 6 characters.');
        return;
      }

      if (password !== confirmPassword) {
        setMessage('Passwords do not match.');
        return;
      }

      window.localStorage.setItem(USER_ID_KEY, userId.trim());
      window.localStorage.setItem(PASSWORD_KEY, password);
      window.localStorage.setItem(SESSION_KEY, 'active');
      setSavedPassword(password);
      const needsProfile = window.localStorage.getItem(PROFILE_REQUIRED_KEY) === 'true';
      setMessage(needsProfile ? 'Password saved. Please create your member profile.' : 'Password saved. Welcome to your workspace.');
      setIsSuccess(true);

      setTimeout(() => router.push(needsProfile ? '/team' : '/'), 850);
      return;
    }

    if (password !== savedPassword) {
      setMessage('Invalid password. Try again or reset your local password.');
      return;
    }

    window.localStorage.setItem(USER_ID_KEY, userId.trim());
    window.localStorage.setItem(SESSION_KEY, 'active');
    const needsProfile = window.localStorage.getItem(PROFILE_REQUIRED_KEY) === 'true';
    setMessage(needsProfile ? 'Login successful. Please create your member profile.' : 'Login successful. Opening your dashboard.');
    setIsSuccess(true);

    setTimeout(() => router.push(needsProfile ? '/team' : '/'), 650);
  };

  const handleResetPassword = () => {
    window.localStorage.removeItem(PASSWORD_KEY);
    window.localStorage.removeItem(SESSION_KEY);
    setSavedPassword(null);
    setPassword('');
    setConfirmPassword('');
    setMessage('Create a new password for this browser.');
    setIsSuccess(false);
  };

  return (
    <div className={styles.loginPage}>
      <div className={styles.orbitOne} />
      <div className={styles.orbitTwo} />
      <div className={styles.gridGlow} />

<section className={styles.visualPanel} aria-label="Kamal Cogent workspace login">
          <div className={styles.brandLock}>
            <div className={styles.brandIcon}>
              <LockKeyhole size={28} />
            </div>
            <div>
              <span>Kamal Cogent Access</span>
            <strong>Secure project command</strong>
          </div>
        </div>

        <div className={styles.signalStack}>
          <div className={styles.signalCard}>
            <span className={styles.signalDot} />
            <p>Identity sync</p>
            <strong>Ready</strong>
          </div>
          <div className={styles.signalCard}>
            <span className={styles.signalDotAlt} />
            <p>Workspace vault</p>
            <strong>{isSetupMode ? 'Setup' : 'Locked'}</strong>
          </div>
          <div className={styles.signalCard}>
            <span className={styles.signalDotHot} />
            <p>Session status</p>
            <strong>{isSuccess ? 'Active' : 'Waiting'}</strong>
          </div>
        </div>

        <div className={styles.motionCore} aria-hidden="true">
          <div className={styles.energyOrb}>
            <Zap size={48} />
          </div>
          <span className={styles.motionTrailOne} />
          <span className={styles.motionTrailTwo} />
          <span className={styles.motionTrailThree} />
        </div>
      </section>

      <section className={`${styles.loginCard} glassmorphism`}>
        <div className={styles.cardHeader}>
          <div className={styles.headerIcon}>
            <Sparkles size={18} />
          </div>
          <span>{isSetupMode ? 'First time setup' : 'Welcome back'}</span>
        </div>

        <h1>{isSetupMode ? 'Set your login password' : 'Login to Kamal Cogent PMS'}</h1>
        <p className={styles.subtitle}>
          {isSetupMode
            ? 'Choose a user ID and create a password manually for this browser.'
            : 'Enter your user ID and password to unlock the Kamal Cogent dashboard.'}
        </p>

        <form className={styles.loginForm} onSubmit={handleSubmit}>
          <label className={styles.fieldGroup}>
            <span>User ID</span>
            <div className={styles.inputShell}>
              <UserRound size={18} />
              <input
                type="text"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                placeholder="rahul.admin"
                autoComplete="username"
              />
            </div>
          </label>

          <label className={styles.fieldGroup}>
            <span>Password</span>
            <div className={styles.inputShell}>
              <KeyRound size={18} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={isSetupMode ? 'Create password' : 'Enter password'}
                autoComplete={isSetupMode ? 'new-password' : 'current-password'}
              />
              <button
                className={styles.iconButton}
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>

          {isSetupMode && (
            <>
              <label className={styles.fieldGroup}>
                <span>Confirm Password</span>
                <div className={styles.inputShell}>
                  <LockKeyhole size={18} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Confirm password"
                    autoComplete="new-password"
                  />
                </div>
              </label>

              <div className={styles.strengthMeter} aria-label="Password strength">
                {[0, 1, 2, 3].map((item) => (
                  <span key={item} className={item < passwordStrength ? styles.strengthOn : ''} />
                ))}
              </div>
            </>
          )}

          {message && (
            <p className={isSuccess ? styles.successMessage : styles.errorMessage}>{message}</p>
          )}

          <button className={styles.submitButton} type="submit">
            <span>{isSetupMode ? 'Save Password & Login' : 'Login'}</span>
            <ArrowRight size={18} />
          </button>
        </form>

        {!isSetupMode && (
          <button className={styles.resetButton} type="button" onClick={handleResetPassword}>
            Set a new manual password
          </button>
        )}
      </section>
    </div>
  );
}
