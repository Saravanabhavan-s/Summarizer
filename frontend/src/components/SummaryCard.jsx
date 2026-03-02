import React from 'react';
import styles from '../styles/SummaryCard.module.css';

export default function SummaryCard({ summary }) {
  return (
    <div className={styles.summaryCard}>
      <div className={styles.header}>
        <span className={styles.icon}>📝</span>
        <h3 className={styles.title}>Call Summary</h3>
      </div>
      <p className={styles.content}>{summary}</p>
    </div>
  );
}
