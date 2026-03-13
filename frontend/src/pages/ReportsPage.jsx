import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { getCallHistory } from '../utils/storage';
import { getServerHistory } from '../utils/api';
import pageStyles from '../styles/PageLayout.module.css';
import styles from '../styles/ReportsPage.module.css';

function toMonthLabel(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function ReportsPage() {
  const [history, setHistory] = useState(() => getCallHistory());

  useEffect(() => {
    let mounted = true;

    getServerHistory().then(({ history: remote = [] }) => {
      if (!mounted || remote.length === 0) {
        return;
      }

      setHistory((prev) => {
        const seen = new Set(prev.map((i) => String(i.id)));
        return [...remote.filter((i) => !seen.has(String(i.id))), ...prev];
      });
    });

    return () => {
      mounted = false;
    };
  }, []);

  const reportStats = useMemo(() => {
    if (history.length === 0) {
      return {
        total: 0,
        avgScore: 0,
        highRisk: 0,
        trend: [],
      };
    }

    const avgScore = history.reduce((sum, h) => sum + Number(h.quality_score || 0), 0) / history.length;
    const highRisk = history.filter((h) => (h.violations || []).length > 0).length;

    const byMonth = {};
    history.forEach((h) => {
      const month = toMonthLabel(h.timestamp || '1970-01-01T00:00:00.000Z');
      if (!byMonth[month]) {
        byMonth[month] = { month, score: 0, count: 0 };
      }
      byMonth[month].score += Number(h.quality_score || 0);
      byMonth[month].count += 1;
    });

    const trend = Object.values(byMonth)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((x) => ({ month: x.month, avgScore: Number((x.score / x.count).toFixed(1)) }));

    return {
      total: history.length,
      avgScore: Number(avgScore.toFixed(1)),
      highRisk,
      trend,
    };
  }, [history]);

  return (
    <main className={pageStyles.page}>
      <div className={pageStyles.panel}>
        <div className={pageStyles.headerRow}>
          <div>
            <h1 className={pageStyles.title}>Reports</h1>
            <p className={pageStyles.tagline}>Performance snapshots</p>
            <p className={pageStyles.subtitle}>Monthly trends and quality insights from call audits.</p>
          </div>
        </div>

        <div className={styles.statGrid}>
          <div className={styles.statCard}>
            <p className={styles.label}>Total Uploads</p>
            <p className={styles.value}>{reportStats.total}</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.label}>Average Score</p>
            <p className={styles.value}>{reportStats.avgScore}</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.label}>Risky Calls</p>
            <p className={styles.value}>{reportStats.highRisk}</p>
          </div>
        </div>

        <div className={styles.chartCard}>
          <p className={styles.chartTitle}>Monthly Quality Trend</p>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={reportStats.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
              <XAxis dataKey="month" stroke="rgba(255,255,255,0.55)" />
              <YAxis stroke="rgba(255,255,255,0.55)" domain={[0, 100]} />
              <Tooltip contentStyle={{ background: '#0f1529', border: '1px solid rgba(255,255,255,0.12)' }} />
              <Line dataKey="avgScore" stroke="#4a9eff" strokeWidth={2.5} dot={{ fill: '#4a9eff', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </main>
  );
}
