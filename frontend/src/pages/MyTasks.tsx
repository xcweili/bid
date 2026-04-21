import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Tag,
  Space,
  Typography,
  Button,
  message,
  Select,
  Row,
  Col,
  Statistic,
  Tabs,
  Empty,
  Divider,
  Alert,
  Checkbox
} from 'antd';
import {
  ProjectOutlined,
  FileTextOutlined,
  TeamOutlined,
  UserOutlined,
  CheckCircleOutlined,
  EditOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  RightOutlined
} from '@ant-design/icons';
import apiClient from '../services/api';
import AppSidebar from '../components/AppSidebar';
import TaskRefinementModal from './TaskRefinementModal';
import './MyTasks.css';

const { Text } = Typography;
const { Option } = Select;

interface User {
  id: number;
  username: string;
  real_name: string;
  role: string;
}

interface TeamMember {
  id: number;
  user_id: number;
  team_id: number;
  role: string;
  user?: User;
  real_name?: string;  // API 直接返回的字段
  username?: string;   // API 直接返回的字段
}

interface SubTask {
  id: number;
  package_id: number;
  package_name: string;
  evaluator_id?: number;
  evaluator_name?: string;
  task_type: string;
  mode: string;
  status: string;
  progress_percent: number;
  assigned_documents: number[];
  assigned_criteria: number[];
  total_score?: number | null;
  completed_companies?: number;
  evaluation_count?: number;
}

interface Project {
  id: number;
  project_name: string;
  status: string;
  progress_percent: number;
  assigned_team_id?: number;
  assigned_team_name?: string;
  can_dispatch: boolean;
  can_refine: boolean;
  subtasks: SubTask[];
}

