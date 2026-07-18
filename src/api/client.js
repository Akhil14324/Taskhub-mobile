import axios from 'axios';
import EncryptedStorage from 'react-native-encrypted-storage';

const API_URL = __DEV__
  ? 'http://10.0.2.2:5000/api'
  : 'https://vgrand-taskhub-backend.onrender.com/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

api.interceptors.request.use(async (config) => {
  try {
    const token = await EncryptedStorage.getItem('token');
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
        await EncryptedStorage.removeItem('token');
        await EncryptedStorage.removeItem('user');
      } catch (e) {
        // ignore
      }
    }
    return Promise.reject(error);
  }
);

export default api;
