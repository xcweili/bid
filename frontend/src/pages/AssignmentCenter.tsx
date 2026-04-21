import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Typography,
  message,
  Space,
  Tag,
  Row,
  Col,
  Skeleton,
  Modal,
  Empty,
  Spin,
  Alert,
  Tooltip
} from 'antd';
import {
  ArrowLeftOutlined,
  TeamOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  SwapOutlined,
  ClearOutlined,
  ReloadOutlined,
  SendOutlined,
  UserOutlined,
  ExportOutlined,
  UndoOutlined,
  RedoOutlined,
  DownloadOutlined,
  BulbOutlined
} from '@ant-design/icons';
import apiClient from '../services/api.js';
import assignmentService from '../services/assignmentService';
import AppSidebar from '../components/AppSidebar';
import AssignmentHeader from './components/AssignmentHeader';
import DispatchModeSelector from './components/DispatchModeSelector';
import ResourcePanel from './components/ResourcePanel';
import AssignmentOperationPanel from './components/AssignmentOperationPanel';
import AssignmentPreview from './components/AssignmentPreview';
import AssignmentFooter from './components/AssignmentFooter';
import './AssignmentCenter.css';

const { Title, Text } = Typography;

// 类型定义
interface Package {
  id: number;
  package_name: string;
  project_id: number;
  status: string;
  dispatch_mode?: string;
}

interface Criteria {
  id: number;
  criteria_name: string;
  criteria_type: string;
  max_score: number;
  weight: number;
}

interface Company {
  id: number;
  company_name: string;
  status: string;
  assigned_count: number;
}

interface TeamMember {
  id: number;
  real_name: string;
  role: string;
  avatar?: string;
  current_workload: number;
}

interface Assignment {
  id: number;
  package_id: number;
  company_id?: number;
  company_name?: string;
  evaluator_id: number;
  evaluator_name: string;
  assignment_type: string;
  dispatch_mode: string;
  assigned_criteria_ids?: number[];
  status: string;
  progress_percent: number;
  created_at?: string;
}

interface Stats {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  unassigned_resources: number;
  evaluator_workloads: Array<{
    evaluator_id: number;
    evaluator_name: string;
    assigned_count: number;
  }>;
}

interface TempAssignment {
  evaluatorId: number;
  evaluatorName: string;
  resourceIds: number[];
}

interface Resource {
  id: number;
  name: string;
  type: 'company' | 'criteria';
  code?: string;
  status?: string;
  assignedCount?: number;
  isSelected?: boolean;
}

