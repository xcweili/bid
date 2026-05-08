import React, { useState, useEffect } from 'react';
import {
  Card, Button, Typography, Table, Modal, Form, Input,
  message, Space, Select, InputNumber, Switch, Row, Col
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined
} from '@ant-design/icons';
import { evaluationItemService, EvaluationItem } from '../services/evaluationItemService';

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
      item_description: item.item_description,
      max_score: item.max_score,
      min_score: item.min_score,
      weight: item.weight,
      material_category: item.material_category,
      is_active: item.is_active
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
      item.item_code.toLowerCase().includes(searchText.toLowerCase()) ||
      (item.item_description && item.item_description.toLowerCase().includes(searchText.toLowerCase()));
    
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
      title: '评分范围',
      key: 'score_range',
      width: 120,
      render: (_: any, record: EvaluationItem) => (
        <span>{record.min_score} - {record.max_score} 分</span>
      )
    },
    {
      title: '权重',
      dataIndex: 'weight',
      key: 'weight',
      width: 80
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
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>
          <SettingOutlined /> 评审项管理
        </Title>
        <Text type="secondary" style={{ marginLeft: 12 }}>
          管理所有评审项，支持按物资品类筛选
        </Text>
      </div>

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
        width={600}
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
            name="item_description"
            label="评审项描述"
          >
            <TextArea rows={3} placeholder="请输入评审项描述" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="min_score"
                label="最低分"
                rules={[{ required: true, message: '请输入最低分' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="max_score"
                label="最高分"
                rules={[{ required: true, message: '请输入最高分' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="weight"
            label="权重"
            rules={[{ required: true, message: '请输入权重' }]}
          >
            <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
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
