/**
 * policyApi.js — Policy Workspace API Client
 * ============================================
 * Dedicated API module for all policy management endpoints.
 */

import axios from 'axios';
import { API_BASE } from './constants';

const client = axios.create({ baseURL: API_BASE, timeout: 120000 });

const getAuthHeader = () => {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const safe = async (fn) => {
  try { return await fn(); }
  catch (e) { throw new Error(e?.response?.data?.detail || e?.message || 'Request failed'); }
};

// Dashboard
export const getPolicyDashboard = () =>
  safe(async () => (await client.get('/policies/dashboard', { headers: getAuthHeader() })).data);

// CRUD
export const listPolicies = (params = {}) =>
  safe(async () => (await client.get('/policies', { headers: getAuthHeader(), params })).data);

export const createPolicy = (file, name, category) => {
  const formData = new FormData();
  formData.append('file', file);
  if (name) formData.append('name', name);
  if (category) formData.append('category', category);
  return safe(async () => (await client.post('/policies', formData, {
    headers: { 'Content-Type': 'multipart/form-data', ...getAuthHeader() },
  })).data);
};

export const getPolicy = (policyId) =>
  safe(async () => (await client.get(`/policies/${policyId}`, { headers: getAuthHeader() })).data);

export const updatePolicy = (policyId, content, summary = '') =>
  safe(async () => (await client.put(`/policies/${policyId}`, { content, summary }, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  })).data);

export const updatePolicyMetadata = (policyId, payload) =>
  safe(async () => (await client.put(`/policies/${policyId}/metadata`, payload, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  })).data);

export const archivePolicy = (policyId) =>
  safe(async () => (await client.post(`/policies/${policyId}/archive`, null, { headers: getAuthHeader() })).data);

export const restorePolicy = (policyId) =>
  safe(async () => (await client.post(`/policies/${policyId}/restore`, null, { headers: getAuthHeader() })).data);

export const deletePolicy = (policyId) =>
  safe(async () => (await client.delete(`/policies/${policyId}`, { headers: getAuthHeader() })).data);

// Versions
export const listVersions = (policyId) =>
  safe(async () => (await client.get(`/policies/${policyId}/versions`, { headers: getAuthHeader() })).data);

export const getVersion = (policyId, version) =>
  safe(async () => (await client.get(`/policies/${policyId}/versions/${version}`, { headers: getAuthHeader() })).data);

export const compareVersions = (policyId, v1, v2) =>
  safe(async () => (await client.get(`/policies/${policyId}/versions/compare/${v1}/${v2}`, { headers: getAuthHeader() })).data);

export const rollbackVersion = (policyId, version) =>
  safe(async () => (await client.post(`/policies/${policyId}/versions/${version}/rollback`, null, { headers: getAuthHeader() })).data);

// AI Insights
export const getInsights = (policyId) =>
  safe(async () => (await client.get(`/policies/${policyId}/insights`, { headers: getAuthHeader() })).data);

export const reanalyzePolicy = (policyId) =>
  safe(async () => (await client.post(`/policies/${policyId}/reanalyze`, null, { headers: getAuthHeader() })).data);

export const reEmbedPolicy = (policyId) =>
  safe(async () => (await client.post(`/policies/${policyId}/re-embed`, null, { headers: getAuthHeader() })).data);

// Suggestions & Testing
export const getMissingSuggestions = () =>
  safe(async () => (await client.get('/policies/suggestions/missing', { headers: getAuthHeader() })).data);

export const testRetrieval = (query, topK = 4) =>
  safe(async () => (await client.post('/policies/test/retrieval', { query, top_k: topK }, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  })).data);

export const getEmbeddingStatus = () =>
  safe(async () => (await client.get('/policies/system/embedding-status', { headers: getAuthHeader() })).data);
