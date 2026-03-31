/**
 * WorkflowSection — 4-step animated timeline with connecting lines
 */

import { useRef, useEffect, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import styles from '../../styles/LandingPage.module.css';

const STEPS = [
  { icon: '📤', title: 'Upload Call', desc: 'Upload audio or text transcript files for analysis.' },
  { icon: '🎧', title: 'Transcribe Audio', desc: 'AI transcribes audio with speaker identification.' },
  { icon: '🤖', title: 'Analyze with AI', desc: 'LLM + RAG evaluates quality, compliance, and empathy.' },
  { icon: '📊', title: 'Get Smart Reports', desc: 'Receive detailed scores, insights, and PDF reports.' },
];

const stepVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.9 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.55,
      delay: 0.2 + i * 0.15,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
};

export default function WorkflowSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.25 });
  const [connectorAnimated, setConnectorAnimated] = useState(false);

  useEffect(() => {
    if (isInView) {
      const t = setTimeout(() => setConnectorAnimated(true), 500);
      return () => clearTimeout(t);
    }
  }, [isInView]);

  return (
    <section className={`${styles.section} ${styles.sectionCenter}`} ref={ref} id="workflow">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
      >
        <span className={styles.sectionTag}>How It Works</span>
        <h2 className={styles.sectionTitle}>
          Four steps to smarter call evaluation
        </h2>
        <p className={styles.sectionSubtitle}>
          From upload to insight — the entire workflow is automated and takes seconds.
        </p>
      </motion.div>

      <div className={styles.workflowContainer}>
        <div className={styles.workflowSteps}>
          {STEPS.map((step, i) => (
            <motion.div
              key={step.title}
              className={styles.workflowStep}
              variants={stepVariants}
              initial="hidden"
              animate={isInView ? 'visible' : 'hidden'}
              custom={i}
            >
              {/* Connector line (not on last step) */}
              {i < STEPS.length - 1 && (
                <div className={styles.stepConnector}>
                  <div
                    className={`${styles.stepConnectorFill} ${connectorAnimated ? styles.animated : ''}`}
                    style={{ transitionDelay: `${0.4 + i * 0.3}s` }}
                  />
                </div>
              )}

              <motion.div
                className={styles.stepNumber}
                animate={isInView ? {
                  scale: [1, 1.1, 1],
                } : {}}
                transition={{ duration: 0.5, delay: 0.5 + i * 0.15 }}
              >
                {step.icon}
              </motion.div>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepDesc}>{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
