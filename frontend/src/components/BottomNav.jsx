/**
 * BottomNav — Mobile bottom navigation bar (visible only on ≤768px screens)
 *
 * New layout: Home | History | Reports | Policy | Profile
 * Sign Out removed — it now lives inside ProfilePage.
 */

import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import styles from '../styles/BottomNav.module.css';

const NAV_ITEMS = [
  { id: 'home',    label: 'Home',    icon: '📤', path: '/dashboard' },
  { id: 'history', label: 'History', icon: '📋', path: '/history' },
  { id: 'reports', label: 'Reports', icon: '📊', path: '/reports' },
  { id: 'live',    label: 'Live',    icon: '🎙️', path: '/live-transcription' },
  { id: 'policy',  label: 'Policy',  icon: '📄', path: '/policy' },
  { id: 'profile', label: 'Profile', icon: '👤', path: '/profile' },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const isActive = (path) => {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(path);
  };

  return (
    <nav className={styles.bottomNav} aria-label="Mobile navigation">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.path);
        return (
          <button
            key={item.id}
            className={`${styles.navItem} ${active ? styles.active : ''}`}
            onClick={() => navigate(item.path)}
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
