import React, { useState, useEffect } from 'react';
import {
  Card, Button, Typography, Table, Modal, Form, Input,
  message, Space, Select, Switch, Row, Col, Tag, Tooltip, List
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined
} from '@ant-design/icons';
import { evaluationItemService, EvaluationItem, FileInfo } from '../services/evaluationItemService';
import PageHeader from '../components/PageHeader';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const RuleConfig: React.FC = () => {
  const [items, setItems] = useState<EvaluationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<EvaluationItem | null>(null);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);
  const [currentItemFiles, setCurrentItemFiles] = useState<FileInfo[]>([]);
  const [deletedFileIds, setDeletedFileIds] = useState<number[]>([]);
  const [formData, setFormData] = useState<EvaluationItem | null>(null);

  useEffect(() => {
    fetchItems();
  }, []);

  useEffect(() => {
    const uniqueCategories = Array.from(new Set(items.map(item => item.material_category).filter(Boolean) as string[]));
    setCategories(uniqueCategories);
  }, [items]);

  useEffect(() => {
    if (showModal && formData) {
      form.setFieldsValue({
        item_code: formData.item_code,
        item_name: formData.item_name,
        material_category: formData.material_category || '',
        is_active: formData.is_active,
        workflow_id: formData.workflow_id || '',
        item_content: formData.item_content || '',
        api_key: formData.api_key || '',
        base_url: formData.base_url || '',
        evaluation_type: formData.evaluation_type || '',
        evaluation_stage: formData.evaluation_stage || '',
        rule_category: formData.rule_category || '',
      });
    }
  }, [showModal, formData]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const data = await evaluationItemService.getAllItems();
      setItems(data);
    } catch (error) {
      console.error('获取评审项失败:', error);
      message.error('获取评审项失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    setCurrentItemFiles([]);
    setDeletedFileIds([]);
    setNewFileName('');
    setShowModal(true);
  };

  const handleEdit = async (item: EvaluationItem) => {
    setEditingItem(item);
    try {
      const latestItem = await evaluationItemService.getItem(item.id);
      setCurrentItemFiles(latestItem.files || []);
      setDeletedFileIds([]);
      setNewFileName('');
      setFormData(latestItem);
      setShowModal(true);
    } catch {
      setCurrentItemFiles(item.files || []);
      setDeletedFileIds([]);
      setNewFileName('');
      setFormData(item);
      setShowModal(true);
    }
  };

  const handleAddFileName = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newFileName.trim()) {
      e.preventDefault();
      const newFile: FileInfo = {
        id: -Date.now(),
        file_name: newFileName.trim(),
        file_path: '',
        file_type: 'md',
        file_size: 0,
        description: ''
      };
      setCurrentItemFiles(prev => [...prev, newFile]);
      setNewFileName('');
    }
  };

  const handleAddFileClick = () => {
    if (!newFileName.trim()) return;
    const newFile: FileInfo = {
      id: -Date.now(),
      file_name: newFileName.trim(),
      file_path: '',
      file_type: 'md',
      file_size: 0,
      description: ''
    };
    setCurrentItemFiles(prev => [...prev, newFile]);
    setNewFileName('');
  };

  const handleRemoveFile = (fileId: number) => {
    if (fileId < 0) {
      setCurrentItemFiles(prev => prev.filter(f => f.id !== fileId));
    } else {
      setDeletedFileIds(prev => {
        if (!prev.includes(fileId)) {
          return [...prev, fileId];
        }
        return prev;
      });
      setCurrentItemFiles(prev => prev.filter(f => f.id !== fileId));
    }
  };

  const handleDelete = (item: EvaluationItem) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除评审项"${item.item_name}"吗？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await evaluationItemService.deleteItem(item.id);
          message.success('删除成功');
          fetchItems();
        } catch (error) {
          console.error('删除失败:', error);
          message.error('删除失败');
        }
      }
    });
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      if (editingItem) {
        const newFiles = currentItemFiles.filter(f => f.id < 0);
        const updateData: any = {
          ...values,
        };
        if (deletedFileIds.length > 0) {
          updateData.files_to_remove = deletedFileIds;
        }
        if (newFiles.length > 0) {
          updateData.files_to_add = newFiles.map(f => f.file_name);
        }
        await evaluationItemService.updateItem(editingItem.id, updateData);
        message.success('更新成功');
      } else {
        const newItem = await evaluationItemService.createItem(values);
        const newFiles = currentItemFiles.filter(f => f.id < 0);
        if (newFiles.length > 0) {
          await evaluationItemService.updateItem(newItem.id, {
            files_to_add: newFiles.map(f => f.file_name),
            files_to_remove: []
          } as any);
        }
        message.success('创建成功');
      }

      setShowModal(false);
      form.resetFields();
      setCurrentItemFiles([]);
      setDeletedFileIds([]);
      fetchItems();
    } catch (error) {
      console.error('保存失败:', error);
      message.error('保存失败');
    }
  };

  const filteredItems = items.filter(item => {
    const matchSearch = !searchText ||
      item.item_name.toLowerCase().includes(searchText.toLowerCase()) ||
      item.item_code.toLowerCase().includes(searchText.toLowerCase());

    const matchCategory = !categoryFilter || item.material_category === categoryFilter;

    return matchSearch && matchCategory;
  });

  const columns = [
    {
      title: '评审项编号',
      dataIndex: 'item_code',
      key: 'item_code',
      width: 150
    },
    {
      title: '评审项名称',
      dataIndex: 'item_name',
      key: 'item_name',
      width: 200
    },
    {
      title: '物资品类',
      dataIndex: 'material_category',
      key: 'material_category',
      width: 150,
      render: (category: string) => category || '-'
    },
    {
      title: '评审项内容',
      dataIndex: 'item_content',
      key: 'item_content',
      width: 250,
      render: (content: string) => (
        <Tooltip title={content || '无内容'}>
          <span style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', whiteSpace: 'nowrap' }}>
            {content || '-'}
          </span>
        </Tooltip>
      )
    },
    {
      title: '绑定文件',
      dataIndex: 'files',
      key: 'files',
      width: 200,
      render: (files: any[]) => {
        if (!files || files.length === 0) {
          return <Text type="secondary">-</Text>;
        }
        const fileNames = files.map(f => f.file_name).slice(0, 3);
        const moreCount = files.length > 3 ? ` +${files.length - 3}` : '';
        return (
          <Tooltip title={files.map(f => f.file_name).join('\n')}>
            <Tag color="blue" style={{ fontSize: 12 }}>
              {fileNames.join(', ')}{moreCount}
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
      render: (isActive: boolean) => (
        <Switch checked={isActive} disabled />
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: EvaluationItem) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
            删除
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div>
      <PageHeader
        title="评审项管理"
        description="管理所有评审项，支持按物资品类筛选"
        icon={<SettingOutlined />}
      />

      <Card>
        <div style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
          <Input.Search
            placeholder="搜索评审项编号、名称或描述"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 300 }}
            allowClear
          />
          <Select
            placeholder="筛选物资品类"
            value={categoryFilter || undefined}
            onChange={setCategoryFilter}
            style={{ width: 200 }}
            allowClear
          >
            {categories.map(category => (
              <Option key={category} value={category}>{category}</Option>
            ))}
          </Select>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            新增评审项
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={filteredItems}
          rowKey="id"
          loading={loading}
          pagination={{
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (total) => `共 ${total} 条数据`
          }}
        />
      </Card>

      <Modal
        title={editingItem ? '编辑评审项' : '新增评审项'}
        open={showModal}
        onOk={handleSave}
        onCancel={() => {
          setShowModal(false);
          form.resetFields();
          setCurrentItemFiles([]);
          setDeletedFileIds([]);
        }}
        width={700}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="item_code"
            label="评审项编号"
            rules={[{ required: true, message: '请输入评审项编号' }]}
          >
            <Input placeholder="例如：ITEM001" />
          </Form.Item>

          <Form.Item
            name="item_name"
            label="评审项名称"
            rules={[{ required: true, message: '请输入评审项名称' }]}
          >
            <Input placeholder="例如：技术方案评审" />
          </Form.Item>

          <Form.Item
            name="material_category"
            label="物资品类"
          >
            <Input placeholder="例如：信号系统、通信系统" />
          </Form.Item>

          <Form.Item
            name="evaluation_type"
            label="评审类型"
          >
            <Select placeholder="选择评审类型" style={{ width: '100%' }}>
              <Option value="技术">技术</Option>
              <Option value="商务">商务</Option>
              <Option value="综合">综合</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="evaluation_stage"
            label="评审阶段"
          >
            <Select placeholder="选择评审阶段" style={{ width: '100%' }}>
              <Option value="初评">初评</Option>
              <Option value="详评">详评</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="rule_category"
            label="规则分类"
          >
            <Select placeholder="选择规则分类" style={{ width: '100%' }}>
              <Option value="价格">价格</Option>
              <Option value="技术">技术</Option>
              <Option value="商务">商务</Option>
              <Option value="资质">资质</Option>
              <Option value="服务">服务</Option>
              <Option value="其他">其他</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="api_key"
            label="Dify API Key"
          >
            <Input.Password placeholder="Dify API Key（用于访问工作流）" />
          </Form.Item>

          <Form.Item
            name="base_url"
            label="Dify API 基础地址"
          >
            <Input 
              placeholder="例如：http://10.255.216.2:8083/v1" 
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block', marginBottom: 16 }}>
            留空则使用默认地址：http://10.255.216.2:8083/v1
          </Text>

          <Form.Item
            name="workflow_id"
            label="工作流ID"
          >
            <Input placeholder="Dify 工作流 ID（选填，配置后使用带workflow_id的调用方式）" />
          </Form.Item>

          <Form.Item label="绑定文件">
            <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #d9d9d9', borderRadius: 4, padding: 8, marginBottom: 8 }}>
              {currentItemFiles.length > 0 ? (
                <List
                  dataSource={currentItemFiles}
                  renderItem={(file: any) => (
                    <List.Item
                      key={file.id || file.file_name}
                      style={{ padding: '4px 0' }}
                      extra={
                        <Button
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => handleRemoveFile(file.id)}
                        />
                      }
                    >
                      <div style={{ fontSize: 14 }}>{file.file_name}</div>
                    </List.Item>
                  )}
                />
              ) : (
                <div style={{ textAlign: 'center', color: '#999', padding: 16 }}>
                  暂无绑定文件
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={handleAddFileName}
                placeholder="输入文件名，回车确认添加"
                style={{ flex: 1 }}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddFileClick}
              >
                添加
              </Button>
            </div>
            <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
              评审时将自动从投标人文件夹下查找同名的 .md 文件
            </Text>
          </Form.Item>

          <Form.Item
            name="item_content"
            label="评审项内容（Markdown格式）"
          >
            <TextArea
              rows={6}
              placeholder="支持 Markdown 格式，如：\n\n## 评审标准\n\n- 标准一\n- 标准二\n\n**重要说明：** ..."
            />
          </Form.Item>

          <Form.Item
            name="is_active"
            label="是否启用"
            valuePropName="checked"
          >
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default RuleConfig;
