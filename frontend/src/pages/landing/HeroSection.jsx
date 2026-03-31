/**
 * HeroSection — Immersive hero with animated microphone, waveform, and floating cards
 */

import { useRef, useState, useEffect } from 'react';
import { motion, useInView } from 'framer-motion';
import styles from '../../styles/LandingPage.module.css';

const WAVE_BARS = 24;
const waveData = Array.from({ length: WAVE_BARS }, (_, i) => ({
  hMin: 6 + Math.random() * 6,
  hMax: 18 + Math.sin(i * 0.5) * 14 + Math.random() * 8,
  delay: i * 0.08,
}));

const fadeUp = {
  hidden: { opacity: 0, y: 30, filter: 'blur(6px)' },
  visible: (d = 0) => ({
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.7, delay: d, ease: [0.22, 1, 0.36, 1] },
  }),
};

export default function HeroSection({ onGetStarted, onViewDemo }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const handleMove = (e) => {
      setMouse({
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      });
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  return (
    <section className={styles.hero} ref={ref} id="hero">
      {/* Background elements */}
      <div className={styles.heroGrid} aria-hidden="true" />
      <div className={styles.heroGlowBlue} aria-hidden="true" />
      <div className={styles.heroGlowPurple} aria-hidden="true" />
      <div className={styles.heroGlowPink} aria-hidden="true" />

      {/* Mouse spotlight */}
      <div
        className={styles.heroSpotlight}
        style={{
          left: `${mouse.x * 100}%`,
          top: `${mouse.y * 100}%`,
        }}
        aria-hidden="true"
      />

      {/* Particles */}
      <div className={styles.particles} aria-hidden="true">
        {[...Array(12)].map((_, i) => (
          <motion.span
            key={i}
            className={styles.particle}
            style={{
              width: 3 + Math.random() * 4,
              height: 3 + Math.random() * 4,
              left: `${8 + Math.random() * 84}%`,
              top: `${10 + Math.random() * 80}%`,
            }}
            animate={{
              y: [0, -20 - Math.random() * 20, 0],
              opacity: [0.15, 0.5, 0.15],
            }}
            transition={{
              duration: 3 + Math.random() * 3,
              repeat: Infinity,
              delay: i * 0.3,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      {/* Content */}
      <motion.div
        className={styles.heroContent}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
      >
        {/* Microphone visual */}
        <motion.div className={styles.micVisual} variants={fadeUp} custom={0}>
          <motion.span
            className={styles.micIcon}
            animate={{
              scale: [1, 1.08, 1],
              filter: [
                'drop-shadow(0 0 16px rgba(74,158,255,0.5))',
                'drop-shadow(0 0 32px rgba(124,58,237,0.8))',
                'drop-shadow(0 0 16px rgba(74,158,255,0.5))',
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            🎙️
          </motion.span>
          <div className={`${styles.micRing} ${styles.micRing1}`} />
          <div className={`${styles.micRing} ${styles.micRing2}`} />
          <div className={`${styles.micRing} ${styles.micRing3}`} />

          {/* Waveform bars */}
          <div className={styles.waveformBars}>
            {waveData.map((bar, i) => (
              <motion.div
                key={i}
                className={styles.waveBar}
                style={{
                  '--h-min': `${bar.hMin}px`,
                  '--h-max': `${bar.hMax}px`,
                  animationDelay: `${bar.delay}s`,
                }}
                animate={{ height: [bar.hMin, bar.hMax, bar.hMin] }}
                transition={{
                  duration: 1.2 + Math.random() * 0.6,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: bar.delay,
                }}
              />
            ))}
          </div>
        </motion.div>

        {/* Title */}
        <motion.h1 className={styles.heroTitle} variants={fadeUp} custom={0.15}>
          <span className={styles.heroTitleAccent}>AI-Powered</span>
          {' '}Call Quality{'\n'}Evaluation
        </motion.h1>

        {/* Subtitle */}
        <motion.p className={styles.heroDesc} variants={fadeUp} custom={0.3}>
          Analyze calls with real-time scoring, sentiment detection, and AI-driven insights.
          Transform your customer conversations into actionable intelligence.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div className={styles.heroCtas} variants={fadeUp} custom={0.45}>
          <motion.button
            className={styles.ctaPrimary}
            onClick={onGetStarted}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
          >
            Get Started →
          </motion.button>
          <motion.button
            className={styles.ctaSecondary}
            onClick={onViewDemo}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
          >
            View Demo ↓
          </motion.button>
        </motion.div>
      </motion.div>

      {/* Floating dashboard cards */}
      <motion.div
        className={styles.floatingCards}
        initial={{ opacity: 0, y: 40 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.8, delay: 0.7 }}
      >
        <motion.div
          className={styles.floatCard}
          style={{ left: '5%', top: '10%' }}
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className={styles.floatCardLabel}>Quality Score</div>
          <div className={`${styles.floatCardValue} ${styles.floatCardValueGreen}`}>87.3</div>
          <div className={styles.floatCardBar}>
            <div className={styles.floatCardBarFill} style={{ width: '87%' }} />
          </div>
        </motion.div>

        <motion.div
          className={styles.floatCard}
          style={{ left: '40%', top: '0%' }}
          animate={{ y: [0, -12, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
        >
          <div className={styles.floatCardLabel}>Sentiment</div>
          <div className={`${styles.floatCardValue} ${styles.floatCardValueBlue}`}>Positive</div>
        </motion.div>

        <motion.div
          className={styles.floatCard}
          style={{ right: '5%', top: '15%' }}
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        >
          <div className={styles.floatCardLabel}>Compliance</div>
          <div className={`${styles.floatCardValue} ${styles.floatCardValuePurple}`}>92.1</div>
          <div className={styles.floatCardBar}>
            <div className={styles.floatCardBarFill} style={{ width: '92%' }} />
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
