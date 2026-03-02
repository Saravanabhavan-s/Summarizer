import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ResultDashboard from '../components/ResultDashboard';
import { getCallResultById } from '../utils/storage';
import styles from '../styles/PageLayout.module.css';

export default function HistoryDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();

  const result = useMemo(() => {
    return getCallResultById(Number(id));
  }, [id]);

  if (!result) {
    return (
      <main className={styles.page}>
        <div className={styles.panel}>
          <button className={styles.backButton} onClick={() => navigate('/history')} type="button">
            ← Back to History
          </button>
          <div className={styles.emptyState}>
            <h2 className={styles.emptyTitle}>Entry Not Found</h2>
            <p className={styles.emptyText}>This call log entry no longer exists in local history.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <button className={styles.backButton} onClick={() => navigate('/history')} type="button">
          ← Back to History
        </button>
        <ResultDashboard result={result} />
      </div>
    </main>
  );
}
