import { useNavigate } from 'react-router-dom';
import UploadSection from '../components/UploadSection';
import { saveCallResult } from '../utils/storage';
import styles from '../styles/PageLayout.module.css';

export default function UploadPage() {
  const navigate = useNavigate();

  const handleResultsReady = (result) => {
    const savedEntry = saveCallResult(result);
    navigate('/results', { state: { result: savedEntry } });
  };

  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>EchoScore</h1>
            <p className={styles.tagline}>Precision Intelligence for Every Conversation</p>
            <p className={styles.subtitle}>Upload a recording to generate transcription summary and hybrid quality scoring.</p>
          </div>
          <button
            className={styles.secondaryButton}
            onClick={() => navigate('/history')}
            type="button"
          >
            View History
          </button>
        </div>
        <UploadSection onResultsReady={handleResultsReady} />
      </div>
    </main>
  );
}
