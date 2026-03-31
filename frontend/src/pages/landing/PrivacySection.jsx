/**
 * PrivacySection — Security & privacy cards with hover glow
 */

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import styles from '../../styles/LandingPage.module.css';

const ITEMS = [
  {
    icon: '🔐',
    title: 'User-specific History',
    desc: 'Every call evaluation, report, and comparison is stored privately for each user. No data leaks.',
  },
  {
    icon: '📄',
    title: 'Private Reports',
    desc: 'PDF reports and transcripts are generated per-user. Only the owner or admin can access them.',
  },
  {
    icon: '🛡️',
    title: 'JWT Authentication',
    desc: 'Industry-standard JWT tokens with secure bcrypt password hashing and token revocation support.',
  },
  {
    icon: '👥',
    title: 'Role-based Access',
    desc: 'Admin and user roles with strict endpoint authorization. Admin dashboard is fully separated.',
  },
];

const cardVariants = {
  hidden: { opacity: 0, y: 25 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      delay: 0.1 + i * 0.12,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
};

export default function PrivacySection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section className={`${styles.section} ${styles.sectionCenter}`} ref={ref} id="privacy">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
      >
        <span className={styles.sectionTag}>Security & Privacy</span>
        <h2 className={styles.sectionTitle}>
          Your data, your control
        </h2>
        <p className={styles.sectionSubtitle}>
          Built with enterprise-grade security from day one. Every piece of data is isolated per-user.
        </p>
      </motion.div>

      <div className={styles.privacyGrid}>
        {ITEMS.map((item, i) => (
          <motion.div
            key={item.title}
            className={styles.privacyCard}
            variants={cardVariants}
            initial="hidden"
            animate={isInView ? 'visible' : 'hidden'}
            custom={i}
            whileHover={{ y: -3 }}
          >
            <div className={styles.privacyIconWrap}>
              <span>{item.icon}</span>
            </div>
            <div>
              <h3 className={styles.privacyCardTitle}>{item.title}</h3>
              <p className={styles.privacyCardDesc}>{item.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
