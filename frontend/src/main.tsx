import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';

import AppLayout from './components/AppLayout';
import TaskList from './pages/TaskList';
import TaskDetail from './pages/TaskDetail';
import TaskProgress from './pages/TaskProgress';
import RuleConfig from './pages/RuleConfig';
import ResultDetail from './pages/ResultDetail';
import CompanyDetail from './pages/CompanyDetail';
import Dashboard from './pages/Dashboard';

import './App.css';

function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 6,
        },
        algorithm: theme.defaultAlgorithm,
      }}
    >
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Navigate to="/tasks" replace />} />
            <Route path="/tasks" element={<TaskList />} />
            <Route path="/tasks/:id" element={<TaskDetail />} />
            <Route path="/tasks/:id/progress" element={<TaskProgress />} />
            <Route path="/rules" element={<RuleConfig />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/results/:taskId" element={<ResultDetail />} />
            <Route path="/companies/:companyId" element={<CompanyDetail />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
