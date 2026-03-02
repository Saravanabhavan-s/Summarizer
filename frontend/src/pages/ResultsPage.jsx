import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ResultDashboard from '../components/ResultDashboard';
import { getLatestCallResult } from '../utils/storage';
import styles from '../styles/PageLayout.module.css';

export default function ResultsPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const result = useMemo(() => {
    return location.state?.result || getLatestCallResult();
  }, [location.state]);

  if (!result) {
    return (
      <main className={styles.page}>
        <div className={styles.panel}>
          <button className={styles.backButton} onClick={() => navigate('/')} type="button">
            ← Back to Upload
          </button>
          <div className={styles.emptyState}>
            <h2 className={styles.emptyTitle}>No Results Found</h2>
            <p className={styles.emptyText}>Upload a call recording to view analysis results.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <button className={styles.backButton} onClick={() => navigate('/')} type="button">
          ← Back to Upload
        </button>
        <ResultDashboard result={result} />
      </div>
    </main>
  );
}
