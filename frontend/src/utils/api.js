import axios from 'axios';
import { API_BASE, PROCESS_CALL_ENDPOINT } from './constants';

const client = axios.create({
  baseURL: API_BASE,
  timeout: 300000, // 5 minutes for long processing
});

// ---------------------------------------------------------------------------
// Auth helpers — attach JWT token from localStorage to every request
// ---------------------------------------------------------------------------

const getAuthHeader = () => {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const toErrorMessage = (error, fallback) => (
  error?.response?.data?.detail ||
  error?.response?.data?.message ||
  error?.message ||
  fallback
);

const parseFilename = (contentDisposition, fallback) => {
  if (!contentDisposition) return fallback;
  const match = /filename\*?=(?:UTF-8''|\")?([^\";]+)/i.exec(contentDisposition);
  if (!match?.[1]) return fallback;
  try {
    return decodeURIComponent(match[1].replace(/\"/g, '').trim());
  } catch {
    return match[1].replace(/\"/g, '').trim();
  }
};

const triggerBrowserDownload = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
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
    const msg = toErrorMessage(error, 'Login failed');
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
    const msg = toErrorMessage(error, 'Registration failed');
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
    throw new Error(toErrorMessage(error, 'Failed to process audio file'));
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
    throw new Error(toErrorMessage(error, 'Failed to compare results'));
  }
};

export const generateResultPdf = async (resultId) => {
  const response = await client.post(`/result/${resultId}/report/generate`, null, {
    headers: getAuthHeader(),
  });
  return response.data;
};

export const downloadResultPdf = async (resultId) => {
  const response = await client.get(`/result/${resultId}/report/pdf`, {
    headers: getAuthHeader(),
    responseType: 'blob',
  });
  const filename = parseFilename(response.headers['content-disposition'], `report_${resultId}.pdf`);
  triggerBrowserDownload(response.data, filename);
  return { success: true, filename };
};

export const downloadResultTranscript = async (resultId) => {
  const response = await client.get(`/result/${resultId}/transcript/download`, {
    headers: getAuthHeader(),
    responseType: 'blob',
  });
  const filename = parseFilename(response.headers['content-disposition'], `transcript_${resultId}.txt`);
  triggerBrowserDownload(response.data, filename);
  return { success: true, filename };
};

export const getServiceHealth = async () => {
  try {
    const response = await client.get('/health');
    return response.data;
  } catch {
    return { status: 'error', service: 'unreachable' };
  }
};

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------

export const getAdminOverview = async () => {
  const response = await client.get('/admin', { headers: getAuthHeader() });
  return response.data;
};

export const getAdminStats = async () => {
  const response = await client.get('/admin/stats', { headers: getAuthHeader() });
  return response.data;
};

export const getAdminLogs = async (limit = 50) => {
  const response = await client.get('/admin/logs', {
    headers: getAuthHeader(),
    params: { limit },
  });
  return response.data;
};

export const getAdminErrors = async (limit = 50) => {
  const response = await client.get('/admin/errors', {
    headers: getAuthHeader(),
    params: { limit },
  });
  return response.data;
};

export const getAdminUsers = async () => {
  const response = await client.get('/admin/users', { headers: getAuthHeader() });
  return response.data;
};

export const getAdminUsersList = async () => {
  const response = await client.get('/admin/users/list', { headers: getAuthHeader() });
  return response.data;
};

export const createAdminUser = async (payload) => {
  const response = await client.post('/admin/users', payload, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
    },
  });
  return response.data;
};

export const deleteAdminUser = async (userId) => {
  const response = await client.delete(`/admin/users/${userId}`, {
    headers: getAuthHeader(),
  });
  return response.data;
};

export const blockAdminUser = async (userId) => {
  const response = await client.post(`/admin/users/${userId}/block`, null, {
    headers: getAuthHeader(),
  });
  return response.data;
};

export const unblockAdminUser = async (userId) => {
  const response = await client.post(`/admin/users/${userId}/unblock`, null, {
    headers: getAuthHeader(),
  });
  return response.data;
};

export const assignAdminUserRole = async (userId, role) => {
  const response = await client.put(`/admin/users/${userId}/role`, { role }, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
    },
  });
  return response.data;
};

