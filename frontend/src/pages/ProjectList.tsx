import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Typography,
  message,
  Modal,
  Input,
  Select,
  Form
} from 'antd';
import {
  PlusOutlined,
  ProjectOutlined,
  TeamOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EyeOutlined,
  DashboardOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { projectApi, teamApi } from '../services/projectApi';
import PackageDispatchModal from '../components/PackageDispatchModal';
import AppSidebar from '../components/AppSidebar';
import axios from 'axios';
import './ProjectList.css';

const { Title, Text } = Typography;
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
  assigned_team?: string;
  created_at: string;
}

const ProjectList: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [createForm, setCreateForm] = useState({
    project_name: '',
    project_type: 'service',
    template_id: undefined
  });
  const [searchText, setSearchText] = useState('');
  const [dispatchModalVisible, setDispatchModalVisible] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

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
      const response = await projectApi.getProjects();
      
      // 数据权限过滤
      let filteredProjects = response.data;
      if (user?.role === 'admin') {
        filteredProjects = response.data;
      } else if (user?.role === 'team_leader' || user?.role === 'team_manager') {
        filteredProjects = response.data;
      } else if (user?.role === 'technical_evaluator' || user?.role === 'business_evaluator') {
        filteredProjects = response.data;
      }
      
      // 获取每个项目的团队分配信息
      const projectsWithTeam = await Promise.all(
        filteredProjects.map(async (project: any) => {
          try {
            const teamResponse = await axios.get(`/api/projects/${project.id}/team-assignment`, {
              headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            const data = teamResponse.data;
            // 使用项目级别的 assigned_team_name
            const assignedTeamName = data.assigned_team_name || (data.packages && data.packages.length > 0 ? 
              (data.packages[0].assigned_team_name || '未分配') : '未分配');
            return {
              ...project,
              assigned_team: assignedTeamName !== '未分配' ? assignedTeamName : project.assigned_team_name || undefined
            };
          } catch (error) {
            return { ...project, assigned_team: project.assigned_team_name || '未分配' };
          }
        })
      );
      
      setProjects(projectsWithTeam);
    } catch (error) {
      message.error('获取项目列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    message.success('已退出登录');
    navigate('/login');
  };

  const handleCreateProject = (values: any) => {
    try {
      projectApi.createProject(values);
      message.success('项目创建成功');
      setIsCreateModalVisible(false);
      setCreateForm({ project_name: '', project_type: 'service', template_id: undefined });
      fetchProjects();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '创建项目失败');
    }
  };

  const handleDeleteProject = (id: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个项目吗？删除后不可恢复！',
      onOk: async () => {
        try {
          await projectApi.deleteProject(id);
          message.success('项目已删除');
          fetchProjects();
        } catch (error) {
          message.error('删除项目失败');
        }
      }
    });
  };

  // 重置项目
  const handleResetProject = async (id: number) => {
    Modal.confirm({
      title: '确认重置项目',
      content: '此操作将清空该项目下所有包的派发记录，任务状态将重置为待派发。已完成的评审结果将保留。确定继续吗？',
      okText: '确认重置',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const token = localStorage.getItem('token');
          await axios.post(`/api/projects/${id}/reset`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          });
          message.success('项目已重置');
          fetchProjects();
        } catch (error: any) {
          message.error(error.response?.data?.detail || '重置失败');
        }
      }
    });
  };

  const getTypeTag = (type: string) => {
    const typeMap: Record<string, [string, string]> = {
      service: ['blue', '服务类'],
      material: ['green', '物资类'],
      engineering: ['orange', '工程类']
    };
    const [color, name] = typeMap[type] || ['default', type];
    return <Tag color={color}>{name}</Tag>;
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, [string, string]> = {
      draft: ['default', '草稿'],
      packaging: ['processing', '分包中'],
      configuring: ['warning', '配置中'],
      assigned: ['blue', '已分派'],
      dispatching: ['blue', '分派中'],
      processing: ['processing', '执行中'],
      evaluating: ['processing', '评审中'],
      completed: ['success', '已完成']
    };
    const [color, name] = statusMap[status] || ['default', status];
    return <Tag color={color}>{name}</Tag>;
  };

  const projectColumns = [
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      className: 'project-name-cell',
      render: (name: string) => (
        <span>{name}</span>
      )
    },
    {
      title: '类型',
      dataIndex: 'project_type',
      key: 'project_type',
      render: (type: string) => getTypeTag(type)
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status)
    },
    {
      title: '分配团队',
      dataIndex: 'assigned_team',
      key: 'assigned_team',
      render: (team: string | undefined) => (
        team && team !== '未分配' ? (
          <Tag color="blue" icon={<TeamOutlined />}>{team}</Tag>
        ) : (
          <Text type="secondary">未分配</Text>
        )
      )
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleDateString('zh-CN')
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Project) => (
        <Space size="small">
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/projects/${record.id}`)}
          >
            详情
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDeleteProject(record.id)}
          >
            删除
          </Button>
        </Space>
      )
    }
  ];

  return (
    <AppSidebar 
      pageTitle="项目管理" 
      userRole={user?.role}
      onLogout={handleLogout}
    >
      <Card>
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
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setIsCreateModalVisible(true)}
            >
              新建项目
            </Button>
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
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`
          }}
        />
      </Card>

      {/* 创建项目弹窗 */}
      <Modal
        title="创建项目"
        open={isCreateModalVisible}
        onCancel={() => setIsCreateModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          layout="vertical"
          style={{ marginTop: 16 }}
          onFinish={handleCreateProject}
          initialValues={createForm}
        >
          <Form.Item
            label="项目名称 *"
            name="project_name"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="请输入项目名称" />
          </Form.Item>

          <Form.Item
            label="项目类型 *"
            name="project_type"
            rules={[{ required: true, message: '请选择项目类型' }]}
          >
            <Select>
              <Option value="service">服务类</Option>
              <Option value="material">物资类</Option>
              <Option value="engineering">工程类</Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="描述"
            name="description"
          >
            <Input.TextArea rows={3} placeholder="输入项目描述（可选）" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setIsCreateModalVisible(false)}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                确定
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 分包与分派弹窗 */}
      {selectedProjectId && (
        <PackageDispatchModal
          projectId={selectedProjectId}
          visible={dispatchModalVisible}
          onClose={() => {
            setDispatchModalVisible(false);
            setSelectedProjectId(null);
          }}
        />
      )}
    </AppSidebar>
  );
};

export default ProjectList;
