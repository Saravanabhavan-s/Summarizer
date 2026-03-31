import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ResultDashboard from '../components/ResultDashboard';
import { getLatestCallResult } from '../utils/storage';
import { downloadResultPdf, downloadResultTranscript } from '../utils/api';
import styles from '../styles/PageLayout.module.css';

export default function ResultsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const result = useMemo(() => {
    return location.state?.result || getLatestCallResult();
  }, [location.state]);

  if (!result) {
    return (
      <main className={styles.page}>
        <div className={styles.panel}>
          <button className={styles.backButton} onClick={() => navigate('/dashboard')} type="button">
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

  const handleDownloadPdf = async () => {
    if (!result?.id) {
      setDownloadError('Report unavailable for this item.');
      return;
    }
    setBusy(true);
    setDownloadError('');
    try {
      await downloadResultPdf(result.id);
    } catch (error) {
      setDownloadError(error?.message || 'Failed to download report PDF.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadTranscript = async () => {
    if (!result?.id) {
      setDownloadError('Transcript unavailable for this item.');
      return;
    }
    setBusy(true);
    setDownloadError('');
    try {
      await downloadResultTranscript(result.id);
    } catch (error) {
      setDownloadError(error?.message || 'Failed to download transcript.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <div className={styles.headerRow}>
          <button className={styles.backButton} onClick={() => navigate('/dashboard')} type="button">
            ← Back to Upload
          </button>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className={styles.secondaryButton} onClick={handleDownloadPdf} type="button" disabled={busy}>
              Download PDF
            </button>
            <button className={styles.secondaryButton} onClick={handleDownloadTranscript} type="button" disabled={busy}>
              Download Transcript
            </button>
          </div>
        </div>
        {downloadError && <p className={styles.emptyText}>{downloadError}</p>}
        <ResultDashboard result={result} />
      </div>
    </main>
  );
}
