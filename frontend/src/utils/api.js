import axios from 'axios';
import { PROCESS_CALL_ENDPOINT } from './constants';

// Use environment variable if available, otherwise use default
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // 5 minutes for long processing
});

export const processCallAudio = async (file, onProgress) => {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await client.post(PROCESS_CALL_ENDPOINT, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
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

export default {
  processCallAudio,
};
