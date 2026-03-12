import axios from 'axios';
import { PROCESS_CALL_ENDPOINT } from './constants';

// Use environment variable if available, otherwise use default
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // 5 minutes for long processing
});

// ---------------------------------------------------------------------------
// Auth helpers — attach JWT token from localStorage to every request
// ---------------------------------------------------------------------------

const getAuthHeader = () => {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// ---------------------------------------------------------------------------
// Authentication API
// ---------------------------------------------------------------------------

/**
 * loginUser — POST /login with JSON body (credentials NOT in URL)
 * Returns: { success, token, user_id, role, message }
 */
export const loginUser = async (username, password) => {
  try {
    const response = await client.post('/login', { username, password });
    return response.data;
  } catch (error) {
    const msg = error.response?.data?.detail || error.message || 'Login failed';
    return { success: false, message: msg };
  }
};

/**
 * registerUser — POST /register with JSON body
 * Returns: { success, message, user }
 */
export const registerUser = async (username, password) => {
  try {
    const response = await client.post('/register', { username, password });
    return response.data;
  } catch (error) {
    const msg = error.response?.data?.detail || error.message || 'Registration failed';
    return { success: false, message: msg };
  }
};

// ---------------------------------------------------------------------------
// Call Processing API
// ---------------------------------------------------------------------------

export const processCallAudio = async (file, onProgress) => {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await client.post(PROCESS_CALL_ENDPOINT, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        ...getAuthHeader(),
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress) {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percentCompleted);
        }
      },
    });

    return response.data;
  } catch (error) {
    throw new Error(
      error.response?.data?.detail ||
      error.message ||
      'Failed to process audio file'
    );
  }
};

// ---------------------------------------------------------------------------
// History API — server-side per-user call history
// ---------------------------------------------------------------------------

/**
 * getServerHistory — GET /history
 * Returns: { history: [...], total: n }
 */
export const getServerHistory = async () => {
  try {
    const response = await client.get('/history', {
      headers: getAuthHeader(),
    });
    return response.data;
  } catch (error) {
    return { history: [], total: 0 };
  }
};

/**
 * getServerResult — GET /result/:id
 * Returns: result object or null
 */
export const getServerResult = async (id) => {
  try {
    const response = await client.get(`/result/${id}`, {
      headers: getAuthHeader(),
    });
    return response.data;
  } catch (error) {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Comparison API
// ---------------------------------------------------------------------------

/**
 * compareResults — POST /compare
 * ids: string[] (at least 2 result IDs)
 * Returns: { results: [...] }
 */
export const compareResults = async (ids) => {
  try {
    const response = await client.post('/compare', { ids }, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
    });
    return response.data;
  } catch (error) {
    throw new Error(
      error.response?.data?.detail ||
      error.message ||
      'Failed to compare results'
    );
  }
};

export default {
  loginUser,
  registerUser,
  processCallAudio,
  getServerHistory,
  getServerResult,
  compareResults,
};
