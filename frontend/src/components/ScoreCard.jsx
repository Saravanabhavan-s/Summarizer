import React, { useEffect, useState } from 'react';
import styles from '../styles/ScoreCard.module.css';
import { getScoreColor, getGrade, getGradeLabel } from '../utils/constants';

export default function ScoreCard({ result }) {
  const [displayScore, setDisplayScore] = useState(0);
  const qualityScore = Number.isFinite(result.quality_score) ? result.quality_score : 0;

  useEffect(() => {
    let interval;
    let current = 0;
    const target = Math.round(qualityScore);

    const animate = () => {
      current += Math.ceil(target / 30);
      if (current >= target) {
        current = target;
        clearInterval(interval);
      }
      setDisplayScore(current);
    };

    interval = setInterval(animate, 30);
    return () => clearInterval(interval);
  }, [qualityScore]);

  const grade = getGrade(qualityScore);
  const gradeLabel = getGradeLabel(qualityScore);
  const color = getScoreColor(qualityScore);

  const formatDuration = (seconds) => {
    if (!Number.isFinite(seconds)) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60)
      .toString()
      .padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const emotion = result.customer_emotion || 'Unknown';
  const safeMetric = (value) => (Number.isFinite(value) ? Math.round(value) : '—');

  return (
    <div className={styles.scoreCard}>
      <div className={styles.cardHeader}>
        <div className={styles.fileInfo}>
          <p className={styles.label}>Filename</p>
          <p className={styles.filename}>{result.filename}</p>
        </div>
        <div className={styles.metadataGrid}>
          <div className={styles.metaItem}>
            <p className={styles.label}>Duration</p>
            <p className={styles.metaValue}>{formatDuration(result.duration_seconds)}</p>
          </div>
          <div className={styles.metaItem}>
            <p className={styles.label}>Language</p>
            <p className={styles.metaValue}>{result.language_detected || 'Unknown'}</p>
          </div>
          <div className={styles.metaItem}>
            <p className={styles.label}>Time Taken</p>
            <p className={styles.metaValue}>
              {Number.isFinite(result.time_taken_seconds) ? `${Math.round(result.time_taken_seconds)}s` : '—'}
            </p>
          </div>
          <div className={styles.metaItem}>
            <p className={styles.label}>Emotion</p>
            <span className={styles.emotionBadge}>{emotion}</span>
          </div>
        </div>
      </div>

      <div className={styles.scoreDisplay}>
        <div className={styles.scoreCircle} style={{ borderColor: color }}>
          <div className={styles.scoreValue}>{displayScore}</div>
          <div className={styles.scoreUnit}>/100</div>
        </div>

        <div className={styles.gradeContainer}>
          <div
            className={styles.gradeBadge}
            style={{ backgroundColor: color }}
          >
            <span className={styles.gradeLetter}>{grade}</span>
          </div>
          <p className={styles.gradeLabel}>{gradeLabel}</p>
        </div>
      </div>

      <div className={styles.dimensionScores}>
        <div className={styles.dimensionItem}>
          <span className={styles.dimensionLabel}>Quality</span>
          <span className={styles.dimensionValue}>
            {Math.round(qualityScore)}
          </span>
        </div>
        <div className={styles.dimensionItem}>
          <span className={styles.dimensionLabel}>Empathy</span>
          <span className={styles.dimensionValue}>
            {safeMetric(result.empathy_score)}
          </span>
        </div>
        <div className={styles.dimensionItem}>
          <span className={styles.dimensionLabel}>Professionalism</span>
          <span className={styles.dimensionValue}>
            {safeMetric(result.professionalism_score)}
          </span>
        </div>
        <div className={styles.dimensionItem}>
          <span className={styles.dimensionLabel}>Compliance</span>
          <span className={styles.dimensionValue}>
            {safeMetric(result.compliance_score)}
          </span>
        </div>
      </div>
    </div>
  );
}
