/**
 * PolicyWorkspacePage.jsx — Enterprise AI Compliance Engine
 *
 * 4-section policy workspace:
 *   A. Policy Dashboard — stats, compliance score, missing policies
 *   B. Policy Library — upload, categorize, manage policies
 *   C. AI Policy Intelligence — AI-analyzed insights per policy
 *   D. Policy Version Center — version history, diff, rollback
 */

import { useCallback, useEffect, useState } from 'react';
import {
  getPolicyDashboard, listPolicies, createPolicy, getPolicy,
  updatePolicy, archivePolicy, restorePolicy, deletePolicy,
  listVersions, getVersion, compareVersions, rollbackVersion,
  reanalyzePolicy, reEmbedPolicy,
} from '../utils/policyApi';
import styles from '../styles/PolicyWorkspacePage.module.css';

const SECTIONS = ['Dashboard', 'Library', 'AI Intelligence', 'Version Center'];

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'refund', label: 'Refund' },
  { value: 'escalation', label: 'Escalation' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'privacy', label: 'Privacy' },
  { value: 'sales', label: 'Sales' },
  { value: 'objection_handling', label: 'Objection' },
  { value: 'custom', label: 'Custom' },
];

const CAT_STYLE = {
  refund: styles.catRefund, escalation: styles.catEscalation,
  compliance: styles.catCompliance, privacy: styles.catPrivacy,
  sales: styles.catSales, objection_handling: styles.catObjection,
  custom: styles.catCustom,
};

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PolicyWorkspacePage() {
  const [section, setSection] = useState('Dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  // Dashboard
  const [dashboard, setDashboard] = useState(null);

  // Library
  const [policies, setPolicies] = useState([]);
  const [catFilter, setCatFilter] = useState('all');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadCat, setUploadCat] = useState('custom');

  // Selected policy (for Intelligence & Versions)
  const [selected, setSelected] = useState(null);
  const [selectedInsights, setSelectedInsights] = useState(null);

  // Versions
  const [versions, setVersions] = useState([]);
  const [diffData, setDiffData] = useState(null);

  // Edit mode
  const [editContent, setEditContent] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [showEdit, setShowEdit] = useState(false);

  // ── Data Loading ──
  const loadDashboard = useCallback(async () => {
    try {
      const data = await getPolicyDashboard();
      setDashboard(data);
    } catch (e) { console.warn('Dashboard load error:', e); }
  }, []);

  const loadPolicies = useCallback(async () => {
    try {
      const params = catFilter !== 'all' ? { category: catFilter } : {};
      const data = await listPolicies(params);
      setPolicies(data?.policies || []);
    } catch (e) { console.warn('Policies load error:', e); }
  }, [catFilter]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([loadDashboard(), loadPolicies()]);
    } catch (e) {
      setError(e?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [loadDashboard, loadPolicies]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const selectPolicy = async (policyId) => {
    setBusy('Loading policy…');
    try {
      const data = await getPolicy(policyId);
      setSelected(data?.policy || null);
      setSelectedInsights(data?.insights || null);

      const vData = await listVersions(policyId);
      setVersions(vData?.versions || []);
      setDiffData(null);
      setShowEdit(false);
    } catch (e) {
      setError(e?.message || 'Failed to load policy');
    } finally {
      setBusy('');
    }
  };

  const runAction = async (label, fn) => {
    setBusy(label);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e?.message || 'Action failed');
    } finally {
      setBusy('');
    }
  };

  // ── Upload ──
  const handleUpload = async () => {
    if (!uploadFile) return;
    await runAction('Uploading policy…', async () => {
      await createPolicy(uploadFile, uploadName, uploadCat);
      setUploadFile(null);
      setUploadName('');
      setUploadCat('custom');
      await Promise.all([loadDashboard(), loadPolicies()]);
    });
  };

  // ── Section A: Dashboard ──
  const renderDashboard = () => {
    if (!dashboard) return <div className={styles.loading}>Loading dashboard…</div>;
    const d = dashboard;
    const healthCls = d.health_status === 'healthy' ? styles.healthHealthy
      : d.health_status === 'moderate' ? styles.healthModerate : styles.healthCritical;

    return (
      <div className={styles.sectionWrap}>
        <div className={styles.dashGrid}>
          <div className={styles.dashCard}>
            <p className={styles.dashLabel}>Active Policies</p>
            <p className={styles.dashValue}>{d.total_active}</p>
            <p className={styles.dashMuted}>{d.total_archived} archived</p>
          </div>
          <div className={styles.dashCard}>
            <p className={styles.dashLabel}>Compliance Score</p>
            <p className={styles.dashValue}>{d.compliance_score}%</p>
            <span className={`${styles.healthBadge} ${healthCls}`}>{d.health_status}</span>
          </div>
          <div className={styles.dashCard}>
            <p className={styles.dashLabel}>Total Evaluations</p>
            <p className={styles.dashValue}>{d.total_evaluations}</p>
            <p className={styles.dashMuted}>policy-grounded scores</p>
          </div>
          <div className={styles.dashCard}>
            <p className={styles.dashLabel}>Latest Updated</p>
            <p className={styles.dashValueSm}>{d.latest_updated?.name || '—'}</p>
            <p className={styles.dashMuted}>{fmtDate(d.latest_updated?.updated_at)}</p>
          </div>
        </div>

        {d.missing_policies?.length > 0 && (
          <div className={styles.missingBanner}>
            <p className={styles.missingTitle}>⚠ Missing Policy Recommendations</p>
            <ul className={styles.missingList}>
              {d.missing_policies.map((mp) => (
                <li key={mp.category} className={styles.missingItem}>
                  {mp.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  // ── Section B: Library ──
  const renderLibrary = () => (
    <div className={styles.sectionWrap}>
      {/* Upload Area */}
      <div className={styles.glassPanel}>
        <p className={styles.panelTitle}>Upload New Policy</p>
        <label className={styles.uploadArea}>
          <div className={styles.uploadIcon}>📄</div>
          <p className={styles.uploadText}>
            {uploadFile ? uploadFile.name : 'Click or drag a policy document'}
          </p>
          <p className={styles.uploadHint}>Supports .txt, .pdf, .docx, .md</p>
          <input
            type="file"
            accept=".txt,.pdf,.docx,.md"
            style={{ display: 'none' }}
            onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
          />
        </label>
        {uploadFile && (
          <div className={styles.uploadForm}>
            <input
              className={styles.uploadInput}
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              placeholder="Policy name (optional)"
            />
            <select
              className={styles.uploadSelect}
              value={uploadCat}
              onChange={(e) => setUploadCat(e.target.value)}
            >
              {CATEGORIES.filter(c => c.value !== 'all').map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleUpload}>
              Upload & Analyze
            </button>
          </div>
        )}
      </div>

      {/* Category Filter */}
      <div className={styles.catFilter}>
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            className={`${styles.catBtn} ${catFilter === c.value ? styles.catBtnActive : ''}`}
            onClick={() => { setCatFilter(c.value); }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Policy Cards */}
      {policies.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📋</div>
          <p>No policies found. Upload your first policy above.</p>
        </div>
      ) : (
        <div className={styles.policyGrid}>
          {policies.map((p) => (
            <div key={p.policy_id} className={styles.policyCard} onClick={() => { selectPolicy(p.policy_id); setSection('AI Intelligence'); }}>
              <div className={styles.policyCardHeader}>
                <p className={styles.policyName}>{p.name}</p>
                <span className={`${styles.categoryBadge} ${CAT_STYLE[p.category] || styles.catCustom}`}>
                  {p.category}
                </span>
              </div>
              <div className={styles.policyMeta}>
                <span className={styles.metaItem}>v<span>{p.current_version}</span></span>
                <span className={styles.metaItem}>Uploaded <span>{fmtDate(p.created_at)}</span></span>
                <span className={styles.metaItem}>
                  Last eval <span>{p.last_used_in_evaluation ? fmtDate(p.last_used_in_evaluation) : 'Never'}</span>
                </span>
              </div>
              <span className={`${styles.statusBadge} ${p.status === 'active' ? styles.statusActive : styles.statusArchived}`}>
                {p.status}
              </span>
              <div className={styles.policyActions} onClick={(e) => e.stopPropagation()}>
                <button className={styles.btn} onClick={() => { selectPolicy(p.policy_id); setSection('AI Intelligence'); }}>Open</button>
                <button className={styles.btn} onClick={() => { selectPolicy(p.policy_id); setSection('Version Center'); }}>Versions</button>
                {p.status === 'active' ? (
                  <button className={styles.btn} onClick={() => runAction('Archiving…', async () => { await archivePolicy(p.policy_id); await loadAll(); })}>Archive</button>
                ) : (
                  <button className={styles.btn} onClick={() => runAction('Restoring…', async () => { await restorePolicy(p.policy_id); await loadAll(); })}>Restore</button>
                )}
                <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => runAction('Deleting…', async () => { await deletePolicy(p.policy_id); setSelected(null); await loadAll(); })}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── Section C: AI Intelligence ──
  const renderIntelligence = () => {
    if (!selected) return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>🧠</div>
        <p>Select a policy from the Library to view AI analysis.</p>
      </div>
    );

    const ins = selectedInsights;

    return (
      <div className={styles.sectionWrap}>
        <div className={styles.glassPanel}>
          <p className={styles.panelTitle}>
            {selected.name}
            <span className={`${styles.categoryBadge} ${CAT_STYLE[selected.category] || styles.catCustom}`} style={{ marginLeft: 10 }}>
              {selected.category}
            </span>
          </p>
          {ins?.summary && <p className={styles.insightSummary}>{ins.summary}</p>}
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            <button className={styles.btn} onClick={() => runAction('Re-analyzing…', async () => { const r = await reanalyzePolicy(selected.policy_id); setSelectedInsights(r?.insights || null); })}>
              🔄 Re-analyze
            </button>
            <button className={styles.btn} onClick={() => runAction('Re-embedding…', async () => { await reEmbedPolicy(selected.policy_id); })}>
              🔗 Re-embed
            </button>
            <button className={styles.btn} onClick={() => { setShowEdit(true); setEditContent(''); setEditSummary(''); }}>
              ✏️ Update Content
            </button>
          </div>
        </div>

        {showEdit && (
          <div className={styles.glassPanel}>
            <p className={styles.panelTitle}>Update Policy Content</p>
            <textarea
              className={styles.textArea}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Paste updated policy content here…"
            />
            <input
              className={styles.uploadInput}
              value={editSummary}
              onChange={(e) => setEditSummary(e.target.value)}
              placeholder="Change summary (optional)"
              style={{ width: '100%', marginTop: 8 }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => runAction('Updating…', async () => {
                await updatePolicy(selected.policy_id, editContent, editSummary);
                await selectPolicy(selected.policy_id);
                setShowEdit(false);
                await loadAll();
              })}>Save New Version</button>
              <button className={styles.btn} onClick={() => setShowEdit(false)}>Cancel</button>
            </div>
          </div>
        )}

        {ins && (
          <div className={styles.insightGrid}>
            {[
              { label: 'Required Behaviors', items: ins.required_behaviors, icon: '✅' },
              { label: 'Forbidden Behaviors', items: ins.forbidden_behaviors, icon: '🚫' },
              { label: 'Escalation Conditions', items: ins.escalation_conditions, icon: '🔺' },
              { label: 'Required Phrases', items: ins.required_phrases, icon: '💬' },
              { label: 'Risk Triggers', items: ins.risk_triggers, icon: '⚡' },
              { label: 'Missing Policy Suggestions', items: ins.missing_policy_suggestions, icon: '🔍' },
            ].map(({ label, items, icon }) => (
              <div key={label} className={styles.insightCard}>
                <p className={styles.insightLabel}>{icon} {label}</p>
                {items?.length > 0 ? (
                  <ul className={styles.insightList}>
                    {items.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                ) : (
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: 0 }}>None detected</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── Section D: Version Center ──
  const renderVersionCenter = () => {
    if (!selected) return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>🕰️</div>
        <p>Select a policy from the Library to view version history.</p>
      </div>
    );

    return (
      <div className={styles.sectionWrap}>
        <div className={styles.glassPanel}>
          <p className={styles.panelTitle}>Version History — {selected.name}</p>

          {versions.length === 0 ? (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>No versions found.</p>
          ) : (
            <div className={styles.versionTimeline}>
              {versions.map((v) => (
                <div key={v.version} className={styles.versionEntry}>
                  <div className={`${styles.versionDot} ${v.is_active ? styles.versionDotActive : styles.versionDotInactive}`} />
                  <div className={styles.versionInfo}>
                    <p className={styles.versionLabel}>
                      Version {v.version} {v.is_active && '(Active)'}
                    </p>
                    <p className={styles.versionMeta}>
                      {v.summary} · {fmtDate(v.created_at)} · by {v.uploaded_by}
                    </p>
                  </div>
                  <div className={styles.versionActions}>
                    {!v.is_active && (
                      <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => runAction(`Rolling back to v${v.version}…`, async () => {
                        await rollbackVersion(selected.policy_id, v.version);
                        await selectPolicy(selected.policy_id);
                        await loadAll();
                      })}>
                        Rollback
                      </button>
                    )}
                    {versions.length >= 2 && (
                      <button className={styles.btn} onClick={() => runAction('Comparing…', async () => {
                        const activeV = versions.find(x => x.is_active);
                        if (!activeV || activeV.version === v.version) return;
                        const d = await compareVersions(selected.policy_id, v.version, activeV.version);
                        setDiffData(d);
                      })}>
                        Compare
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {diffData && (
          <div className={styles.glassPanel}>
            <p className={styles.panelTitle}>
              Diff: v{diffData.from_version} → v{diffData.to_version}
              <span style={{ marginLeft: 12, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                +{diffData.additions} / -{diffData.deletions}
              </span>
            </p>
            <div className={styles.diffBlock}>
              {diffData.diff || 'No changes detected.'}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Render ──
  const sectionRenderers = {
    'Dashboard': renderDashboard,
    'Library': renderLibrary,
    'AI Intelligence': renderIntelligence,
    'Version Center': renderVersionCenter,
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Policy Workspace</h1>
        <p className={styles.pageSubtitle}>Enterprise AI Compliance Engine — Manage, analyze, and version your policies</p>
      </div>

      <div className={styles.tabBar}>
        {SECTIONS.map((s) => (
          <button
            key={s}
            className={`${styles.tabBtn} ${section === s ? styles.tabBtnActive : ''}`}
            onClick={() => setSection(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {busy && <p className={styles.loading}>{busy}</p>}
      {error && <p className={styles.error}>{error}</p>}
      {loading && !busy ? <div className={styles.loading}>Loading policy workspace…</div> : sectionRenderers[section]?.()}
    </div>
  );
}
