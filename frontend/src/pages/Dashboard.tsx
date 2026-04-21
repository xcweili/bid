import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Button,
  Tag,
  Space,
  Typography,
  message,
  Modal,
  Input,
  Select,
  Form,
  Empty,
  Spin
} from 'antd';
import {
  PlusOutlined,
  ProjectOutlined,
  TeamOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DashboardOutlined
} from '@ant-design/icons';
import apiClient from '../services/api';
import AppSidebar from '../components/AppSidebar';
import './Dashboard.css';

const { Text } = Typography;

const { Title } = Typography;
const { Option } = Select;

interface User {
  id: number;
  username: string;
  real_name: string;
  role: string;
}

interface Project {
  id: number;
  project_name: string;
  project_type: string;
  status: string;
  total_packages: number;
  total_companies?: number;
  total_rules?: number;  // 项目配置的评审项总数
  created_at: string;
  companies?: Company[];
}

interface Company {
  id: number;
  company_name: string;
  status: string;
  total_score?: number | null;
  file_count?: number;
}

interface RuleScore {
  rule_name: string;
  item_name: string;
  score: number;
  max_score: number;
  reason: string;
  evidence: string;
}

interface CompanyResult {
  id: number;
  company_name: string;
  total_score: number | null;
  rule_scores: RuleScore[];
  status: string;
}

const roleNames: Record<string, string> = {
  admin: '系统管理员',
  team_leader: '评标组长',
  team_manager: '团队负责人',
  technical_evaluator: '技术评审员',
  business_evaluator: '商务评审员'
};

