/**
 * UploadSection — File upload with a multi-phase rocket animation
 *
 * Rocket phases:
 *   idle      → normal dropzone
 *   boosting  → file accepted, rocket on pad, engines firing
 *   flying    → API in progress, rocket arcs across screen
 *   launched  → analysis done, rocket exits, success flash
 */

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../styles/UploadSection.module.css';
import { processCallAudio } from '../utils/api';

// Accepted file extensions (for display)
const AUDIO_EXTS = ['.mp3', '.wav', '.m4a', '.mp4', '.flac', '.ogg', '.wma'];
const TEXT_EXTS  = ['.txt', '.pdf', '.docx'];
const ALL_EXTS   = [...AUDIO_EXTS, ...TEXT_EXTS];

// Rocket phase titles / sub-text
const PHASE_COPY = {
  idle:     { title: 'Upload File',          sub: 'Drag & drop or click to select an audio or transcript file' },
  boosting: { title: 'Preparing Launch…',    sub: 'Initiating analysis sequence' },
  flying:   { title: 'Analysing Call…',      sub: 'AI engines running — this may take a moment' },
  launched: { title: 'Analysis Complete! 🎉', sub: 'Loading your results' },
};

export default function UploadSection({ onResultsReady }) {
  const [isDragging, setIsDragging]     = useState(false);
  const [rocketPhase, setRocketPhase]  = useState('idle');    // idle|boosting|flying|launched
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError]               = useState('');
  const fileInputRef = useRef(null);

  const isProcessing = rocketPhase !== 'idle';

  // ── Drag handlers ──────────────────────────────────────────
  const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true);  };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDragOver  = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop      = (e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFile(files[0]);
  };

  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (files.length > 0) handleFile(files[0]);
  };

  // ── Core upload logic ──────────────────────────────────────
  const handleFile = async (file) => {
    setError('');
    setUploadProgress(0);

    // Validate extension
    const name = file.name.toLowerCase();
    const hasValidExt = ALL_EXTS.some((ext) => name.endsWith(ext));
    const hasAudioMime = file.type.startsWith('audio/');
    if (!hasValidExt && !hasAudioMime) {
      setError('Please upload an audio or transcript file (MP3, WAV, M4A, TXT, PDF, DOCX)');
      return;
    }

    // Validate size (100 MB)
    if (file.size > 100 * 1024 * 1024) {
      setError('File size must be less than 100 MB');
      return;
    }

    // Phase 1 — boosting (brief ignition delay)
    setRocketPhase('boosting');
    await delay(800);

    // Phase 2 — flying (API call)
    setRocketPhase('flying');

    try {
      const result = await processCallAudio(file, setUploadProgress);

      // Phase 3 — launched
      setRocketPhase('launched');
      await delay(1000);

      // Reset input and hand result to parent
      if (fileInputRef.current) fileInputRef.current.value = '';
      onResultsReady(result);
    } catch (err) {
      setError(err.message);
      setRocketPhase('idle');
      setUploadProgress(0);
    }
  };

  const { title, sub } = PHASE_COPY[rocketPhase];

  return (
    <div className={styles.uploadSection}>
      <div className={styles.uploadContainer}>

        {/* ── Drop zone / rocket stage ── */}
        <div
          className={[
            styles.dropZone,
            isDragging    ? styles.dragging  : '',
            isProcessing  ? styles.processing : '',
          ].join(' ')}
          onDragEnter={!isProcessing ? handleDragEnter : undefined}
          onDragLeave={!isProcessing ? handleDragLeave : undefined}
          onDragOver={!isProcessing  ? handleDragOver  : undefined}
          onDrop={!isProcessing      ? handleDrop      : undefined}
          onClick={!isProcessing     ? () => fileInputRef.current?.click() : undefined}
        >
          <AnimatePresence mode="wait">

            {/* ── Idle state ── */}
            {rocketPhase === 'idle' && (
              <motion.div
                key="idle"
                className={styles.dropContent}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  className={styles.uploadIcon}
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                >
                  📂
                </motion.div>
                <h2 className={styles.uploadTitle}>{title}</h2>
                <p className={styles.uploadText}>{sub}</p>
                <button
                  className={styles.uploadButton}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                >
                  Choose File
                </button>
              </motion.div>
            )}

            {/* ── Boosting state ── */}
            {rocketPhase === 'boosting' && (
              <motion.div
                key="boosting"
                className={styles.rocketStage}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.35 }}
              >
                <div className={styles.rocketPad}>
                  <motion.div
                    className={styles.rocket}
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 0.4, repeat: Infinity }}
                  >
                    🚀
                  </motion.div>
                  <div className={styles.padFlame}>
                    <motion.div
                      className={styles.flameSpark}
                      animate={{ scaleY: [0.6, 1.4, 0.6], opacity: [0.7, 1, 0.7] }}
                      transition={{ duration: 0.25, repeat: Infinity }}
                    />
                  </div>
                  <div className={styles.padBase} />
                </div>
                <h2 className={styles.phaseTitle}>{title}</h2>
                <p className={styles.phaseSub}>{sub}</p>
              </motion.div>
            )}

            {/* ── Flying state ── */}
            {rocketPhase === 'flying' && (
              <motion.div
                key="flying"
                className={styles.rocketStage}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                {/* Rocket flying arc */}
                <div className={styles.flyingTrack}>
                  <motion.div
                    className={styles.flyingRocket}
                    animate={{
                      x: ['-30%', '30%', '-30%'],
                      y: [0, -18, 0],
                      rotate: [-5, 5, -5],
                    }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    🚀
                    {/* Exhaust trail */}
                    <div className={styles.trail} />
                  </motion.div>
                </div>

                <h2 className={styles.phaseTitle}>{title}</h2>
                <p className={styles.phaseSub}>{sub}</p>

                {/* Progress bar */}
                <div className={styles.progressContainer}>
                  <div className={styles.progressBar}>
                    <motion.div
                      className={styles.progressFill}
                      animate={{ width: `${Math.max(uploadProgress, 8)}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                  <p className={styles.progressText}>{uploadProgress}%</p>
                </div>
              </motion.div>
            )}

            {/* ── Launched state ── */}
            {rocketPhase === 'launched' && (
              <motion.div
                key="launched"
                className={styles.rocketStage}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
              >
                <motion.div
                  className={styles.launchEmoji}
                  animate={{ y: [0, -80], opacity: [1, 0], scale: [1, 1.4] }}
                  transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
                >
                  🚀
                </motion.div>
                <motion.div
                  className={styles.successIcon}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.45, type: 'spring', stiffness: 340, damping: 22 }}
                >
                  ✅
                </motion.div>
                <h2 className={styles.phaseTitle}>{title}</h2>
                <p className={styles.phaseSub}>{sub}</p>
              </motion.div>
            )}

          </AnimatePresence>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.txt,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileSelect}
            className={styles.fileInput}
            disabled={isProcessing}
          />
        </div>

        {/* Error message */}
        <AnimatePresence>
          {error && (
            <motion.div
              className={styles.errorMessage}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <span className={styles.errorIcon}>⚠️</span>
              <p>{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={styles.infoBox}>
          <p className={styles.infoTitle}>💡 Supported Formats</p>
          <ul className={styles.infoList}>
            <li>MP3 / WAV / M4A — Audio recordings</li>
            <li>TXT / PDF / DOCX — Call transcripts</li>
            <li>Max file size: 100 MB</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// Small utility
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
