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
  InputNumber,
  Divider
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ImportOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import apiClient from '../services/api';
import AppSidebar from '../components/AppSidebar';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface RuleTemplate {
  id: number;
  template_name: string;
  project_type: string;
  description: string;
  config: any;
  created_at: string;
}

const RuleTemplateList: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [templates, setTemplates] = useState<RuleTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    } else {
      navigate('/login');
    }
    fetchTemplates();
  }, [navigate]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/rule-templates');
      setTemplates(response.data);
    } catch (error) {
      message.error('获取模板列表失败');
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
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      await apiClient.post('/api/rule-templates', {
        template_name: values.template_name,
        project_type: values.project_type,
        description: values.description,
        config: {
          items: []
        }
      });
      message.success('模板创建成功');
      setIsModalVisible(false);
      fetchTemplates();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '创建失败');
    }
  };

  const handleDelete = (id: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个模板吗？',
      onOk: async () => {
        try {
          await apiClient.delete(`/api/rule-templates/${id}`);
          message.success('删除成功');
          fetchTemplates();
        } catch (error) {
          message.error('删除失败');
        }
      }
    });
  };

  const columns = [
    {
      title: '模板名称',
      dataIndex: 'template_name',
      key: 'template_name',
      width: 120
    },
    {
      title: '项目类型',
      dataIndex: 'project_type',
      key: 'project_type',
      width: 100,
      render: (type: string) => {
        const typeMap: Record<string, [string, string]> = {
          service: ['blue', '服务类'],
          material: ['green', '物资类'],
          engineering: ['orange', '工程类']
        };
        const [color, name] = typeMap[type] || ['default', type];
        return <Tag color={color}>{name}</Tag>;
      }
    },
    {
      title: '评审项数量',
      dataIndex: 'config',
      key: 'config',
      width: 100,
      render: (config: any, record: RuleTemplate) => {
        const items = Array.isArray(config) ? config : (config?.items || []);
        return (
          <Tag color="blue" icon={<FileTextOutlined />}>
            {items.length} 项
          </Tag>
        );
      }
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      width: 160
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 90,
      render: (date: string) => date ? new Date(date).toLocaleDateString('zh-CN') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: any, record: RuleTemplate) => (
        <Space size="small">
          <Button
            size="small"
            icon={<ImportOutlined />}
            onClick={() => navigate(`/rule-templates/${record.id}`)}
          >
            查看
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
      pageTitle="规则模板管理" 
      userRole={user?.role}
      userId={user?.id}
      onLogout={handleLogout}
    >
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={5} style={{ margin: 0 }}>模板列表</Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleCreate}
          >
            新建模板
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={templates}
          rowKey="id"
          loading={loading}
          pagination={{ 
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`
          }}
        />
      </Card>

      {/* 创建模板弹窗 */}
      <Modal
        title="新建模板"
        open={isModalVisible}
        onOk={handleFormSubmit}
        onCancel={() => setIsModalVisible(false)}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="template_name"
            label="模板名称"
            rules={[{ required: true, message: '请输入模板名称' }]}
          >
            <Input placeholder="例如：服务类评审模板" />
          </Form.Item>

          <Form.Item
            name="project_type"
            label="项目类型"
            rules={[{ required: true, message: '请选择项目类型' }]}
          >
            <Select>
              <Option value="service">服务类</Option>
              <Option value="material">物资类</Option>
              <Option value="engineering">工程类</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="description"
            label="描述"
          >
            <TextArea rows={3} placeholder="输入模板描述" />
          </Form.Item>
        </Form>
      </Modal>
    </AppSidebar>
  );
};

export default RuleTemplateList;
