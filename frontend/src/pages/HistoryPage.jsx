import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HistorySection from '../components/HistorySection';
import { getServerHistory, downloadResultPdf, downloadResultTranscript } from '../utils/api';
import styles from '../styles/PageLayout.module.css';

export default function HistoryPage() {
  const navigate = useNavigate();
  const [serverHistory, setServerHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await getServerHistory();
        if (!active) return;
        setServerHistory(response?.history || []);
      } catch {
        if (!active) return;
        setServerHistory([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const mergedHistory = serverHistory;

  const handleViewResult = (id) => {
    navigate(`/history/${id}`);
  };

  const handleDownloadPdf = async (id) => {
    setActionError('');
    try {
      await downloadResultPdf(id);
    } catch (error) {
      setActionError(error?.message || 'Failed to download PDF');
    }
  };

  const handleDownloadTranscript = async (id) => {
    setActionError('');
    try {
      await downloadResultTranscript(id);
    } catch (error) {
      setActionError(error?.message || 'Failed to download transcript');
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <button className={styles.backButton} onClick={() => navigate('/')} type="button">
          ← Back to Upload
        </button>
        {actionError && <p className={styles.emptyText}>{actionError}</p>}
        <HistorySection
          history={mergedHistory}
          loading={loading}
          onViewResult={handleViewResult}
          onDownloadPdf={handleDownloadPdf}
          onDownloadTranscript={handleDownloadTranscript}
        />
      </div>
    </main>
  );
}