export const getAdminUserActivity = async (userId) => {
  const response = await client.get(`/admin/users/${userId}/activity`, {
    headers: getAuthHeader(),
  });
  return response.data;
};

export const getAdminEndpoints = async () => {
  const response = await client.get('/admin/endpoints', { headers: getAuthHeader() });
  return response.data;
};

export const getAdminHealth = async () => {
  const response = await client.get('/admin/health', { headers: getAuthHeader() });
  return response.data;
};

export const getAdminHistory = async (limit = 200) => {
  const response = await client.get('/admin/history', {
    headers: getAuthHeader(),
    params: { limit },
  });
  return response.data;
};

export const getAdminCalls = async (limit = 300) => {
  const response = await client.get('/admin/calls', {
    headers: getAuthHeader(),
    params: { limit },
  });
  return response.data;
};

export const uploadAdminCall = async (file, onProgress) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await client.post('/admin/calls/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      ...getAuthHeader(),
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        onProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
      }
    },
  });

  return response.data;
};

export const rescoreAdminCall = async (resultId) => {
  const response = await client.post(`/admin/calls/${resultId}/rescore`, null, {
    headers: getAuthHeader(),
  });
  return response.data;
};

export const deleteAdminCall = async (resultId) => {
  const response = await client.delete(`/admin/calls/${resultId}`, {
    headers: getAuthHeader(),
  });
  return response.data;
};

export const getAdminPolicy = async () => {
  const response = await client.get('/admin/policy', { headers: getAuthHeader() });
  return response.data;
};

export const uploadAdminPolicy = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await client.post('/admin/policy/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      ...getAuthHeader(),
    },
  });
  return response.data;
};

export const updateAdminPolicy = async (content) => {
  const response = await client.put('/admin/policy/update', { content }, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
    },
  });
  return response.data;
};

export const deleteAdminPolicy = async () => {
  const response = await client.delete('/admin/policy', {
    headers: getAuthHeader(),
  });
  return response.data;
};

export const rebuildAdminPolicyEmbeddings = async () => {
  const response = await client.post('/admin/policy/rebuild-embeddings', null, {
    headers: getAuthHeader(),
  });
  return response.data;
};

export const rebuildAdminPolicyVectorDb = async () => {
  const response = await client.post('/admin/policy/rebuild-vector-db', null, {
    headers: getAuthHeader(),
  });
  return response.data;
};

export const runAdminEchoScore = async (payload) => {
  const response = await client.post('/admin/echoscore/run', payload, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
    },
  });
  return response.data;
};

export const getAdminEchoScoreScores = async (limit = 300) => {
  const response = await client.get('/admin/echoscore/scores', {
    headers: getAuthHeader(),
    params: { limit },
  });
  return response.data;
};

export const getAdminEchoScoreParameters = async () => {
  const response = await client.get('/admin/echoscore/parameters', {
    headers: getAuthHeader(),
  });
  return response.data;
};

export const updateAdminEchoScoreParameters = async (payload) => {
  const response = await client.put('/admin/echoscore/parameters', payload, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
    },
  });
  return response.data;
};

export const resetAdminEchoScoreParameters = async () => {
  const response = await client.post('/admin/echoscore/parameters/reset', null, {
    headers: getAuthHeader(),
  });
  return response.data;
};

export const resetAdminEchoScoreValue = async (resultId) => {
  const response = await client.post(`/admin/echoscore/${resultId}/reset`, null, {
    headers: getAuthHeader(),
  });
  return response.data;
};

export const getAdminEchoScoreDetails = async (resultId) => {
  const response = await client.get(`/admin/echoscore/${resultId}/details`, {
    headers: getAuthHeader(),
  });
  return response.data;
};

