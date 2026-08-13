import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { navigate, getCurrentRouteName } from '../navigation/navigationRef';

const API_URL = 'https://vgrand-taskhub-backend.onrender.com/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
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

    // No connectivity or request timed out → show the cat screen.
    // Skip if the request opted out (e.g. background polling) or we're already there.
    const isNetworkError = error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED';
    if (
      isNetworkError &&
      !error.config?.__skipOops &&
      getCurrentRouteName() !== 'Oops'
    ) {
      navigate('Oops', { mode: 'offline' });
    }

    return Promise.reject(error);
  }
);

export { API_URL };
export default api;
