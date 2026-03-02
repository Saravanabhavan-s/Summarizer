import React from 'react';
import styles from '../styles/Sidebar.module.css';

export default function Sidebar({ activeTab, onTabChange }) {
  return (
    <div className={styles.sidebar}>
      <div className={styles.logo}>
        <div className={styles.logoIcon}>🎙️</div>
        <div>
          <h1 className={styles.appTitle}>Call Quality</h1>
          <p className={styles.appSubtitle}>Scorer</p>
        </div>
      </div>

      <nav className={styles.nav}>
        <button
          className={`${styles.navItem} ${activeTab === 'upload' ? styles.active : ''}`}
          onClick={() => onTabChange('upload')}
        >
          <span className={styles.navIcon}>📤</span>
          <span className={styles.navLabel}>Upload</span>
        </button>

        <button
          className={`${styles.navItem} ${activeTab === 'history' ? styles.active : ''}`}
          onClick={() => onTabChange('history')}
        >
          <span className={styles.navIcon}>📋</span>
          <span className={styles.navLabel}>History</span>
        </button>
      </nav>

      <div className={styles.footer}>
        <p className={styles.version}>v1.0</p>
        <p className={styles.tagline}>Real-time call quality analysis</p>
      </div>
    </div>
  );
}
