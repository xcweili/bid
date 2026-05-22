import axios from 'axios';
import { message } from 'antd';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000
});

const TOKEN_KEY = 'bid_evaluation_token';

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (config.url?.includes('/tasks/') && (config.method === 'post' || config.method === 'put')) {
      console.log('🔄 API 请求:', config.method?.toUpperCase(), config.url);
    }
    return config;
  },
  (error) => {
    console.error('❌ API 请求错误:', error);
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    if (response.config.url?.includes('/tasks/') && (response.config.method === 'post' || response.config.method === 'put')) {
      console.log('✅ API 响应:', response.config.url, response.status);
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      message.error('登录已过期，请重新登录');
      window.location.href = '/login';
      return Promise.reject(error);
    }
    console.error('❌ API 响应错误:', error.config?.url, error.response?.status, error.response?.data);
    return Promise.reject(error);
  }
);

export default api;
