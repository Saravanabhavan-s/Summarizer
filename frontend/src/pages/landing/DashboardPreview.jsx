/**
 * DashboardPreview — Mock dashboard cards showing score ring, charts, keywords, and sentiment
 */

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import styles from '../../styles/LandingPage.module.css';

const CIRCUMFERENCE = 2 * Math.PI * 42; // r=42 for the ring

const CHART_HEIGHTS = [65, 45, 70, 55, 80, 40, 75, 60, 50, 85, 55, 70];
const KEYWORDS = ['empathy', 'resolution', 'compliance', 'greeting', 'hold-time', 'escalation', 'apology', 'confirmation'];

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      delay: 0.15 + i * 0.1,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
};

function ScoreRingCard({ isInView }) {
  const score = 87;
  const dashOffset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;

  return (
    <motion.div
      className={styles.previewCard}
      variants={cardVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      custom={0}
      whileHover={{ y: -3 }}
    >
      <span className={styles.previewCardIcon}>🎯</span>
      <div className={styles.previewCardTitle}>Overall Quality Score</div>
      <div className={styles.scoreRing}>
        <svg className={styles.scoreRingSvg} viewBox="0 0 100 100">
          <circle className={styles.scoreRingBg} cx="50" cy="50" r="42" />
          <circle
            className={styles.scoreRingFill}
            cx="50"
            cy="50"
            r="42"
            stroke="#22c55e"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={isInView ? dashOffset : CIRCUMFERENCE}
          />
        </svg>
        <motion.span
          className={styles.scoreRingValue}
          style={{ color: '#22c55e' }}
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 0.8, duration: 0.5 }}
        >
          {score}
        </motion.span>
      </div>
      <div className={styles.previewCardSub}>Above average performance</div>
    </motion.div>
  );
}

function ChartCard({ isInView }) {
  return (
    <motion.div
      className={`${styles.previewCard} ${styles.previewCardLarge}`}
      variants={cardVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      custom={1}
      whileHover={{ y: -3 }}
    >
      <span className={styles.previewCardIcon}>📈</span>
      <div className={styles.previewCardTitle}>Score Trend</div>
      <div className={styles.previewCardValue}>+12.4%</div>
      <div className={styles.previewCardSub}>Improvement over last 30 days</div>
      <div className={styles.miniChart}>
        {CHART_HEIGHTS.map((h, i) => (
          <motion.div
            key={i}
            className={styles.miniChartBar}
            initial={{ height: 0 }}
            animate={isInView ? { height: `${h}%` } : { height: 0 }}
            transition={{ duration: 0.6, delay: 0.5 + i * 0.06, ease: 'easeOut' }}
          />
        ))}
      </div>
    </motion.div>
  );
}

function SentimentCard({ isInView }) {
  return (
    <motion.div
      className={styles.previewCard}
      variants={cardVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      custom={2}
      whileHover={{ y: -3 }}
    >
      <span className={styles.previewCardIcon}>💬</span>
      <div className={styles.previewCardTitle}>Sentiment Analysis</div>
      <div className={styles.previewCardValue} style={{ color: '#4a9eff' }}>Positive</div>
      <div className={styles.sentimentRow}>
        <span className={styles.sentimentDot}>
          <span className={styles.sentimentDotCircle} style={{ background: '#22c55e' }} />
          72% Positive
        </span>
        <span className={styles.sentimentDot}>
          <span className={styles.sentimentDotCircle} style={{ background: '#f59e0b' }} />
          18% Neutral
        </span>
        <span className={styles.sentimentDot}>
          <span className={styles.sentimentDotCircle} style={{ background: '#ef4444' }} />
          10% Negative
        </span>
      </div>
    </motion.div>
  );
}

function KeywordsCard({ isInView }) {
  return (
    <motion.div
      className={styles.previewCard}
      variants={cardVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      custom={3}
      whileHover={{ y: -3 }}
    >
      <span className={styles.previewCardIcon}>🏷️</span>
      <div className={styles.previewCardTitle}>Keyword Extraction</div>
      <div className={styles.keywordTags}>
        {KEYWORDS.map((kw, i) => (
          <motion.span
            key={kw}
            className={styles.keywordTag}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.8 + i * 0.06, duration: 0.3 }}
          >
            {kw}
          </motion.span>
        ))}
      </div>
    </motion.div>
  );
}

function TranscriptCard({ isInView }) {
  return (
    <motion.div
      className={`${styles.previewCard} ${styles.previewCardLarge}`}
      variants={cardVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      custom={4}
      whileHover={{ y: -3 }}
    >
      <span className={styles.previewCardIcon}>📝</span>
      <div className={styles.previewCardTitle}>Transcript Summary</div>
      <p className={styles.previewCardSub} style={{ marginTop: 12, lineHeight: 1.65, fontSize: '0.92rem' }}>
        Customer called regarding billing discrepancy on last invoice. Agent verified identity,
        reviewed account details, confirmed the overcharge, and processed a credit refund.
        Resolution achieved with strong empathy and compliance with company policy.
      </p>
    </motion.div>
  );
}

export default function DashboardPreview() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.15 });

  return (
    <section className={`${styles.section} ${styles.sectionCenter}`} ref={ref} id="dashboard-preview">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
      >
        <span className={styles.sectionTag}>Dashboard</span>
        <h2 className={styles.sectionTitle}>
          Powerful insights at a glance
        </h2>
        <p className={styles.sectionSubtitle}>
          Every call evaluation is broken down into actionable scores, trends, and detailed feedback.
        </p>
      </motion.div>

      <div className={styles.previewContainer}>
        <div className={styles.previewGrid}>
          <ScoreRingCard isInView={isInView} />
          <ChartCard isInView={isInView} />
          <SentimentCard isInView={isInView} />
          <KeywordsCard isInView={isInView} />
          <TranscriptCard isInView={isInView} />
        </div>
      </div>
    </section>
  );
}
