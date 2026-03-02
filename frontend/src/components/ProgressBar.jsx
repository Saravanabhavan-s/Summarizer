import React from 'react';
import styles from '../styles/ProgressBar.module.css';

export default function ProgressBar({ label, score, evaluated = true, max = 100 }) {
  const safeScore = Number.isFinite(score) ? score : 0;
  const percentage = Math.max(0, Math.min(100, (safeScore / max) * 100));

  return (
    <div className={styles.progressContainer}>
      <div className={styles.labelRow}>
        <label className={styles.label}>{label}</label>
        {evaluated ? (
          <span className={styles.score}>{Math.round(safeScore)}</span>
        ) : (
          <span className={styles.notEvaluatedBadge}>Not Evaluated</span>
        )}
      </div>
      <div className={styles.barWrapper}>
        <div className={styles.bar}>
          <div
            className={`${styles.fill} ${!evaluated ? styles.mutedFill : ''}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}
