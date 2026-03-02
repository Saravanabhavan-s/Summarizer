import React from 'react';
import styles from '../styles/HistorySection.module.css';
import { getGrade, getScoreColor } from '../utils/constants';

export default function HistorySection({ history, onViewResult }) {
  if (history.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>📭</div>
        <h3 className={styles.emptyTitle}>No History Yet</h3>
        <p className={styles.emptyText}>
          Upload and process an audio file to see your analysis history here.
        </p>
      </div>
    );
  }

  const formatDate = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={styles.historySection}>
      <div className={styles.header}>
        <h2 className={styles.title}>Call History</h2>
        <p className={styles.subtitle}>{history.length} recordings</p>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thFilename}>Filename</th>
              <th className={styles.thDate}>Date</th>
              <th className={styles.thScore}>Quality Score</th>
              <th className={styles.thEmotion}>Emotion</th>
              <th className={styles.thLanguage}>Language</th>
            </tr>
          </thead>
          <tbody>
            {history.map((entry) => {
              const qualityScore = Number(entry.quality_score ?? 0);
              const grade = getGrade(qualityScore);
              const color = getScoreColor(qualityScore);

              return (
                <tr
                  key={entry.id}
                  className={styles.row}
                  onClick={() => onViewResult(entry.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      onViewResult(entry.id);
                    }
                  }}
                >
                  <td className={styles.filename}>
                    <span className={styles.filenameText}>{entry.filename}</span>
                  </td>
                  <td className={styles.date}>{formatDate(entry.timestamp)}</td>
                  <td className={styles.scoreCell}>
                    <div className={styles.scoreDisplay}>
                      <span
                        className={styles.scoreBadge}
                        style={{ backgroundColor: color }}
                      >
                        {grade}
                      </span>
                      <span className={styles.scoreNumber}>
                        {qualityScore.toFixed(1)}
                      </span>
                    </div>
                  </td>
                  <td className={styles.emotion}>{entry.customer_emotion || 'Unknown'}</td>
                  <td className={styles.language}>{entry.language_detected || 'Unknown'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
