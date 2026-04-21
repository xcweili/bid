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
import Login from './pages/Login';

// 新页面 - 角色协作版
import ProjectList from './pages/ProjectList';
import ProjectCreate from './pages/ProjectCreate';
import ProjectDetail from './pages/ProjectDetail';
import PackageDispatch from './pages/PackageDispatch';
import MyTasks from './pages/MyTasks';
import RuleTemplateList from './pages/RuleTemplateList';
import RuleTemplateDetail from './pages/RuleTemplateDetail';
import TeamManagement from './pages/TeamManagement';
import UserManagement from './pages/UserManagement';
import ProjectTypeList from './pages/ProjectTypeList';

// 新增页面
import CriteriaManagement from './pages/CriteriaManagement';
import ProjectCriteriaManagement from './pages/ProjectCriteriaManagement';
import TaskAssignment from './pages/TaskAssignment';
import TaskOverview from './pages/TaskOverview';
import EvaluationForm from './pages/EvaluationForm';
import ResultSummary from './pages/ResultSummary';
import ProjectRuleConfig from './pages/ProjectRuleConfig';
import TeamTaskRefine from './pages/TeamTaskRefine';
import AssignmentCenter from './pages/AssignmentCenter';
import TestScroll from './pages/TestScroll';

import RoleGuard from './components/RoleGuard';
import './App.css';
import './styles/global-overflow.css';

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
        <Routes>
          {/* 登录页 - 无布局 */}
          <Route path="/login" element={<Login />} />
          
          {/* 根路径跳转到仪表盘 */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          
          {/* 新页面 - 角色协作版 */}
          <Route path="/dashboard" element={
            <RoleGuard allowedRoles={['admin', 'team_leader', 'team_manager', 'technical_evaluator', 'business_evaluator']}>
              <Dashboard />
            </RoleGuard>
          } />
          <Route path="/projects" element={
            <RoleGuard allowedRoles={['admin', 'team_leader']}>
              <ProjectList />
            </RoleGuard>
          } />
          <Route path="/projects/create" element={
            <RoleGuard allowedRoles={['admin', 'team_leader']}>
              <ProjectCreate />
            </RoleGuard>
          } />
          <Route path="/projects/:id" element={
            <RoleGuard allowedRoles={['admin', 'team_leader', 'team_manager', 'technical_evaluator', 'business_evaluator']}>
              <ProjectDetail />
            </RoleGuard>
          } />
          <Route path="/projects/:id/dispatch" element={
            <RoleGuard allowedRoles={['admin', 'team_leader']}>
              <PackageDispatch />
            </RoleGuard>
          } />
          <Route path="/projects/:id/criteria" element={
            <RoleGuard allowedRoles={['admin', 'team_leader']}>
              <ProjectCriteriaManagement />
            </RoleGuard>
          } />
          <Route path="/projects/:id/rules" element={
            <RoleGuard allowedRoles={['admin', 'team_leader', 'technical_evaluator', 'business_evaluator']}>
              <ProjectRuleConfig />
            </RoleGuard>
          } />
          <Route path="/projects/:id/old-criteria" element={
            <RoleGuard allowedRoles={['admin', 'team_leader']}>
              <CriteriaManagement />
            </RoleGuard>
          } />
          <Route path="/projects/:id/assignment" element={
            <RoleGuard allowedRoles={['admin', 'team_leader']}>
              <TaskAssignment />
            </RoleGuard>
          } />
          <Route path="/projects/:id/assign-center" element={
            <RoleGuard allowedRoles={['admin', 'team_leader']}>
              <AssignmentCenter />
            </RoleGuard>
          } />
          <Route path="/projects/:id/overview" element={
            <RoleGuard allowedRoles={['admin', 'team_leader', 'team_manager', 'technical_evaluator', 'business_evaluator']}>
              <TaskOverview />
            </RoleGuard>
          } />
          <Route path="/projects/:id/summary" element={
            <RoleGuard allowedRoles={['admin', 'team_leader']}>
              <ResultSummary />
            </RoleGuard>
          } />
          <Route path="/teams/tasks" element={
            <RoleGuard allowedRoles={['admin', 'team_leader', 'team_manager']}>
              <TeamTaskRefine />
            </RoleGuard>
          } />
          <Route path="/project-types" element={
            <RoleGuard allowedRoles={['admin', 'team_leader']}>
              <ProjectTypeList />
            </RoleGuard>
          } />
          <Route path="/teams" element={
            <RoleGuard allowedRoles={['admin', 'team_leader', 'team_manager']}>
              <TeamManagement />
            </RoleGuard>
          } />
          <Route path="/users" element={
            <RoleGuard allowedRoles={['admin', 'team_leader']}>
              <UserManagement />
            </RoleGuard>
          } />
          <Route path="/my-tasks" element={
            <RoleGuard allowedRoles={['admin', 'team_leader', 'team_manager', 'technical_evaluator', 'business_evaluator']}>
              <MyTasks />
            </RoleGuard>
          } />
          <Route path="/my-tasks/:id" element={
            <RoleGuard allowedRoles={['admin', 'team_leader', 'team_manager', 'technical_evaluator', 'business_evaluator']}>
              <EvaluationForm />
            </RoleGuard>
          } />
          <Route path="/rule-templates" element={
            <RoleGuard allowedRoles={['admin', 'team_leader']}>
              <RuleTemplateList />
            </RoleGuard>
          } />
          <Route path="/rule-templates/:id" element={
            <RoleGuard allowedRoles={['admin', 'team_leader']}>
              <RuleTemplateDetail />
            </RoleGuard>
          } />
          <Route path="/test-scroll" element={<TestScroll />} />
          
          {/* 旧页面 - 兼容 */}
          <Route path="/tasks" element={<TaskList />} />
          <Route path="/tasks/:id" element={<TaskDetail />} />
          <Route path="/tasks/:id/progress" element={<TaskProgress />} />
          <Route path="/rules" element={<RuleConfig />} />
          <Route path="/results/:taskId" element={<ResultDetail />} />
          <Route path="/companies/:companyId" element={<CompanyDetail />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
