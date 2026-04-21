import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Table,
  Tag,
  Space,
  Typography,
  message,
  Modal,
  Form,
  Input,
  Select,
  Divider,
  Switch,
  Tooltip,
  Row,
  Col
} from 'antd';
import { projectApi } from '../services/projectApi';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  TeamOutlined,
  InfoCircleOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons';
import AppSidebar from '../components/AppSidebar';
import './ProjectTypeList.css';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

interface ProjectType {
  id: number;
  type_code: string;
  type_name: string;
  description: string;
  config: any;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface User {
  id: number;
  username: string;
  real_name: string;
  role: string;
}

const defaultProjectTypes = [
  {
    value: 'service',
    label: '服务类',
    icon: '🌐',
    color: '#1890ff',
    desc: '适用于咨询服务、技术服务、运维服务等',
    evalFocus: '技术方案、服务能力、人员资质'
  },
  {
    value: 'material',
    label: '物资类',
    icon: '🛒',
    color: '#52c41a',
    desc: '适用于设备采购、材料采购、办公用品等',
    evalFocus: '产品参数、质量保证、供货能力'
  },
  {
    value: 'engineering',
    label: '工程类',
    icon: '🏗️',
    color: '#faad14',
    desc: '适用于建筑工程、装修工程、安装工程等',
    evalFocus: '施工方案、工程质量、安全措施'
  }
];

const ProjectTypeList: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingType, setEditingType] = useState<ProjectType | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    } else {
      navigate('/login');
    }
    fetchProjectTypes();
  }, [navigate]);

  const fetchProjectTypes = async () => {
    setLoading(true);
    try {
      const response = await projectApi.getProjectTypes();
      setProjectTypes(response.data || []);
    } catch (error) {
      console.log('使用默认项目类型数据');
      setProjectTypes([]);
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

  const handleCreate = () => {
    setEditingType(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record: ProjectType) => {
    setEditingType(record);
    form.setFieldsValue({
      type_code: record.type_code,
      type_name: record.type_name,
      description: record.description,
      is_active: record.is_active,
      sort_order: record.sort_order
    });
    setIsModalVisible(true);
  };

  const handleDelete = (id: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个项目类型吗？删除后无法恢复！',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await projectApi.deleteProjectType(id);
          message.success('删除成功');
          fetchProjectTypes();
        } catch (error: any) {
          message.error(error.response?.data?.detail || '删除失败');
        }
      }
    });
  };

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingType) {
        await projectApi.updateProjectType(editingType.id, values);
        message.success('更新成功');
      } else {
        await projectApi.createProjectType(values);
        message.success('创建成功');
      }
      
      setIsModalVisible(false);
      fetchProjectTypes();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '操作失败');
    }
  };

  const handleToggleStatus = async (record: ProjectType) => {
    try {
      // 暂时使用 PUT 更新状态，等后端支持 PATCH 后再调整
      await projectApi.updateProjectType(record.id, { status: record.status === 'active' ? 'inactive' : 'active' });
      message.success('状态更新成功');
      fetchProjectTypes();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '更新失败');
    }
  };

  const columns = [
    {
      title: '类型代码',
      dataIndex: 'type_code',
      key: 'type_code',
      width: 120,
      render: (code: string) => (
        <Tag color="blue" style={{ fontSize: 12 }}>
          {code}
        </Tag>
      )
    },
    {
      title: '类型名称',
      dataIndex: 'type_name',
      key: 'type_name',
      width: 150,
      render: (name: string, record: ProjectType) => {
        const defaultType = defaultProjectTypes.find(t => t.value === record.type_code);
        return (
          <Space>
            <span style={{ fontSize: 20 }}>{defaultType?.icon || '📋'}</span>
            <Text strong>{name}</Text>
          </Space>
        );
      }
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (desc: string) => (
        <Text type="secondary" style={{ maxWidth: 300 }}>
          {desc || '暂无描述'}
        </Text>
      )
    },
    {
      title: '评审重点',
      dataIndex: 'eval_focus',
      key: 'eval_focus',
      width: 180,
      render: (_: any, record: ProjectType) => {
        const defaultType = defaultProjectTypes.find(t => t.value === record.type_code);
        return (
          <Tooltip title={defaultType?.desc || '暂无说明'}>
            <Tag icon={<InfoCircleOutlined />} color="cyan">
              {defaultType?.evalFocus || '未设置'}
            </Tag>
          </Tooltip>
        );
      }
    },

    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      align: 'center' as const,
      render: (active: boolean) => (
        <Tag icon={active ? <CheckCircleOutlined /> : <CloseCircleOutlined />} 
             color={active ? 'success' : 'default'}>
          {active ? '启用' : '禁用'}
        </Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right' as const,
      render: (_: any, record: ProjectType) => (
        <Space size="small" wrap={false}>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)}
          >
            删除
          </Button>
        </Space>
      )
    }
  ];

  return (
    <AppSidebar 
      pageTitle="项目类型管理" 
      userRole={user?.role}
      onLogout={handleLogout}
    >
      <div style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          {/* 页面标题 */}
          <div style={{ marginBottom: 24 }}>
            <Title level={3} style={{ margin: 0 }}>项目类型管理</Title>
          </div>

          {/* 类型说明卡片 */}
          <Card style={{ marginBottom: 24, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Title level={5} style={{ margin: '0 0 16px 0' }}>
              <Space>
                <InfoCircleOutlined />
                项目类型说明
              </Space>
            </Title>
            <Row gutter={[16, 16]}>
              {defaultProjectTypes.map((type) => (
                <Col xs={24} sm={8} key={type.value}>
                  <Card 
                    style={{ 
                      background: '#fafafa', 
                      border: '1px solid #e8e8e8',
                      height: '100%'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <span style={{ fontSize: 28 }}>{type.icon}</span>
                      <div>
                        <Title level={5} style={{ margin: 0 }}>{type.label}</Title>
                      </div>
                    </div>
                    <Paragraph type="secondary" style={{ fontSize: 13, margin: '0 0 8px 0' }}>
                      {type.desc}
                    </Paragraph>
                    <Divider style={{ margin: '8px 0' }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      评审重点：{type.evalFocus}
                    </Text>
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>

          {/* 项目类型列表 */}
          <Card 
            className="project-type-card" 
            style={{ border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Title level={5} style={{ margin: 0 }}>项目类型列表</Title>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleCreate}
              >
                新建类型
              </Button>
            </div>

            <Table
              columns={columns}
              dataSource={projectTypes}
              rowKey="id"
              loading={loading}
              pagination={{ 
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 条`,
                pageSizeOptions: ['10', '20', '50']
              }}
            />
          </Card>
        </div>
      </div>

      {/* 创建/编辑项目类型弹窗 */}
      <Modal
        title={editingType ? '编辑项目类型' : '新建项目类型'}
        open={isModalVisible}
        onOk={handleFormSubmit}
        onCancel={() => setIsModalVisible(false)}
        okText="确定"
        cancelText="取消"
        width={600}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="type_code"
            label="类型代码"
            rules={[
              { required: true, message: '请输入类型代码' },
              { pattern: /^[a-z_]+$/, message: '只能使用小写字母和下划线' }
            ]}
            extra="例如：service, material, engineering"
          >
            <Input placeholder="请输入类型代码" disabled={!!editingType} />
          </Form.Item>

          <Form.Item
            name="type_name"
            label="类型名称"
            rules={[{ required: true, message: '请输入类型名称' }]}
          >
            <Input placeholder="例如：服务类" />
          </Form.Item>

          <Form.Item
            name="description"
            label="描述"
          >
            <Input.TextArea rows={3} placeholder="输入项目类型描述" />
          </Form.Item>

          <Form.Item
            name="review_focus"
            label="评审重点"
          >
            <Input.TextArea rows={3} placeholder="输入评审重点" />
          </Form.Item>

          <Form.Item
            name="is_active"
            label="状态"
            valuePropName="checked"
          >
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
        </Form>
      </Modal>
    </AppSidebar>
  );
};

export default ProjectTypeList;
