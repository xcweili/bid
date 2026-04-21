import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Table,
  Tag,
  Space,
  Typography,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  message,
  Divider,
  Tabs
} from 'antd';
import {
  ArrowLeftOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ImportOutlined
} from '@ant-design/icons';
import apiClient from '../services/api';
import './CriteriaManagement.css';

const { Title, Text } = Typography;
const { Option } = Select;

interface Criteria {
  id: number;
  criteria_name: string;
  criteria_type: string;
  max_score: number;
  scoring_criteria: string;
  created_at: string;
}

const CriteriaManagement: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const packageId = parseInt(id || '0');

  const [criteriaList, setCriteriaList] = useState<Criteria[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingCriteria, setEditingCriteria] = useState<Criteria | null>(null);
  const [form] = Form.useForm();

  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  useEffect(() => {
    fetchCriteria();
  }, [packageId]);

  const fetchCriteria = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/api/criteria/package/${packageId}`);
      setCriteriaList(response.data);
    } catch (error) {
      message.error('获取评审项失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingCriteria(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record: Criteria) => {
    setEditingCriteria(record);
    form.setFieldsValue(record);
    setIsModalVisible(true);
  };

  const handleDelete = (id: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个评审项吗？',
      onOk: async () => {
        try {
          await apiClient.delete(`/api/criteria/${id}`);
          message.success('删除成功');
          fetchCriteria();
        } catch (error) {
          message.error('删除失败');
        }
      }
    });
  };

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingCriteria) {
        await apiClient.put(`/api/criteria/${editingCriteria.id}`, values);
        message.success('更新成功');
      } else {
        await apiClient.post('/api/criteria', {
          ...values,
          package_id: packageId
        });
        message.success('创建成功');
      }
      
      setIsModalVisible(false);
      fetchCriteria();
    } catch (error: any) {
      if (error.response?.data?.detail) {
        message.error(error.response.data.detail);
      } else {
        message.error('操作失败');
      }
    }
  };

  const handleLoadFromTemplate = async () => {
    try {
      await apiClient.post(`/api/criteria/package/${packageId}/from-template?template_type=${selectedTemplate}`);
      message.success('从模板加载成功');
      setTemplateModalVisible(false);
      fetchCriteria();
    } catch (error) {
      message.error('加载模板失败');
    }
  };

  const columns = [
    {
      title: '评审项名称',
      dataIndex: 'criteria_name',
      key: 'criteria_name'
    },
    {
      title: '类型',
      dataIndex: 'criteria_type',
      key: 'criteria_type',
      render: (type: string) => (
        <Tag color={type === 'technical' ? 'blue' : 'green'}>
          {type === 'technical' ? '技术' : '商务'}
        </Tag>
      )
    },
    {
      title: '满分',
      dataIndex: 'max_score',
      key: 'max_score',
      align: 'center' as const
    },
    {
      title: '评审标准',
      dataIndex: 'scoring_criteria',
      key: 'scoring_criteria',
      ellipsis: true
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Criteria) => (
        <Space size="small">
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

  const tabs = [
    {
      key: 'all',
      label: '全部评审项',
      children: <Table columns={columns} dataSource={criteriaList} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} />
    },
    {
      key: 'technical',
      label: '技术评审项',
      children: <Table columns={columns} dataSource={criteriaList.filter(c => c.criteria_type === 'technical')} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} />
    },
    {
      key: 'business',
      label: '商务评审项',
      children: <Table columns={columns} dataSource={criteriaList.filter(c => c.criteria_type === 'business')} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} />
    }
  ];

  return (
    <div className="criteria-management">
      <div className="page-header">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/projects')}>
          返回
        </Button>
        <div className="header-content">
          <Title level={4} style={{ margin: 0 }}>评审项管理</Title>
          <Text type="secondary"> - 包 ID: {packageId}</Text>
        </div>
      </div>

      <Card className="criteria-card">
        <div className="card-header">
          <Title level={5}>评审项列表</Title>
          <Space>
            <Button
              icon={<ImportOutlined />}
              onClick={() => setTemplateModalVisible(true)}
            >
              从模板加载
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreate}
            >
              新增评审项
            </Button>
          </Space>
        </div>

        <Divider />

        <Tabs items={tabs} />
      </Card>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingCriteria ? '编辑评审项' : '新增评审项'}
        open={isModalVisible}
        onOk={handleFormSubmit}
        onCancel={() => setIsModalVisible(false)}
        okText="确定"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="criteria_name"
            label="评审项名称"
            rules={[{ required: true, message: '请输入评审项名称' }]}
          >
            <Input placeholder="例如：技术方案" />
          </Form.Item>

          <Form.Item
            name="criteria_type"
            label="评审类型"
            rules={[{ required: true, message: '请选择评审类型' }]}
          >
            <Select>
              <Option value="technical">技术评审</Option>
              <Option value="business">商务评审</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="max_score"
            label="满分"
            rules={[{ required: true, message: '请输入满分' }]}
          >
            <InputNumber min={0} max={1000} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="scoring_criteria"
            label="评审标准"
            rules={[{ required: true, message: '请输入评审标准' }]}
          >
            <Input.TextArea rows={4} placeholder="输入详细的评审标准" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 模板选择弹窗 */}
      <Modal
        title="从模板加载评审项"
        open={templateModalVisible}
        onOk={handleLoadFromTemplate}
        onCancel={() => setTemplateModalVisible(false)}
        okText="加载"
        cancelText="取消"
      >
        <div style={{ padding: '16px 0' }}>
          <Text>选择模板类型：</Text>
          <Select
            value={selectedTemplate}
            onChange={setSelectedTemplate}
            style={{ width: '100%', marginTop: 8 }}
            placeholder="请选择模板"
          >
            <Option value="service">服务类模板</Option>
            <Option value="material">物资类模板</Option>
            <Option value="engineering">工程类模板</Option>
          </Select>
        </div>
      </Modal>
    </div>
  );
};

export default CriteriaManagement;
