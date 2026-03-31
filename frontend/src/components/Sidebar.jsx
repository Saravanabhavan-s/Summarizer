/**
 * Sidebar — Dark glass navigation panel
 *
 * Reads current route via useLocation and navigates via useNavigate.
 * Shows user info and logout button at the bottom.
 * Admin nav item is only visible for users with role="admin".
 */

import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import styles from '../styles/Sidebar.module.css';

const NAV_ITEMS = [
  { id: 'upload',   label: 'Upload',   icon: '📤', path: '/dashboard' },
  { id: 'history',  label: 'History',  icon: '📋', path: '/history' },
  { id: 'compare',  label: 'Compare',  icon: '⚖️',  path: '/compare' },
  { id: 'reports',  label: 'Reports',  icon: '📊', path: '/reports' },
  { id: 'live',     label: 'Live',     icon: '🎙️', path: '/live-transcription' },
];

const ADMIN_ITEM = { id: 'admin', label: 'Admin', icon: '🛡️', path: '/admin' };

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  // Determine active tab based on current path
  const isActive = (path) => {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(path);
  };

  const navItems = user?.role === 'admin'
    ? [...NAV_ITEMS, ADMIN_ITEM]
    : NAV_ITEMS;

  return (
    <aside className={styles.sidebar}>
      {/* Ambient glow */}
      <div className={styles.glowTop} aria-hidden="true" />

      {/* Logo */}
      <div className={styles.logo} onClick={() => navigate('/dashboard')} role="button" tabIndex={0}>
        <span className={styles.logoIcon}>🎙️</span>
        <div>
          <p className={styles.logoTitle}>EchoScore</p>
          <p className={styles.logoSub}>Call Intelligence</p>
        </div>
      </div>

      {/* Divider */}
      <div className={styles.divider} />

      {/* Navigation */}
      <nav className={styles.nav} aria-label="Main navigation">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <motion.button
              key={item.id}
              className={`${styles.navItem} ${active ? styles.active : ''}`}
              onClick={() => navigate(item.path)}
              whileHover={{ x: 3 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.18 }}
            >
              {active && (
                <motion.div
                  className={styles.activeIndicator}
                  layoutId="activeIndicator"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </motion.button>
          );
        })}
      </nav>

      {/* Spacer */}
      <div className={styles.spacer} />

      {/* User info + logout */}
      <div className={styles.footer}>
        <div className={styles.divider} />
        {user && (
          <div className={styles.userInfo}>
            <div className={styles.userAvatar}>
              {(user.username?.[0] || 'U').toUpperCase()}
            </div>
            <div className={styles.userDetails}>
              <p className={styles.userName}>{user.username}</p>
              <p className={styles.userRole}>{user.role}</p>
            </div>
          </div>
        )}
        <motion.button
          className={styles.logoutBtn}
          onClick={handleLogout}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
        >
          <span>↩</span>
          <span>Sign Out</span>
        </motion.button>
        <p className={styles.version}>EchoScore v2.0</p>
      </div>
    </aside>
  );
}
