import React from 'react';
import ProgressBar from './ProgressBar';
import styles from '../styles/ScoreBreakdown.module.css';
import { getPerformanceMetrics } from '../utils/metrics';

export default function ScoreBreakdown({ result }) {
  const metricRows = getPerformanceMetrics(result).filter((metric) => (
    metric.key !== 'quality_score'
  ));

  return (
    <div className={styles.breakdownCard}>
      <div className={styles.header}>
        <span className={styles.icon}>📊</span>
        <h3 className={styles.title}>Core Metrics</h3>
      </div>

      <div className={styles.progressBars}>
        {metricRows.map((item) => (
          <ProgressBar
            key={item.label}
            label={item.label}
            score={item.value}
            evaluated={item.evaluated}
            max={100}
          />
        ))}
      </div>
    </div>
  );
}
