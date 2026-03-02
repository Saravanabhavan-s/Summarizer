import React from 'react';
import ScoreCard from './ScoreCard';
import ScoreBreakdown from './ScoreBreakdown';
import ChartsSection from './ChartsSection';
import ViolationsCard from './ViolationsCard';
import ImprovementsCard from './ImprovementsCard';
import SummaryCard from './SummaryCard';
import styles from '../styles/ResultDashboard.module.css';

export default function ResultDashboard({ result }) {
  return (
    <div className={styles.dashboard}>
      <div className={styles.content}>
        <div className={styles.section}>
          <ScoreCard result={result} />
        </div>

        <div className={styles.section}>
          <ScoreBreakdown result={result} />
        </div>

        <div className={styles.section}>
          <ChartsSection result={result} />
        </div>

        <div className={styles.feedbackGrid}>
          <div className={styles.feedbackColumn}>
            <ViolationsCard violations={result.violations} />
          </div>
          <div className={styles.feedbackColumn}>
            <ImprovementsCard improvements={result.improvements} />
          </div>
        </div>

        {result.summary && (
          <div className={styles.section}>
            <SummaryCard summary={result.summary} />
          </div>
        )}
      </div>
    </div>
  );
}
