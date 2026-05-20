import React, { useState, useEffect } from 'react';
import {
  Card, Button, Typography, Table, Modal, Form, Input,
  message, Space, Select, Switch, Row, Col, Tag, Tooltip
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined
} from '@ant-design/icons';
import { evaluationItemService, EvaluationItem } from '../services/evaluationItemService';
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
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);

  // 获取所有评审项
  useEffect(() => {
    fetchItems();
  }, []);

  // 提取所有物资品类
  useEffect(() => {
    const uniqueCategories = Array.from(new Set(items.map(item => item.material_category).filter(Boolean) as string[]));
    setCategories(uniqueCategories);
  }, [items]);

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
    setShowModal(true);
  };

  const handleEdit = (item: EvaluationItem) => {
    setEditingItem(item);
    form.setFieldsValue({
      item_code: item.item_code,
      item_name: item.item_name,
      material_category: item.material_category,
      is_active: item.is_active,
      workflow_id: item.workflow_id,
      item_content: item.item_content,
      api_key: item.api_key,
      base_url: item.base_url
    });
    setShowModal(true);
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
        await evaluationItemService.updateItem(editingItem.id, values);
        message.success('更新成功');
      } else {
        await evaluationItemService.createItem(values);
        message.success('创建成功');
      }

      setShowModal(false);
      form.resetFields();
      fetchItems();
    } catch (error) {
      console.error('保存失败:', error);
      message.error('保存失败');
    }
  };

  // 过滤数据
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
      title: '工作流ID',
      dataIndex: 'workflow_id',
      key: 'workflow_id',
      width: 200,
      render: (workflowId: string) => (
        workflowId ? (
          <Tag color="purple" style={{ fontSize: 12 }}>
            {workflowId}
          </Tag>
        ) : (
          <Text type="secondary">-</Text>
        )
      )
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
        {/* 搜索和筛选 */}
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

      {/* 新增/编辑模态框 */}
      <Modal
        title={editingItem ? '编辑评审项' : '新增评审项'}
        open={showModal}
        onOk={handleSave}
        onCancel={() => {
          setShowModal(false);
          form.resetFields();
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
            name="workflow_id"
            label="工作流ID"
          >
            <Input placeholder="Dify 工作流 ID（选填，配置后使用带workflow_id的调用方式）" />
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
            <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
              留空则使用默认地址：http://10.255.216.2:8083/v1
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
