/**
 * ComparePage — Side-by-side comparison of two call evaluations
 *
 * Step 1: User selects 2 items from combined local + server history
 * Step 2: Scores, charts, violations, and improvements shown side-by-side
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from 'recharts';
import { getCallHistory } from '../utils/storage';
import { getServerHistory } from '../utils/api';
import { getPerformanceMetrics } from '../utils/metrics';
import styles from '../styles/ComparePage.module.css';
import pageStyles from '../styles/PageLayout.module.css';

// Score badge color thresholds
const scoreColor = (v) => {
  if (v == null) return '#9ca3af';
  if (v >= 80) return '#22c55e';
  if (v >= 60) return '#f59e0b';
  return '#ef4444';
};

// ── Sub-component: compact score tile ──────────────────────
function ScoreTile({ label, value }) {
  const color = scoreColor(value);
  return (
    <div className={styles.scoreTile}>
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileValue} style={{ color }}>
        {value != null ? `${Math.round(value)}` : '—'}
      </span>
    </div>
  );
}

// ── Sub-component: comparison column ───────────────────────
function CompareColumn({ result, label, accent }) {
  const metrics = getPerformanceMetrics(result);
  const radarData = metrics
    .filter((m) => m.evaluated && ['empathy_score', 'professionalism_score', 'compliance_score', 'efficiency_score'].includes(m.key))
    .map((m) => ({ metric: m.label.split(' ')[0], score: m.value }));

  return (
    <motion.div
      className={styles.column}
      style={{ '--accent': accent }}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Column label */}
      <div className={styles.columnHead} style={{ borderColor: accent }}>
        <span className={styles.columnTag} style={{ background: accent }}>{label}</span>
        <h3 className={styles.fileName}>{result.filename || 'Call Recording'}</h3>
        <p className={styles.timeStamp}>
          {result.timestamp ? new Date(result.timestamp).toLocaleString() : '—'}
        </p>
      </div>

      {/* Quality score hero */}
      <div className={styles.heroScore} style={{ borderColor: `${accent}55` }}>
        <span className={styles.heroLabel}>Quality Score</span>
        <span className={styles.heroValue} style={{ color: scoreColor(result.quality_score) }}>
          {result.quality_score != null ? `${result.quality_score}` : '—'}
          <span className={styles.heroUnit}>/100</span>
        </span>
      </div>

      {/* Score tiles grid */}
      <div className={styles.tileGrid}>
        <ScoreTile label="Empathy"        value={result.empathy_score} />
        <ScoreTile label="Professionalism" value={result.professionalism_score} />
        <ScoreTile label="Compliance"      value={result.compliance_score} />
        <ScoreTile label="Efficiency"      value={result.efficiency_score} />
        <ScoreTile label="Language"        value={result.language_proficiency_score} />
        <ScoreTile label="Bias Reduction"  value={result.bias_reduction_score} />
      </div>

      {/* Radar chart */}
      {radarData.length >= 3 && (
        <div className={styles.chartWrap}>
          <p className={styles.chartTitle}>Skill Radar</p>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="rgba(0,0,0,0.08)" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar dataKey="score" stroke={accent} fill={accent} fillOpacity={0.2} dot={{ fill: accent, r: 3 }} />
              <Tooltip formatter={(v) => [`${Math.round(v)} / 100`]} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary */}
      {result.summary && (
        <div className={styles.summaryBlock}>
          <p className={styles.sectionLabel}>Summary</p>
          <p className={styles.summaryText}>{result.summary}</p>
        </div>
      )}

      {/* Violations */}
      {result.violations?.length > 0 && (
        <div className={styles.listBlock}>
          <p className={styles.sectionLabel}>⚠️ Violations ({result.violations.length})</p>
          <ul className={styles.listItems}>
            {result.violations.slice(0, 5).map((v, i) => (
              <li key={i} className={styles.violation}>{v}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Improvements */}
      {result.improvements?.length > 0 && (
        <div className={styles.listBlock}>
          <p className={styles.sectionLabel}>✅ Improvements ({result.improvements.length})</p>
          <ul className={styles.listItems}>
            {result.improvements.slice(0, 5).map((v, i) => (
              <li key={i} className={styles.improvement}>{v}</li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}

// ── Main page ───────────────────────────────────────────────
export default function ComparePage() {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState([]);        // array of result IDs
  const [comparing, setComparing] = useState(false);
  const [compareData, setCompareData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load history from localStorage + server on mount
  useEffect(() => {
    const localHistory = getCallHistory();
    setHistory(localHistory);
    setLoading(false);

    // Also try server-side history (merge by id)
    getServerHistory().then(({ history: serverItems = [] }) => {
      if (serverItems.length === 0) return;
      setHistory((prev) => {
        const existingIds = new Set(prev.map((e) => String(e.id)));
        const newItems = serverItems.filter((e) => !existingIds.has(String(e.id)));
        return [...newItems, ...prev];
      });
    });
  }, []);

  const toggleSelect = (id) => {
    const strId = String(id);
    setSelected((prev) =>
      prev.includes(strId)
        ? prev.filter((x) => x !== strId)
        : prev.length < 2 ? [...prev, strId] : prev
    );
  };

  const handleCompare = () => {
    const items = selected.map((id) => history.find((h) => String(h.id) === id)).filter(Boolean);
    if (items.length < 2) return;
    setCompareData(items);
    setComparing(true);
  };

  const ACCENTS = ['#4a9eff', '#f59e0b'];

  return (
    <main className={pageStyles.page}>
      <div className={pageStyles.panel}>
        {/* Header */}
        <div className={pageStyles.headerRow}>
          <div>
            <h1 className={pageStyles.title}>Compare Calls</h1>
            <p className={pageStyles.tagline}>Side-by-side analysis</p>
            <p className={pageStyles.subtitle}>
              Select 2 evaluations from your history to compare scores, charts, and feedback.
            </p>
          </div>
          {comparing && (
            <button
              className={pageStyles.secondaryButton}
              onClick={() => { setComparing(false); setSelected([]); }}
              type="button"
            >
              ← New Comparison
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {/* ── Selection view ── */}
          {!comparing && (
            <motion.div
              key="select"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {loading && <p className={styles.empty}>Loading history…</p>}
              {!loading && history.length === 0 && (
                <div className={pageStyles.emptyState}>
                  <h2 className={pageStyles.emptyTitle}>No history yet</h2>
                  <p className={pageStyles.emptyText}>
                    Upload and analyse at least 2 call recordings first.
                  </p>
                  <button className={pageStyles.backButton} onClick={() => navigate('/')}>
                    Go to Upload
                  </button>
                </div>
              )}

              {history.length > 0 && (
                <>
                  <p className={styles.pickHint}>
                    {selected.length === 0 && 'Select 2 recordings to compare'}
                    {selected.length === 1 && 'Select 1 more recording'}
                    {selected.length === 2 && 'Ready to compare ✓'}
                  </p>
                  <div className={styles.historyGrid}>
                    {history.map((entry) => {
                      const sid = String(entry.id);
                      const isSelected = selected.includes(sid);
                      const isDisabled = !isSelected && selected.length >= 2;
                      const idx = selected.indexOf(sid);
                      return (
                        <motion.div
                          key={entry.id}
                          className={[
                            styles.historyCard,
                            isSelected ? styles.cardSelected : '',
                            isDisabled  ? styles.cardDisabled  : '',
                          ].join(' ')}
                          onClick={() => !isDisabled && toggleSelect(sid)}
                          style={isSelected ? { '--card-accent': ACCENTS[idx] } : {}}
                          whileHover={!isDisabled ? { y: -2, boxShadow: '0 8px 24px rgba(0,0,0,0.1)' } : {}}
                          whileTap={!isDisabled ? { scale: 0.99 } : {}}
                        >
                          {isSelected && (
                            <span className={styles.selectedBadge} style={{ background: ACCENTS[idx] }}>
                              {idx + 1}
                            </span>
                          )}
                          <p className={styles.cardFile}>{entry.filename || 'Call Recording'}</p>
                          <p className={styles.cardDate}>
                            {entry.timestamp ? new Date(entry.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                          </p>
                          <div className={styles.cardScore} style={{ color: scoreColor(entry.quality_score) }}>
                            {entry.quality_score != null ? `${entry.quality_score}` : '—'}
                            <span className={styles.cardScoreUnit}>/100</span>
                          </div>
                          {entry.summary && (
                            <p className={styles.cardSummary}>{entry.summary.slice(0, 100)}…</p>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>

                  {selected.length === 2 && (
                    <motion.div
                      className={styles.compareBar}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <motion.button
                        className={styles.compareBtn}
                        onClick={handleCompare}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        ⚖️ Compare Selected
                      </motion.button>
                    </motion.div>
                  )}
                </>
              )}
            </motion.div>
          )}

          {/* ── Comparison view ── */}
          {comparing && compareData.length === 2 && (
            <motion.div
              key="compare"
              className={styles.compareGrid}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {compareData.map((item, i) => (
                <CompareColumn
                  key={item.id}
                  result={item}
                  label={`Call ${i + 1}`}
                  accent={ACCENTS[i]}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
