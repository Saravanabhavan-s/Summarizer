/**
 * TranscriptChatWindow
 * =====================
 * Renders a call transcript as a WhatsApp-style chat conversation.
 *
 * Accepts:
 *   - formatted_transcript: string  — diarized text: "Agent: ...\nCustomer: ..."
 *   - transcript:           string  — raw flat fallback
 *   - violations:           string[] — list of violation phrases/sentences
 *   - improvements:         string[] — list of improvement suggestions
 *   - duration_seconds:     number
 *   - result:               object  — full result for agent/customer name hints
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import styles from '../styles/TranscriptChatWindow.module.css';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a diarized or labelled transcript string into message objects.
 * Supports:
 *   "Agent: <text>\nCustomer: <text>"
 *   "Speaker 0: <text>\nSpeaker 1: <text>"
 * Falls back to a single customer block if no labels detected.
 */
function parseTranscript(text) {
  if (!text || !text.trim()) return [];

  const lines = text.split('\n').filter(Boolean);
  // Check if lines start with speaker labels
  const LABEL_RE = /^([A-Za-z][A-Za-z0-9 _]*)\s*:\s*/;

  const hasLabels = lines.some((l) => LABEL_RE.test(l));

  if (!hasLabels) {
    // No labels — render entire transcript as a single customer bubble
    return [
      {
        id: 0,
        speaker: 'Customer',
        text: text.trim(),
        side: 'left',
        sentiment: 'neutral',
      },
    ];
  }

  const messages = [];
  let idx = 0;

  // Merge consecutive lines from the same speaker (handles word-wrap in text files)
  let current = null;

  for (const line of lines) {
    const match = LABEL_RE.exec(line);
    if (match) {
      if (current) messages.push(current);
      const speaker = match[1].trim();
      const msgText = line.slice(match[0].length).trim();
      current = {
        id: idx++,
        speaker,
        text: msgText,
        side: inferSide(speaker),
        sentiment: 'neutral',
      };
    } else if (current) {
      // Continuation of previous speaker's text
      current.text += ' ' + line.trim();
    } else {
      // Orphan line — treat as agent
      current = { id: idx++, speaker: 'Agent', text: line.trim(), side: 'right', sentiment: 'neutral' };
    }
  }
  if (current) messages.push(current);

  return messages;
}

function inferSide(speaker) {
  const s = speaker.toLowerCase();
  if (s === 'agent' || s === 'speaker 0' || s === 'speaker0') return 'right';
  return 'left';
}

function getSentimentIcon(text) {
  const lower = text.toLowerCase();
  const positive = ['thank', 'great', 'appreciate', 'perfect', 'excellent', 'happy', 'glad', 'wonderful', 'resolved', 'sure', 'absolutely'];
  const negative = ['frustrated', 'angry', 'unacceptable', 'terrible', 'worst', 'upset', 'problem', 'issue', 'complaint', 'refund', 'waiting', 'nobody'];

  if (positive.some((w) => lower.includes(w))) return { icon: '😊', label: 'positive', cls: 'positive' };
  if (negative.some((w) => lower.includes(w))) return { icon: '😟', label: 'negative', cls: 'negative' };
  return { icon: '😐', label: 'neutral', cls: 'neutral' };
}

function highlightText(text, query) {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className={styles.searchHighlight}>{part}</mark>
      : part
  );
}

