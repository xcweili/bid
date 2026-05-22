import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000
});

// 添加请求和响应拦截器
api.interceptors.request.use(
  (config) => {
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
    // 只保留重要的响应日志
    if (response.config.url?.includes('/tasks/') && (response.config.method === 'post' || response.config.method === 'put')) {
      console.log('✅ API 响应:', response.config.url, response.status);
    }
    return response;
  },
  (error) => {
    console.error('❌ API 响应错误:', error.config?.url, error.response?.status, error.response?.data);
    return Promise.reject(error);
  }
);

export default api;
