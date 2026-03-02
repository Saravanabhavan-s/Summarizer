import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HistorySection from '../components/HistorySection';
import { getCallHistory } from '../utils/storage';
import styles from '../styles/PageLayout.module.css';

export default function HistoryPage() {
  const navigate = useNavigate();
  const [history] = useState(() => getCallHistory());

  const handleViewResult = (id) => {
    navigate(`/history/${id}`);
  };

  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <button className={styles.backButton} onClick={() => navigate('/')} type="button">
          ← Back to Upload
        </button>
        <HistorySection history={history} onViewResult={handleViewResult} />
      </div>
    </main>
  );
}
