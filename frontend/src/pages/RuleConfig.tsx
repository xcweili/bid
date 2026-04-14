import React, { useState, useEffect } from 'react';
import { 
  Card, Button, Typography, Upload, Table, Modal, Form, Input, 
  message, Tag, Collapse, Descriptions, Space, Alert, Divider,
  Switch, InputNumber, Select
} from 'antd';
import { 
  UploadOutlined, PlusOutlined, EditOutlined, 
  FileTextOutlined, CheckCircleOutlined, EyeOutlined,
  DeleteOutlined, LinkOutlined
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import { ruleService } from '../services/ruleService';
import { colors } from '../styles/designTokens';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface ReviewItem {
  id?: number;
  item_name: string;
  content: string;
  source_files: string[];  // 支持多个文件
  max_score: number;
  is_active: boolean;
}

interface Rule {
  id: number;
  rule_name: string;
  rule_content: string;
  config: any;
  items: ReviewItem[];
}

const RuleConfig: React.FC = () => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showBindModal, setShowBindModal] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [editingItem, setEditingItem] = useState<ReviewItem | null>(null);
  const [form] = Form.useForm();
  const [bindForm] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const data = await ruleService.getRules();
      console.log('规则列表数据:', data);
      
      // 将规则转换为评审项列表（每个规则就是一个评审项）
      const items: Rule[] = data.map((rule: any) => {
        console.log('处理规则:', rule);
        // 确保 rule_content 存在
        const ruleContent = rule.rule_content || rule.content || '';
        const ruleName = rule.rule_name || '';
        
        return {
          id: rule.id,
          rule_name: ruleName,
          rule_content: ruleContent,
          config: rule.config || {},
          // 如果 config.items 为空，则将规则本身作为一个评审项
          items: (rule.config?.items && rule.config.items.length > 0) 
            ? rule.config.items 
            : [{
                item_name: ruleName,
                content: ruleContent,
                source_files: [],
                max_score: 10,
                is_active: true
              }]
        };
      });
      
      console.log('转换后的规则:', items);
      setRules(items);
    } catch (error) {
      console.error('获取规则列表失败:', error);
      message.error('获取规则列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (file: File) => {
    try {
      const content = await file.text();
      
      // 调用后端 API 创建规则
      const newItem = {
        item_name: file.name.replace('.md', ''),
        content: content,
        source_files: [],
        max_score: 10,
        is_active: true
      };
      
      const response = await ruleService.createReviewItem(newItem);
      
      // 使用后端返回的真实 ID
      const newRule: Rule = {
        id: response.id,
        rule_name: newItem.item_name,
        rule_content: content,
        config: { items: [newItem] },
        items: [newItem]
      };
      
      setRules([...rules, newRule]);
      message.success('评审项已添加');
    } catch (error) {
      console.error('上传失败:', error);
      message.error('上传失败');
    }
    return false;
  };

  const handleAddItem = async () => {
    try {
      const values = await form.validateFields();
      
      const newItem = {
        item_name: values.item_name,
        content: values.content,
        source_files: [],
        max_score: values.max_score || 10,
        is_active: true
      };
      
      // 调用后端 API 创建评审项
      const response = await ruleService.createReviewItem(newItem);
      
      // 使用后端返回的真实 ID
      const newRule: Rule = {
        id: response.id,
        rule_name: newItem.item_name,
        rule_content: newItem.content,
        config: { items: [newItem] },
        items: [newItem]
      };
      
      setRules([...rules, newRule]);
      message.success('评审项已创建');
      setShowAddModal(false);
      form.resetFields();
    } catch (error) {
      console.error('创建失败:', error);
      message.error('创建失败');
    }
  };

  const handleBindFiles = (item: ReviewItem) => {
    setEditingItem(item);
    // 直接使用source_files数组
    bindForm.setFieldsValue({ source_files: item.source_files || [] });
    setShowBindModal(true);
  };

  const handleSaveBind = async () => {
    try {
      const values = await bindForm.validateFields();
      
      if (editingItem && editingItem.id) {
        // 直接使用数组
        const filesArray = values.source_files || [];
        
        // 调用后端 API 更新
        await ruleService.bindFiles(editingItem.id, filesArray);
        
        message.success('文件绑定成功');
        setShowBindModal(false);
        fetchRules();
      } else {
        message.error('评审项 ID 无效');
      }
    } catch (error) {
      console.error('绑定失败:', error);
      message.error('绑定失败');
    }
  };

  const handleDeleteItem = async (ruleId: number, itemName: string) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除评审项 "${itemName}" 吗？此操作不可恢复！`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await ruleService.deleteRule(ruleId);
          message.success('已删除');
          fetchRules();
        } catch (error) {
          message.error('删除失败');
        }
      }
    });
  };

  const handlePreview = (content: string, title: string) => {
    console.log('Preview - Content:', content, 'Title:', title);
    
    // 确保内容有值
    if (!content || content.trim() === '') {
      message.warning('预览内容为空');
      return;
    }
    
    setPreviewContent(content);
    setPreviewTitle(title);
    setShowPreviewModal(true);
  };

  const columns = [
    {
      title: '评审项名称',
      dataIndex: 'item_name',
      key: 'item_name',
      width: 200,
      render: (text: string, record: ReviewItem) => (
        <Text strong style={{ fontSize: 14 }}>{text}</Text>
      )
    },
    {
      title: '绑定文件',
      dataIndex: 'source_files',
      key: 'source_files',
      width: 250,
      render: (files: string[], record: ReviewItem) => (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {files && files.length > 0 ? (
            files.map((file, idx) => (
              <Tag key={idx} icon={<FileTextOutlined />} color="blue" style={{ fontSize: 11, marginBottom: 4 }}>
                {file}
              </Tag>
            ))
          ) : (
            <Tag icon={<LinkOutlined />} color="orange" style={{ fontSize: 11 }}>
              未绑定
            </Tag>
          )}
        </Space>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: any, record: ReviewItem) => {
        // 使用 row.rule_content 作为预览内容，因为它是从规则转换来的
        const previewContent = record.content || '';
        return (
        <Space wrap>
          <Button 
            size="small" 
            icon={<LinkOutlined />}
            onClick={() => handleBindFiles(record)}
          >
            绑定文件
          </Button>
          <Button 
            size="small" 
            icon={<EyeOutlined />}
            onClick={() => {
              console.log('点击预览按钮，content:', previewContent, 'item_name:', record.item_name);
              handlePreview(previewContent, record.item_name);
            }}
          >
            预览
          </Button>
          <Button 
            size="small" 
            icon={<DeleteOutlined />}
            danger
            onClick={() => handleDeleteItem(record.id || 0, record.item_name)}
          >
            删除
          </Button>
        </Space>
        );
      }
    }
  ];

  const allItems = rules.flatMap(rule => 
    (rule.items || []).map(item => ({
      ...item,
      id: rule.id,  // 使用 rule.id 作为 item 的 id
      rule_id: rule.id,
      rule_name: rule.rule_name,
      rule_content: rule.rule_content,  // 添加 rule_content 用于预览
      content: item.content || rule.rule_content  // 确保 content 字段有值
    }))
  );

  // 根据搜索文本过滤数据
  const filteredItems = allItems.filter(item => {
    if (!searchText) return true;
    const lowerSearchText = searchText.toLowerCase();
    return (
      item.item_name.toLowerCase().includes(lowerSearchText) ||
      item.content.toLowerCase().includes(lowerSearchText) ||
      item.rule_name.toLowerCase().includes(lowerSearchText)
    );
  });

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>
          <FileTextOutlined /> 评审项管理
        </Title>
        <Text type="secondary" style={{ marginLeft: 12 }}>
          管理所有评审项，上传 MD 文件或手动创建，并绑定源文件
        </Text>
      </div>

      <Alert
        message="评审项说明"
        description="1. 上传 MD 文件创建评审项 | 2. 为每个评审项绑定源文件（支持多个） | 3. AI 评审时直接从绑定文件中提取内容"
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Card
        style={{ marginBottom: 16 }}
        extra={
          <Space>
            <Upload
              accept=".md"
              showUploadList={false}
              beforeUpload={handleUpload}
            >
              <Button icon={<UploadOutlined />}>
                上传 MD 文件
              </Button>
            </Upload>
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={() => setShowAddModal(true)}
            >
              新建评审项
            </Button>
          </Space>
        }
      >
        <div style={{ marginBottom: 16 }}>
          <Input.Search
            placeholder="搜索评审项名称、内容或规则名称"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 300 }}
            allowClear
          />
        </div>
        <Table
          columns={columns}
          dataSource={filteredItems}
          rowKey={(record) => `${record.rule_id || 0}-${record.item_name}`}
          loading={loading}
          pagination={{
            pageSize: pageSize,
            onChange: (current, size) => setPageSize(size),
            showSizeChanger: true,
            pageSizeOptions: ['5', '10', '20', '50'],
            showTotal: (total) => `共 ${total} 条数据`
          }}
          scroll={{ x: 800 }}
        />
      </Card>

      {/* 新建评审项模态框 */}
      <Modal
        title={<span><PlusOutlined /> 新建评审项</span>}
        open={showAddModal}
        onOk={handleAddItem}
        onCancel={() => {
          setShowAddModal(false);
          form.resetFields();
        }}
        width={800}
        okText="创建"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="item_name"
            label="评审项名称"
            rules={[{ required: true, message: '请输入评审项名称' }]}
          >
            <Input placeholder="如：供货业绩评分" size="large" />
          </Form.Item>
          
          <Form.Item
            name="max_score"
            label="满分"
            rules={[{ required: true, message: '请输入满分' }]}
          >
            <InputNumber 
              min={0} 
              max={100} 
              style={{ width: '100%' }} 
              placeholder="如：20"
            />
          </Form.Item>
          
          <Form.Item
            name="content"
            label="评审标准内容"
            rules={[{ required: true, message: '请输入评审标准' }]}
          >
            <TextArea 
              rows={10} 
              placeholder="输入评审标准，支持 Markdown 格式"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 绑定文件模态框 */}
      <Modal
        title={<span><LinkOutlined /> 绑定源文件 - {editingItem?.item_name}</span>}
        open={showBindModal}
        onOk={handleSaveBind}
        onCancel={() => setShowBindModal(false)}
        width={700}
        okText="保存绑定"
      >
        <Form form={bindForm} layout="vertical">
          <Form.Item
            label="绑定文件列表"
            tooltip="添加要绑定的文件名，评审时将从公司文件夹下读取这些文件。"
          >
            <Form.List
              name="source_files"
            >
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field, index) => (
                    <div key={field.key} className="ant-space-item" style={{ width: '100%', display: 'flex', marginBottom: 8, alignItems: 'center' }}>
                      <Form.Item
                        {...field}
                        validateTrigger={['onChange', 'onBlur']}
                        rules={[
                          { required: true, message: '请输入文件名' },
                        ]}
                        noStyle
                      >
                        <Input
                          placeholder="输入文件名，如：供货业绩.doc"
                          style={{ width: '100%', height: 40 }}
                        />
                      </Form.Item>
                      <Button
                        danger
                        type="text"
                        icon={<DeleteOutlined />}
                        onClick={() => remove(field.name)}
                        style={{ height: 40, marginLeft: 8 }}
                      />
                    </div>
                  ))}
                  <Form.Item>
                    <Button
                      type="dashed"
                      onClick={() => add()}
                      style={{ width: '20%', height: 40, marginTop: 8 }}
                      icon={<PlusOutlined />}
                    >
                      添加文件
                    </Button>
                  </Form.Item>
                </>
              )}
            </Form.List>
          </Form.Item>
          
          <Alert
            message="绑定说明"
            description="AI 评审时，系统会从公司文件夹下查找这些文件名的文件，优先读取同名的 md 文档内容，然后喂给 LLM 进行评分。"
            type="info"
            showIcon
          />
        </Form>
      </Modal>

      {/* 预览模态框 */}
      <Modal
        title={<span><EyeOutlined /> {previewTitle || '预览'}</span>}
        open={showPreviewModal}
        onCancel={() => setShowPreviewModal(false)}
        footer={null}
        width={800}
      >
        <div style={{ 
          maxHeight: 500, 
          overflow: 'auto',
          padding: 16,
          background: '#fafafa',
          borderRadius: 8
        }}>
          {previewContent ? (
            <ReactMarkdown>{previewContent}</ReactMarkdown>
          ) : (
            <Alert
              message="无内容"
              description="预览内容为空，请检查数据"
              type="warning"
              showIcon
            />
          )}
        </div>
      </Modal>
    </div>
  );
};

export default RuleConfig;
