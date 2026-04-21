import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Form,
  Input,
  Select,
  message,
  Divider,
  Typography,
  Row,
  Col,
  Tooltip,
  Space
} from 'antd';
import {
  ArrowLeftOutlined,
  PlusOutlined,
  GlobalOutlined,
  ShoppingOutlined,
  BuildOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import apiClient from '../services/api';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

const ProjectCreate: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      
      await apiClient.post('/api/projects', {
        project_name: values.project_name,
        project_type: values.project_type
      });
      
      message.success('项目创建成功！');
      navigate('/projects');
    } catch (error: any) {
      message.error(error.response?.data?.detail || '创建失败');
    } finally {
      setLoading(false);
    }
  };

  const projectTypeOptions = [
    {
      value: 'service',
      label: '服务类',
      icon: <GlobalOutlined />,
      color: '#1890ff',
      desc: '适用于咨询服务、技术服务、运维服务等'
    },
    {
      value: 'material',
      label: '物资类',
      icon: <ShoppingOutlined />,
      color: '#52c41a',
      desc: '适用于设备采购、材料采购、办公用品等'
    },
    {
      value: 'engineering',
      label: '工程类',
      icon: <BuildOutlined />,
      color: '#faad14',
      desc: '适用于建筑工程、装修工程、安装工程等'
    }
  ];

  return (
    <div style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        {/* 顶部导航 */}
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={() => navigate('/projects')}
            size="large"
          >
            返回
          </Button>
          <Title level={3} style={{ margin: 0 }}>创建新项目</Title>
        </div>

        <Card bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <Form form={form} layout="vertical" onFinish={handleSubmit}>
            <Form.Item
              name="project_name"
              label={
                <Space>
                  <Text strong>项目名称</Text>
                  <Tooltip title="请输入清晰的项目名称，便于后续识别和管理">
                    <InfoCircleOutlined style={{ color: '#999' }} />
                  </Tooltip>
                </Space>
              }
              rules={[{ required: true, message: '请输入项目名称' }]}
            >
              <Input 
                placeholder="例如：2024 年 XX 单位信息化建设项目" 
                size="large"
                style={{ fontSize: 16 }}
              />
            </Form.Item>

            <Divider />

            <Form.Item
              name="project_type"
              label={
                <Space>
                  <Text strong>项目类型</Text>
                  <Tooltip title="选择项目类型将自动加载对应的评审规则模板">
                    <InfoCircleOutlined style={{ color: '#999' }} />
                  </Tooltip>
                </Space>
              }
              rules={[{ required: true, message: '请选择项目类型' }]}
            >
              <Select 
                size="large"
                placeholder="请选择项目类型"
                style={{ fontSize: 16 }}
                dropdownRender={(menu) => (
                  <div style={{ padding: '8px 0' }}>
                    {projectTypeOptions.map((option) => (
                      <div
                        key={option.value}
                        style={{
                          padding: '12px 16px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12
                        }}
                      >
                        <div style={{ 
                          fontSize: 20, 
                          color: option.color,
                          display: 'flex',
                          alignItems: 'center'
                        }}>
                          {option.icon}
                        </div>
                        <div>
                          <div style={{ fontWeight: 500 }}>{option.label}</div>
                          <div style={{ fontSize: 12, color: '#999' }}>{option.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              >
                {projectTypeOptions.map((option) => (
                  <Option key={option.value} value={option.value}>
                    <Space>
                      <span style={{ color: option.color }}>{option.icon}</span>
                      <span>{option.label}</span>
                    </Space>
                  </Option>
                ))}
              </Select>
            </Form.Item>

            {/* 项目类型说明 */}
            <Card style={{ background: '#f6f8fa', border: '1px solid #e8e8e8' }}>
              <Title level={5} style={{ margin: '0 0 12px 0' }}>项目类型说明</Title>
              <Row gutter={16}>
                <Col span={8}>
                  <div style={{ padding: 12, background: '#fff', borderRadius: 4, border: '1px solid #e8e8e8' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <GlobalOutlined style={{ color: '#1890ff', fontSize: 18 }} />
                      <Text strong>服务类</Text>
                    </div>
                    <Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>
                      评审重点：技术方案、服务能力、人员资质
                    </Paragraph>
                  </div>
                </Col>
                <Col span={8}>
                  <div style={{ padding: 12, background: '#fff', borderRadius: 4, border: '1px solid #e8e8e8' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <ShoppingOutlined style={{ color: '#52c41a', fontSize: 18 }} />
                      <Text strong>物资类</Text>
                    </div>
                    <Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>
                      评审重点：产品参数、质量保证、供货能力
                    </Paragraph>
                  </div>
                </Col>
                <Col span={8}>
                  <div style={{ padding: 12, background: '#fff', borderRadius: 4, border: '1px solid #e8e8e8' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <BuildOutlined style={{ color: '#faad14', fontSize: 18 }} />
                      <Text strong>工程类</Text>
                    </div>
                    <Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>
                      评审重点：施工方案、工程质量、安全措施
                    </Paragraph>
                  </div>
                </Col>
              </Row>
            </Card>

            <Form.Item style={{ marginTop: 24 }}>
              <Space>
                <Button 
                  type="primary" 
                  htmlType="submit" 
                  loading={loading}
                  size="large"
                  icon={<PlusOutlined />}
                  style={{ minWidth: 120 }}
                >
                  创建项目
                </Button>
                <Button 
                  onClick={() => navigate('/projects')}
                  size="large"
                  style={{ minWidth: 120 }}
                >
                  取消
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      </div>
    </div>
  );
};

export default ProjectCreate;
