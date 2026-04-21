import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Button, Typography, Table, Modal, Form, Input,
  message, Tag, Space, InputNumber, Divider, Alert,
  Popconfirm, Row, Col
} from 'antd';
import {
  ArrowLeftOutlined, PlusOutlined, DeleteOutlined,
  SaveOutlined, UpOutlined, DownOutlined, FileTextOutlined
} from '@ant-design/icons';
import apiClient from '../services/api';
import AppSidebar from '../components/AppSidebar';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface ReviewItem {
  id?: number;
  item_name: string;
  scoring_criteria: string;
  source_files: string[];
}

const ProjectRuleConfig: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || '0');
  const navigate = useNavigate();

  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form] = Form.useForm();

  // 项目类型（从 URL 或 localStorage 获取）
  const projectType = localStorage.getItem('currentProjectType') || 'service';

  useEffect(() => {
    fetchReviewItems();
  }, [projectId]);

  const fetchReviewItems = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/api/projects/${projectId}/rules`);
      if (response.status === 200) {
        setReviewItems(response.data.rules || []);
      }
    } catch (error: any) {
      console.error('获取评审项失败:', error);
      // 如果项目没有配置规则，返回空数组
      if (error?.response?.status === 404) {
        setReviewItems([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async () => {
    try {
      const values = await form.validateFields();
      const newItem: ReviewItem = {
        item_name: values.item_name,
        scoring_criteria: values.scoring_criteria,
        source_files: values.source_files ? values.source_files.split('\n').filter(f => f.trim()) : [],
      };
      setReviewItems([...reviewItems, newItem]);
      setShowAddForm(false);
      form.resetFields();
      message.success('添加成功');
    } catch (error: any) {
      if (error?.message) {
        message.error(error.message);
      }
    }
  };

  const handleDeleteItem = (index: number) => {
    const newItems = reviewItems.filter((_, i) => i !== index);
    setReviewItems(newItems);
    message.success('删除成功');
  };

  const handleMoveItem = (index: number, direction: 'up' | 'down') => {
    const newItems = [...reviewItems];
    if (direction === 'up' && index > 0) {
      [newItems[index], newItems[index - 1]] = [newItems[index - 1], newItems[index]];
    } else if (direction === 'down' && index < newItems.length - 1) {
      [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
    }
    setReviewItems(newItems);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.post(`/api/projects/${projectId}/rules`, {
        rules: reviewItems,
        project_type: projectType
      });
      message.success('保存成功');
      navigate(`/projects/${projectId}`);
    } catch (error: any) {
      console.error('保存失败:', error);
      message.error(error?.response?.data?.detail || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: '序号',
      dataIndex: 'index',
      key: 'index',
      width: 60,
      render: (_: any, __: any, index: number) => index + 1
    },
    {
      title: '评审项名称',
      dataIndex: 'item_name',
      key: 'item_name'
    },
    {
      title: '评分标准',
      dataIndex: 'scoring_criteria',
      key: 'scoring_criteria',
      ellipsis: true
    },
    {
      title: '绑定文件',
      dataIndex: 'source_files',
      key: 'source_files',
      width: 200,
      render: (files: string[]) => (
        <Space size="small">
          {files?.slice(0, 2).map((file, i) => (
            <Tag key={i} color="default" style={{ fontSize: '12px' }}>
              📎 {file.split('/').pop()}
            </Tag>
          ))}
          {files && files.length > 2 && (
            <Tag color="default">+{files.length - 2}</Tag>
          )}
        </Space>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, __: any, index: number) => (
        <Space size="small">
          <Button 
            size="small" 
            icon={<UpOutlined />} 
            onClick={() => handleMoveItem(index, 'up')}
            disabled={index === 0}
          />
          <Button 
            size="small" 
            icon={<DownOutlined />} 
            onClick={() => handleMoveItem(index, 'down')}
            disabled={index === reviewItems.length - 1}
          />
          <Popconfirm
            title="确定删除该评审项吗？"
            onConfirm={() => handleDeleteItem(index)}
            okText="确定"
            cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <AppSidebar activeKey="rule-config" />
      <div style={{ flex: 1, padding: '24px', background: '#F5F5F5' }}>
        {/* 顶部导航 */}
        <Card bordered={false} style={{ marginBottom: '16px' }}>
          <Space>
            <Button 
              icon={<ArrowLeftOutlined />} 
              onClick={() => navigate(`/projects/${projectId}`)}
            >
              返回
            </Button>
            <Title level={4} style={{ margin: 0 }}>评审规则配置</Title>
          </Space>
        </Card>

        {/* 主内容区 */}
        <Card
          title={
            <Space>
              <FileTextOutlined />
              <span>评审项列表</span>
            </Space>
          }
          extra={
            <Space>
              <Button 
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setShowAddForm(true)}
              >
                添加评审项
              </Button>
              <Button 
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSave}
                loading={saving}
              >
                保存配置
              </Button>
            </Space>
          }
        >
          {/* 添加评审项表单 */}
          {showAddForm && (
            <Card size="small" style={{ marginBottom: '16px' }} title="添加评审项">
              <Form form={form} layout="vertical">
                <Row gutter={16}>
                  <Col span={24}>
                    <Form.Item
                      label="评审项名称"
                      name="item_name"
                      rules={[{ required: true, message: '请输入评审项名称' }]}
                    >
                      <Input placeholder="如：技术方案" />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item
                  label="评分标准"
                  name="scoring_criteria"
                  rules={[{ required: true, message: '请输入评分标准' }]}
                >
                  <TextArea rows={3} placeholder="描述评分标准和要求" />
                </Form.Item>
                <Form.Item
                  label="绑定文件（每行一个）"
                  name="source_files"
                >
                  <TextArea rows={2} placeholder="如：技术文件/技术方案.pdf" />
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    可选。填写标书解析后生成的文件路径
                  </Text>
                </Form.Item>
                <Form.Item>
                  <Space>
                    <Button type="primary" onClick={handleAddItem}>添加</Button>
                    <Button onClick={() => { setShowAddForm(false); form.resetFields(); }}>取消</Button>
                  </Space>
                </Form.Item>
              </Form>
            </Card>
          )}

          {/* 评审项列表 */}
          {reviewItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: '#999' }}>
              <FileTextOutlined style={{ fontSize: '48px', marginBottom: '16px' }} />
              <div>暂无评审项，请添加</div>
            </div>
          ) : (
            <Table
              columns={columns}
              dataSource={reviewItems}
              rowKey={(record, index) => index.toString()}
              pagination={false}
              loading={loading}
            />
          )}
        </Card>
      </div>
    </div>
  );
};

export default ProjectRuleConfig;
