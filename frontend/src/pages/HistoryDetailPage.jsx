import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ResultDashboard from '../components/ResultDashboard';
import { getServerResult, downloadResultPdf, downloadResultTranscript } from '../utils/api';
import styles from '../styles/PageLayout.module.css';

export default function HistoryDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [serverResult, setServerResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const remote = await getServerResult(id);
        if (!active) return;
        setServerResult(remote || null);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [id]);

  const result = serverResult;

  const handleDownloadPdf = async () => {
    setError('');
    try {
      await downloadResultPdf(id);
    } catch (downloadError) {
      setError(downloadError?.message || 'Failed to download PDF');
    }
  };

  const handleDownloadTranscript = async () => {
    setError('');
    try {
      await downloadResultTranscript(id);
    } catch (downloadError) {
      setError(downloadError?.message || 'Failed to download transcript');
    }
  };

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.panel}>
          <button className={styles.backButton} onClick={() => navigate('/history')} type="button">
            ← Back to History
          </button>
          <div className={styles.emptyState}>
            <h2 className={styles.emptyTitle}>Loading Entry</h2>
            <p className={styles.emptyText}>Retrieving call details from the server.</p>
          </div>
        </div>
      </main>
    );
  }

  if (!result) {
    return (
      <main className={styles.page}>
        <div className={styles.panel}>
          <button className={styles.backButton} onClick={() => navigate('/history')} type="button">
            ← Back to History
          </button>
          <div className={styles.emptyState}>
            <h2 className={styles.emptyTitle}>Entry Not Found</h2>
            <p className={styles.emptyText}>This call record is not available on the server. Refresh history and open an existing item.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <div className={styles.headerRow}>
          <button className={styles.backButton} onClick={() => navigate('/history')} type="button">
            ← Back to History
          </button>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className={styles.secondaryButton} type="button" onClick={handleDownloadPdf}>
              Download PDF
            </button>
            <button className={styles.secondaryButton} type="button" onClick={handleDownloadTranscript}>
              Download transcript
            </button>
          </div>
        </div>
        {error && <p className={styles.emptyText}>{error}</p>}
        <ResultDashboard result={result} />
      </div>
    </main>
  );
}
