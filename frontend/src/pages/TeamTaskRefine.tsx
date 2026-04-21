import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Tag,
  Space,
  Typography,
  Button,
  message,
  Radio,
  Alert,
  Row,
  Col,
  Modal,
  Steps
} from 'antd';
import {
  TeamOutlined,
  ProjectOutlined,
  EditOutlined,
  CheckCircleOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import apiClient from '../services/api';
import AppSidebar from '../components/AppSidebar';
import BatchAssignmentPanel from '../components/BatchAssignmentPanel';
import './TeamTaskRefine.css';

const { Title, Text } = Typography;

// ==================== 类型定义 ====================

interface Project {
  project_id: number;
  project_name: string;
  assigned_team_id: number;
  assigned_team_name: string;
  status: string;
  assigned_at: string;
  company_count: number;
}

interface TeamMember {
  id: number;
  real_name: string;
  role: string;
}

interface Assignment {
  evaluator_id: number;
  resource_ids: number[];
}

// ==================== 组件实现 ====================

const TeamTaskRefine: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  
  // 状态管理
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedMode, setSelectedMode] = useState<'by_criteria' | 'by_company'>('by_criteria');
  const [showModeSelectModal, setShowModeSelectModal] = useState(false);
  const [showAssignmentPanel, setShowAssignmentPanel] = useState(false);
  const [packageId, setPackageId] = useState<number | null>(null);
  const [assignmentStep, setAssignmentStep] = useState(0);  // 0=选择模式，1=分配任务，2=完成

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    } else {
      navigate('/login');
    }
    fetchAssignedProjects();
    fetchTeamMembers();
  }, [navigate]);

  // 获取分配给当前团队的项目
  const fetchAssignedProjects = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/projects/team-assigned-projects');
      setProjects(response.data.projects || []);
    } catch (error) {
      message.error('获取任务列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取团队成员
  const fetchTeamMembers = async () => {
    try {
      const userData = localStorage.getItem('user');
      if (userData) {
        const currentUser = JSON.parse(userData);
        if (currentUser.team_id) {
          const response = await apiClient.get(`/api/teams/${currentUser.team_id}`);
          setTeamMembers(response.data.members || []);
        }
      }
    } catch (error) {
      console.error('获取团队成员失败:', error);
    }
  };

  // 处理细化点击 - 弹出模式选择弹窗
  const handleRefineClick = async (record: Project) => {
    setSelectedProject(record);
    setPackageId(record.project_id);
    setSelectedMode('by_criteria');  // 默认按评审项
    setAssignmentStep(0);  // 第一步：选择模式
    setShowModeSelectModal(true);
    setShowAssignmentPanel(false);
  };

  // 确认选择模式，进入分配步骤
  const handleModeConfirm = () => {
    setAssignmentStep(1);  // 第二步：分配任务
    setShowModeSelectModal(false);
    // 延迟显示分配面板，确保状态更新
    setTimeout(() => setShowAssignmentPanel(true), 100);
  };

  // 提交成功回调
  const handleAssignmentSubmit = async (assignments: Assignment[]) => {
    try {
      // 转换 assignments 为 refine API 需要的格式
      const team_members = assignments.map(a => ({
        evaluator_id: a.evaluator_id,
        task_type: "technical",  // 默认技术评审，实际应该根据用户角色判断
        [selectedMode === 'by_criteria' ? 'criteria' : 'documents']: a.resource_ids
      }));

      // 调用细化任务 API
      await apiClient.post(`/api/projects/${selectedProject?.project_id}/refine`, {
        mode: selectedMode,
        team_members: team_members
      });

      message.success('任务细化成功');
      setAssignmentStep(2);  // 第三步：完成
      setShowAssignmentPanel(false);
      setSelectedProject(null);
      setPackageId(null);
      fetchAssignedProjects();
      // 跳转到任务执行页面
      navigate(`/projects/${selectedProject?.project_id}`);
    } catch (error: any) {
      console.error('细化任务失败:', error);
      message.error(error?.response?.data?.detail || '细化失败');
    }
  };

  // 取消细化
  const handleCancelRefine = () => {
    setShowModeSelectModal(false);
    setShowAssignmentPanel(false);
    setSelectedProject(null);
    setPackageId(null);
    setAssignmentStep(0);
  };

  // 获取状态标签
  const getStatusTag = (status: string) => {
    const statusConfig: Record<string, [string, string]> = {
      pending: ['default', '待分派'],
      assigned: ['processing', '已分派'],
      in_progress: ['blue', '进行中'],
      completed: ['success', '已完成']
    };
    const [color, text] = statusConfig[status] || ['default', status];
    return <Tag color={color}>{text}</Tag>;
  };

  // 表格列定义
  const columns = [
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 280,
      className: 'project-name-cell',
      render: (name: string) => (
        <span>{name}</span>
      )
    },
    {
      title: '公司数',
      dataIndex: 'company_count',
      key: 'company_count',
      width: 100,
      render: (count: number) => <Text type="secondary">{count} 家</Text>
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => getStatusTag(status)
    },
    {
      title: '分派时间',
      dataIndex: 'assigned_at',
      key: 'assigned_at',
      width: 180,
      render: (date: string) => <Text type="secondary">{date ? new Date(date).toLocaleString() : '-'}</Text>
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: Project) => (
        <Space size="small">
          <Button
            size="small"
            type="primary"
            icon={<EditOutlined />}
            onClick={() => handleRefineClick(record)}
            disabled={record.status !== 'assigned'}
          >
            细化任务
          </Button>
        </Space>
      )
    }
  ];

  // 统计信息
  const totalProjects = projects.length;
  const assignedProjects = projects.filter(p => p.status === 'assigned').length;
  const inProgressProjects = projects.filter(p => p.status === 'in_progress').length;

  return (
    <AppSidebar pageTitle="团队任务">
      <div className="team-task-refine-container">
        {/* 页面标题 */}
        <div className="page-header">
          <Title level={2} className="page-title">
            团队任务
          </Title>
          <Text type="secondary">管理分配给团队的项目</Text>
        </div>

        {/* 统计卡片 */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <Card style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ fontSize: 32, color: '#1890ff', marginRight: 16 }}>
                <ProjectOutlined />
              </div>
              <div>
                <Text type="secondary">总项目</Text>
                <div style={{ fontSize: 24, fontWeight: 'bold' }}>{totalProjects}</div>
              </div>
            </div>
          </Card>
          <Card style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ fontSize: 32, color: '#faad14', marginRight: 16 }}>
                <TeamOutlined />
              </div>
              <div>
                <Text type="secondary">待细化</Text>
                <div style={{ fontSize: 24, fontWeight: 'bold' }}>{assignedProjects}</div>
              </div>
            </div>
          </Card>
          <Card style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ fontSize: 32, color: '#52c41a', marginRight: 16 }}>
                <CheckCircleOutlined />
              </div>
              <div>
                <Text type="secondary">进行中</Text>
                <div style={{ fontSize: 24, fontWeight: 'bold' }}>{inProgressProjects}</div>
              </div>
            </div>
          </Card>
        </div>

        {/* 模式选择弹窗 */}
        <Modal
          title={<Space><EditOutlined /><span>细化任务 - 选择模式</span></Space>}
          open={showModeSelectModal}
          onCancel={handleCancelRefine}
          footer={null}
          width={600}
        >
          <div style={{ padding: '16px 0' }}>
            <Alert
              message={selectedProject?.project_name}
              description="请选择细化模式，将任务分配给团队成员"
              type="info"
              showIcon
              style={{ marginBottom: 24 }}
            />

            <Steps
              current={assignmentStep}
              items={[
                {
                  title: '选择模式',
                  description: '选择分配模式'
                },
                {
                  title: '分配任务',
                  description: '给团队成员分配资源'
                },
                {
                  title: '完成',
                  description: '任务已下发'
                }
              ]}
              style={{ marginBottom: 24 }}
            />

            {assignmentStep === 0 && (
              <div>
                <Text strong style={{ display: 'block', marginBottom: 16 }}>
                  请选择细化模式：
                </Text>
                <Radio.Group
                  value={selectedMode}
                  onChange={(e) => setSelectedMode(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <Radio value="by_criteria" style={{ marginBottom: 16, display: 'block' }}>
                    <Space>
                      <FileTextOutlined />
                      <span>按评审项分配</span>
                    </Space>
                    <Text type="secondary" style={{ marginLeft: 16 }}>
                      将评审项分配给团队成员进行评审
                    </Text>
                  </Radio>
                  <Radio value="by_company" style={{ display: 'block' }}>
                    <Space>
                      <TeamOutlined />
                      <span>按公司分配</span>
                    </Space>
                    <Text type="secondary" style={{ marginLeft: 16 }}>
                      将公司分配给团队成员进行评审
                    </Text>
                  </Radio>
                </Radio.Group>

                <div style={{ marginTop: 32, textAlign: 'right' }}>
                  <Button onClick={handleCancelRefine} style={{ marginRight: 8 }}>
                    取消
                  </Button>
                  <Button type="primary" onClick={handleModeConfirm}>
                    确认并开始分配
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Modal>

        {/* 批量分配面板 */}
        {showAssignmentPanel && packageId && selectedProject && (
          <Card style={{ marginBottom: 16 }} bordered={false}>
            <BatchAssignmentPanel
              packageId={packageId}
              projectId={selectedProject.project_id}
              mode={selectedMode}
              onSubmit={handleAssignmentSubmit}
              useRefineAPI={true}
            />
          </Card>
        )}

        {/* 任务列表 */}
        <Card>
          <Table
            columns={columns}
            dataSource={projects}
            rowKey="project_id"
            loading={loading}
            pagination={{ 
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`
            }}
            locale={{
              emptyText: (
                <div style={{ textAlign: 'center', padding: 48 }}>
                  <TeamOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
                  <Text type="secondary">暂无分配给团队的项目</Text>
                </div>
              )
            }}
          />
        </Card>
      </div>
    </AppSidebar>
  );
};

export default TeamTaskRefine;
