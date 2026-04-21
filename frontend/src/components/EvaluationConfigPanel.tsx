import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card, Button, Space, Tag, Input, Select, Modal, Form,
  InputNumber, Typography, message, Alert, Empty, Divider,
  Tooltip, List
} from 'antd';
import {
  FileTextOutlined, PlusOutlined, DeleteOutlined,
  UpOutlined, DownOutlined, SearchOutlined,
  SaveOutlined
} from '@ant-design/icons';
import apiClient from '../services/api';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface EvaluationItem {
  id?: number;
  item_name: string;
  scoring_criteria: string;
  source_files: string[];
}

interface Template {
  id: number;
  template_name: string;
  project_type: string;
  description: string;
  items: EvaluationItem[];
}

interface EvaluationConfigPanelProps {
  isConfigured: boolean;
  onGoToTemplateConfig?: () => void;
}

const EvaluationConfigPanel: React.FC<EvaluationConfigPanelProps> = ({ isConfigured, onGoToTemplateConfig }) => {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || '0');

  const [evaluationItems, setEvaluationItems] = useState<EvaluationItem[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templateFilter, setTemplateFilter] = useState<string>('all');
  const [templateSearch, setTemplateSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTemplateDetail, setShowTemplateDetail] = useState<Template | null>(null);
  const [form] = Form.useForm();

  const projectType = localStorage.getItem('currentProjectType') || 'service';

  useEffect(() => {
    fetchEvaluationItems();
    fetchTemplates();
  }, [projectId]);

  const fetchEvaluationItems = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/api/projects/${projectId}/rules`);
      if (response.status === 200) {
        const rules = response.data?.rules || [];
        const normalizedRules = rules.map((item: any) => ({
          ...item,
          source_files: item.source_files || []
        }));
        setEvaluationItems(normalizedRules);
      }
    } catch (error: any) {
      if (error?.response?.status !== 404) {
        console.error('获取评审项失败:', error);
      }
      setEvaluationItems([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const response = await apiClient.get('/api/rule-templates');
      if (response.status === 200) {
        const data = response.data || [];
        const normalizedTemplates = data.map((template: any) => {
          // 后端返回的是 config.items，不是 items
          const config = template.config || {};
          const items = Array.isArray(config) ? config : (config.items || []);
          
          return {
            ...template,
            items: items.map((item: any) => ({
              ...item,
              item_name: item.criteria_name || item.item_name,
              source_files: item.attached_files || item.source_files || []
            }))
          };
        });
        setTemplates(normalizedTemplates);
      }
    } catch (error) {
      console.error('获取模板失败:', error);
      setTemplates([]);
    }
  };

  const filteredTemplates = templates.filter(template => {
    const matchType = templateFilter === 'all' || template.project_type === templateFilter;
    const matchSearch = !templateSearch || template.template_name.includes(templateSearch);
    return matchType && matchSearch;
  });

  const handleViewTemplateDetail = (template: Template) => {
    setShowTemplateDetail(template);
  };

  const handleAddTemplate = (template: Template) => {
    const exists = evaluationItems.some(item => 
      template.items.some(ti => ti.item_name === item.item_name)
    );
    
    if (exists) {
      message.warning('该模板的部分评审项已存在，跳过添加');
      return;
    }

    const newItems = [...evaluationItems, ...template.items];
    setEvaluationItems(newItems);
    message.success(`已添加「${template.template_name}」的 ${template.items.length} 个评审项`);
  };

  const handleDeleteItem = (index: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该评审项吗？',
      onOk: () => {
        const newItems = evaluationItems.filter((_, i) => i !== index);
        setEvaluationItems(newItems);
        message.success('删除成功');
      }
    });
  };

  const handleMoveItem = (index: number, direction: 'up' | 'down') => {
    const newItems = [...evaluationItems];
    if (direction === 'up' && index > 0) {
      [newItems[index], newItems[index - 1]] = [newItems[index - 1], newItems[index]];
    } else if (direction === 'down' && index < newItems.length - 1) {
      [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
    }
    setEvaluationItems(newItems);
  };

  const handleAddItem = async () => {
    try {
      const values = await form.validateFields();
      const newItem: EvaluationItem = {
        item_name: values.item_name,
        scoring_criteria: values.scoring_criteria,
        source_files: values.source_files ? values.source_files.split('\n').filter(f => f.trim()) : []
      };
      setEvaluationItems([...evaluationItems, newItem]);
      setShowAddModal(false);
      form.resetFields();
      message.success('添加成功');
    } catch (error: any) {
      if (error?.message) {
        message.error(error.message);
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.post(`/api/projects/${projectId}/rules`, {
        rules: evaluationItems,
        project_type: projectType
      });
      message.success('保存成功');
      window.location.reload();
    } catch (error: any) {
      console.error('保存失败:', error);
      message.error(error?.response?.data?.detail || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    Modal.confirm({
      title: '确认取消',
      content: '有未保存的修改，确定要放弃吗？',
      onOk: () => {
        window.location.reload();
      }
    });
  };

  return (
    <Card
      className="evaluation-config-panel"
      style={{ marginTop: '16px' }}
      title={
        <Space>
          <FileTextOutlined />
          <span>评审配置</span>
        </Space>
      }
      extra={
        <Space>
          <Button 
            type="primary" 
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
          >
            保存
          </Button>
          <Button onClick={handleCancel}>取消</Button>
          {onGoToTemplateConfig && (
            <Button onClick={onGoToTemplateConfig}>
              去配置模板
            </Button>
          )}
        </Space>
      }
    >
      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Card 
            size="small" 
            title="模板库"
            style={{ height: '520px', display: 'flex', flexDirection: 'column' }}
            bodyStyle={{ padding: '20px' }}
          >
            <Space size="middle" style={{ marginBottom: '20px', flexWrap: 'wrap' }}>
              <Select
                value={templateFilter}
                onChange={setTemplateFilter}
                style={{ width: 130 }}
              >
                <Option value="all">全部</Option>
                <Option value="service">服务类</Option>
                <Option value="material">物资类</Option>
                <Option value="engineering">工程类</Option>
              </Select>
              <Input
                placeholder="搜索模板..."
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                prefix={<SearchOutlined />}
                style={{ flex: 1, minWidth: '200px' }}
              />
            </Space>

            <List
              dataSource={filteredTemplates}
              loading={loading}
              grid={{ column: 2, gutter: 16 }}
              renderItem={(template) => (
                <List.Item key={template.id}>
                  <Card 
                    hoverable
                    onClick={() => handleViewTemplateDetail(template)}
                    style={{ cursor: 'pointer', height: '100%' }}
                    bodyStyle={{ padding: '16px' }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ 
                          width: '40px', 
                          height: '40px', 
                          borderRadius: '8px', 
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: '12px'
                        }}>
                          <FileTextOutlined style={{ color: '#fff', fontSize: '20px' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <Text strong style={{ fontSize: '15px', display: 'block', marginBottom: '4px' }}>
                            {template.template_name}
                          </Text>
                          <Space size="small">
                            <Tag color="blue" style={{ fontSize: '12px' }}>{template.project_type}</Tag>
                            <Tag color="green" style={{ fontSize: '12px' }}>{template.items.length} 项</Tag>
                          </Space>
                        </div>
                      </div>
                      {template.description && (
                        <Text type="secondary" style={{ fontSize: '13px', lineHeight: '1.5' }}>
                          {template.description.length > 60 ? template.description.substring(0, 60) + '...' : template.description}
                        </Text>
                      )}
                    </div>
                  </Card>
                </List.Item>
              )}
              locale={{ emptyText: <Empty description="暂无模板" /> }}
            />
          </Card>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <Card 
            size="small" 
            title={
              <Space>
                <span>已配置的评审项</span>
                <Tag color="blue">{evaluationItems.length} 项</Tag>
              </Space>
            }
            style={{ height: '520px', display: 'flex', flexDirection: 'column' }}
            bodyStyle={{ padding: '20px' }}
          >
            {evaluationItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <Empty 
                  description="暂无配置的评审项"
                  style={{ marginTop: '20px' }}
                />
                <Button 
                  icon={<PlusOutlined />}
                  onClick={() => setShowAddModal(true)}
                  style={{ 
                    marginTop: '24px', 
                    padding: '8px 24px',
                    background: '#f0f5ff',
                    border: '1px dashed #1890ff',
                    color: '#1890ff',
                    fontWeight: 500
                  }}
                >
                  新增评审项
                </Button>
              </div>
            ) : (
              <>
                <div style={{ height: '450px', overflowY: 'auto', paddingRight: '8px' }}>
                  <List
                    dataSource={evaluationItems}
                    renderItem={(item, index) => (
                      <Card 
                        key={item.id || index}
                        style={{ marginBottom: '12px', borderLeft: '3px solid #1890ff' }}
                        bodyStyle={{ padding: '16px' }}
                        title={
                          <Space>
                            <Tag color="blue" style={{ fontSize: '13px' }}>{index + 1}</Tag>
                            <Text strong style={{ fontSize: '15px' }}>{item.item_name}</Text>
                          </Space>
                        }
                        extra={
                          <Tooltip title="删除">
                            <Button 
                              size="small" 
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => handleDeleteItem(index)}
                            />
                          </Tooltip>
                        }
                      >
                        <Space direction="vertical" style={{ width: '100%', align: 'start' }}>
                          <div>
                            <Text type="secondary" style={{ fontSize: '13px' }}>评分标准：</Text>
                            <Paragraph ellipsis={{ rows: 2 }} style={{ margin: '6px 0 0 0', fontSize: '14px', lineHeight: '1.6' }}>
                              {item.scoring_criteria}
                            </Paragraph>
                          </div>
                          {item.source_files && item.source_files.length > 0 && (
                            <div>
                              <Text type="secondary" style={{ fontSize: '13px' }}>关联文件：</Text>
                              <Space size="small" style={{ marginLeft: '6px' }}>
                                {item.source_files.slice(0, 2).map((file, i) => (
                                  <Tag key={i} icon={<FileTextOutlined />} style={{ fontSize: '12px' }}>
                                    {file.split('/').pop()}
                                  </Tag>
                                ))}
                                {item.source_files.length > 2 && (
                                  <Tag>+{item.source_files.length - 2}</Tag>
                                )}
                              </Space>
                            </div>
                          )}
                        </Space>
                      </Card>
                    )}
                  />
                </div>
                <Button 
                  icon={<PlusOutlined />}
                  onClick={() => setShowAddModal(true)}
                  style={{ 
                    marginTop: '12px', 
                    padding: '8px 20px',
                    background: '#f0f5ff',
                    border: '1px dashed #1890ff',
                    color: '#1890ff',
                    fontWeight: 500
                  }}
                >
                  新增评审项
                </Button>
              </>
            )}
          </Card>
        </div>
      </div>

      <Modal
        title="新增评审项"
        open={showAddModal}
        onCancel={() => { setShowAddModal(false); form.resetFields(); }}
        onOk={handleAddItem}
        okText="确认添加"
        width={700}
        bodyStyle={{ padding: '32px' }}
      >
        <Form form={form} layout="vertical" style={{ marginTop: '16px' }}>
          <Form.Item
            label={<span style={{ fontSize: '14px', fontWeight: 500 }}>评审项名称 *</span>}
            name="item_name"
            rules={[{ required: true, message: '请输入评审项名称' }]}
          >
            <Input placeholder="如：技术方案" size="large" />
          </Form.Item>
          <Form.Item
            label={<span style={{ fontSize: '14px', fontWeight: 500 }}>评分标准 *</span>}
            name="scoring_criteria"
            rules={[{ required: true, message: '请输入评分标准' }]}
          >
            <TextArea rows={4} placeholder="描述评分标准和要求" size="large" />
          </Form.Item>
          <Form.Item
            label={<span style={{ fontSize: '14px', fontWeight: 500 }}>绑定文件（每行一个，可选）</span>}
            name="source_files"
            extra={
              <Text type="secondary" style={{ fontSize: '13px' }}>
                填写标书解析后生成的文件路径，用于后续获取评审项对应的文件内容。如：技术文件/技术方案.pdf
              </Text>
            }
          >
            <TextArea rows={4} placeholder="每行一个文件路径&#10;如：&#10;技术文件/技术方案.pdf&#10;商务文件/报价单.pdf" size="large" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={showTemplateDetail?.template_name}
        open={!!showTemplateDetail}
        onCancel={() => setShowTemplateDetail(null)}
        footer={[
          <Button key="close" onClick={() => setShowTemplateDetail(null)}>关闭</Button>,
          <Button 
            key="use" 
            type="primary"
            onClick={() => {
              if (showTemplateDetail) {
                handleAddTemplate(showTemplateDetail);
                setShowTemplateDetail(null);
              }
            }}
          >
            采用此模板
          </Button>
        ]}
        width={800}
        bodyStyle={{ padding: '24px' }}
      >
        {showTemplateDetail && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <div style={{ 
              background: '#f5f5f5', 
              padding: '16px', 
              borderRadius: '8px',
              marginBottom: '16px'
            }}>
              <Space>
                <Tag color="blue">{showTemplateDetail.project_type}</Tag>
                <Tag color="green">{showTemplateDetail.items?.length || 0} 个评审项</Tag>
                {showTemplateDetail.description && (
                  <Text type="secondary" style={{ marginLeft: '8px' }}>
                    {showTemplateDetail.description}
                  </Text>
                )}
              </Space>
            </div>
            
            <div style={{ 
              background: '#fafafa', 
              padding: '16px', 
              borderRadius: '8px',
              maxHeight: '500px',
              overflow: 'auto'
            }}>
              <Text strong style={{ fontSize: '14px', marginBottom: '16px', display: 'block' }}>
                评审项列表：
              </Text>
              <List
                dataSource={showTemplateDetail.items || []}
                renderItem={(item, index) => (
                  <List.Item key={item.id || index} style={{ padding: '16px 0', borderBottom: '1px solid #e8e8e8' }}>
                    <Space direction="vertical" style={{ width: '100%', align: 'start' }}>
                      <Tag color="blue" style={{ fontSize: '13px' }}>
                        {index + 1}. {item.item_name}
                      </Tag>
                      <div style={{ 
                        background: '#fff', 
                        padding: '12px', 
                        borderRadius: '4px',
                        width: '100%',
                        marginTop: '8px'
                      }}>
                        <Text type="secondary" style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>
                          评分标准：
                        </Text>
                        <Text style={{ fontSize: '14px', lineHeight: '1.6' }}>
                          {item.scoring_criteria}
                        </Text>
                      </div>
                      {item.source_files && item.source_files.length > 0 && (
                        <div style={{ marginTop: '8px' }}>
                          <Text type="secondary" style={{ fontSize: '13px' }}>关联文件：</Text>
                          <Space size="small" style={{ marginLeft: '6px' }}>
                            {item.source_files.slice(0, 3).map((file, i) => (
                              <Tag key={i} icon={<FileTextOutlined />} style={{ fontSize: '12px' }}>
                                {file.split('/').pop()}
                              </Tag>
                            ))}
                            {item.source_files.length > 3 && (
                              <Tag>+{item.source_files.length - 3}</Tag>
                            )}
                          </Space>
                        </div>
                      )}
                    </Space>
                  </List.Item>
                )}
              />
            </div>
          </Space>
        )}
      </Modal>
    </Card>
  );
};

export default EvaluationConfigPanel;
