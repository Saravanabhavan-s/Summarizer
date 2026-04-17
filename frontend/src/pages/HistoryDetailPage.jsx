import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ResultDashboard from '../components/ResultDashboard';
import TranscriptChatWindow from '../components/TranscriptChatWindow';
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
  const isLiveEntry = result && (
    String(result.source_type || '').toLowerCase() === 'live'
    || String(result.live_tag || '').toUpperCase() === 'LIVE'
    || result.is_live === true
  );
  const liveTranscript = isLiveEntry
    ? (result.transcription || result.report_data?.transcription || '')
    : '';
  const liveChunkScores = isLiveEntry
    ? (result.chunk_scores || result.report_data?.chunk_scores || [])
    : [];
  const liveAlerts = isLiveEntry
    ? (result.alerts || result.report_data?.alerts || [])
    : [];

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

        {isLiveEntry && (
          <section className={styles.liveSection}>
            <h3 className={styles.liveSectionTitle}>Live Session Details</h3>

            {liveTranscript && (
              <div className={styles.liveTranscriptBlock}>
                <p className={styles.liveSubTitle}>Full Transcription</p>
                <TranscriptChatWindow result={{
                  formatted_transcript: result.formatted_transcript || liveTranscript,
                  transcript: liveTranscript,
                  violations: result.violations || result.report_data?.violations || [],
                  improvements: result.improvements || result.report_data?.improvements || [],
                  duration_seconds: result.duration_seconds,
                  filename: result.filename || result.audio_name,
                }} />
              </div>
            )}

            {Array.isArray(liveChunkScores) && liveChunkScores.length > 0 && (
              <div className={styles.liveChunkTableWrap}>
                <p className={styles.liveSubTitle}>Chunk Scores</p>
                <table className={styles.liveChunkTable}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Time</th>
                      <th>Overall</th>
                      <th>Fluency</th>
                      <th>Confidence</th>
                      <th>Clarity</th>
                      <th>Engagement</th>
                      <th>Sentiment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveChunkScores.map((chunk, index) => (
                      <tr key={`${chunk?.index ?? index}`}> 
                        <td>{Number.isFinite(chunk?.index) ? Number(chunk.index) + 1 : index + 1}</td>
                        <td>
                          {Number.isFinite(chunk?.time_start) && Number.isFinite(chunk?.time_end)
                            ? `${Math.floor(chunk.time_start)}s - ${Math.floor(chunk.time_end)}s`
                            : '—'}
                        </td>
                        <td>{Number.isFinite(chunk?.score) ? Number(chunk.score).toFixed(1) : '—'}</td>
                        <td>{Number.isFinite(chunk?.fluency) ? Number(chunk.fluency).toFixed(1) : '—'}</td>
                        <td>{Number.isFinite(chunk?.confidence) ? Number(chunk.confidence).toFixed(1) : '—'}</td>
                        <td>{Number.isFinite(chunk?.clarity) ? Number(chunk.clarity).toFixed(1) : '—'}</td>
                        <td>{Number.isFinite(chunk?.engagement) ? Number(chunk.engagement).toFixed(1) : '—'}</td>
                        <td>{chunk?.sentiment || 'neutral'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {Array.isArray(liveAlerts) && liveAlerts.length > 0 && (
              <div className={styles.liveAlertsBlock}>
                <p className={styles.liveSubTitle}>Alerts</p>
                <ul className={styles.liveAlertsList}>
                  {liveAlerts.map((alert, index) => {
                    const text = typeof alert === 'string' ? alert : (alert?.text || '');
                    const chunkLabel = typeof alert === 'object' && alert?.chunk != null
                      ? `Chunk ${alert.chunk}: `
                      : '';

                    return (
                      <li key={`${index}-${text}`} className={styles.liveAlertItem}>
                        {chunkLabel}{text}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
