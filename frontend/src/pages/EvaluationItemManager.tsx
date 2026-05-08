import React, { useState, useEffect } from 'react';
import {
  Card, Typography, Table, Tag, Button, Space, message,
  Modal, Input, Row, Col, Switch, InputNumber, Empty, Tooltip
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  SaveOutlined, CloseOutlined, EyeOutlined
} from '@ant-design/icons';
import { evaluationItemService, EvaluationItem } from '../services/evaluationItemService';

const { Title, Text } = Typography;

const EvaluationItemManager: React.FC = () => {
  const [items, setItems] = useState<EvaluationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<EvaluationItem | null>(null);
  const [formData, setFormData] = useState({
    item_code: '',
    item_name: '',
    item_description: '',
    max_score: 100,
    min_score: 0,
    weight: 1,
    is_active: true
  });

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const data = await evaluationItemService.getAllItems();
      setItems(data);
    } catch (error) {
      message.error('获取评审项失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingItem(null);
    setFormData({
      item_code: '',
      item_name: '',
      item_description: '',
      max_score: 100,
      min_score: 0,
      weight: 1,
      is_active: true
    });
    setShowModal(true);
  };

  const handleEdit = (item: EvaluationItem) => {
    setEditingItem(item);
    setFormData({
      item_code: item.item_code,
      item_name: item.item_name,
      item_description: item.item_description || '',
      max_score: item.max_score,
      min_score: item.min_score,
      weight: item.weight,
      is_active: item.is_active
    });
    setShowModal(true);
  };

  const handleDelete = async (itemId: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该评审项吗？',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await evaluationItemService.deleteItem(itemId);
          message.success('删除成功');
          fetchItems();
        } catch (error) {
          message.error('删除失败');
        }
      }
    });
  };

  const handleSave = async () => {
    if (!formData.item_code.trim() || !formData.item_name.trim()) {
      message.warning('请填写评审项编号和名称');
      return;
    }

    try {
      if (editingItem) {
        await evaluationItemService.updateItem(editingItem.id, formData);
        message.success('更新成功');
      } else {
        await evaluationItemService.createItem(formData);
        message.success('创建成功');
      }
      setShowModal(false);
      fetchItems();
    } catch (error: any) {
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const columns = [
    {
      title: '评审项编号',
      dataIndex: 'item_code',
      key: 'item_code',
      width: 150,
      render: (text: string) => <Text strong>{text}</Text>
    },
    {
      title: '评审项名称',
      dataIndex: 'item_name',
      key: 'item_name',
      width: 200
    },
    {
      title: '评分范围',
      key: 'score_range',
      width: 150,
      render: (_: any, record: EvaluationItem) => (
        <span>{record.min_score} - {record.max_score} 分</span>
      )
    },
    {
      title: '权重',
      dataIndex: 'weight',
      key: 'weight',
      width: 100,
      render: (weight: number) => <Tag color="blue">{weight}</Tag>
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (is_active: boolean) => (
        is_active ? (
          <Tag color="green">启用</Tag>
        ) : (
          <Tag color="red">禁用</Tag>
        )
      )
    },
    {
      title: '描述',
      dataIndex: 'item_description',
      key: 'item_description',
      render: (desc: string) => (
        <Tooltip title={desc || '无'}>
          <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block' }}>
            {desc || '-'}
          </span>
        </Tooltip>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: any, record: EvaluationItem) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)}>
            删除
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <Title level={2}>评审项管理</Title>
          <Text type="secondary">管理和配置评审项，可在包中选择需要的评审项</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增评审项
        </Button>
      </div>

      <Card bordered={false}>
        <Table
          columns={columns}
          dataSource={items}
          rowKey="id"
          loading={loading}
          pagination={{
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (total) => `共 ${total} 个评审项`
          }}
          locale={{ emptyText: (
            <Empty 
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<Text type="secondary">暂无评审项，点击上方按钮创建</Text>}
            />
          )}}
        />
      </Card>

      {/* 编辑/创建模态框 */}
      <Modal
        title={editingItem ? '编辑评审项' : '新建评审项'}
        visible={showModal}
        footer={null}
        onCancel={() => setShowModal(false)}
      >
        <div style={{ padding: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>评审项编号 *</label>
              <Input
                value={formData.item_code}
                onChange={(e) => setFormData({ ...formData, item_code: e.target.value })}
                placeholder="请输入评审项编号"
              />
            </Col>
            <Col span={12}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>评审项名称 *</label>
              <Input
                value={formData.item_name}
                onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                placeholder="请输入评审项名称"
              />
            </Col>
          </Row>
          <Row gutter={16} style={{ marginTop: 16 }}>
            <Col span={8}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>最低分</label>
              <InputNumber
                value={formData.min_score}
                onChange={(value) => setFormData({ ...formData, min_score: value || 0 })}
                min={0}
                style={{ width: '100%' }}
              />
            </Col>
            <Col span={8}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>最高分</label>
              <InputNumber
                value={formData.max_score}
                onChange={(value) => setFormData({ ...formData, max_score: value || 100 })}
                min={0}
                style={{ width: '100%' }}
              />
            </Col>
            <Col span={8}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>权重</label>
              <InputNumber
                value={formData.weight}
                onChange={(value) => setFormData({ ...formData, weight: value || 1 })}
                min={0.1}
                step={0.1}
                style={{ width: '100%' }}
              />
            </Col>
          </Row>
          <Row style={{ marginTop: 16 }}>
            <Col span={24}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>描述</label>
              <Input.TextArea
                value={formData.item_description}
                onChange={(e) => setFormData({ ...formData, item_description: e.target.value })}
                placeholder="请输入评审项描述"
                rows={3}
              />
            </Col>
          </Row>
          <Row style={{ marginTop: 16 }}>
            <Col span={24}>
              <Space>
                <span style={{ fontWeight: 500 }}>启用状态</span>
                <Switch
                  checked={formData.is_active}
                  onChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  checkedChildren="启用"
                  unCheckedChildren="禁用"
                />
              </Space>
            </Col>
          </Row>
          <Row style={{ marginTop: 24, textAlign: 'right' }}>
            <Col span={24}>
              <Space>
                <Button onClick={() => setShowModal(false)} icon={<CloseOutlined />}>
                  取消
                </Button>
                <Button type="primary" onClick={handleSave} icon={<SaveOutlined />}>
                  保存
                </Button>
              </Space>
            </Col>
          </Row>
        </div>
      </Modal>
    </div>
  );
};

export default EvaluationItemManager;