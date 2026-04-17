/**
 * ProfilePage — Full user profile management
 *
 * Sections:
 *  1. Profile Hero (avatar + name + meta)
 *  2. Account Details
 *  3. Change Password (with strength bar + show/hide)
 *  4. Profile Picture Upload
 *  5. Active Sessions
 *  6. Two-Factor Authentication (TOTP setup + Google OAuth link)
 *  7. Danger Zone (Sign Out)
 *
 * Fully responsive: desktop / tablet / mobile / small-screen.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import styles from '../styles/ProfilePage.module.css';
import {
  changePassword,
  updateDisplayName,
  updateOrganization,
  uploadProfilePicture,
  removeProfilePicture,
  getActiveSessions,
  revokeSession,
  revokeAllOtherSessions,
  setupTOTP,
  verifyTOTP,
  disableTOTP,
  getGoogleAuthUrl,
} from '../utils/api';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getPasswordStrength(password) {
  if (!password) return { score: 0, label: '', color: '' };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: 'Weak', color: '#ef4444' };
  if (score <= 2) return { score, label: 'Fair', color: '#f59e0b' };
  if (score <= 3) return { score, label: 'Good', color: '#22c55e' };
  return { score, label: 'Strong', color: '#4a9eff' };
}

function formatDate(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch {
    return ts;
  }
}

function formatDateTime(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

function getRoleBadgeClass(role) {
  if (role === 'admin') return styles.badgeAdmin;
  if (role === 'evaluator') return styles.badgeEvaluator;
  return styles.badgeUser;
}

function PasswordField({ id, label, value, onChange, placeholder, showToggle = true, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className={styles.fieldGroup}>
      <label className={styles.fieldLabel} htmlFor={id}>{label}</label>
      <div className={styles.passwordWrapper}>
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder || '••••••••'}
          className={styles.input}
          autoComplete={autoComplete}
        />
        {showToggle && (
          <button
            type="button"
            className={styles.eyeBtn}
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? '🙈' : '👁️'}
          </button>
        )}
      </div>
    </div>
  );
}

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <motion.div
      className={`${styles.toast} ${type === 'error' ? styles.toastError : styles.toastSuccess}`}
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.97 }}
      transition={{ duration: 0.25 }}
    >
      <span>{type === 'error' ? '❌' : '✅'}</span>
      <span>{message}</span>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout, updateProfile, refreshProfile } = useAuth();
  const fileInputRef = useRef(null);
  const totpInputRef = useRef(null);

  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState('');

  // Profile fields
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [organization, setOrganization] = useState(user?.organization || '');

  // Password
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const pwStrength = getPasswordStrength(pwNew);
  const pwMismatch = pwConfirm && pwNew !== pwConfirm;

  // Avatar
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);

  // Sessions
  const [sessions, setSessions] = useState([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  // 2FA
  const [totp, setTotp] = useState({ qr: null, secret: null, code: '' });
  const [totpStep, setTotpStep] = useState('idle'); // 'idle' | 'setup' | 'verify' | 'enabled'

  // Collapsible sections
  const [openSections, setOpenSections] = useState({
    password: false,
    picture: false,
    sessions: false,
    twofa: false,
    danger: false,
  });

  const toggleSection = (key) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  const runBusy = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy('');
    }
  };

  // Refresh profile on mount
  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  // Sync local state when user updates
  useEffect(() => {
    setDisplayName(user?.display_name || '');
    setOrganization(user?.organization || '');
  }, [user?.display_name, user?.organization]);

  // Load sessions when section opens
  useEffect(() => {
    if (openSections.sessions && !sessionsLoaded) {
      getActiveSessions()
        .then((data) => { setSessions(data?.sessions || []); setSessionsLoaded(true); })
        .catch(() => { setSessions([]); setSessionsLoaded(true); });
    }
  }, [openSections.sessions, sessionsLoaded]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSaveDisplayName = () => runBusy('displayName', async () => {
    const name = displayName.trim();
    if (!name) return;
    const res = await updateDisplayName(name);
    if (res?.success) {
      updateProfile({ display_name: name });
      showToast('Display name updated');
    } else {
      showToast(res?.detail || 'Failed to update display name', 'error');
    }
  });

  const handleSaveOrganization = () => runBusy('organization', async () => {
    const res = await updateOrganization(organization.trim());
    if (res?.success) {
      updateProfile({ organization: organization.trim() });
      showToast('Organization updated');
    } else {
      showToast('Failed to update organization', 'error');
    }
  });

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwMismatch) return;
    if (pwStrength.score < 2) { showToast('Password is too weak', 'error'); return; }
    await runBusy('password', async () => {
      const res = await changePassword(pwCurrent, pwNew);
      if (res?.success) {
        showToast('Password changed successfully');
        setPwCurrent(''); setPwNew(''); setPwConfirm('');
        toggleSection('password');
      } else {
        showToast(res?.detail || 'Failed to change password', 'error');
      }
    });
  };

  const handleAvatarSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleAvatarUpload = () => runBusy('avatar', async () => {
    if (!avatarFile) return;
    const res = await uploadProfilePicture(avatarFile);
    if (res?.success) {
      updateProfile({ avatar_url: res.avatar_url });
      showToast('Profile picture updated');
      setAvatarFile(null);
      setAvatarPreview(null);
    } else {
      showToast('Failed to upload picture', 'error');
    }
  });

  const handleRemoveAvatar = () => runBusy('removeAvatar', async () => {
    const res = await removeProfilePicture();
    if (res?.success) {
      updateProfile({ avatar_url: null });
      showToast('Profile picture removed');
    }
  });

  const handleRevokeSession = (sessionId) => runBusy(`session-${sessionId}`, async () => {
    await revokeSession(sessionId);
    setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
    showToast('Session revoked');
  });

  const handleRevokeAll = () => runBusy('revokeAll', async () => {
    await revokeAllOtherSessions();
    await getActiveSessions().then((d) => setSessions(d?.sessions || []));
    showToast('All other sessions revoked');
  });

  const handleSetupTOTP = () => runBusy('totpSetup', async () => {
    const res = await setupTOTP();
    if (res?.success) {
      setTotp({ qr: res.qr_code_base64, secret: res.secret, code: '' });
      setTotpStep('setup');
    } else {
      showToast(res?.detail || 'Failed to setup 2FA', 'error');
    }
  });

  const handleVerifyTOTP = () => runBusy('totpVerify', async () => {
    const res = await verifyTOTP(totp.code);
    if (res?.success) {
      updateProfile({ totp_enabled: true });
      setTotpStep('enabled');
      showToast('Two-factor authentication enabled!');
    } else {
      showToast(res?.detail || 'Invalid code', 'error');
    }
  });

  const handleDisableTOTP = () => runBusy('totpDisable', async () => {
    const pass = window.prompt('Enter your password to disable 2FA:');
    if (!pass) return;
    const res = await disableTOTP(pass, pass);
    if (res?.success) {
      updateProfile({ totp_enabled: false });
      setTotpStep('idle');
      showToast('Two-factor authentication disabled');
    } else {
      showToast(res?.detail || 'Incorrect password', 'error');
    }
  });

  const handleGoogleLogin = async () => {
    const res = await getGoogleAuthUrl();
    if (res?.auth_url) {
      window.location.href = res.auth_url;
    } else {
      showToast('Google OAuth not configured', 'error');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  // ── Computed ──────────────────────────────────────────────────────────────

  const initials = ((user?.display_name || user?.username || 'U')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase());

  const avatarSrc = avatarPreview || (user?.avatar_url
    ? (user.avatar_url.startsWith('http') ? user.avatar_url : `${import.meta.env.VITE_API_BASE || ''}${user.avatar_url}`)
    : null);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.profilePage}>

      {/* ── Toast Notifications ── */}
      <div className={styles.toastContainer}>
        <AnimatePresence>
          {toast && (
            <Toast
              key={toast.message}
              message={toast.message}
              type={toast.type}
              onClose={() => setToast(null)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ── Page Header ── */}
      <div className={styles.pageHeader}>
        <button className={styles.backBtn} onClick={() => navigate('/dashboard')} type="button">
          ← Back
        </button>
        <h1 className={styles.pageTitle}>My Profile</h1>
      </div>

      {/* ── Profile Grid ── */}
      <div className={styles.profileGrid}>

        {/* ── LEFT Column ── */}
        <div className={styles.leftCol}>

          {/* Hero Card */}
          <div className={styles.card}>
            <div className={styles.heroSection}>
              <div className={styles.avatarRing}>
                {avatarSrc
                  ? <img src={avatarSrc} alt="Profile" className={styles.avatarImg} />
                  : <div className={styles.avatarInitials}>{initials}</div>
                }
              </div>
              <div className={styles.heroInfo}>
                <h2 className={styles.heroName}>
                  {user?.display_name || user?.username || 'User'}
                </h2>
                <p className={styles.heroUsername}>@{user?.username}</p>
                <div className={styles.heroBadges}>
                  <span className={`${styles.roleBadge} ${getRoleBadgeClass(user?.role)}`}>
                    {user?.role || 'user'}
                  </span>
                  {user?.totp_enabled && (
                    <span className={styles.totpBadge}>🔒 2FA</span>
                  )}
                  {user?.google_id && (
                    <span className={styles.googleBadge}>🌐 Google</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Account Details Card */}
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Account Details</h3>
            <dl className={styles.detailList}>
              <div className={styles.detailRow}>
                <dt className={styles.detailLabel}>Username</dt>
                <dd className={styles.detailValue}>{user?.username || '—'}</dd>
              </div>
              <div className={styles.detailRow}>
                <dt className={styles.detailLabel}>Role</dt>
                <dd className={styles.detailValue}>{user?.role || '—'}</dd>
              </div>
              <div className={styles.detailRow}>
                <dt className={styles.detailLabel}>Organization</dt>
                <dd className={styles.detailValue}>{user?.organization || '—'}</dd>
              </div>
              <div className={styles.detailRow}>
                <dt className={styles.detailLabel}>Member Since</dt>
                <dd className={styles.detailValue}>{formatDate(user?.created_at)}</dd>
              </div>
              <div className={styles.detailRow}>
                <dt className={styles.detailLabel}>Last Login</dt>
                <dd className={styles.detailValue}>{formatDateTime(user?.last_login)}</dd>
              </div>
            </dl>
          </div>

          {/* Display Name & Organization Card */}
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Edit Profile</h3>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="display-name">Display Name</label>
              <div className={styles.inlineField}>
                <input
                  id="display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your display name"
                  className={styles.input}
                  maxLength={60}
                />
                <button
                  type="button"
                  className={styles.saveBtn}
                  onClick={handleSaveDisplayName}
                  disabled={busy === 'displayName' || !displayName.trim()}
                >
                  {busy === 'displayName' ? '…' : 'Save'}
                </button>
              </div>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="organization">Organization</label>
              <div className={styles.inlineField}>
                <input
                  id="organization"
                  type="text"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="Your company / organization"
                  className={styles.input}
                  maxLength={80}
                />
                <button
                  type="button"
                  className={styles.saveBtn}
                  onClick={handleSaveOrganization}
                  disabled={busy === 'organization'}
                >
                  {busy === 'organization' ? '…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT Column ── */}
        <div className={styles.rightCol}>

          {/* ── Change Password ── */}
          <div className={styles.card}>
            <button
              className={styles.collapsibleHeader}
              onClick={() => toggleSection('password')}
              type="button"
            >
              <span>🔑 Change Password</span>
              <span className={`${styles.chevron} ${openSections.password ? styles.chevronOpen : ''}`}>›</span>
            </button>
            <AnimatePresence initial={false}>
              {openSections.password && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28 }}
                  style={{ overflow: 'hidden' }}
                >
                  <form className={styles.section} onSubmit={handleChangePassword} noValidate>
                    <PasswordField
                      id="pw-current"
                      label="Current Password"
                      value={pwCurrent}
                      onChange={(e) => setPwCurrent(e.target.value)}
                      autoComplete="current-password"
                    />
                    <PasswordField
                      id="pw-new"
                      label="New Password"
                      value={pwNew}
                      onChange={(e) => setPwNew(e.target.value)}
                      autoComplete="new-password"
                    />
                    {/* Strength bar */}
                    {pwNew && (
                      <div className={styles.strengthWrap}>
                        <div className={styles.strengthBar}>
                          {[1, 2, 3, 4].map((n) => (
                            <div
                              key={n}
                              className={styles.strengthSegment}
                              style={{
                                background: n <= pwStrength.score
                                  ? pwStrength.color
                                  : 'rgba(255,255,255,0.08)',
                              }}
                            />
                          ))}
                        </div>
                        <span className={styles.strengthLabel} style={{ color: pwStrength.color }}>
                          {pwStrength.label}
                        </span>
                      </div>
                    )}
                    <PasswordField
                      id="pw-confirm"
                      label="Confirm New Password"
                      value={pwConfirm}
                      onChange={(e) => setPwConfirm(e.target.value)}
                      autoComplete="new-password"
                    />
                    {pwMismatch && (
                      <p className={styles.errorText}>Passwords do not match</p>
                    )}
                    <p className={styles.hintText}>
                      Min 8 characters · Include uppercase, number, and special character
                    </p>
                    <button
                      type="submit"
                      className={styles.primaryBtn}
                      disabled={
                        busy === 'password' ||
                        !pwCurrent ||
                        !pwNew ||
                        !pwConfirm ||
                        pwMismatch ||
                        pwStrength.score < 2
                      }
                    >
                      {busy === 'password' ? 'Updating…' : 'Update Password'}
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Profile Picture ── */}
          <div className={styles.card}>
            <button
              className={styles.collapsibleHeader}
              onClick={() => toggleSection('picture')}
              type="button"
            >
              <span>🖼️ Profile Picture</span>
              <span className={`${styles.chevron} ${openSections.picture ? styles.chevronOpen : ''}`}>›</span>
            </button>
            <AnimatePresence initial={false}>
              {openSections.picture && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className={styles.section}>
                    {avatarSrc && (
                      <div className={styles.avatarPreviewWrap}>
                        <img src={avatarSrc} alt="Preview" className={styles.avatarPreviewImg} />
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleAvatarSelect}
                      style={{ display: 'none' }}
                    />
                    <div className={styles.buttonRow}>
                      <button
                        type="button"
                        className={styles.outlineBtn}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        📁 Choose Image
                      </button>
                      {avatarFile && (
                        <button
                          type="button"
                          className={styles.primaryBtn}
                          onClick={handleAvatarUpload}
                          disabled={busy === 'avatar'}
                        >
                          {busy === 'avatar' ? 'Uploading…' : '⬆ Upload'}
                        </button>
                      )}
                      {user?.avatar_url && (
                        <button
                          type="button"
                          className={styles.dangerOutlineBtn}
                          onClick={handleRemoveAvatar}
                          disabled={busy === 'removeAvatar'}
                        >
                          🗑 Remove
                        </button>
                      )}
                    </div>
                    <p className={styles.hintText}>Max 5 MB · JPG, PNG, WebP, GIF</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Active Sessions ── */}
          <div className={styles.card}>
            <button
              className={styles.collapsibleHeader}
              onClick={() => toggleSection('sessions')}
              type="button"
            >
              <span>🖥️ Active Sessions</span>
              <span className={`${styles.chevron} ${openSections.sessions ? styles.chevronOpen : ''}`}>›</span>
            </button>
            <AnimatePresence initial={false}>
              {openSections.sessions && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className={styles.section}>
                    {sessions.length === 0 && sessionsLoaded && (
                      <p className={styles.mutedText}>No other active sessions found.</p>
                    )}
                    {sessions.map((session) => (
                      <div key={session.session_id} className={styles.sessionRow}>
                        <div className={styles.sessionInfo}>
                          <p className={styles.sessionId}>
                            Session <code className={styles.code}>{session.session_id?.slice(0, 8)}…</code>
                          </p>
                          <p className={styles.sessionMeta}>
                            Issued: {formatDateTime(session.issued_at)} · Expires: {formatDateTime(session.expires_at)}
                          </p>
                        </div>
                        <button
                          type="button"
                          className={styles.dangerOutlineBtn}
                          onClick={() => handleRevokeSession(session.session_id)}
                          disabled={busy === `session-${session.session_id}`}
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                    {sessions.length > 0 && (
                      <button
                        type="button"
                        className={styles.dangerBtn}
                        onClick={handleRevokeAll}
                        disabled={busy === 'revokeAll'}
                        style={{ marginTop: 8 }}
                      >
                        {busy === 'revokeAll' ? 'Revoking…' : 'Sign Out All Other Sessions'}
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Two-Factor Authentication ── */}
          <div className={styles.card}>
            <button
              className={styles.collapsibleHeader}
              onClick={() => toggleSection('twofa')}
              type="button"
            >
              <span>🔐 Two-Factor Authentication</span>
              <span className={`${styles.chevron} ${openSections.twofa ? styles.chevronOpen : ''}`}>›</span>
            </button>
            <AnimatePresence initial={false}>
              {openSections.twofa && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className={styles.section}>
                    {/* Google Sign-In Link */}
                    <div className={styles.oauthRow}>
                      <div>
                        <p className={styles.oauthTitle}>🌐 Google Account</p>
                        <p className={styles.mutedText}>
                          {user?.google_id ? 'Linked to Google' : 'Link your Google account for easy sign-in'}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={styles.googleBtn}
                        onClick={handleGoogleLogin}
                      >
                        <span className={styles.googleIcon}>G</span>
                        {user?.google_id ? 'Re-link Google' : 'Link Google'}
                      </button>
                    </div>

                    <div className={styles.dividerLine} />

                    {/* TOTP */}
                    {user?.totp_enabled || totpStep === 'enabled' ? (
                      <div className={styles.totpEnabled}>
                        <span className={styles.totpEnabledIcon}>✅</span>
                        <div>
                          <p className={styles.oauthTitle}>Authenticator App Active</p>
                          <p className={styles.mutedText}>
                            Your account is protected with Google Authenticator or compatible app.
                          </p>
                        </div>
                        <button
                          type="button"
                          className={styles.dangerOutlineBtn}
                          onClick={handleDisableTOTP}
                          disabled={busy === 'totpDisable'}
                        >
                          Disable
                        </button>
                      </div>
                    ) : totpStep === 'idle' ? (
                      <div>
                        <p className={styles.mutedText}>
                          Add an extra layer of security. Use any TOTP app (Google Authenticator, Authy, etc.)
                        </p>
                        <button
                          type="button"
                          className={styles.primaryBtn}
                          onClick={handleSetupTOTP}
                          disabled={busy === 'totpSetup'}
                          style={{ marginTop: 12 }}
                        >
                          {busy === 'totpSetup' ? 'Setting up…' : 'Enable 2FA'}
                        </button>
                      </div>
                    ) : totpStep === 'setup' ? (
                      <div className={styles.totpSetup}>
                        <p className={styles.fieldLabel}>Scan with your authenticator app:</p>
                        {totp.qr && (
                          <img
                            src={`data:image/png;base64,${totp.qr}`}
                            alt="QR Code"
                            className={styles.qrCode}
                          />
                        )}
                        <p className={styles.mutedText}>
                          Or enter manually: <code className={styles.code}>{totp.secret}</code>
                        </p>
                        <div className={styles.fieldGroup}>
                          <label className={styles.fieldLabel} htmlFor="totp-code">Enter 6-digit code</label>
                          <div className={styles.inlineField}>
                            <input
                              ref={totpInputRef}
                              id="totp-code"
                              type="text"
                              inputMode="numeric"
                              maxLength={6}
                              value={totp.code}
                              onChange={(e) => setTotp((t) => ({ ...t, code: e.target.value.replace(/\D/g, '') }))}
                              placeholder="000000"
                              className={styles.input}
                              style={{ letterSpacing: '0.4em', fontSize: 18, textAlign: 'center' }}
                            />
                            <button
                              type="button"
                              className={styles.primaryBtn}
                              onClick={handleVerifyTOTP}
                              disabled={busy === 'totpVerify' || totp.code.length !== 6}
                            >
                              {busy === 'totpVerify' ? '…' : 'Verify'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Danger Zone ── */}
          <div className={`${styles.card} ${styles.dangerCard}`}>
            <button
              className={styles.collapsibleHeader}
              onClick={() => toggleSection('danger')}
              type="button"
            >
              <span>⚠️ Account Actions</span>
              <span className={`${styles.chevron} ${openSections.danger ? styles.chevronOpen : ''}`}>›</span>
            </button>
            <AnimatePresence initial={false}>
              {openSections.danger && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className={styles.section}>
                    <button
                      type="button"
                      className={styles.logoutBtn}
                      onClick={handleLogout}
                    >
                      ↩ Sign Out of EchoScore
                    </button>
                    <p className={styles.mutedText} style={{ marginTop: 8 }}>
                      You will be redirected to the login page.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </div>
    </div>
  );
}
