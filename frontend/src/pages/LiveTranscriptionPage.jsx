/**
 * LiveTranscriptionPage — self-contained live transcription + scoring page
 *
 * Flow:
 *  1. User uploads audio file
 *  2. Audio is sent to /api/live-transcribe → full transcript + 10s chunks
 *  3. User presses Play → audio plays, chunks are scored one-by-one via LLM
 *  4. UI updates in real time: transcript, scores, charts, floating reactions
 *  5. After audio ends → final analysis overlay
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { liveTranscribe, scoreLiveChunk, saveLiveSession } from '../utils/liveApi';
import styles from '../styles/LiveTranscriptionPage.module.css';

// ─── Helpers ────────────────────────────────────────────────────
const fmt = (sec) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const GOOD_EMOJIS = ['❤️', '👍', '🔥', '⭐', '💪'];
const BAD_EMOJIS = ['⚠️', '❌', '😬', '👎'];

const pickReaction = (score) => {
  const arr = score >= 70 ? GOOD_EMOJIS : BAD_EMOJIS;
  return arr[Math.floor(Math.random() * arr.length)];
};

const sentimentEmoji = (s) =>
  s === 'positive' ? '😊' : s === 'negative' ? '😟' : '😐';

const metricValue = (value) => (Number.isFinite(value) ? Number(value) : 0);

const averageMetric = (items, key) => {
  if (!items.length) return 0;
  const total = items.reduce((sum, item) => sum + metricValue(item?.[key]), 0);
  return Math.round(total / items.length);
};

// ─── Component ──────────────────────────────────────────────────
export default function LiveTranscriptionPage() {
  // State
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [chunks, setChunks] = useState([]);
  const [fullTranscript, setFullTranscript] = useState('');
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState('idle'); // idle | ready | playing | paused | done
  const [currentTime, setCurrentTime] = useState(0);
  const [processedIdx, setProcessedIdx] = useState(-1);
  const [scoredChunks, setScoredChunks] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [showFinal, setShowFinal] = useState(false);
  const [allAlerts, setAllAlerts] = useState([]);
  const [historySyncStatus, setHistorySyncStatus] = useState('idle');
  const [historySyncMessage, setHistorySyncMessage] = useState('');

  const audioRef = useRef(null);
  const fileInputRef = useRef(null);
  const transcriptEndRef = useRef(null);
  const reactionIdRef = useRef(0);
  const processingRef = useRef(false);
  const intervalRef = useRef(null);
  const historySavedRef = useRef(false);

  // ─── File upload ──────────────────────────────────────────────
  const handleFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setChunks([]);
      setScoredChunks([]);
      setAllAlerts([]);
      setFullTranscript('');
      setStatus('idle');
      setProcessedIdx(-1);
      setCurrentTime(0);
      setShowFinal(false);
      setHistorySyncStatus('idle');
      setHistorySyncMessage('');
      historySavedRef.current = false;
      if (audioRef.current) {
        audioRef.current.src = URL.createObjectURL(f);
        audioRef.current.load();
      }
    }
  };

  // ─── Transcribe (step 1) ──────────────────────────────────────
  const handleTranscribe = async () => {
    if (!file) return;
    setLoading(true);
    setStatus('idle');
    setHistorySyncStatus('idle');
    setHistorySyncMessage('');
    historySavedRef.current = false;
    try {
      const data = await liveTranscribe(file);
      setChunks(data.chunks || []);
      setFullTranscript(data.transcript || '');
      setDuration(data.duration_seconds || 0);
      setStatus('ready');
      setScoredChunks([]);
      setAllAlerts([]);
      setProcessedIdx(-1);
    } catch (err) {
      console.error('Transcription failed:', err);
      alert('Failed to transcribe. Check backend.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Audio playback ───────────────────────────────────────────
  const handlePlay = () => {
    if (!audioRef.current || chunks.length === 0) return;
    audioRef.current.play();
    setStatus('playing');
  };

  const handlePause = () => {
    audioRef.current?.pause();
    setStatus('paused');
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setStatus('ready');
    setCurrentTime(0);
  };

  // ─── Time update tracker ─────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onEnd = () => {
      setStatus('done');
      // small delay so last chunk finishes
      setTimeout(() => setShowFinal(true), 800);
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

  // ─── Chunk scoring as audio plays ─────────────────────────────
  useEffect(() => {
    if (status !== 'playing' || chunks.length === 0) return;

    const tick = async () => {
      if (processingRef.current) return;

      const time = audioRef.current?.currentTime || 0;
      // Find which chunk index we're at
      const idx = chunks.findIndex(
        (c) => time >= c.time_start && time < c.time_end
      );
      // Also handle when we've passed the last chunk
      const effectiveIdx = idx === -1 && time >= (chunks[chunks.length - 1]?.time_end || 0)
        ? chunks.length - 1
        : idx;

      if (effectiveIdx <= processedIdx || effectiveIdx < 0) return;

      // Score all unscored chunks up to effectiveIdx
      for (let i = processedIdx + 1; i <= effectiveIdx; i++) {
        processingRef.current = true;
        try {
          const chunk = chunks[i];
          const result = await scoreLiveChunk(
            chunk.text, chunk.index, chunk.time_start, chunk.time_end
          );

          const scored = { ...chunk, ...result };
          setScoredChunks((prev) => [...prev, scored]);
          setProcessedIdx(i);

          // Collect alerts
          if (result.alerts?.length) {
            setAllAlerts((prev) => [
              ...prev,
              ...result.alerts.map((a) => ({ text: a, chunk: i + 1 })),
            ]);
          }

          // Spawn floating reaction
          spawnReaction(result.score);
        } catch (err) {
          console.error(`Chunk ${i} scoring failed:`, err);
          setProcessedIdx(i);
        } finally {
          processingRef.current = false;
        }
      }
    };

    intervalRef.current = setInterval(tick, 1200);
    return () => clearInterval(intervalRef.current);
  }, [status, chunks, processedIdx]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [scoredChunks]);

  // ─── Floating reactions ───────────────────────────────────────
  const spawnReaction = (score) => {
    const id = ++reactionIdRef.current;
    const emoji = pickReaction(score);
    const drift = Math.random() * 40 - 20;
    setReactions((prev) => [...prev, { id, emoji, drift }]);
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2600);
  };

  // ─── Computed values ──────────────────────────────────────────
  const avgScore = averageMetric(scoredChunks, 'score');
  const avgFluency = averageMetric(scoredChunks, 'fluency');
  const avgConfidence = averageMetric(scoredChunks, 'confidence');
  const avgClarity = averageMetric(scoredChunks, 'clarity');
  const avgEngagement = averageMetric(scoredChunks, 'engagement');

  const sentimentCounts = scoredChunks.reduce((acc, c) => {
    const s = c.sentiment || 'neutral';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  const dominantSentiment = Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';

  // Chart data
  const lineData = scoredChunks.map((c, i) => ({
    name: `${fmt(c.time_start)}`,
    score: c.score || 0,
  }));

  const barData = scoredChunks.map((c, i) => ({
    name: `C${i + 1}`,
    score: c.score || 0,
  }));

  const radarData = [
    { metric: 'Fluency', score: avgFluency },
    { metric: 'Confidence', score: avgConfidence },
    { metric: 'Clarity', score: avgClarity },
    { metric: 'Engagement', score: avgEngagement },
    { metric: 'Overall', score: avgScore },
  ];

  // Save completed live session into server history
  useEffect(() => {
    if (status !== 'done' || !file || !fullTranscript.trim()) return;
    if (historySavedRef.current) return;

    const persistSession = async () => {
      historySavedRef.current = true;
      setHistorySyncStatus('saving');
      setHistorySyncMessage('Saving LIVE session to history...');

      try {
        const scoredByIndex = new Map(
          scoredChunks.map((chunk, idx) => [Number(chunk.index ?? idx), chunk])
        );

        const sourceChunks = chunks.length
          ? chunks
          : scoredChunks.map((chunk, idx) => ({
            index: chunk.index ?? idx,
            time_start: chunk.time_start ?? 0,
            time_end: chunk.time_end ?? 0,
            text: chunk.text || '',
          }));

        const chunkScores = sourceChunks.map((chunk, idx) => {
          const key = Number(chunk.index ?? idx);
          const scored = scoredByIndex.get(key) || scoredChunks[idx] || {};
          return {
            index: key,
            time_start: Number(chunk.time_start ?? 0),
            time_end: Number(chunk.time_end ?? 0),
            text: chunk.text || '',
            score: Number.isFinite(scored.score) ? Number(scored.score) : null,
            fluency: Number.isFinite(scored.fluency) ? Number(scored.fluency) : null,
            confidence: Number.isFinite(scored.confidence) ? Number(scored.confidence) : null,
            clarity: Number.isFinite(scored.clarity) ? Number(scored.clarity) : null,
            sentiment: scored.sentiment || 'neutral',
            engagement: Number.isFinite(scored.engagement) ? Number(scored.engagement) : null,
            alerts: Array.isArray(scored.alerts) ? scored.alerts : [],
          };
        });

        const normalizedAlerts = allAlerts
          .map((alert) => ({
            text: String(alert?.text || '').trim(),
            chunk: Number.isFinite(alert?.chunk) ? Number(alert.chunk) : undefined,
          }))
          .filter((alert) => alert.text);

        const reportData = {
          overall_score: avgScore,
          fluency: avgFluency,
          confidence: avgConfidence,
          clarity: avgClarity,
          engagement: avgEngagement,
          sentiment: dominantSentiment,
          total_chunks: chunkScores.length,
          chunk_scores: chunkScores,
          alerts: normalizedAlerts,
          charts: {
            line: lineData,
            bar: barData,
            radar: radarData,
          },
          feedback: {
            alerts: normalizedAlerts,
            recommendations: [...new Set(chunkScores.flatMap((chunk) => chunk.alerts || []))].slice(0, 20),
          },
        };

        const response = await saveLiveSession({
          audio_name: file.name,
          transcription: fullTranscript,
          duration_seconds: duration,
          chunk_scores: chunkScores,
          alerts: normalizedAlerts,
          report_data: reportData,
        });

        const resultId = response?.result?.id ? String(response.result.id) : '';
        setHistorySyncStatus('saved');
        setHistorySyncMessage(resultId ? `Saved to history (${resultId.slice(0, 8)}...)` : 'Saved to history');
      } catch (err) {
        historySavedRef.current = false;
        setHistorySyncStatus('error');
        setHistorySyncMessage(
          err?.response?.data?.detail || err?.message || 'Failed to save live session to history'
        );
      }
    };

    persistSession();
  }, [
    status,
    file,
    fullTranscript,
    duration,
    chunks,
    scoredChunks,
    allAlerts,
    avgScore,
    avgFluency,
    avgConfidence,
    avgClarity,
    avgEngagement,
    dominantSentiment,
    lineData,
    barData,
    radarData,
  ]);

  // ─── Download helpers ─────────────────────────────────────────
  const downloadText = (content, filename) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadTranscript = () => {
    downloadText(fullTranscript, 'live_transcript.txt');
  };

  const downloadScoreReport = () => {
    const report = {
      overall_score: avgScore,
      fluency: avgFluency,
      confidence: avgConfidence,
      clarity: avgClarity,
      engagement: avgEngagement,
      dominant_sentiment: dominantSentiment,
      total_chunks: scoredChunks.length,
      chunks: scoredChunks.map((c, i) => ({
        chunk: i + 1,
        time_range: `${fmt(c.time_start)} - ${fmt(c.time_end)}`,
        text: c.text,
        score: c.score,
        fluency: c.fluency,
        confidence: c.confidence,
        clarity: c.clarity,
        engagement: c.engagement,
        sentiment: c.sentiment,
        alerts: c.alerts,
      })),
      alerts: allAlerts,
    };
    downloadText(JSON.stringify(report, null, 2), 'live_score_report.json');
  };

  const downloadPdf = () => {
    // Generate a simple HTML report and print as PDF
    const html = `
      <html><head><title>Live Transcription Report</title>
      <style>body{font-family:Arial,sans-serif;padding:20px;max-width:800px;margin:auto}
      h1{color:#333}table{width:100%;border-collapse:collapse;margin:20px 0}
      th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}
      .score{font-size:48px;font-weight:bold;color:#4a9eff;text-align:center}</style></head>
      <body>
      <h1>🎙️ Live Transcription Report</h1>
      <div class="score">${avgScore}/100</div>
      <p><strong>Fluency:</strong> ${avgFluency} | <strong>Confidence:</strong> ${avgConfidence} | <strong>Clarity:</strong> ${avgClarity} | <strong>Engagement:</strong> ${avgEngagement} | <strong>Sentiment:</strong> ${dominantSentiment}</p>
      <h2>Chunk Scores</h2>
      <table><tr><th>#</th><th>Time</th><th>Score</th><th>Fluency</th><th>Confidence</th><th>Clarity</th><th>Engagement</th><th>Sentiment</th></tr>
      ${scoredChunks.map((c, i) => `<tr><td>${i + 1}</td><td>${fmt(c.time_start)}-${fmt(c.time_end)}</td><td>${c.score}</td><td>${c.fluency}</td><td>${c.confidence}</td><td>${c.clarity ?? '-'}</td><td>${c.engagement ?? '-'}</td><td>${c.sentiment}</td></tr>`).join('')}
      </table>
      <h2>Full Transcript</h2><p>${fullTranscript}</p>
      <h2>Alerts</h2><ul>${allAlerts.map(a => `<li>Chunk ${a.chunk}: ${a.text}</li>`).join('')}</ul>
      </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.print();
  };

  // ─── Waveform bars ────────────────────────────────────────────
  const waveformBars = Array.from({ length: 32 }, (_, i) => i);

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Live Transcription</h1>
        <span className={styles.liveBadge}>
          <span className={styles.liveDot} />
          Live Analysis
        </span>
      </div>

      {/* Two-column layout */}
      <div className={styles.splitLayout}>
        {/* ════════ LEFT PANEL ════════ */}
        <div>
          {/* Upload */}
          <div className={styles.glassCard}>
            <p className={styles.cardTitle}>📁 Audio Source</p>
            <div
              className={`${styles.uploadArea} ${file ? styles.fileSelected : ''}`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
              <div className={styles.uploadIcon}>🎵</div>
              <p className={styles.uploadLabel}>
                {file ? 'Change audio file' : 'Click to upload audio'}
              </p>
              <p className={styles.uploadHint}>MP3, WAV, M4A, FLAC, OGG</p>
              {file && <p className={styles.fileName}>{file.name}</p>}
            </div>

            {/* Transcribe button */}
            {file && status === 'idle' && (
              <button
                className={styles.processBtn}
                onClick={handleTranscribe}
                disabled={loading}
              >
                {loading ? (
                  <><span className={styles.spinner} /> Transcribing...</>
                ) : (
                  '🚀 Transcribe Audio'
                )}
              </button>
            )}

            {/* Audio element (hidden) */}
            <audio ref={audioRef} preload="metadata" />

            {/* Player controls */}
            {status !== 'idle' && (
              <>
                <div className={styles.audioControls}>
                  {status === 'playing' ? (
                    <button className={styles.controlBtnPrimary} onClick={handlePause} title="Pause">⏸️</button>
                  ) : (
                    <button className={styles.controlBtnPrimary} onClick={handlePlay} title="Play">▶️</button>
                  )}
                  <button className={styles.controlBtn} onClick={handleStop} title="Stop">⏹️</button>
                  <span className={styles.playbackTimer}>
                    {fmt(currentTime)} / {fmt(duration)}
                  </span>
                </div>

                {/* Waveform */}
                <div className={styles.waveformContainer}>
                  {waveformBars.map((i) => (
                    <div
                      key={i}
                      className={`${styles.waveformBar} ${status === 'playing' ? styles.active : ''}`}
                      style={{
                        height: `${8 + Math.random() * 30}px`,
                        animationDelay: `${i * 0.05}s`,
                      }}
                    />
                  ))}
                </div>

                {/* Progress */}
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
                  />
                </div>
              </>
            )}

            {/* Status */}
            <div className={`${styles.statusBar} ${
              status === 'playing' ? styles.statusProcessing :
              status === 'done' ? styles.statusDone : styles.statusIdle
            }`}>
              {status === 'idle' && '⏳ Upload audio & transcribe to begin'}
              {status === 'ready' && `✅ Ready — ${chunks.length} chunks detected. Press Play!`}
              {status === 'playing' && <><span className={styles.spinner} /> Processing chunk {processedIdx + 2} of {chunks.length}...</>}
              {status === 'paused' && `⏸️ Paused at ${fmt(currentTime)}`}
              {status === 'done' && `✅ Complete — ${scoredChunks.length} chunks scored`}
            </div>

            {status === 'done' && historySyncStatus !== 'idle' && (
              <div className={`${styles.statusBar} ${
                historySyncStatus === 'saving' ? styles.statusProcessing :
                historySyncStatus === 'saved' ? styles.statusDone : styles.statusIdle
              }`}>
                {historySyncStatus === 'saving' && <><span className={styles.spinner} /> {historySyncMessage}</>}
                {historySyncStatus !== 'saving' && historySyncMessage}
              </div>
            )}
          </div>

          {/* Transcript chunks */}
          {scoredChunks.length > 0 && (
            <div className={`${styles.glassCard}`} style={{ marginTop: 16 }}>
              <p className={styles.cardTitle}>📝 Live Transcript</p>
              <div className={styles.transcriptArea}>
                {scoredChunks.map((c, i) => (
                  <motion.div
                    key={i}
                    className={styles.chunkItem}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className={styles.chunkHeader}>
                      <span className={styles.chunkLabel}>Chunk {i + 1}</span>
                      <span className={styles.chunkTime}>{fmt(c.time_start)} — {fmt(c.time_end)}</span>
                    </div>
                    <p className={styles.chunkText}>{c.text}</p>
                    <div className={styles.chunkScores}>
                      <span className={styles.chunkScoreTag}>
                        Score: <span className={styles.chunkScoreValue}>{c.score}</span>
                      </span>
                      <span className={styles.chunkScoreTag}>
                        Fluency: <span className={styles.chunkScoreValue}>{c.fluency}</span>
                      </span>
                      <span className={styles.chunkScoreTag}>
                        Confidence: <span className={styles.chunkScoreValue}>{c.confidence}</span>
                      </span>
                      <span className={styles.chunkScoreTag}>
                        Clarity: <span className={styles.chunkScoreValue}>{c.clarity ?? '-'}</span>
                      </span>
                      <span className={styles.chunkScoreTag}>
                        Engagement: <span className={styles.chunkScoreValue}>{c.engagement ?? '-'}</span>
                      </span>
                      <span className={styles.chunkScoreTag}>
                        {sentimentEmoji(c.sentiment)} {c.sentiment}
                      </span>
                    </div>
                  </motion.div>
                ))}
                <div ref={transcriptEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* ════════ RIGHT PANEL ════════ */}
        <div className={styles.rightPanel}>
          {/* Score cards */}
          <div className={styles.scoreCardsGrid}>
            <div className={`${styles.glassCard} ${styles.scoreCardMini} ${styles.overallCard}`}>
              <p className={styles.scoreLabel}>Overall Score</p>
              <p className={styles.scoreValue}>{avgScore}</p>
            </div>
            <div className={`${styles.glassCard} ${styles.scoreCardMini}`}>
              <p className={styles.scoreLabel}>Fluency</p>
              <p className={styles.scoreValue}>{avgFluency}</p>
            </div>
            <div className={`${styles.glassCard} ${styles.scoreCardMini}`}>
              <p className={styles.scoreLabel}>Confidence</p>
              <p className={styles.scoreValue}>{avgConfidence}</p>
            </div>
            <div className={`${styles.glassCard} ${styles.scoreCardMini}`}>
              <p className={styles.scoreLabel}>Clarity</p>
              <p className={styles.scoreValue}>{avgClarity}</p>
            </div>
            <div className={`${styles.glassCard} ${styles.scoreCardMini}`}>
              <p className={styles.scoreLabel}>Engagement</p>
              <p className={styles.scoreValue}>{avgEngagement}</p>
            </div>
            <div className={`${styles.glassCard} ${styles.scoreCardMini}`} style={{ gridColumn: '1 / -1' }}>
              <p className={styles.scoreLabel}>Sentiment</p>
              <span className={`${styles.sentimentBadge} ${
                dominantSentiment === 'positive' ? styles.sentimentPositive :
                dominantSentiment === 'negative' ? styles.sentimentNegative :
                styles.sentimentNeutral
              }`}>
                {sentimentEmoji(dominantSentiment)} {dominantSentiment}
              </span>
            </div>
          </div>

          {/* Alerts */}
          <div className={styles.glassCard}>
            <p className={styles.cardTitle}>🚨 Live Alerts</p>
            {allAlerts.length > 0 ? (
              <div className={styles.alertsList}>
                {allAlerts.slice(-10).reverse().map((a, i) => (
                  <div key={i} className={styles.alertItem}>
                    <span className={styles.alertIcon}>
                      {a.text.toLowerCase().includes('excellent') || a.text.toLowerCase().includes('professional')
                        ? '✅' : '⚠️'}
                    </span>
                    <span><strong>C{a.chunk}:</strong> {a.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.noAlerts}>No alerts yet — start playing audio</p>
            )}
          </div>

          {/* Line chart */}
          {lineData.length > 0 && (
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>📈 Score Over Time</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(12,16,32,0.95)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: '#fff',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#4a9eff"
                    strokeWidth={2}
                    dot={{ fill: '#4a9eff', r: 4 }}
                    activeDot={{ r: 6, fill: '#7c3aed' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Bar chart */}
          {barData.length > 0 && (
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>📊 Chunk Scores</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(12,16,32,0.95)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: '#fff',
                    }}
                  />
                  <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={entry.score >= 70 ? '#4a9eff' : entry.score >= 50 ? '#fbbf24' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Radar chart */}
          {scoredChunks.length > 0 && (
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>🕸️ Skill Profile</p>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgba(255,255,255,0.08)" />
                  <PolarAngleAxis dataKey="metric" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="rgba(255,255,255,0.15)" tick={{ fontSize: 10 }} />
                  <Radar name="Score" dataKey="score" fill="#7c3aed" fillOpacity={0.3} stroke="#4a9eff" strokeWidth={2} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(12,16,32,0.95)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: '#fff',
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* View Report button */}
          {status === 'done' && scoredChunks.length > 0 && (
            <button className={styles.processBtn} onClick={() => setShowFinal(true)}>
              📋 View Final Report
            </button>
          )}
        </div>
      </div>

      {/* ════════ FLOATING REACTIONS ════════ */}
      <div className={styles.reactionsContainer}>
        <AnimatePresence>
          {reactions.map((r) => (
            <span
              key={r.id}
              className={styles.floatingReaction}
              style={{ '--drift': `${r.drift}px` }}
            >
              {r.emoji}
            </span>
          ))}
        </AnimatePresence>
      </div>

      {/* ════════ FINAL REPORT OVERLAY ════════ */}
      {showFinal && (
        <div className={styles.finalOverlay} onClick={(e) => e.target === e.currentTarget && setShowFinal(false)}>
          <div className={styles.finalReport}>
            <div className={styles.finalHeader}>
              <h2 className={styles.finalTitle}>📋 Final Analysis Report</h2>
              <button className={styles.closeBtn} onClick={() => setShowFinal(false)}>✕</button>
            </div>

            {/* Score summary */}
            <div className={styles.finalGrid}>
              <div className={`${styles.glassCard} ${styles.scoreCardMini} ${styles.overallCard}`}>
                <p className={styles.scoreLabel}>Overall Score</p>
                <p className={styles.scoreValue}>{avgScore}</p>
              </div>
              <div className={`${styles.glassCard} ${styles.scoreCardMini}`}>
                <p className={styles.scoreLabel}>Fluency</p>
                <p className={styles.scoreValue}>{avgFluency}</p>
              </div>
              <div className={`${styles.glassCard} ${styles.scoreCardMini}`}>
                <p className={styles.scoreLabel}>Confidence</p>
                <p className={styles.scoreValue}>{avgConfidence}</p>
              </div>
              <div className={`${styles.glassCard} ${styles.scoreCardMini}`}>
                <p className={styles.scoreLabel}>Clarity</p>
                <p className={styles.scoreValue}>{avgClarity}</p>
              </div>
              <div className={`${styles.glassCard} ${styles.scoreCardMini}`}>
                <p className={styles.scoreLabel}>Engagement</p>
                <p className={styles.scoreValue}>{avgEngagement}</p>
              </div>
              <div className={`${styles.glassCard} ${styles.scoreCardMini}`}>
                <p className={styles.scoreLabel}>Sentiment</p>
                <span className={`${styles.sentimentBadge} ${
                  dominantSentiment === 'positive' ? styles.sentimentPositive :
                  dominantSentiment === 'negative' ? styles.sentimentNegative :
                  styles.sentimentNeutral
                }`}>
                  {sentimentEmoji(dominantSentiment)} {dominantSentiment}
                </span>
              </div>
            </div>

            {/* Charts in final */}
            <div className={styles.finalGrid}>
              <div className={styles.chartCard}>
                <p className={styles.chartTitle}>Score Over Time</p>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={lineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="score" stroke="#4a9eff" strokeWidth={2} dot={{ fill: '#4a9eff', r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className={styles.chartCard}>
                <p className={styles.chartTitle}>Skill Profile</p>
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="rgba(255,255,255,0.08)" />
                    <PolarAngleAxis dataKey="metric" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="rgba(255,255,255,0.15)" />
                    <Radar dataKey="score" fill="#7c3aed" fillOpacity={0.3} stroke="#4a9eff" strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chunk scores table */}
            <div className={`${styles.glassCard} ${styles.fullWidth}`} style={{ marginBottom: 16 }}>
              <p className={styles.cardTitle}>Chunk Scores</p>
              <div style={{ overflowX: 'auto' }}>
                <table className={styles.chunkTable}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Time</th>
                      <th>Score</th>
                      <th>Fluency</th>
                      <th>Confidence</th>
                      <th>Clarity</th>
                      <th>Engagement</th>
                      <th>Sentiment</th>
                      <th>Text</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoredChunks.map((c, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{fmt(c.time_start)}–{fmt(c.time_end)}</td>
                        <td style={{ fontWeight: 700, color: c.score >= 70 ? '#86efac' : c.score >= 50 ? '#fbbf24' : '#fca5a5' }}>{c.score}</td>
                        <td>{c.fluency}</td>
                        <td>{c.confidence}</td>
                        <td>{c.clarity ?? '-'}</td>
                        <td>{c.engagement ?? '-'}</td>
                        <td>{sentimentEmoji(c.sentiment)} {c.sentiment}</td>
                        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Full transcript */}
            <div className={`${styles.glassCard} ${styles.fullWidth}`} style={{ marginBottom: 16 }}>
              <p className={styles.cardTitle}>Full Transcript</p>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>{fullTranscript}</p>
            </div>

            {/* Alerts */}
            {allAlerts.length > 0 && (
              <div className={`${styles.glassCard} ${styles.fullWidth}`} style={{ marginBottom: 16 }}>
                <p className={styles.cardTitle}>All Alerts</p>
                {allAlerts.map((a, i) => (
                  <div key={i} className={styles.alertItem}>
                    <span className={styles.alertIcon}>⚠️</span>
                    <span><strong>Chunk {a.chunk}:</strong> {a.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Download buttons */}
            <div className={styles.downloadRow}>
              <button className={styles.downloadBtn} onClick={downloadPdf}>
                📄 Download PDF Report
              </button>
              <button className={styles.downloadBtn} onClick={downloadTranscript}>
                📝 Download Transcript
              </button>
              <button className={styles.downloadBtn} onClick={downloadScoreReport}>
                📊 Download Score Report (JSON)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
