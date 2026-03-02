import React, { useState, useRef } from 'react';
import styles from '../styles/UploadSection.module.css';
import { processCallAudio } from '../utils/api';

export default function UploadSection({ onResultsReady }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFile = async (file) => {
    setError('');
    setUploadProgress(0);

    // Validate file type by extension (audio + text document)
    const audioExtensions = ['.mp3', '.wav', '.m4a', '.mp4', '.flac', '.ogg', '.wma'];
    const textExtensions  = ['.txt', '.pdf', '.docx'];
    const allowedExtensions = [...audioExtensions, ...textExtensions];
    const fileName = file.name.toLowerCase();
    const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));

    // Also check MIME type as backup for audio
    const audioFormats = [
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
      'audio/m4a', 'audio/mp4', 'audio/ogg', 'audio/flac', 'audio/x-flac', 'audio/wma'
    ];
    const hasValidMime = audioFormats.includes(file.type) || file.type.startsWith('audio/');

    if (!hasValidExtension && !hasValidMime) {
      setError('Please upload an audio or transcript file (MP3, WAV, M4A, TXT, PDF, DOCX)');
      return;
    }

    // Validate file size (max 100MB)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('File size must be less than 100MB');
      return;
    }

    setIsProcessing(true);

    try {
      const result = await processCallAudio(file, setUploadProgress);
      onResultsReady(result);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className={styles.uploadSection}>
      <div className={styles.uploadContainer}>
        <div
          className={`${styles.dropZone} ${isDragging ? styles.dragging : ''}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className={styles.dropContent}>
            <div className={styles.uploadIcon}>📂</div>
            <h2 className={styles.uploadTitle}>
              {isProcessing ? 'Processing File...' : 'Upload File'}
            </h2>
            <p className={styles.uploadText}>
              {isProcessing
                ? 'This may take a moment...'
                : 'Drag and drop or click to select an audio or transcript file'}
            </p>

            {isProcessing && (
              <div className={styles.processingBlock}>
                <div className={styles.spinner} />
                <div className={styles.progressContainer}>
                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className={styles.progressText}>{uploadProgress}%</p>
                </div>
              </div>
            )}

            {!isProcessing && (
              <button
                className={styles.uploadButton}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                Choose File
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.txt,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileSelect}
            className={styles.fileInput}
            disabled={isProcessing}
          />
        </div>

        {error && (
          <div className={styles.errorMessage}>
            <span className={styles.errorIcon}>⚠️</span>
            <p>{error}</p>
          </div>
        )}

        <div className={styles.infoBox}>
          <p className={styles.infoTitle}>💡 Supported Formats</p>
          <ul className={styles.infoList}>
            <li>MP3 / WAV / M4A — Audio recordings</li>
            <li>TXT / PDF / DOCX — Call transcripts</li>
            <li>Max file size: 100MB</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
