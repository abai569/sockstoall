import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

const savedToken = localStorage.getItem('token');
if (savedToken) {
  api.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  changePassword: (oldPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { oldPassword, newPassword }),
  getMe: () => api.get('/auth/me'),
};

export const nodeApi = {
  list: () => api.get('/nodes'),
  get: (id: string) => api.get(`/nodes/${id}`),
  create: (data: any) => api.post('/nodes', data),
  update: (id: string, data: any) => api.put(`/nodes/${id}`, data),
  delete: (id: string) => api.delete(`/nodes/${id}`),
  toggle: (id: string, enabled: boolean) => api.patch(`/nodes/${id}/toggle`, { enabled }),
};

export const linkApi = {
  parse: (link: string) => api.post('/link/parse', { link }),
};

export const routeApi = {
  list: () => api.get('/routes'),
  get: (id: string) => api.get(`/routes/${id}`),
  create: (data: any) => api.post('/routes', data),
  update: (id: string, data: any) => api.put(`/routes/${id}`, data),
  delete: (id: string) => api.delete(`/routes/${id}`),
  toggle: (id: string, enabled: boolean) =>
    api.patch(`/routes/${id}/toggle`, { enabled }),
};

export const xrayApi = {
  status: () => api.get('/xray/status'),
  start: () => api.post('/xray/start'),
  stop: () => api.post('/xray/stop'),
  reload: () => api.post('/xray/reload'),
};
