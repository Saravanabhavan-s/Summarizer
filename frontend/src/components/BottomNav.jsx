/**
 * BottomNav — Mobile bottom navigation bar (visible only on ≤768px screens)
 *
 * Mirrors the sidebar nav items. Admin tab only shown for admin users.
 * Fixed to the bottom of the viewport.
 */

import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import styles from '../styles/BottomNav.module.css';

const NAV_ITEMS = [
  { id: 'upload',  label: 'Home',    icon: '📤', path: '/' },
  { id: 'history', label: 'Calls',   icon: '📋', path: '/history' },
  { id: 'reports', label: 'Reports', icon: '📊', path: '/reports' },
  { id: 'compare', label: 'Analysis',icon: '⚖️', path: '/compare' },
  { id: 'live',    label: 'Live',    icon: '🎙️', path: '/live-transcription' },
];

const ADMIN_ITEM = { id: 'admin', label: 'Admin', icon: '🛡️', path: '/admin' };
const SIGN_OUT_ITEM = { id: 'signout', label: 'Sign Out', icon: '↩' };

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const roleBasedItems = user?.role === 'admin'
    ? [...NAV_ITEMS, ADMIN_ITEM]
    : NAV_ITEMS;

  const navItems = [...roleBasedItems, SIGN_OUT_ITEM];

  return (
    <nav className={styles.bottomNav} aria-label="Mobile navigation">
      {navItems.map((item) => {
        const isSignOut = item.id === 'signout';
        const active = isSignOut ? false : isActive(item.path);
        return (
          <button
            key={item.id}
            className={`${styles.navItem} ${active ? styles.active : ''} ${isSignOut ? styles.signOutItem : ''}`}
            onClick={isSignOut ? handleLogout : () => navigate(item.path)}
            aria-label={item.label}
          >
            <span className={styles.icon}>{item.icon}</span>
            <span className={styles.label}>{item.label}</span>
            {active && <span className={styles.activeGlow} aria-hidden="true" />}
          </button>
        );
      })}
    </nav>
  );
}