const MyTasks: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [refineModalVisible, setRefineModalVisible] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [criteria, setCriteria] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [assignMode, setAssignMode] = useState<'by_criteria' | 'by_company' | null>(null);
  const [memberAssignments, setMemberAssignments] = useState<Record<number, any[]>>({});

  useEffect(() => {
    const userData = localStorage.getItem('user');
    console.log('Raw user data from localStorage:', userData);
    if (userData) {
      try {
        const parsedUser = JSON.parse(userData);
        console.log('Parsed user data:', parsedUser);
        console.log('User team_id:', parsedUser.team_id);
        setUser(parsedUser);
        fetchTasks();
        if (parsedUser.role === 'team_manager') {
          if (parsedUser.team_id) {
            console.log('Fetching team members for team_id:', parsedUser.team_id);
            fetchTeamMembers(parsedUser.team_id);
          } else {
            console.warn('User has no team_id, user object:', parsedUser);
            // 不显示警告，让用户可以继续浏览页面
          }
        }
      } catch (e) {
        console.error('Failed to parse user data:', e);
        navigate('/login');
      }
    } else {
      navigate('/login');
    }
  }, [navigate]);  // 只在导航时重新加载，避免无限循环

  const fetchTeamMembers = async (teamId: number) => {
    console.log('fetchTeamMembers called with teamId:', teamId);
    try {
      const response = await apiClient.get(`/api/teams/${teamId}`);
      console.log('Team API response:', response.data);
      const members = response.data?.members || [];
      console.log('Parsed team members:', members);
      setTeamMembers(members);
    } catch (error) {
      console.error('获取团队成员失败:', error);
      message.error('获取团队成员失败');
    }
  };

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/evaluation/my-tasks');
      setProjects(response.data || []);
    } catch (error: any) {
      console.error('获取任务列表失败:', error);
      message.error('获取任务列表失败');
    } finally {
      setLoading(false);  // 确保无论成功失败都关闭 loading
    }
  };

  // 统计
  const stats = {
    total: user?.role === 'technical_evaluator' || user?.role === 'business_evaluator' 
      ? projects.reduce((sum, p) => sum + (p.subtasks?.length || 0), 0)
      : projects.length,
    assigned: user?.role === 'technical_evaluator' || user?.role === 'business_evaluator'
      ? projects.filter(p => p.status === 'assigned').length
      : projects.filter(p => p.status === 'assigned').length,
    processing: user?.role === 'technical_evaluator' || user?.role === 'business_evaluator'
      ? projects.filter(p => p.status === 'processing').length
      : projects.filter(p => p.status === 'processing').length,
    completed: user?.role === 'technical_evaluator' || user?.role === 'business_evaluator'
      ? projects.filter(p => p.status === 'completed').length
      : projects.filter(p => p.status === 'completed').length
  };

  // 过滤
  const filteredProjects = projects.filter(project => {
    if (activeTab === 'all') return true;
    if (activeTab === 'assigned') return project.status === 'assigned';
    if (activeTab === 'in_progress') return project.status === 'processing';
    if (activeTab === 'completed') return project.status === 'completed';
    return true;
  });

  const handleRefineClick = async (record: Project) => {
    setSelectedProject(record);
    setRefineModalVisible(true);
    setMemberAssignments({});
    setLoadingData(true);
    
    try {
      // 加载项目数据和团队成员
      const [companiesRes, criteriaRes] = await Promise.all([
        apiClient.get(`/api/projects/${record.id}/companies`),
        apiClient.get(`/api/projects/${record.id}/rules`)
      ]);
      
      setCompanies(companiesRes.data?.companies || []);
      setCriteria(criteriaRes.data?.rules || []);
    } catch (error) {
      console.error('加载项目数据失败:', error);
      message.warning('加载项目数据失败，将使用默认分配方式');
      setCompanies([]);
      setCriteria([]);
    } finally {
      setLoadingData(false);
    }
  };


  // 状态配置
  const getStatusConfig = (status: string) => {
    const config: Record<string, { text: string; color: string }> = {
      assigned: { text: '已分派', color: 'default' },
      processing: { text: '进行中', color: 'orange' },
      completed: { text: '已完成', color: 'green' }
    };
    return config[status] || { text: status, color: 'default' };
  };

  // 专家角色的表格列（扁平化子任务列表）
  const expertColumns = [
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 180,
      render: (name: string) => (
        <span className="project-name">{name}</span>
      )
    },
    {
      title: '评审模式',
      dataIndex: 'mode',
      key: 'mode',
      width: 100,
      render: (mode: string) => (
        <Tag color="default">
          {mode === 'by_criteria' ? '按评审项' : mode === 'by_company' ? '按公司' : mode}
        </Tag>
      )
    },
    {
      title: '任务类型',
      dataIndex: 'task_type',
      key: 'task_type',
      width: 80,
      render: (type: string) => (
        <Tag color={type === 'technical' ? 'blue' : 'green'}>
          {type === 'technical' ? '技术' : '商务'}
        </Tag>
      )
    },
    {
      title: '公司数',
      dataIndex: 'company_count',
      key: 'company_count',
      width: 80,
      render: (count: number) => (
        <Text strong>{count}</Text>
      )
    },
    {
      title: '评审项',
      dataIndex: 'criteria_count',
      key: 'criteria_count',
      width: 80,
      render: (count: number) => (
        <Text strong>{count}</Text>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const { text, color } = getStatusConfig(status);
        return <Tag color={color}>{text}</Tag>;
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size="small">
          <Button
            size="small"
            type="default"
            onClick={() => navigate(`/projects/${record.package_id}`)}
          >
            项目
          </Button>
          <Button
            size="small"
            type="link"
            onClick={() => navigate(`/my-tasks/${record.id}`)}
          >
            任务
          </Button>
        </Space>
      )
    }
  ];

  // 普通角色的表格列（项目列表）
  const columns = [
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 200,
      render: (name: string, record: Project) => (
        <Space size="middle">
          <div className="project-icon">
            <ProjectOutlined />
          </div>
          <span className="project-name">{name}</span>
        </Space>
      )
    },
    {
      title: '分派团队',
      dataIndex: 'assigned_team_name',
      key: 'assigned_team_name',
      width: 180,
      render: (team: string) => team ? (
        <Space size="small">
          <TeamOutlined />
          <span>{team}</span>
        </Space>
      ) : (
        <Text type="secondary">未分派</Text>
      )
    },
    {
      title: '进度',
      key: 'progress',
      width: 150,
      render: (_: any, record: Project) => (
        <div className="progress-wrapper">
          <div className="progress-track">
            <div 
              className="progress-fill" 
              style={{ width: `${record.progress_percent}%` }}
            />
          </div>
          <span className="progress-text">{record.progress_percent}%</span>
        </div>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => {
        const { text, color } = getStatusConfig(status);
        return <Tag color={color}>{text}</Tag>;
      }
    },
    {
      title: '子任务',
      key: 'subtasks',
      width: 100,
      render: (_: any, record: Project) => {
        const count = record.subtasks?.length || 0;
        return count > 0 ? (
          <Tag color="default">{count}</Tag>
        ) : (
          <Text type="secondary">-</Text>
        );
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right' as const,
      render: (_: any, record: Project) => {
        // team_manager 角色在 assigned 或 processing 状态时可以细化/重新细化
        const canRefine = user?.role === 'team_manager' && (record.status === 'assigned' || record.status === 'processing');
        const hasSubtasks = record.subtasks && record.subtasks.length > 0;
        
        return (
          <Space size="small" wrap>
            {canRefine && (
              <Button
                size="small"
                type="primary"
                icon={<EditOutlined />}
                onClick={() => handleRefineClick(record)}
              >
                {record.status === 'assigned' ? '细化' : '重新细化'}
              </Button>
            )}
            {hasSubtasks && (
              <Button
                size="small"
                type="link"
                onClick={() => navigate(`/projects/${record.id}`)}
              >
                查看
              </Button>
            )}
          </Space>
        );
      }
    }
  ];

  // 展开行内容
  const expandable = {
    expandedRowRender: (record: Project) => (
      <div className="expanded-content">
        {record.subtasks && record.subtasks.length > 0 ? (
          <Table
            columns={[
              {
                title: '分配给',
                dataIndex: 'evaluator_name',
                key: 'evaluator_name',
                width: 150,
                render: (name: string) => name || <Text type="secondary">未分配</Text>
              },
              {
                title: '模式',
                dataIndex: 'mode',
                key: 'mode',
                width: 120,
                render: (mode: string) => (
                  <Tag size="small" color="default">
                    {mode === 'by_criteria' ? '按评审项' : '按公司'}
                  </Tag>
                )
              },
              {
                title: '状态',
                dataIndex: 'status',
                key: 'status',
                width: 100,
                render: (status: string) => {
                  const { text, color } = getStatusConfig(status);
                  return <Tag size="small" color={color}>{text}</Tag>;
                }
              },
              {
                title: '分配内容',
                key: 'content',
                width: 150,
                render: (_: any, record: SubTask) => {
                  if (record.mode === 'by_criteria') {
                    return <Text type="secondary">{record.assigned_criteria?.length || 0} 个评审项</Text>;
                  } else {
                    return <Text type="secondary">{record.assigned_documents?.length || 0} 家公司</Text>;
                  }
                }
              },
              {
                title: '总分',
                key: 'total_score',
                width: 100,
                render: (_: any, record: any) => {
                  // record.total_score 可能是 null 或数字
                  if (record.total_score === null || record.total_score === undefined) {
                    return <Text type="secondary">-</Text>;
                  }
                  return <Text strong>{record.total_score} 分</Text>;
                }
              },
              {
                title: '操作',
                key: 'action',
                width: 100,
                render: (_: any, record: SubTask) => (
                  <Button
                    size="small"
                    type="link"
                    onClick={() => navigate(`/my-tasks/${record.id}`)}
                  >
                    查看
                  </Button>
                )
              }
            ]}
            dataSource={record.subtasks}
            rowKey="id"
            pagination={false}
            size="small"
            showHeader={false}
          />
        ) : (
          <Text type="secondary">暂无子任务</Text>
        )}
      </div>
    ),
    rowExpandable: (record: Project) => record.subtasks && record.subtasks.length > 0
  };

  return (
    <AppSidebar pageTitle="我的任务">
      <div className="my-tasks-container">
        {/* 顶部统计卡片 */}
        <Row gutter={[24, 24]} className="stats-row">
          <Col xs={24} sm={12} md={6}>
            <Card className="stat-card">
              <div className="stat-content">
                <div className="stat-icon">
                  <FileTextOutlined />
                </div>
                <div className="stat-info">
                  <Text className="stat-label">全部项目</Text>
                  <Statistic value={stats.total} />
                </div>
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="stat-card">
              <div className="stat-content">
                <div className="stat-icon warning">
                  <ClockCircleOutlined />
                </div>
                <div className="stat-info">
                  <Text className="stat-label">待细化</Text>
                  <Statistic value={stats.assigned} />
                </div>
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="stat-card">
              <div className="stat-content">
                <div className="stat-icon primary">
                  <ThunderboltOutlined />
                </div>
                <div className="stat-info">
                  <Text className="stat-label">进行中</Text>
                  <Statistic value={stats.processing} />
                </div>
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="stat-card">
              <div className="stat-content">
                <div className="stat-icon success">
                  <CheckCircleOutlined />
                </div>
                <div className="stat-info">
                  <Text className="stat-label">已完成</Text>
                  <Statistic value={stats.completed} />
                </div>
              </div>
            </Card>
          </Col>
        </Row>

        {/* 角色提示 */}
        {user?.role === 'team_manager' && stats.assigned > 0 && (
          <Alert
            message={`您有 ${stats.assigned} 个项目待细化`}
            description="请点击【细化】按钮将任务分配给团队成员"
            type="warning"
            showIcon
            closable
            style={{ 
              marginBottom: 24,
              position: 'relative',
              zIndex: 1
            }}
          />
        )}

        {/* 主内容区域 */}
        <Card className="tasks-card">
          <div className="table-header">
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              size="large"
              items={[
                { key: 'all', label: '全部项目' },
                { key: 'assigned', label: '待细化' },
                { key: 'in_progress', label: '进行中' },
                { key: 'completed', label: '已完成' }
              ]}
            />
          </div>

          <Table
            columns={user?.role === 'technical_evaluator' || user?.role === 'business_evaluator' ? expertColumns : columns}
            dataSource={filteredProjects}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 个项目`
            }}
            scroll={{ x: 1200 }}
            expandable={user?.role === 'technical_evaluator' || user?.role === 'business_evaluator' ? undefined : {
              expandedRowRender: expandable.expandedRowRender,
              rowExpandable: expandable.rowExpandable,
            }}
            className="tasks-table"
            keyboard={false}
          />
        </Card>

        {/* 细化弹窗 - 使用新的 TaskRefinementModal 组件 */}
        <TaskRefinementModal
          open={refineModalVisible}
          projectId={selectedProject?.id || 0}
          projectName={selectedProject?.project_name || ''}
          onCancel={() => {
            setRefineModalVisible(false);
            setMemberAssignments({});
            setAssignMode(null);
          }}
          onSuccess={() => {
            setRefineModalVisible(false);
            setMemberAssignments({});
            setAssignMode(null);
            fetchTasks();
          }}
          teamMembers={teamMembers}
          criteriaList={criteria}
          companyList={companies}
          onSubmit={async (mode, assignments) => {
            // 构建后端需要的请求数据
            const teamMembersData = Object.entries(assignments)
              .filter(([_, ids]) => ids.length > 0)
              .map(([evaluatorId, assignment]) => ({
                evaluator_id: parseInt(evaluatorId),
                task_type: 'technical',
                ...(mode === 'by_criteria' 
                  ? { criteria: assignment }
                  : { documents: assignment }
                )
              }));
            
            await apiClient.post(`/api/projects/${selectedProject?.id}/refine`, {
              mode: mode,
              team_members: teamMembersData
            });
          }}
        />
      </div>
    </AppSidebar>
  );
};

export default MyTasks;
