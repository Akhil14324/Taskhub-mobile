import axios from 'axios';
import * as SecureStore from '../utils/secureStorage';
import { showToast } from '../utils/events';
import { API_URL } from '../config';

const MAX_RETRIES = 2;
const NETWORK_TOAST_GAP_MS = 10000;
let lastNetworkToast = 0;

const api = axios.create({
  baseURL: API_URL,
  timeout: 20000,
});

api.interceptors.request.use(async (config) => {
  try {
    const token = await SecureStore.getItemAsync('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (e) {
    // ignore
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      try {
        await SecureStore.deleteItemAsync('token');
        await SecureStore.deleteItemAsync('user');
      } catch (e) {
        // ignore
      }
    }

    const config = error.config;
    const status = error.response?.status;
    const isCanceled = error.code === 'ERR_CANCELED' || error.name === 'CanceledError';
    const isNetworkError = error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
    const isTransient = isNetworkError || status === 502 || status === 503 || status === 504;

    // Transient failures (flaky connection, server waking up, a deploy in progress) on
    // read requests are retried quietly so the user never notices them.
    if (config && !isCanceled && isTransient && (config.method || 'get').toLowerCase() === 'get') {
      config.__retryCount = (config.__retryCount || 0) + 1;
      if (config.__retryCount <= MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 600 * config.__retryCount));
        return api(config);
      }
    }

    // Never throw the user onto a full-screen error page; callers handle their own errors.
    // For user-initiated requests show one throttled toast instead.
    if (isTransient && !isCanceled && !config?.__skipOops) {
      const now = Date.now();
      if (now - lastNetworkToast > NETWORK_TOAST_GAP_MS) {
        lastNetworkToast = now;
        showToast('Connection problem. Please check your internet and try again.');
      }
    }

    return Promise.reject(error);
  }
);

export { API_URL };
export default api;