function formatDuration(secs) {
  if (!Number.isFinite(secs) || secs <= 0) return null;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TranscriptChatWindow({ result }) {
  const {
    formatted_transcript,
    transcript,
    violations = [],
    improvements = [],
    duration_seconds,
    filename,
  } = result || {};

  const [search, setSearch] = useState('');
  const [activeViolation, setActiveViolation] = useState(null); // { text, improvements }
  const listRef = useRef(null);

  const rawText = formatted_transcript || transcript || '';
  const messages = useMemo(() => parseTranscript(rawText), [rawText]);

  // Enrich messages with sentiment + violation flags
  const enrichedMessages = useMemo(() => {
    const violationPhrases = (violations || []).map((v) => v.toLowerCase());

    return messages.map((msg) => {
      const sentiment = getSentimentIcon(msg.text);
      const matchedViolation = violationPhrases.find((vp) => {
        // Check if any word chunk of the violation appears in this message
        const chunks = vp.split(' ').filter((w) => w.length > 4);
        return chunks.some((chunk) => msg.text.toLowerCase().includes(chunk));
      });
      const violationText = matchedViolation
        ? violations.find((v) => v.toLowerCase() === matchedViolation) || null
        : null;

      return { ...msg, sentiment, violationText };
    });
  }, [messages, violations]);

  // Filter by search
  const filteredMessages = useMemo(() => {
    if (!search.trim()) return enrichedMessages;
    return enrichedMessages.filter((m) =>
      m.text.toLowerCase().includes(search.toLowerCase())
    );
  }, [enrichedMessages, search]);

  // Auto-scroll to bottom on mount
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, []);

  // Agent/Customer names
  const agentName = 'Agent';
  const customerName = 'Customer';
  const duration = formatDuration(duration_seconds);
  const totalMessages = enrichedMessages.length;

  if (!rawText.trim()) return null;

  return (
    <div className={styles.chatWindow}>
      {/* ── Header ── */}
      <div className={styles.chatHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.headerTitle}>
            <span className={styles.titleIcon}>💬</span>
            <span>Conversation Transcript</span>
          </div>
          <div className={styles.headerMeta}>
            {duration && <span className={styles.metaBadge}>⏱ {duration}</span>}
            <span className={styles.metaBadge}>💬 {totalMessages} messages</span>
            <span className={`${styles.metaBadge} ${styles.agentBadge}`}>🎧 {agentName}</span>
            <span className={`${styles.metaBadge} ${styles.customerBadge}`}>👤 {customerName}</span>
          </div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.searchWrapper}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search transcript…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className={styles.searchClear} onClick={() => setSearch('')} type="button">✕</button>
            )}
          </div>
        </div>
      </div>

      {/* ── Message List ── */}
      <div className={styles.messageList} ref={listRef}>
        {filteredMessages.length === 0 && (
          <div className={styles.emptySearch}>
            <p>No messages match "<strong>{search}</strong>"</p>
          </div>
        )}

        {filteredMessages.map((msg) => (
          <div
            key={msg.id}
            className={`${styles.messageRow} ${msg.side === 'right' ? styles.rowRight : styles.rowLeft}`}
          >
            {/* Avatar — left side */}
            {msg.side === 'left' && (
              <div className={`${styles.avatar} ${styles.avatarCustomer}`}>
                {msg.speaker.charAt(0).toUpperCase()}
              </div>
            )}

            <div className={styles.bubbleWrapper}>
              <span className={styles.speakerLabel}>{msg.speaker}</span>
              <div
                className={`${styles.bubble} ${msg.side === 'right' ? styles.bubbleAgent : styles.bubbleCustomer} ${msg.violationText ? styles.bubbleViolation : ''}`}
                role={msg.violationText ? 'button' : undefined}
                tabIndex={msg.violationText ? 0 : undefined}
                onClick={msg.violationText ? () => setActiveViolation({ violation: msg.violationText, improvements }) : undefined}
                onKeyDown={msg.violationText ? (e) => e.key === 'Enter' && setActiveViolation({ violation: msg.violationText, improvements }) : undefined}
                title={msg.violationText ? 'Click to view policy violation details' : undefined}
              >
                <p className={styles.bubbleText}>
                  {highlightText(msg.text, search)}
                </p>
                <div className={styles.bubbleFooter}>
                  <span className={`${styles.sentimentIcon} ${styles[`sentiment_${msg.sentiment.cls}`]}`}>
                    {msg.sentiment.icon}
                  </span>
                  {msg.violationText && (
                    <span className={styles.violationBadge} title="Policy violation detected">
                      🚨
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Avatar — right side */}
            {msg.side === 'right' && (
              <div className={`${styles.avatar} ${styles.avatarAgent}`}>
                {msg.speaker.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Violation Detail Modal ── */}
      {activeViolation && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Policy violation details"
          onClick={(e) => { if (e.target === e.currentTarget) setActiveViolation(null); }}
        >
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <span className={styles.modalIcon}>🚨</span>
              <h3 className={styles.modalTitle}>Policy Violation</h3>
              <button
                className={styles.modalClose}
                onClick={() => setActiveViolation(null)}
                type="button"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalSection}>
                <p className={styles.modalLabel}>Violation Detected</p>
                <p className={styles.modalText}>{activeViolation.violation}</p>
              </div>
              {activeViolation.improvements && activeViolation.improvements.length > 0 && (
                <div className={styles.modalSection}>
                  <p className={styles.modalLabel}>Suggested Improvements</p>
                  <ul className={styles.modalList}>
                    {activeViolation.improvements.slice(0, 4).map((imp, i) => (
                      <li key={i} className={styles.modalListItem}>
                        <span className={styles.modalBullet}>💡</span>
                        {imp}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
