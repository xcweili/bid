import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Tag,
  Space,
  Typography,
  Progress,
  Button,
  Statistic,
  Row,
  Col,
  message
} from 'antd';
import {
  ArrowLeftOutlined,
  TeamOutlined,
  UserOutlined,
  FileTextOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import apiClient from '../services/api';
import AppSidebar from '../components/AppSidebar';

const { Title, Text } = Typography;

interface TaskOverview {
  project_id: number;
  project_name: string;
  companies: Array<{
    company_id: number;
    company_name: string;
    assignments: Array<{
      assignment_id: number;
      evaluator_id: number;
      evaluator_name: string;
      assignment_type: string;
      assigned_criteria: number[];
      status: string;
      progress: number;
    }>;
  }>;
}

const TaskOverview: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || '0');
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);

  const [overview, setOverview] = useState<TaskOverview | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        setUser(JSON.parse(userData));
      } catch (e) {
        console.error('Failed to parse user data:', e);
      }
    }
    fetchOverview();
  }, [projectId]);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      // 获取项目信息
      const projectResponse = await apiClient.get(`/api/projects/${projectId}`);
      
      // 获取分配视图
      const dispatchResponse = await apiClient.get(`/api/assignments/package/${projectId}/full-view`);
      
      setOverview({
        project_id: projectId,
        project_name: projectResponse.data.project_name,
        companies: dispatchResponse.data.companies || []
      });
    } catch (error) {
      console.error('获取任务总览失败:', error);
      message.error('获取任务总览失败');
    } finally {
      setLoading(false);
    }
  };

  const getStatusTag = (status: string) => {
    const statusConfig: Record<string, [string, string]> = {
      pending: ['default', '待开始'],
      in_progress: ['processing', '进行中'],
      completed: ['success', '已完成']
    };
    const [color, text] = statusConfig[status] || ['default', status];
    return <Tag color={color}>{text}</Tag>;
  };

  const getAssignmentTypeTag = (type: string) => {
    const typeConfig: Record<string, [string, string]> = {
      by_package: ['blue', '按包'],
      by_company: ['green', '按公司'],
      by_criteria: ['orange', '按评审项']
    };
    const [color, text] = typeConfig[type] || ['default', type];
    return <Tag color={color}>{text}</Tag>;
  };

  const columns = [
    {
      title: '专家',
      dataIndex: 'evaluator_name',
      key: 'evaluator_name',
      width: 150,
      render: (name: string) => (
        <Space>
          <UserOutlined />
          <span>{name}</span>
        </Space>
      )
    },
    {
      title: '分配类型',
      dataIndex: 'assignment_type',
      key: 'assignment_type',
      width: 100,
      render: (type: string) => getAssignmentTypeTag(type)
    },
    {
      title: '评审项',
      dataIndex: 'assigned_criteria',
      key: 'assigned_criteria',
      width: 100,
      render: (criteria: number[]) => (
        <Tag color="orange">{criteria?.length || 0} 项</Tag>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => getStatusTag(status)
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 150,
      render: (progress: number) => (
        <Progress percent={progress} size="small" status={progress === 100 ? 'success' : 'normal'} />
      )
    }
  ];

  if (!overview) {
    return <div>加载中...</div>;
  }

  // 计算统计信息
  const totalAssignments = overview.companies.reduce(
    (sum, company) => sum + company.assignments.length, 0
  );
  const completedAssignments = overview.companies.reduce(
    (sum, company) => sum + company.assignments.filter(a => a.status === 'completed').length, 0
  );
  const inProgressAssignments = overview.companies.reduce(
    (sum, company) => sum + company.assignments.filter(a => a.status === 'in_progress').length, 0
  );

  return (
    <AppSidebar
      pageTitle="任务总览"
      userRole={user?.role || 'team_leader'}
      onLogout={() => {}}
    >
      <div style={{ padding: 24 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(user?.role === 'technical_evaluator' || user?.role === 'business_evaluator' ? '/my-tasks' : `/projects/${id}`)}
          style={{ marginBottom: 16 }}
        >
          返回
        </Button>

        <Title level={3}>{overview.project_name} - 任务总览</Title>

        {/* 统计卡片 */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="总任务数"
                value={totalAssignments}
                prefix={<FileTextOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="进行中"
                value={inProgressAssignments}
                prefix={<TeamOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="已完成"
                value={completedAssignments}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="完成率"
                value={totalAssignments > 0 ? Math.round((completedAssignments / totalAssignments) * 100) : 0}
                suffix="%"
              />
            </Card>
          </Col>
        </Row>

        {/* 公司列表 */}
        {overview.companies.map(company => (
          <Card key={company.company_id} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Title level={5}>
                <TeamOutlined /> {company.company_name}
              </Title>
              <Text type="secondary">{company.assignments.length} 个任务</Text>
            </div>

            <Table
              columns={columns}
              dataSource={company.assignments}
              rowKey="assignment_id"
              pagination={false}
              size="small"
              locale={{ emptyText: '暂无分配任务' }}
            />
          </Card>
        ))}
      </div>
    </AppSidebar>
  );
};

export default TaskOverview;
