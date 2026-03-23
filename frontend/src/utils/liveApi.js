/**
 * liveApi.js — API helpers for the Live Transcription feature
 *
 * Standalone file — does NOT modify existing api.js
 */

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://echoscore.onrender.com';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000,
});

const getAuthHeader = () => {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Upload audio for transcription — returns full transcript + 10s chunks
 */
export const liveTranscribe = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await client.post('/live-transcribe', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      ...getAuthHeader(),
    },
  });
  return response.data;
};

/**
 * Score a single transcript chunk via LLM
 */
export const scoreLiveChunk = async (text, chunkIndex = 0, timeStart = 0, timeEnd = 10) => {
  const response = await client.post(
    '/live-chunk-score',
    { text, chunk_index: chunkIndex, time_start: timeStart, time_end: timeEnd },
    {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
    }
  );
  return response.data;
};

/**
 * Save completed live session in server-side history
 */
export const saveLiveSession = async (payload) => {
  const response = await client.post('/live-session-complete', payload, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
    },
  });
  return response.data;
};
