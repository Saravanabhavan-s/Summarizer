import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
} from 'recharts';
import {
  getAdminOverview,
  getAdminStats,
  getAdminUsersList,
  createAdminUser,
  deleteAdminUser,
  blockAdminUser,
  unblockAdminUser,
  assignAdminUserRole,
  getAdminUserActivity,
  getAdminPolicy,
  uploadAdminPolicy,
  updateAdminPolicy,
  deleteAdminPolicy,
  rebuildAdminPolicyEmbeddings,
  rebuildAdminPolicyVectorDb,
  getAdminCalls,
  uploadAdminCall,
  rescoreAdminCall,
  deleteAdminCall,
  downloadResultPdf,
  downloadResultTranscript,
  runAdminEchoScore,
  getAdminEchoScoreScores,
  getAdminEchoScoreParameters,
  updateAdminEchoScoreParameters,
  resetAdminEchoScoreParameters,
  resetAdminEchoScoreValue,
  getAdminEchoScoreDetails,
  getAdminReportsAnalytics,
  generateAdminReport,
  exportAdminReportPdf,
  exportAdminReportCsv,
  getAdminMonitoringTable,
  getAdminApiUsage,
  getAdminLogs,
  getAdminErrors,
  getAdminScoringLogs,
  getAdminSystemLogs,
  getAdminSettings,
  updateAdminSettings,
  getAdminSecurity,
  getAdminHealth,
} from '../utils/api';
import pageStyles from '../styles/PageLayout.module.css';
import styles from '../styles/AdminPage.module.css';

const SECTIONS = [
  'Overview',
  'Users',
  'Policies',
  'Calls',
  'EchoScore',
  'Reports',
  'Logs',
  'Settings',
  'Security',
];

const ROLE_OPTIONS = ['admin', 'evaluator', 'user'];