const AssignmentCenter: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const packageId = parseInt(id || '0');

  // 状态管理
  const [mode, setMode] = useState<'by_company' | 'by_criteria'>('by_company');
  const [packageInfo, setPackageInfo] = useState<Package | null>(null);
  const [criteriaList, setCriteriaList] = useState<Criteria[]>([]);
  const [companyList, setCompanyList] = useState<Company[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [currentAssignments, setCurrentAssignments] = useState<Assignment[]>([]);
  const [tempAssignments, setTempAssignments] = useState<TempAssignment[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 撤销/重做历史
  const [historyStack, setHistoryStack] = useState<TempAssignment[][]>([]);
  const [futureStack, setFutureStack] = useState<TempAssignment[][]>([]);
  const maxHistoryLength = 50;
  
  // 保存历史快照
  const saveHistorySnapshot = useCallback(() => {
    const snapshot = JSON.parse(JSON.stringify(tempAssignments));
    setHistoryStack(prev => {
      const newStack = [...prev, snapshot];
      if (newStack.length > maxHistoryLength) {
        return newStack.slice(newStack.length - maxHistoryLength);
      }
      return newStack;
    });
    // 清空重做栈
    setFutureStack([]);
  }, [tempAssignments]);

  // 加载数据
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.get(`/api/assignments/package/${packageId}/dispatch-info`);
      const data = response.data;
      
      setPackageInfo(data.package);
      setCriteriaList(data.criteria_list || []);
      setCompanyList(data.company_list || []);
      setTeamMembers(data.team_members || []);
      setCurrentAssignments(data.current_assignments || []);
      setStats(data.stats || null);
      
      // 初始化临时分配状态
      const initialAssignments: TempAssignment[] = (data.team_members || []).map(member => ({
        evaluatorId: member.id,
        evaluatorName: member.real_name,
        resourceIds: []
      }));
      setTempAssignments(initialAssignments);
      
    } catch (error) {
      console.error('获取数据失败:', error);
      message.error('获取数据失败');
    } finally {
      setIsLoading(false);
    }
  }, [packageId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 模式切换
  const handleModeChange = (newMode: 'by_company' | 'by_criteria') => {
    // 检查是否有未保存的分配
    const hasUnsavedChanges = tempAssignments.some(a => a.resourceIds.length > 0);
    
    if (hasUnsavedChanges) {
      Modal.confirm({
        title: '确认切换模式',
        content: '切换模式将清空当前已分配的 resource，确定继续吗？',
        onOk: () => {
          setMode(newMode);
          // 清空临时分配
          setTempAssignments(prev => prev.map(a => ({ ...a, resourceIds: [] })));
          message.info('已清空当前分配');
        }
      });
    } else {
      setMode(newMode);
    }
  };

  // 获取当前资源列表
  const getResources = (): Resource[] => {
    if (mode === 'by_company') {
      return companyList.map(c => ({
        id: c.id,
        name: c.company_name,
        type: 'company',
        status: c.status,
        assignedCount: c.assigned_count
      }));
    } else {
      return criteriaList.map(c => ({
        id: c.id,
        name: c.criteria_name,
        type: 'criteria',
        code: c.criteria_type,
        assignedCount: 0
      }));
    }
  };

  // 分配资源到成员
  const handleAssignToMember = (evaluatorId: number, resourceIds: number[]) => {
    // 保存操作前的状态
    saveHistorySnapshot();
    
    setTempAssignments(prev => {
      const newAssignments = [...prev];
      const memberAssignment = newAssignments.find(a => a.evaluatorId === evaluatorId);
      
      if (memberAssignment) {
        // 检查资源是否已被其他人分配
        const isAlreadyAssigned = resourceIds.some(id => 
          newAssignments.some(a => 
            a.evaluatorId !== evaluatorId && a.resourceIds.includes(id)
          )
        );
        
        if (isAlreadyAssigned) {
          message.warning('部分资源已被分配给其他成员');
          return prev;
        }
        
        memberAssignment.resourceIds = [...memberAssignment.resourceIds, ...resourceIds];
      }
      
      return newAssignments;
    });
  };

  // 从成员移除资源
  const handleRemoveFromAssignment = (evaluatorId: number, resourceId: number) => {
    // 保存操作前的状态
    saveHistorySnapshot();
    
    setTempAssignments(prev => {
      const newAssignments = [...prev];
      const memberAssignment = newAssignments.find(a => a.evaluatorId === evaluatorId);
      
      if (memberAssignment) {
        memberAssignment.resourceIds = memberAssignment.resourceIds.filter(
          id => id !== resourceId
        );
      }
      
      return newAssignments;
    });
  };

  // 清空成员所有分配
  const handleClearMemberAssignments = (evaluatorId: number) => {
    // 保存操作前的状态
    saveHistorySnapshot();
    
    setTempAssignments(prev => 
      prev.map(a => 
        a.evaluatorId === evaluatorId 
          ? { ...a, resourceIds: [] }
          : a
      )
    );
  };

  // 平均分配
  const handleAverageAssign = () => {
    if (teamMembers.length === 0) {
      message.warning('没有团队成员');
      return;
    }

    // 保存操作前的状态
    saveHistorySnapshot();

    const resources = getResources();
    const unassignedResources = resources.filter(r => 
      !tempAssignments.some(a => a.resourceIds.includes(r.id))
    );
    
    const newAssignments: TempAssignment[] = JSON.parse(JSON.stringify(tempAssignments));
    const memberIds = teamMembers.map(m => m.id);
    
    unassignedResources.forEach((resource, index) => {
      const memberIndex = index % memberIds.length;
      const memberId = memberIds[memberIndex];
      const memberAssignment = newAssignments.find(a => a.evaluatorId === memberId);
      
      if (memberAssignment) {
        memberAssignment.resourceIds.push(resource.id);
      }
    });
    
    setTempAssignments(newAssignments);
    message.success('平均分配完成');
  };

  // 清空所有分配
  const handleClearAll = () => {
    Modal.confirm({
      title: '确认清空',
      content: '确定要清空所有已分配的资源吗？',
      onOk: () => {
        // 保存操作前的状态
        saveHistorySnapshot();
        setTempAssignments(prev => prev.map(a => ({ ...a, resourceIds: [] })));
        message.success('已清空所有分配');
      }
    });
  };

  // 重置到初始状态
  const handleReset = () => {
    // 保存操作前的状态
    saveHistorySnapshot();
    setTempAssignments(prev => 
      prev.map(a => ({ 
        ...a, 
        resourceIds: [] 
      }))
    );
    message.info('已重置');
  };
  
  // 撤销操作
  const handleUndo = () => {
    if (historyStack.length === 0) {
      message.info('没有可撤销的操作');
      return;
    }
    
    const previousState = historyStack[historyStack.length - 1];
    setHistoryStack(prev => prev.slice(0, -1));
    setFutureStack(prev => [...prev, tempAssignments]);
    setTempAssignments(previousState);
    message.success('已撤销上一次操作');
  };
  
  // 重做操作
  const handleRedo = () => {
    if (futureStack.length === 0) {
      message.info('没有可重做的操作');
      return;
    }
    
    const nextState = futureStack[futureStack.length - 1];
    setFutureStack(prev => prev.slice(0, -1));
    setHistoryStack(prev => [...prev, tempAssignments]);
    setTempAssignments(nextState);
    message.success('已重做操作');
  };
  
  // 智能推荐分配
  const handleSmartRecommend = async () => {
    try {
      const response = await assignmentService.recommendAssignments(packageId, mode);
      
      if (response.recommendations && response.recommendations.length > 0) {
        // 保存当前状态
        saveHistorySnapshot();
        
        // 应用推荐
        const newAssignments = teamMembers.map(member => {
          const recommendation = response.recommendations.find(
            r => r.evaluator_id === member.id
          );
          return {
            evaluatorId: member.id,
            evaluatorName: member.real_name,
            resourceIds: recommendation?.resource_ids || []
          };
        });
        
        setTempAssignments(newAssignments);
        message.success(`智能推荐完成，共推荐 ${response.total_resources} 项分配`);
      } else {
        message.info('没有找到合适的推荐方案');
      }
    } catch (error: any) {
      console.error('智能推荐失败:', error);
      message.error('智能推荐失败');
    }
  };
  
  // 导出分配结果
  const handleExport = async () => {
    Modal.confirm({
      title: '导出分配结果',
      content: (
        <Space direction="vertical">
          <p>选择导出格式：</p>
          <div>
            <Button 
              icon={<DownloadOutlined />} 
              onClick={async () => {
                try {
                  const blob = await assignmentService.exportAssignments(packageId, 'excel');
                  const url = window.URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `分配结果_${packageInfo?.package_name || packageId}.xlsx`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  window.URL.revokeObjectURL(url);
                  message.success('Excel 导出成功');
                } catch (error) {
                  message.error('Excel 导出失败');
                }
              }}
            >
              Excel 格式
            </Button>
            <Button 
              icon={<DownloadOutlined />} 
              style={{ marginLeft: 8 }}
              onClick={async () => {
                try {
                  const blob = await assignmentService.exportAssignments(packageId, 'csv');
                  const url = window.URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `分配结果_${packageInfo?.package_name || packageId}.csv`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  window.URL.revokeObjectURL(url);
                  message.success('CSV 导出成功');
                } catch (error) {
                  message.error('CSV 导出失败');
                }
              }}
            >
              CSV 格式
            </Button>
          </div>
        </Space>
      ),
      okText: '关闭',
      cancelText: '',
      onOk: () => {}
    });
  };

  // 提交分配
  const handleSubmit = async () => {
    // 检查是否有分配
    const hasAssignments = tempAssignments.some(a => a.resourceIds.length > 0);
    if (!hasAssignments) {
      message.warning('请先分配资源');
      return;
    }

    // 显示确认弹窗
    const assignmentSummary = tempAssignments
      .filter(a => a.resourceIds.length > 0)
      .map(a => `${a.evaluatorName}: ${a.resourceIds.length}项`)
      .join('\n');

    Modal.confirm({
      title: '确认下发分配',
      content: (
        <div>
          <p>以下分配将被提交：</p>
          <pre style={{ 
            background: '#f5f5f5', 
            padding: '12px', 
            borderRadius: '4px',
            margin: '8px 0',
            maxHeight: '200px',
            overflow: 'auto'
          }}>
            {assignmentSummary}
          </pre>
          <p style={{ color: '#ff4d4f' }}>确定继续吗？</p>
        </div>
      ),
      okText: '确认下发',
      cancelText: '取消',
      onOk: async () => {
        setIsSubmitting(true);
        try {
          const teamAssignments = tempAssignments
            .filter(a => a.resourceIds.length > 0)
            .map(a => ({
              evaluator_id: a.evaluatorId,
              ...(mode === 'by_criteria' 
                ? { criteria_ids: a.resourceIds }
                : { company_ids: a.resourceIds })
            }));

          if (mode === 'by_criteria') {
            await apiClient.post('/api/assignments/batch-assign-criteria', {
              package_id: packageId,
              team_assignments: teamAssignments
            });
            message.success('评审项分配成功');
          } else {
            await apiClient.post('/api/assignments/batch-assign-companies', {
              package_id: packageId,
              team_assignments: teamAssignments
            });
            message.success('公司分配成功');
          }

          navigate(`/projects/${packageInfo?.project_id}`);
        } catch (error: any) {
          console.error('提交分配失败:', error);
          message.error(error?.response?.data?.detail || '分配失败');
        } finally {
          setIsSubmitting(false);
        }
      }
    });
  };

  // 计算统计信息
  const getFooterStats = () => {
    const resources = getResources();
    const assignedIds = new Set<number>();
    tempAssignments.forEach(a => a.resourceIds.forEach(id => assignedIds.add(id)));
    
    return {
      pendingCount: resources.length - assignedIds.size,
      assignedCount: assignedIds.size,
      totalResources: resources.length
    };
  };

  // 键盘快捷键支持
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  if (isLoading) {
    return (
      <AppSidebar pageTitle="任务分配中心">
        <div className="assignment-center-loading">
          <Spin size="large" tip="加载中..." />
        </div>
      </AppSidebar>
    );
  }

  const resources = getResources();
  const footerStats = getFooterStats();

  return (
    <AppSidebar pageTitle="任务分配中心">
      <div className="assignment-center">
        {/* 顶部信息栏 */}
        <AssignmentHeader
          package={packageInfo}
          stats={stats}
          onBack={() => navigate(`/projects/${packageInfo?.project_id}`)}
        />

        {/* 模式选择器 */}
        <DispatchModeSelector
          mode={mode}
          onChange={handleModeChange}
        />

        {/* 主内容区 */}
        <div className="assignment-main">
          {/* 左侧：资源面板 */}
          <ResourcePanel
            mode={mode}
            resources={resources}
            assignments={tempAssignments}
          />

          {/* 中间：操作面板 */}
          <AssignmentOperationPanel
            mode={mode}
            teamMembers={teamMembers}
            resources={resources}
            assignments={tempAssignments}
            onAssign={handleAssignToMember}
            onRemove={handleRemoveFromAssignment}
            onClear={handleClearMemberAssignments}
          />

          {/* 右侧：预览面板 */}
          <AssignmentPreview
            assignments={tempAssignments}
            mode={mode}
            resources={resources}
          />
        </div>

        {/* 底部操作栏 */}
        <AssignmentFooter
          stats={footerStats}
          onAverage={handleAverageAssign}
          onClearAll={handleClearAll}
          onReset={handleReset}
          onSubmit={handleSubmit}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onSmartRecommend={handleSmartRecommend}
          onExport={handleExport}
          disabled={{
            average: resources.length === 0,
            clear: tempAssignments.every(a => a.resourceIds.length === 0),
            reset: tempAssignments.every(a => a.resourceIds.length === 0),
            submit: !tempAssignments.some(a => a.resourceIds.length > 0),
            undo: historyStack.length === 0,
            redo: futureStack.length === 0
          }}
          isSubmitting={isSubmitting}
        />
      </div>
    </AppSidebar>
  );
};

export default AssignmentCenter;
