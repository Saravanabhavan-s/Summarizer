/**
 * FeaturesSection — 6 feature cards with staggered scroll-reveal and hover glow
 */

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import styles from '../../styles/LandingPage.module.css';

const FEATURES = [
  {
    icon: '⚡',
    title: 'Real-time Call Analysis',
    desc: 'Process audio files and get instant quality scores with comprehensive breakdown in seconds.',
  },
  {
    icon: '💬',
    title: 'Sentiment Detection',
    desc: 'Detect customer emotions, engagement levels, and satisfaction signals throughout the call.',
  },
  {
    icon: '🎯',
    title: 'AI-Based Scoring',
    desc: 'Hybrid scoring combines rule-based checks with LLM evaluation for accurate, explainable results.',
  },
  {
    icon: '📝',
    title: 'Transcription Insights',
    desc: 'Automatic transcription with keyword extraction, topic detection, and violation highlighting.',
  },
  {
    icon: '📊',
    title: 'User-specific Reports',
    desc: 'Download detailed PDF reports with score breakdowns, radar charts, and improvement suggestions.',
  },
  {
    icon: '🔒',
    title: 'Secure Dashboard',
    desc: 'JWT-authenticated dashboard with role-based access. Your data stays private and isolated.',
  },
];

const cardVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.5,
      delay: i * 0.1,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
};

export default function FeaturesSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.15 });

  return (
    <section className={`${styles.section} ${styles.sectionCenter}`} ref={ref} id="features">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
      >
        <span className={styles.sectionTag}>Features</span>
        <h2 className={styles.sectionTitle}>
          Everything you need to evaluate call quality
        </h2>
        <p className={styles.sectionSubtitle}>
          Comprehensive AI-powered tools to score, analyze, and improve every customer conversation.
        </p>
      </motion.div>

      <div className={styles.featuresGrid}>
        {FEATURES.map((feature, i) => (
          <motion.div
            key={feature.title}
            className={styles.featureCard}
            variants={cardVariants}
            initial="hidden"
            animate={isInView ? 'visible' : 'hidden'}
            custom={i}
            whileHover={{ y: -4 }}
          >
            <span className={styles.featureIcon}>{feature.icon}</span>
            <h3 className={styles.featureCardTitle}>{feature.title}</h3>
            <p className={styles.featureCardDesc}>{feature.desc}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