const defaultReportFilters = {
  user_id: '',
  start_date: '',
  end_date: '',
  min_score: '',
  max_score: '',
};

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function numberValue(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default function AdminPage({ initialSection = 'Overview' }) {
  const navigate = useNavigate();

  const [activeSection, setActiveSection] = useState(initialSection);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyMessage, setBusyMessage] = useState('');

  const [overview, setOverview] = useState({ sections: [], stats: {}, api_usage: {} });
  const [stats, setStats] = useState({});
  const [users, setUsers] = useState([]);
  const [userActivityMap, setUserActivityMap] = useState({});

  const [policy, setPolicy] = useState({ exists: false, content: '', policy_path: '' });
  const [policyEdit, setPolicyEdit] = useState('');

  const [calls, setCalls] = useState([]);
  const [scores, setScores] = useState([]);
  const [scoreParams, setScoreParams] = useState({
    openrouter_model: 'openai/gpt-4o-mini',
    final_weights: { empathy: 0.35, professionalism: 0.30, compliance: 0.35 },
  });

  const [manualScoreForm, setManualScoreForm] = useState({
    call_name: 'manual_call.txt',
    transcript: '',
  });

  const [reports, setReports] = useState({ summary: {}, results: [], total: 0 });
  const [reportFilters, setReportFilters] = useState(defaultReportFilters);

  const [monitoring, setMonitoring] = useState({ rows: [], request_count: 0, tokens_used: 0 });
  const [apiUsage, setApiUsage] = useState({ requests_count: 0, tokens_used: 0, by_endpoint: [] });
  const [requestLogs, setRequestLogs] = useState([]);
  const [errorLogs, setErrorLogs] = useState([]);
  const [scoringLogs, setScoringLogs] = useState([]);
  const [systemLogs, setSystemLogs] = useState([]);
  const [settings, setSettings] = useState({
    model: 'openai/gpt-4o-mini',
    api_key: '',
    scoring_rules: { final_weights: { empathy: 0.35, professionalism: 0.30, compliance: 0.35 } },
    feature_flags: { admin_dashboard: true, pdf_reports: true, history_downloads: true, rag_enabled: true },
  });
  const [security, setSecurity] = useState({ admin_only_pages: [], users: [] });
  const [health, setHealth] = useState({ api: { status: 'unknown' }, rag: { status: 'unknown' }, llm: { status: 'unknown' } });
  const [selectedScoreDetail, setSelectedScoreDetail] = useState(null);
  const [callUploadProgress, setCallUploadProgress] = useState(0);

  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user' });

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [
        overviewData,
        statsData,
        usersData,
        policyData,
        callsData,
        scoresData,
        scoreParamsData,
        reportsData,
        monitoringData,
        apiUsageData,
        requestLogsData,
        errorLogsData,
        scoringLogsData,
        systemLogsData,
        settingsData,
        securityData,
        healthData,
      ] = await Promise.all([
        getAdminOverview(),
        getAdminStats(),
        getAdminUsersList(),
        getAdminPolicy(),
        getAdminCalls(300),
        getAdminEchoScoreScores(300),
        getAdminEchoScoreParameters(),
        getAdminReportsAnalytics(),
        getAdminMonitoringTable(150),
        getAdminApiUsage(),
        getAdminLogs(120),
        getAdminErrors(120),
        getAdminScoringLogs(120),
        getAdminSystemLogs(120),
        getAdminSettings(),
        getAdminSecurity(),
        getAdminHealth(),
      ]);

      setOverview(overviewData || { sections: [], stats: {}, api_usage: {} });
      setStats(statsData || {});
      setUsers(usersData?.users || []);
      setPolicy(policyData || { exists: false, content: '', policy_path: '' });
      setPolicyEdit(policyData?.content || '');
      setCalls(callsData?.calls || []);
      setScores(scoresData?.scores || []);
      setScoreParams(scoreParamsData || {
        openrouter_model: 'openai/gpt-4o-mini',
        final_weights: { empathy: 0.35, professionalism: 0.30, compliance: 0.35 },
      });
      setReports(reportsData || { summary: {}, results: [], total: 0 });
      setMonitoring(monitoringData || { rows: [], request_count: 0, tokens_used: 0 });
      setApiUsage(apiUsageData || { requests_count: 0, tokens_used: 0, by_endpoint: [] });
      setRequestLogs(requestLogsData || []);
      setErrorLogs(errorLogsData || []);
      setScoringLogs(scoringLogsData || []);
      setSystemLogs(systemLogsData || []);
      setSettings((prev) => ({
        ...prev,
        model: settingsData?.model || prev.model,
        scoring_rules: settingsData?.scoring_rules || prev.scoring_rules,
        feature_flags: settingsData?.feature_flags || prev.feature_flags,
      }));
      setSecurity(securityData || { admin_only_pages: [], users: [] });
      setHealth(healthData || { api: { status: 'unknown' }, rag: { status: 'unknown' }, llm: { status: 'unknown' } });
    } catch (loadError) {
      setError(loadError?.message || 'Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const endpointChartData = useMemo(() => {
    return (apiUsage.by_endpoint || []).slice(0, 8).map((row) => ({
      endpoint: row.endpoint,
      requests: row.requests,
    }));
  }, [apiUsage]);

  const reportTrendData = useMemo(() => {
    const byDate = {};
    (reports.results || []).forEach((item) => {
      const key = (item.timestamp || '').slice(0, 10) || 'unknown';
      if (!byDate[key]) byDate[key] = { date: key, totalScore: 0, count: 0 };
      byDate[key].totalScore += numberValue(item.quality_score, 0);
      byDate[key].count += 1;
    });

    return Object.values(byDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => ({ date: row.date, avgScore: Number((row.totalScore / row.count).toFixed(1)) }));
  }, [reports]);

  const runWithBusy = async (label, fn) => {
    setBusyMessage(label);
    setError('');
    try {
      await fn();
    } catch (actionError) {
      setError(actionError?.message || 'Action failed.');
    } finally {
      setBusyMessage('');
    }
  };

  const refreshUsers = async () => {
    const data = await getAdminUsersList();
    setUsers(data?.users || []);
  };

  const refreshPolicy = async () => {
    const data = await getAdminPolicy();
    setPolicy(data || {});
    setPolicyEdit(data?.content || '');
  };

  const refreshCalls = async () => {
    const data = await getAdminCalls(300);
    setCalls(data?.calls || []);
  };

  const refreshScores = async () => {
    const data = await getAdminEchoScoreScores(300);
    setScores(data?.scores || []);
  };

  const refreshReports = async () => {
    const params = {
      ...(reportFilters.user_id ? { user_id: reportFilters.user_id } : {}),
      ...(reportFilters.start_date ? { start_date: reportFilters.start_date } : {}),
      ...(reportFilters.end_date ? { end_date: reportFilters.end_date } : {}),
      ...(reportFilters.min_score ? { min_score: reportFilters.min_score } : {}),
      ...(reportFilters.max_score ? { max_score: reportFilters.max_score } : {}),
    };
    const data = await getAdminReportsAnalytics(params);
    setReports(data || { summary: {}, results: [], total: 0 });
  };

  const refreshMonitoring = async () => {
    const [monitoringData, usageData, requestLogsData, errorLogsData, scoringLogsData, systemLogsData] = await Promise.all([
      getAdminMonitoringTable(150),
      getAdminApiUsage(),
      getAdminLogs(120),
      getAdminErrors(120),
      getAdminScoringLogs(120),
      getAdminSystemLogs(120),
    ]);
    setMonitoring(monitoringData || { rows: [], request_count: 0, tokens_used: 0 });
    setApiUsage(usageData || { requests_count: 0, tokens_used: 0, by_endpoint: [] });
    setRequestLogs(requestLogsData || []);
    setErrorLogs(errorLogsData || []);
    setScoringLogs(scoringLogsData || []);
    setSystemLogs(systemLogsData || []);
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    await runWithBusy('Creating user...', async () => {
      await createAdminUser(newUser);
      setNewUser({ username: '', password: '', role: 'user' });
      await refreshUsers();
    });
  };

  const handleUserActivity = async (userId) => {
    await runWithBusy('Loading user activity...', async () => {
      const activity = await getAdminUserActivity(userId);
      setUserActivityMap((prev) => ({ ...prev, [userId]: activity }));
    });
  };

  const handlePolicyUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await runWithBusy('Uploading policy...', async () => {
      await uploadAdminPolicy(file);
      await refreshPolicy();
    });

    event.target.value = '';
  };

  const handleAdminCallUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await runWithBusy('Uploading admin call...', async () => {
      setCallUploadProgress(0);
      await uploadAdminCall(file, setCallUploadProgress);
      await Promise.all([refreshCalls(), refreshScores(), refreshReports(), refreshMonitoring()]);
      setCallUploadProgress(0);
    });

    event.target.value = '';
  };

  const handleManualScoreRun = async (event) => {
    event.preventDefault();
    await runWithBusy('Running manual scoring...', async () => {
      await runAdminEchoScore(manualScoreForm);
      setManualScoreForm((prev) => ({ ...prev, transcript: '' }));
      await Promise.all([refreshCalls(), refreshScores(), refreshReports(), refreshMonitoring()]);
    });
  };

  const handleSaveScoreParameters = async () => {
    await runWithBusy('Saving scoring parameters...', async () => {
      const payload = {
        openrouter_model: scoreParams.openrouter_model,
        final_weights: scoreParams.final_weights,
      };
      const response = await updateAdminEchoScoreParameters(payload);
      setScoreParams(response?.parameters || scoreParams);
    });
  };

  const handleResetScoreParameters = async () => {
    await runWithBusy('Resetting scoring parameters...', async () => {
      const response = await resetAdminEchoScoreParameters();
      setScoreParams(response?.parameters || scoreParams);
    });
  };

  const handleViewScoreDetails = async (resultId) => {
    await runWithBusy('Loading evaluation details...', async () => {
      const detail = await getAdminEchoScoreDetails(resultId);
      setSelectedScoreDetail(detail || null);
    });
  };

  const handleSaveSettings = async () => {
    await runWithBusy('Saving settings...', async () => {
      const payload = {
        model: settings.model,
        api_key: settings.api_key || undefined,
        scoring_rules: settings.scoring_rules,
        feature_flags: settings.feature_flags,
      };
      await updateAdminSettings(payload);
      const latest = await getAdminSettings();
      setSettings((prev) => ({
        ...prev,
        model: latest?.model || prev.model,
        scoring_rules: latest?.scoring_rules || prev.scoring_rules,
        feature_flags: latest?.feature_flags || prev.feature_flags,
        api_key: '',
      }));
    });
  };

  const summaryCards = [
    { label: 'Total Requests', value: stats.total_requests ?? 0 },
    { label: 'Success Rate', value: `${stats.success_rate_percent ?? 0}%` },
    { label: 'Total Errors', value: stats.total_errors ?? 0 },
    { label: 'Active Users', value: stats.active_user_count ?? 0 },
    { label: 'Scoring Runs', value: stats.scoring_runs ?? 0 },
    { label: 'Tokens Used', value: stats.tokens_used ?? 0 },
  ];

  const renderOverview = () => (
    <div className={styles.sectionWrap}>
      <div className={styles.cardGrid}>
        {summaryCards.map((card) => (
          <div key={card.label} className={styles.card}>
            <p className={styles.cardLabel}>{card.label}</p>
            <p className={styles.cardValue}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className={styles.chartCard}>
        <p className={styles.chartTitle}>Top API Endpoints</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={endpointChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
            <XAxis dataKey="endpoint" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.45)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.45)' }} />
            <Tooltip
              contentStyle={{
                background: 'rgba(10,14,28,0.92)',
                border: '1px solid rgba(74,158,255,0.2)',
                borderRadius: '10px',
                color: '#fff',
                fontSize: '12px',
              }}
              cursor={{ fill: 'rgba(74,158,255,0.05)' }}
            />
            <Bar dataKey="requests" fill="#4a9eff" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={styles.healthGrid}>
        {[
          { label: 'API', value: health?.api?.status || 'unknown', detail: `Version ${health?.api?.version || '—'}` },
          { label: 'RAG', value: health?.rag?.status || 'unknown', detail: health?.rag?.provider || 'faiss' },
          { label: 'LLM', value: health?.llm?.status || 'unknown', detail: health?.llm?.model || '—' },
        ].map((item) => (
          <div className={styles.healthCard} key={item.label}>
            <p className={styles.cardLabel}>{item.label}</p>
            <p className={styles.healthValue}>{item.value}</p>
            <p className={styles.cardMuted}>{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );

  const renderUsers = () => (
    <div className={styles.sectionWrap}>
      <form className={styles.inlineForm} onSubmit={handleCreateUser}>
        <input
          value={newUser.username}
          onChange={(event) => setNewUser((prev) => ({ ...prev, username: event.target.value }))}
          placeholder="Username"
          required
        />
        <input
          type="password"
          value={newUser.password}
          onChange={(event) => setNewUser((prev) => ({ ...prev, password: event.target.value }))}
          placeholder="Password"
          required
        />
        <select
          value={newUser.role}
          onChange={(event) => setNewUser((prev) => ({ ...prev, role: event.target.value }))}
        >
          {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
        </select>
        <button type="submit">Add user</button>
      </form>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Blocked</th>
              <th>Last Activity</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((item) => (
              <tr key={item.user_id}>
                <td>{item.username}</td>
                <td>
                  <select
                    value={item.role}
                    onChange={(event) => {
                      runWithBusy('Updating role...', async () => {
                        await assignAdminUserRole(item.user_id, event.target.value);
                        await refreshUsers();
                      });
                    }}
                  >
                    {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                </td>
                <td>{item.blocked ? 'Yes' : 'No'}</td>
                <td>{formatDate(item.last_activity)}</td>
                <td className={styles.actionsCell}>
                  <button type="button" onClick={() => navigate(`/admin/users`)}>View</button>
                  <button type="button" onClick={() => handleUserActivity(item.user_id)}>Activity</button>
                  {!item.blocked && <button type="button" onClick={() => runWithBusy('Blocking user...', async () => { await blockAdminUser(item.user_id); await refreshUsers(); })}>Block</button>}
                  {item.blocked && <button type="button" onClick={() => runWithBusy('Unblocking user...', async () => { await unblockAdminUser(item.user_id); await refreshUsers(); })}>Unblock</button>}
                  <button type="button" onClick={() => runWithBusy('Deleting user...', async () => { await deleteAdminUser(item.user_id); await refreshUsers(); })}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {Object.keys(userActivityMap).length > 0 && (
        <div className={styles.tableCard}>
          <p className={styles.chartTitle}>User Activity</p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Blocked</th>
                <th>Last Login</th>
                <th>Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(userActivityMap).map(([key, value]) => (
                <tr key={key}>
                  <td>{value.username || key}</td>
                  <td>{value.role}</td>
                  <td>{value.blocked ? 'Yes' : 'No'}</td>
                  <td>{formatDate(value.last_login)}</td>
                  <td>{formatDate(value.last_activity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderPolicies = () => (
    <div className={styles.sectionWrap}>
      <div className={styles.inlineForm}>
        <input type="file" accept=".txt,.md" onChange={handlePolicyUpload} />
        <button type="button" onClick={() => runWithBusy('Rebuilding embeddings...', rebuildAdminPolicyEmbeddings)}>
          Rebuild embeddings
        </button>
        <button type="button" onClick={() => runWithBusy('Rebuilding vector DB...', rebuildAdminPolicyVectorDb)}>
          Rebuild vector DB
        </button>
        <button type="button" onClick={() => runWithBusy('Deleting policy...', async () => { await deleteAdminPolicy(); await refreshPolicy(); })}>
          Delete policy
        </button>
      </div>

      <p className={styles.cardMuted}>Active policy: {policy.policy_path || 'N/A'}</p>

      <textarea
        className={styles.textArea}
        value={policyEdit}
        onChange={(event) => setPolicyEdit(event.target.value)}
        placeholder="Policy content"
      />
      <button
        className={styles.primaryBtn}
        type="button"
        onClick={() => runWithBusy('Updating policy...', async () => {
          await updateAdminPolicy(policyEdit);
          await refreshPolicy();
        })}
      >
        Update policy
      </button>
    </div>
  );

  const renderCalls = () => (
    <div className={styles.sectionWrap}>
      <div className={styles.inlineForm}>
        <input type="file" accept="audio/*,.txt,.pdf,.docx" onChange={handleAdminCallUpload} />
        {callUploadProgress > 0 && callUploadProgress < 100 && (
          <span className={styles.cardMuted}>Uploading {callUploadProgress}%</span>
        )}
      </div>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>User</th>
              <th>File</th>
              <th>Score</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((item) => (
              <tr key={item.id}>
                <td>{formatDate(item.timestamp)}</td>
                <td>{item.username || item.user_id}</td>
                <td>{item.filename}</td>
                <td>{item.quality_score}</td>
                <td className={styles.actionsCell}>
                  <button type="button" onClick={() => navigate(`/history/${item.id}`)}>View</button>
                  <button type="button" onClick={() => runWithBusy('Rescoring call...', async () => { await rescoreAdminCall(item.id); await Promise.all([refreshCalls(), refreshScores()]); })}>Re-score</button>
                  <button type="button" onClick={() => runWithBusy('Resetting score...', async () => { await resetAdminEchoScoreValue(item.id); await Promise.all([refreshCalls(), refreshScores()]); })}>Reset score</button>
                  <button type="button" onClick={() => runWithBusy('Downloading PDF...', async () => { await downloadResultPdf(item.id); })}>Download PDF</button>
                  <button type="button" onClick={() => runWithBusy('Downloading transcript...', async () => { await downloadResultTranscript(item.id); })}>Download transcript</button>
                  <button type="button" onClick={() => runWithBusy('Deleting call...', async () => { await deleteAdminCall(item.id); await Promise.all([refreshCalls(), refreshScores(), refreshReports()]); })}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderEchoScore = () => (
    <div className={styles.sectionWrap}>
      <form className={styles.manualForm} onSubmit={handleManualScoreRun}>
        <input
          value={manualScoreForm.call_name}
          onChange={(event) => setManualScoreForm((prev) => ({ ...prev, call_name: event.target.value }))}
          placeholder="Call name"
        />
        <textarea
          value={manualScoreForm.transcript}
          onChange={(event) => setManualScoreForm((prev) => ({ ...prev, transcript: event.target.value }))}
          placeholder="Paste transcript to run manual scoring"
          required
        />
        <button type="submit">Run scoring manually</button>
      </form>

      <div className={styles.inlineForm}>
        <input
          value={scoreParams.openrouter_model || ''}
          onChange={(event) => setScoreParams((prev) => ({ ...prev, openrouter_model: event.target.value }))}
          placeholder="Model"
        />
        <input
          type="number"
          step="0.01"
          value={scoreParams?.final_weights?.empathy ?? 0}
          onChange={(event) => setScoreParams((prev) => ({
            ...prev,
            final_weights: { ...prev.final_weights, empathy: Number(event.target.value) },
          }))}
          placeholder="Empathy weight"
        />
        <input
          type="number"
          step="0.01"
          value={scoreParams?.final_weights?.professionalism ?? 0}
          onChange={(event) => setScoreParams((prev) => ({
            ...prev,
            final_weights: { ...prev.final_weights, professionalism: Number(event.target.value) },
          }))}
          placeholder="Professionalism weight"
        />
        <input
          type="number"
          step="0.01"
          value={scoreParams?.final_weights?.compliance ?? 0}
          onChange={(event) => setScoreParams((prev) => ({
            ...prev,
            final_weights: { ...prev.final_weights, compliance: Number(event.target.value) },
          }))}
          placeholder="Compliance weight"
        />
        <button type="button" onClick={handleSaveScoreParameters}>Save parameters</button>
        <button type="button" onClick={handleResetScoreParameters}>Reset parameters</button>
      </div>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>Call</th>
              <th>Score</th>
              <th>Empathy</th>
              <th>Compliance</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {scores.slice(0, 120).map((item) => (
              <tr key={item.id}>
                <td>{formatDate(item.timestamp)}</td>
                <td>{item.user_id}</td>
                <td>{item.filename}</td>
                <td>{item.quality_score}</td>
                <td>{item.empathy_score}</td>
                <td>{item.compliance_score}</td>
                <td className={styles.actionsCell}>
                  <button type="button" onClick={() => handleViewScoreDetails(item.id)}>Details</button>
                  <button type="button" onClick={() => runWithBusy('Resetting score...', async () => { await resetAdminEchoScoreValue(item.id); await Promise.all([refreshCalls(), refreshScores()]); })}>Reset</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedScoreDetail && (
        <div className={styles.tableCard}>
          <p className={styles.chartTitle}>Evaluation Details</p>
          <div className={styles.detailGrid}>
            <div className={styles.card}>
              <p className={styles.cardLabel}>Call</p>
              <p className={styles.cardMuted}>{selectedScoreDetail.filename}</p>
              <p className={styles.cardMuted}>{selectedScoreDetail.summary || 'No summary available.'}</p>
            </div>
            <div className={styles.card}>
              <p className={styles.cardLabel}>Suggestions</p>
              <ul className={styles.list}>
                {(selectedScoreDetail.improvements || []).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div className={styles.card}>
              <p className={styles.cardLabel}>Risks</p>
              <ul className={styles.list}>
                {(selectedScoreDetail.violations || []).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderReports = () => (
    <div className={styles.sectionWrap}>
      <div className={styles.inlineForm}>
        <input
          value={reportFilters.user_id}
          onChange={(event) => setReportFilters((prev) => ({ ...prev, user_id: event.target.value }))}
          placeholder="Filter user"
        />
        <input
          type="date"
          value={reportFilters.start_date}
          onChange={(event) => setReportFilters((prev) => ({ ...prev, start_date: event.target.value }))}
        />
        <input
          type="date"
          value={reportFilters.end_date}
          onChange={(event) => setReportFilters((prev) => ({ ...prev, end_date: event.target.value }))}
        />
        <input
          type="number"
          min="0"
          max="100"
          value={reportFilters.min_score}
          onChange={(event) => setReportFilters((prev) => ({ ...prev, min_score: event.target.value }))}
          placeholder="Min score"
        />
        <input
          type="number"
          min="0"
          max="100"
          value={reportFilters.max_score}
          onChange={(event) => setReportFilters((prev) => ({ ...prev, max_score: event.target.value }))}
          placeholder="Max score"
        />
        <button type="button" onClick={() => runWithBusy('Applying filters...', refreshReports)}>Apply filters</button>
        <button type="button" onClick={() => runWithBusy('Generating report summary...', async () => {
          await generateAdminReport({
            ...(reportFilters.user_id ? { user_id: reportFilters.user_id } : {}),
            ...(reportFilters.start_date ? { start_date: reportFilters.start_date } : {}),
            ...(reportFilters.end_date ? { end_date: reportFilters.end_date } : {}),
            ...(reportFilters.min_score ? { min_score: reportFilters.min_score } : {}),
            ...(reportFilters.max_score ? { max_score: reportFilters.max_score } : {}),
          });
          await refreshReports();
        })}>Generate report</button>
        <button type="button" onClick={() => runWithBusy('Exporting PDF...', async () => { await exportAdminReportPdf(reportFilters); })}>Export PDF</button>
        <button type="button" onClick={() => runWithBusy('Exporting CSV...', async () => { await exportAdminReportCsv(reportFilters); })}>Export CSV</button>
      </div>

      <div className={styles.cardGrid}>
        <div className={styles.card}>
          <p className={styles.cardLabel}>Total Calls</p>
          <p className={styles.cardValue}>{reports.summary?.total_calls || 0}</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>Average Score</p>
          <p className={styles.cardValue}>{reports.summary?.avg_score || 0}</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>Average Compliance</p>
          <p className={styles.cardValue}>{reports.summary?.avg_compliance || 0}</p>
        </div>
      </div>

      <div className={styles.chartCard}>
        <p className={styles.chartTitle}>Score Trend</p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={reportTrendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.45)' }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.45)' }} />
            <Tooltip
              contentStyle={{
                background: 'rgba(10,14,28,0.92)',
                border: '1px solid rgba(74,158,255,0.2)',
                borderRadius: '10px',
                color: '#fff',
                fontSize: '12px',
              }}
              cursor={{ stroke: 'rgba(74,158,255,0.2)' }}
            />
            <Line type="monotone" dataKey="avgScore" stroke="#4a9eff" strokeWidth={2.4} dot={{ fill: '#4a9eff', r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>User</th>
              <th>File</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {(reports.results || []).slice(0, 120).map((item) => (
              <tr key={item.id}>
                <td>{formatDate(item.timestamp)}</td>
                <td>{item.username || item.user_id}</td>
                <td>{item.filename}</td>
                <td>{item.quality_score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderLogs = () => (
    <div className={styles.sectionWrap}>
      <div className={styles.cardGrid}>
        <div className={styles.card}>
          <p className={styles.cardLabel}>Requests Count</p>
          <p className={styles.cardValue}>{monitoring.request_count || 0}</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>Tokens Used</p>
          <p className={styles.cardValue}>{monitoring.tokens_used || 0}</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>API Requests</p>
          <p className={styles.cardValue}>{apiUsage.requests_count || 0}</p>
        </div>
      </div>

      <button className={styles.primaryBtn} type="button" onClick={() => runWithBusy('Refreshing logs...', refreshMonitoring)}>
        Refresh logs
      </button>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Time</th>
              <th>Type</th>
              <th>Source</th>
              <th>User</th>
              <th>Status</th>
              <th>Requests</th>
              <th>Tokens</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {(monitoring.rows || []).slice(0, 180).map((row, idx) => (
              <tr key={`${row.timestamp}-${idx}`}>
                <td>{formatDate(row.timestamp)}</td>
                <td>{row.kind}</td>
                <td>{row.source}</td>
                <td>{row.user_id || '—'}</td>
                <td>{row.status}</td>
                <td>{row.requests_count}</td>
                <td>{row.tokens_used}</td>
                <td>{row.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.tableCard}>
        <p className={styles.chartTitle}>System Logs</p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Time</th>
              <th>Level</th>
              <th>Component</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {systemLogs.slice(0, 80).map((row, idx) => (
              <tr key={`${row.timestamp}-${idx}`}>
                <td>{formatDate(row.timestamp)}</td>
                <td>{row.level}</td>
                <td>{row.component}</td>
                <td>{row.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.tableCard}>
        <p className={styles.chartTitle}>Scoring Logs</p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>File</th>
              <th>Score</th>
              <th>Duration ms</th>
              <th>Tokens</th>
            </tr>
          </thead>
          <tbody>
            {scoringLogs.slice(0, 80).map((row) => (
              <tr key={`${row.result_id}-${row.timestamp}`}>
                <td>{formatDate(row.timestamp)}</td>
                <td>{row.user_id}</td>
                <td>{row.filename}</td>
                <td>{row.quality_score}</td>
                <td>{Math.round(numberValue(row.duration_ms, 0))}</td>
                <td>{row.tokens_used}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.tableCard}>
        <p className={styles.chartTitle}>Error Logs</p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>Type</th>
              <th>Endpoint</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {errorLogs.slice(0, 80).map((row, idx) => (
              <tr key={`${row.timestamp}-${idx}`}>
                <td>{formatDate(row.timestamp)}</td>
                <td>{row.user_id}</td>
                <td>{row.error_type}</td>
                <td>{row.endpoint}</td>
                <td>{row.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.tableCard}>
        <p className={styles.chartTitle}>API Usage</p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Requests</th>
            </tr>
          </thead>
          <tbody>
            {(apiUsage.by_endpoint || []).map((row) => (
              <tr key={row.endpoint}>
                <td>{row.endpoint}</td>
                <td>{row.requests}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.tableCard}>
        <p className={styles.chartTitle}>Request Logs</p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>Endpoint</th>
              <th>Method</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {requestLogs.slice(0, 80).map((row, idx) => (
              <tr key={`${row.timestamp}-${idx}`}>
                <td>{formatDate(row.timestamp)}</td>
                <td>{row.user_id}</td>
                <td>{row.endpoint}</td>
                <td>{row.method}</td>
                <td>{row.status_code}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className={styles.sectionWrap}>
      <div className={styles.inlineForm}>
        <input
          value={settings.model}
          onChange={(event) => setSettings((prev) => ({ ...prev, model: event.target.value }))}
          placeholder="Model"
        />
        <input
          type="password"
          value={settings.api_key}
          onChange={(event) => setSettings((prev) => ({ ...prev, api_key: event.target.value }))}
          placeholder="API key"
        />
        <input
          type="number"
          step="0.01"
          value={settings?.scoring_rules?.final_weights?.empathy ?? 0}
          onChange={(event) => setSettings((prev) => ({
            ...prev,
            scoring_rules: {
              ...(prev.scoring_rules || {}),
              final_weights: {
                ...(prev.scoring_rules?.final_weights || {}),
                empathy: Number(event.target.value),
              },
            },
          }))}
          placeholder="Empathy weight"
        />
        <input
          type="number"
          step="0.01"
          value={settings?.scoring_rules?.final_weights?.professionalism ?? 0}
          onChange={(event) => setSettings((prev) => ({
            ...prev,
            scoring_rules: {
              ...(prev.scoring_rules || {}),
              final_weights: {
                ...(prev.scoring_rules?.final_weights || {}),
                professionalism: Number(event.target.value),
              },
            },
          }))}
          placeholder="Professionalism weight"
        />
        <input
          type="number"
          step="0.01"
          value={settings?.scoring_rules?.final_weights?.compliance ?? 0}
          onChange={(event) => setSettings((prev) => ({
            ...prev,
            scoring_rules: {
              ...(prev.scoring_rules || {}),
              final_weights: {
                ...(prev.scoring_rules?.final_weights || {}),
                compliance: Number(event.target.value),
              },
            },
          }))}
          placeholder="Compliance weight"
        />
      </div>

      <div className={styles.flagGrid}>
        {Object.entries(settings.feature_flags || {}).map(([key, value]) => (
          <label key={key} className={styles.flagItem}>
            <span>{key}</span>
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(event) => {
                const checked = event.target.checked;
                setSettings((prev) => ({
                  ...prev,
                  feature_flags: {
                    ...(prev.feature_flags || {}),
                    [key]: checked,
                  },
                }));
              }}
            />
          </label>
        ))}
      </div>

      <button className={styles.primaryBtn} type="button" onClick={handleSaveSettings}>
        Save settings
      </button>
    </div>
  );

  const renderSecurity = () => (
    <div className={styles.sectionWrap}>
      <div className={styles.cardGrid}>
        <div className={styles.card}>
          <p className={styles.cardLabel}>JWT Role Check</p>
          <p className={styles.cardValue}>{security.jwt_role_check ? 'Enabled' : 'Disabled'}</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>Admin Only Pages</p>
          <p className={styles.cardValue}>{(security.admin_only_pages || []).length}</p>
        </div>
      </div>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Page</th>
            </tr>
          </thead>
          <tbody>
            {(security.admin_only_pages || []).map((path) => (
              <tr key={path}>
                <td>{path}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Blocked</th>
            </tr>
          </thead>
          <tbody>
            {(security.users || []).map((item) => (
              <tr key={item.user_id}>
                <td>{item.user_id}</td>
                <td>{item.role}</td>
                <td>{item.blocked ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const sectionContent = {
    Overview: renderOverview(),
    Users: renderUsers(),
    Policies: renderPolicies(),
    Calls: renderCalls(),
    EchoScore: renderEchoScore(),
    Reports: renderReports(),
    Logs: renderLogs(),
    Settings: renderSettings(),
    Security: renderSecurity(),
  };

  return (
    <main className={pageStyles.page}>
      <div className={pageStyles.panel}>
        <div className={pageStyles.headerRow}>
          <div>
            <h1 className={pageStyles.title}>Admin Dashboard</h1>
            <p className={pageStyles.tagline}>Advanced operations</p>
            <p className={pageStyles.subtitle}>Overview, users, policies, calls, echoscore, reports, logs, settings, and security.</p>
          </div>
          <button
            className={pageStyles.secondaryButton}
            type="button"
            onClick={() => runWithBusy('Refreshing dashboard...', loadDashboardData)}
          >
            Refresh
          </button>
        </div>

        <div className={styles.tabBar}>
          {SECTIONS.map((section) => (
            <button
              key={section}
              type="button"
              className={`${styles.tabBtn} ${activeSection === section ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveSection(section)}
            >
              {section}
            </button>
          ))}
        </div>

        {busyMessage && <p className={styles.message}>{busyMessage}</p>}
        {error && <p className={styles.error}>{error}</p>}

        {loading ? (
          <p className={styles.message}>Loading admin dashboard...</p>
        ) : (
          sectionContent[activeSection]
        )}
      </div>
    </main>
  );
}