const roleColors: Record<string, string> = {
  admin: 'red',
  team_leader: 'orange',
  team_manager: 'blue',
  technical_evaluator: 'purple',
  business_evaluator: 'volcano'
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [companyScores, setCompanyScores] = useState<Record<number, CompanyResult>>({});
  const [companyScoresLoading, setCompanyScoresLoading] = useState<Record<number, boolean>>({});
  const [expandedCompanies, setExpandedCompanies] = useState<Record<number, Company[]>>({});
  const [expandedCompaniesLoading, setExpandedCompaniesLoading] = useState<Record<number, boolean>>({});
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
  const [scoreModalVisible, setScoreModalVisible] = useState(false);
  const [currentScoreData, setCurrentScoreData] = useState<CompanyResult | null>(null);
  const [currentScoreCompanyName, setCurrentScoreCompanyName] = useState('');
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [createForm, setCreateForm] = useState({
    project_name: '',
    project_type: 'service'
  });
  const [searchText, setSearchText] = useState('');
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    } else {
      navigate('/login');
    }
    fetchProjects();
  }, [navigate]);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/projects');
      
      // 后端已经根据角色过滤了，前端直接使用结果
      setProjects(response.data);
    } catch (error) {
      console.error('获取项目列表失败', error);
    } finally {
      setLoading(false);
    }
  };

  // 加载公司数据
  const loadProjectCompanies = async (projectId: number) => {
    if (expandedCompanies[projectId]) {
      return;
    }
    
    setExpandedCompaniesLoading(prev => ({ ...prev, [projectId]: true }));
    try {
      const response = await apiClient.get(`/api/projects/${projectId}/companies`);
      const companies = response.data.companies || [];
      setExpandedCompanies(prev => ({ ...prev, [projectId]: companies }));
    } catch (error) {
      console.error('获取公司列表失败', error);
      setExpandedCompanies(prev => ({ ...prev, [projectId]: [] }));
    } finally {
      setExpandedCompaniesLoading(prev => ({ ...prev, [projectId]: false }));
    }
  };

  // 处理详情按钮点击
  const handleViewDetails = async (projectId: number) => {
    if (expandedRowId === projectId) {
      // 如果已经展开，则收起
      setExpandedRowId(null);
    } else {
      // 否则展开这一行
      setExpandedRowId(projectId);
      await loadProjectCompanies(projectId);
    }
  };

  // 获取公司评分详情
  const fetchCompanyScores = async (companyId: number) => {
    if (companyScores[companyId]) {
      return companyScores[companyId];
    }
    
    setCompanyScoresLoading(prev => ({ ...prev, [companyId]: true }));
    try {
      const response = await apiClient.get(`/api/evaluation/company/${companyId}/result`);
      setCompanyScores(prev => ({ ...prev, [companyId]: response.data }));
      return response.data;
    } catch (error) {
      console.error('获取公司评分失败', error);
      return null;
    } finally {
      setCompanyScoresLoading(prev => ({ ...prev, [companyId]: false }));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    message.success('已退出登录');
    navigate('/login');
  };

  const handleCreateProject = () => {
    setIsCreateModalVisible(true);
  };

  const handleCreateProjectSubmit = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/projects', 
        { project_name: createForm.project_name, project_type: createForm.project_type },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success('项目创建成功');
      setIsCreateModalVisible(false);
      setCreateForm({ project_name: '', project_type: 'service' });
      fetchProjects();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '创建项目失败');
    }
  };

  // 统计数字
  const totalProjects = projects.length;
  const activeProjects = projects.filter(p => p.status === 'evaluating' || p.status === 'processing').length;
  const completedProjects = projects.filter(p => p.status === 'completed').length;
  
  // team_manager 角色的额外统计
  const teamManagerStats = user?.role === 'team_manager' ? {
    totalTasks: projects.length,
    assignedTasks: projects.filter(p => p.status === 'assigned').length,
    inProgressTasks: projects.filter(p => p.status === 'processing').length
  } : null;

  // 项目类型标签
  const getTypeTag = (type: string) => {
    const typeMap: Record<string, [string, string]> = {
      service: ['blue', '服务类'],
      material: ['green', '物资类'],
      engineering: ['orange', '工程类']
    };
    const [color, name] = typeMap[type] || ['default', type];
    return <Tag color={color}>{name}</Tag>;
  };

  // 状态标签
  const getStatusTag = (status: string) => {
    const statusMap: Record<string, [string, string]> = {
      draft: ['default', '草稿'],
      packaging: ['processing', '分包中'],
      dispatching: ['blue', '分派中'],
      evaluating: ['processing', '评审中'],
      completed: ['success', '已完成']
    };
    const [color, name] = statusMap[status] || ['default', status];
    return <Tag color={color}>{name}</Tag>;
  };

  // 项目列表表格
  const projectColumns = [
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 200
    },
    {
      title: '类型',
      dataIndex: 'project_type',
      key: 'project_type',
      width: 100,
      render: (type: string) => getTypeTag(type)
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => getStatusTag(status)
    },
    {
      title: '评审项数',
      dataIndex: 'total_rules',
      key: 'total_rules',
      width: 100,
      render: (count: number) => (
        count !== null && count !== undefined && count > 0 ? (
          <Tag color="blue">{count}</Tag>
        ) : (
          <Text type="secondary">-</Text>
        )
      )
    },
    {
      title: '分派团队',
      dataIndex: 'assigned_team_name',
      key: 'assigned_team_name',
      width: 150,
      render: (team: string) => team ? <Tag icon={<TeamOutlined />}>{team}</Tag> : '-'
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (date: string) => new Date(date).toLocaleDateString('zh-CN')
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: Project) => (
        <Space size="small">
          {user?.role === 'team_manager' && record.status === 'assigned' && (
            <Button
              size="small"
              type="primary"
              onClick={() => navigate('/my-tasks')}
            >
              细化
            </Button>
          )}
          <Button
            size="small"
            onClick={() => handleViewDetails(record.id)}
          >
            {expandedRowId === record.id ? '收起' : '展开'}
          </Button>
        </Space>
      )
    }
  ];

  // 展开行渲染 - 显示公司信息（只在当前展开的 ID 匹配时显示）
  const expandedRowRender = (record: Project) => {
    // 如果不是当前展开的行，返回 null
    if (expandedRowId !== record.id) {
      return null;
    }
    
    const companies = expandedCompanies[record.id] || [];
    const loading = expandedCompaniesLoading[record.id] || false;
    
    if (loading) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Spin tip="加载公司数据..." />
        </div>
      );
    }
    
    if (companies.length === 0) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Empty description="暂无公司数据" />
        </div>
      );
    }
    
    return (
      <div style={{ padding: 16 }}>
        <Table
          columns={[
            {
              title: '公司名称',
              dataIndex: 'company_name',
              key: 'company_name',
              width: 200
            },
            {
              title: '文件数',
              dataIndex: 'file_count',
              key: 'file_count',
              width: 100,
              render: (count: number) => (
                <Text strong>{count || 0}</Text>
              )
            },
            {
              title: '总分',
              dataIndex: 'total_score',
              key: 'total_score',
              width: 120,
              render: (score: number | null, record: Company) => (
                score !== null && score !== undefined ? (
                  <Tag color={score >= 80 ? 'green' : score >= 60 ? 'orange' : 'red'}>
                    {score.toFixed(1)} 分
                  </Tag>
                ) : (
                  <Text type="secondary">未评分</Text>
                )
              )
            },
            {
              title: '操作',
              key: 'action',
              width: 120,
              render: (_: any, record: Company) => (
                <Button
                  size="small"
                  disabled={record.total_score === null || record.total_score === undefined}
                  onClick={async () => {
                    const scoreData = await fetchCompanyScores(record.id);
                    if (scoreData) {
                      setCurrentScoreData(scoreData);
                      setCurrentScoreCompanyName(record.company_name);
                      setScoreModalVisible(true);
                    } else {
                      message.info('暂无详细评分信息');
                    }
                  }}
                >
                  查看评分
                </Button>
              )
            }
          ]}
          dataSource={companies}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </div>
    );
  };

  return (
    <AppSidebar 
      pageTitle="仪表盘" 
      userRole={user?.role}
      onLogout={handleLogout}
    >
      <div className="dashboard-container">
        {/* 统计卡片 */}
        <Row gutter={[16, 16]} className="stat-row">
          {user?.role === 'team_manager' && teamManagerStats ? (
            // team_manager 角色的统计
            <>
              <Col xs={24} sm={12} md={8}>
                <Card>
                  <Statistic
                    title="团队任务"
                    value={teamManagerStats.totalTasks}
                    prefix={<ProjectOutlined />}
                    valueStyle={{ color: '#1890ff' }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Card>
                  <Statistic
                    title="待细化"
                    value={teamManagerStats.assignedTasks}
                    prefix={<ClockCircleOutlined />}
                    valueStyle={{ color: '#faad14' }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Card>
                  <Statistic
                    title="执行中"
                    value={teamManagerStats.inProgressTasks}
                    prefix={<FileTextOutlined />}
                    valueStyle={{ color: '#52c41a' }}
                  />
                </Card>
              </Col>
            </>
          ) : (
            // 其他角色的统计
            <>
              <Col xs={24} sm={12} md={8}>
                <Card>
                  <Statistic
                    title="总项目数"
                    value={totalProjects}
                    prefix={<ProjectOutlined />}
                    valueStyle={{ color: '#1890ff' }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Card>
                  <Statistic
                    title="进行中"
                    value={activeProjects}
                    prefix={<ClockCircleOutlined />}
                    valueStyle={{ color: '#faad14' }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Card>
                  <Statistic
                    title="已完成"
                    value={completedProjects}
                    prefix={<CheckCircleOutlined />}
                    valueStyle={{ color: '#52c41a' }}
                  />
                </Card>
              </Col>
            </>
          )}
        </Row>

        {/* 快捷操作 - 仅 admin 和 team_leader 可见 */}
        {(user?.role === 'admin' || user?.role === 'team_leader') && (
          <Card className="quick-actions" style={{ marginTop: 16, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Title level={5} style={{ margin: 0 }}>快捷操作</Title>
            </div>
            <Space wrap size="large">
              <Button 
                type="primary" 
                icon={<PlusOutlined />} 
                onClick={() => navigate('/projects/create')}
                size="large"
                style={{ 
                  background: '#1890ff', 
                  borderColor: '#1890ff',
                  minWidth: 120
                }}
              >
                新建项目
              </Button>
              <Button 
                icon={<ProjectOutlined />} 
                onClick={() => navigate('/projects')}
                size="large"
                style={{ 
                  background: '#e6f7ff', 
                  borderColor: '#91d5ff',
                  color: '#1890ff',
                  minWidth: 120
                }}
              >
                管理项目
              </Button>
              <Button 
                icon={<TeamOutlined />} 
                onClick={() => navigate('/teams')}
                size="large"
                style={{ 
                  background: '#f6ffed', 
                  borderColor: '#b7eb8f',
                  color: '#52c41a',
                  minWidth: 120
                }}
              >
                管理团队
              </Button>
              <Button 
                icon={<DashboardOutlined />} 
                onClick={() => navigate('/rule-templates')}
                size="large"
                style={{ 
                  background: '#fff7e6', 
                  borderColor: '#ffd591',
                  color: '#fa8c16',
                  minWidth: 120
                }}
              >
                规则模板
              </Button>
            </Space>
          </Card>
        )}

        {/* 项目列表 */}
        <Card className="projects-card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <Title level={5}>项目列表</Title>
            <Space>
              <Input.Search
                placeholder="搜索项目名称"
                style={{ width: 200 }}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
              />
            </Space>
          </div>

          <Table
            columns={projectColumns}
            dataSource={projects.filter(p => 
              p.project_name.toLowerCase().includes(searchText.toLowerCase())
            )}
            rowKey="id"
            loading={loading}
            pagination={{ 
              pageSize,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              pageSizeOptions: ['10', '20', '50', '100']
            }}
            expandable={{
              expandedRowRender: expandedRowRender,
              expandedRowKeys: expandedRowId ? [expandedRowId] : [],
              defaultExpandAllRows: false,
              expandIcon: ({ expanded, onExpand, record }) => null  // 隐藏默认展开图标
            }}
          />
        </Card>
      </div>

      {/* 创建项目弹窗 */}
      <Modal
        title="创建项目"
        open={isCreateModalVisible}
        onOk={handleCreateProjectSubmit}
        onCancel={() => setIsCreateModalVisible(false)}
        okText="创建"
        cancelText="取消"
        width={700}
      >
        <Form
          layout="vertical"
          style={{ marginTop: 16 }}
          onFinish={handleCreateProjectSubmit}
        >
          <Form.Item
            label="项目名称 *"
            name="project_name"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="例如：2024 年 XX 单位信息化建设项目" size="large" />
          </Form.Item>

          <Form.Item
            label="项目类型 *"
            name="project_type"
            rules={[{ required: true, message: '请选择项目类型' }]}
          >
            <Select 
              size="large"
              placeholder="请选择项目类型"
            >
              <Option value="service">服务类</Option>
              <Option value="material">物资类</Option>
              <Option value="engineering">工程类</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* 评分详情弹窗 */}
      <Modal
        title={`${currentScoreCompanyName} - 评审得分详情`}
        open={scoreModalVisible}
        onCancel={() => setScoreModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setScoreModalVisible(false)}>
            关闭
          </Button>
        ]}
        width={900}
      >
        {currentScoreData && (
          <div>
            {/* 总分概览 */}
            <Card style={{ marginBottom: 16 }}>
              <Statistic
                title="总分"
                value={currentScoreData.total_score || 0}
                suffix="分"
                valueStyle={{ 
                  color: (currentScoreData.total_score || 0) >= 80 ? '#52c41a' : 
                         (currentScoreData.total_score || 0) >= 60 ? '#faad14' : '#ff4d4f'
                }}
              />
            </Card>
            
            {/* 分项得分表格 */}
            <Table
              dataSource={currentScoreData.rule_scores || []}
              columns={[
                { 
                  title: '评审项', 
                  dataIndex: 'item_name', 
                  key: 'item_name',
                  width: 250,
                  render: (text: string) => <Text strong>{text}</Text>
                },
                { 
                  title: '得分', 
                  dataIndex: 'score', 
                  key: 'score',
                  width: 120,
                  render: (score: number, record: any) => (
                    <Tag 
                      color={score >= 80 ? 'green' : score >= 60 ? 'orange' : 'red'}
                      icon={<CheckCircleOutlined />}
                    >
                      {score} 分
                    </Tag>
                  )
                },
                { 
                  title: '满分', 
                  dataIndex: 'max_score', 
                  key: 'max_score',
                  width: 100,
                  render: (score: number) => <Text type="secondary">{score} 分</Text>
                },
                { 
                  title: '评分理由', 
                  dataIndex: 'reason', 
                  key: 'reason',
                  render: (text: string) => <Text style={{ fontSize: 13 }}>{text || '-'}</Text>
                }
              ]}
              pagination={false}
              size="middle"
              locale={{ emptyText: '暂无评分数据' }}
            />
          </div>
        )}
      </Modal>
    </AppSidebar>
  );
};

export default Dashboard;