export const getAdminReportsAnalytics = async (params = {}) => {
  const response = await client.get('/admin/reports/analytics', {
    headers: getAuthHeader(),
    params,
  });
  return response.data;
};

export const generateAdminReport = async (params = {}) => {
  const response = await client.post('/admin/reports/generate', null, {
    headers: getAuthHeader(),
    params,
  });
  return response.data;
};

export const exportAdminReportPdf = async (params = {}) => {
  const response = await client.get('/admin/reports/export/pdf', {
    headers: getAuthHeader(),
    params,
    responseType: 'blob',
  });
  const filename = parseFilename(response.headers['content-disposition'], 'analytics_report.pdf');
  triggerBrowserDownload(response.data, filename);
  return { success: true, filename };
};

export const exportAdminReportCsv = async (params = {}) => {
  const response = await client.get('/admin/reports/export/csv', {
    headers: getAuthHeader(),
    params,
    responseType: 'blob',
  });
  const filename = parseFilename(response.headers['content-disposition'], 'analytics_report.csv');
  triggerBrowserDownload(response.data, filename);
  return { success: true, filename };
};

export const getAdminMonitoringTable = async (limit = 120) => {
  const response = await client.get('/admin/monitoring/table', {
    headers: getAuthHeader(),
    params: { limit },
  });
  return response.data;
};

export const getAdminScoringLogs = async (limit = 100) => {
  const response = await client.get('/admin/scoring-logs', {
    headers: getAuthHeader(),
    params: { limit },
  });
  return response.data;
};

export const getAdminSystemLogs = async (limit = 100) => {
  const response = await client.get('/admin/system-logs', {
    headers: getAuthHeader(),
    params: { limit },
  });
  return response.data;
};

export const getAdminApiUsage = async () => {
  const response = await client.get('/admin/api-usage', {
    headers: getAuthHeader(),
  });
  return response.data;
};

export const getAdminSettings = async () => {
  const response = await client.get('/admin/settings', {
    headers: getAuthHeader(),
  });
  return response.data;
};

export const updateAdminSettings = async (payload) => {
  const response = await client.put('/admin/settings', payload, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
    },
  });
  return response.data;
};

export const getAdminSecurity = async () => {
  const response = await client.get('/admin/security', {
    headers: getAuthHeader(),
  });
  return response.data;
};

export default {
  loginUser,
  registerUser,
  processCallAudio,
  getServerHistory,
  getServerResult,
  compareResults,
  generateResultPdf,
  downloadResultPdf,
  downloadResultTranscript,
  getServiceHealth,
  getAdminOverview,
  getAdminStats,
  getAdminLogs,
  getAdminErrors,
  getAdminUsers,
  getAdminUsersList,
  createAdminUser,
  deleteAdminUser,
  blockAdminUser,
  unblockAdminUser,
  assignAdminUserRole,
  getAdminUserActivity,
  getAdminEndpoints,
  getAdminHealth,
  getAdminHistory,
  getAdminCalls,
  uploadAdminCall,
  rescoreAdminCall,
  deleteAdminCall,
  getAdminPolicy,
  uploadAdminPolicy,
  updateAdminPolicy,
  deleteAdminPolicy,
  rebuildAdminPolicyEmbeddings,
  rebuildAdminPolicyVectorDb,
  runAdminEchoScore,
  getAdminEchoScoreScores,
  getAdminEchoScoreParameters,
  updateAdminEchoScoreParameters,
  resetAdminEchoScoreParameters,
  resetAdminEchoScoreValue,
  getAdminEchoScoreDetails,
  getAdminReportsAnalytics,
  generateAdminReport,
  exportAdminReportPdf,
  exportAdminReportCsv,
  getAdminMonitoringTable,
  getAdminScoringLogs,
  getAdminSystemLogs,
  getAdminApiUsage,
  getAdminSettings,
  updateAdminSettings,
  getAdminSecurity,
};
