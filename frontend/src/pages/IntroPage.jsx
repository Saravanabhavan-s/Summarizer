/**
 * IntroPage — Branded intro animation shown after successful login
 *
 * Shows: logo glow → title fade-in → tagline → loading bar
 * Auto-navigates to dashboard after 3 seconds.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import styles from '../styles/IntroPage.module.css';

export default function IntroPage() {
  const navigate = useNavigate();

  // Auto-navigate to home after animation completes
  useEffect(() => {
    const t = setTimeout(() => navigate('/'), 3200);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className={styles.page}>
      {/* Grid background */}
      <div className={styles.grid} aria-hidden="true" />

      {/* Logo container — staggered children */}
      <motion.div
        className={styles.center}
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.22 } },
        }}
      >
        {/* Glow rings */}
        <div className={styles.rings} aria-hidden="true">
          <div className={styles.ring1} />
          <div className={styles.ring2} />
          <div className={styles.ring3} />
        </div>

        {/* Mic icon */}
        <motion.div
          className={styles.icon}
          variants={{
            hidden:  { opacity: 0, scale: 0.5 },
            visible: { opacity: 1, scale: 1, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
          }}
        >
          🎙️
        </motion.div>

        {/* Brand name */}
        <motion.h1
          className={styles.brandName}
          variants={{
            hidden:  { opacity: 0, y: 22 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
          }}
        >
          EchoScore
        </motion.h1>

        {/* Tagline */}
        <motion.p
          className={styles.tagline}
          variants={{
            hidden:  { opacity: 0 },
            visible: { opacity: 1, transition: { duration: 0.6 } },
          }}
        >
          AI-POWERED CALL INTELLIGENCE
        </motion.p>

        {/* Progress bar */}
        <motion.div
          className={styles.progressTrack}
          variants={{
            hidden:  { opacity: 0 },
            visible: { opacity: 1, transition: { duration: 0.3 } },
          }}
        >
          <motion.div
            className={styles.progressFill}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.9, duration: 2.0, ease: [0.4, 0, 0.2, 1] }}
          />
        </motion.div>
      </motion.div>

      {/* Floating particles */}
      {[...Array(14)].map((_, i) => (
        <motion.span
          key={i}
          className={styles.particle}
          style={{
            left: `${6 + i * 6.5}%`,
            top: `${18 + Math.sin(i * 1.1) * 28}%`,
          }}
          animate={{ y: [0, -18, 0], opacity: [0.25, 0.7, 0.25] }}
          transition={{
            duration: 2.4 + i * 0.18,
            repeat: Infinity,
            delay: i * 0.12,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}
