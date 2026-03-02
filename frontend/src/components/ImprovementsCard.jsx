import React from 'react';
import styles from '../styles/ImprovementsCard.module.css';

export default function ImprovementsCard({ improvements }) {
  if (!improvements || improvements.length === 0) {
    return (
      <div className={styles.emptyCard}>
        <span className={styles.icon}>⭐</span>
        <p className={styles.emptyText}>No suggestions at this time</p>
      </div>
    );
  }

  return (
    <div className={styles.improvementsCard}>
      <div className={styles.header}>
        <span className={styles.icon}>💡</span>
        <h3 className={styles.title}>Suggested Improvements</h3>
      </div>
      <ul className={styles.list}>
        {improvements.map((improvement, index) => (
          <li key={index} className={styles.item}>
            <span className={styles.bullet}>→</span>
            <span className={styles.text}>{improvement}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
