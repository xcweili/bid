import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Typography, Table, Tag, Button, Space, message,
  Modal, Input, Row, Col, Statistic, Empty, Tooltip
} from 'antd';
import {
  PlusOutlined, EyeOutlined, EditOutlined, DeleteOutlined,
  FolderOpenOutlined, InboxOutlined, BankOutlined,
  ReloadOutlined, RightOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;

interface Bidder {
  id: number;
  company_name: string;
  social_credit_code: string;
}

interface Package {
  id: number;
  section_id: number;
  package_no: string;
  status: string;
  bidder_count: number;
  bidders: Bidder[];
}

interface Section {
  id: number;
  project_id: number;
  section_code: string;
  section_name: string;
  package_count: number;
  packages: Package[];
}

interface Project {
  id: number;
  project_code: string;
  project_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  section_count: number;
  sections: Section[];
}

const ProjectList: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProject, setNewProject] = useState({ code: '', name: '' });

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/projects');
      const data = await response.json();
      setProjects(data);
    } catch (error) {
      message.error('获取项目列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProject.code.trim() || !newProject.name.trim()) {
      message.warning('请填写项目编号和名称');
      return;
    }
    try {
      const response = await fetch('/api/import-project-bid-structure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projects: [{
            project_code: newProject.code,
            project_name: newProject.name,
            sections: []
          }]
        })
      });
      const result = await response.json();
      if (result.code === 0) {
        message.success('项目创建成功');
        setShowCreateModal(false);
        setNewProject({ code: '', name: '' });
        fetchProjects();
      } else {
        message.error('创建失败');
      }
    } catch (error) {
      message.error('创建失败');
    }
  };

  const handleDeleteProject = async (projectId: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该项目吗？所有关联的标段、包和投标人信息都将被删除！',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await fetch(`/api/projects/${projectId}`, {
            method: 'DELETE'
          });
          message.success('项目已删除');
          fetchProjects();
        } catch (error) {
          message.error('删除失败');
        }
      }
    });
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; text: string }> = {
      pending: { color: 'default', text: '待处理' },
      processing: { color: 'processing', text: '评审中' },
      completed: { color: 'success', text: '已完成' },
    };
    return configs[status] || configs.pending;
  };

  const filteredProjects = projects.filter(project =>
    project.project_name.toLowerCase().includes(searchText.toLowerCase()) ||
    project.project_code.toLowerCase().includes(searchText.toLowerCase())
  );

  const columns = [
    {
      title: '项目编号',
      dataIndex: 'project_code',
      key: 'project_code',
      width: 150,
      render: (code: string) => <Tag color="blue">{code}</Tag>
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 300,
      render: (name: string, record: Project) => (
        <a 
          onClick={() => navigate(`/projects/${record.id}`)}
          style={{ cursor: 'pointer', color: '#1890ff' }}
        >
          {name}
        </a>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const config = getStatusConfig(status);
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '标段数',
      dataIndex: 'section_count',
      key: 'section_count',
      width: 100,
      render: (count: number) => (
        <Statistic value={count} suffix="个" />
      )
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (time: string) => time ? new Date(time).toLocaleString('zh-CN') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right' as const,
      render: (_: any, record: Project) => (
        <Space>
          <Tooltip title="查看详情">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/projects/${record.id}`)}
            >
              查看
            </Button>
          </Tooltip>
          <Tooltip title="删除项目">
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDeleteProject(record.id)}
            >
              删除
            </Button>
          </Tooltip>
        </Space>
      )
    }
  ];

  const stats = [
    { title: '项目总数', value: projects.length, icon: <BankOutlined />, color: '#1890ff' },
    { title: '标段总数', value: projects.reduce((sum, p) => sum + p.section_count, 0), icon: <FolderOpenOutlined />, color: '#52c41a' },
    { title: '包总数', value: projects.reduce((sum, p) => sum + p.sections.reduce((s, sec) => s + sec.package_count, 0), 0), icon: <InboxOutlined />, color: '#faad14' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>
          <BankOutlined /> 项目管理
        </Title>
        <Text type="secondary" style={{ marginLeft: 12 }}>
          管理项目、标段和包的层级结构
        </Text>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        {stats.map((stat, index) => (
          <Col span={8} key={index}>
            <Card>
              <Statistic
                title={stat.title}
                value={stat.value}
                prefix={<span style={{ color: stat.color }}>{stat.icon}</span>}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        extra={
          <Space>
            <Input.Search
              placeholder="搜索项目"
              allowClear
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 300 }}
            />
            <Button
              type="primary"
              size="large"
              icon={<PlusOutlined />}
              onClick={() => setShowCreateModal(true)}
            >
              新建项目
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={filteredProjects}
          loading={loading}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个项目`
          }}
          scroll={{ x: 1000 }}
          locale={{ emptyText: (
            <div style={{ padding: '40px 0' }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <div>
                    <Text type="secondary">暂无项目</Text>
                    <div style={{ marginTop: 12 }}>
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setShowCreateModal(true)}
                      >
                        创建第一个项目
                      </Button>
                    </div>
                  </div>
                }
              />
            </div>
          )}}
        />
      </Card>

      <Modal
        title={<span><PlusOutlined /> 新建项目</span>}
        open={showCreateModal}
        onOk={handleCreateProject}
        onCancel={() => {
          setShowCreateModal(false);
          setNewProject({ code: '', name: '' });
        }}
        okText="创建"
        cancelText="取消"
        width={520}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Input
            placeholder="项目编号（如：XM2026-001）"
            value={newProject.code}
            onChange={(e) => setNewProject({ ...newProject, code: e.target.value })}
            autoFocus
            size="large"
          />
          <Input
            placeholder="项目名称"
            value={newProject.name}
            onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
            size="large"
          />
        </Space>
      </Modal>
    </div>
  );
};

export default ProjectList;