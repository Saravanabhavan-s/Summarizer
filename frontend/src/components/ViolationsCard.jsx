import React from 'react';
import styles from '../styles/ViolationsCard.module.css';

export default function ViolationsCard({ violations }) {
  if (!violations || violations.length === 0) {
    return (
      <div className={styles.emptyCard}>
        <span className={styles.icon}>✅</span>
        <p className={styles.emptyText}>No violations detected</p>
      </div>
    );
  }

  return (
    <div className={styles.violationsCard}>
      <div className={styles.header}>
        <span className={styles.icon}>⚠️</span>
        <h3 className={styles.title}>Violations ({violations.length})</h3>
      </div>
      <ul className={styles.list}>
        {violations.map((violation, index) => (
          <li key={index} className={styles.item}>
            <span className={styles.bullet}>•</span>
            <span className={styles.text}>{violation}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
