import React, { useState, useEffect } from 'react';
import {
  Card, Typography, Table, Tag, Button, Space, message,
  Modal, Input, Row, Col, Switch, Empty, Tooltip, Upload,
  Divider, Popover
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  SaveOutlined, CloseOutlined, EyeOutlined, FileTextOutlined,
  CopyOutlined, FileImageOutlined, FilePdfOutlined,
  FileWordOutlined, FileExcelOutlined, FileOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { evaluationItemService, EvaluationItem, FileInfo, FileCreateRequest } from '../services/evaluationItemService';
import PageHeader from '../components/PageHeader';

const { Title, Text } = Typography;

const getFileIcon = (fileType: string | undefined) => {
  if (!fileType) return <FileOutlined />;
  const lowerType = fileType.toLowerCase();
  if (lowerType.includes('pdf')) return <FilePdfOutlined />;
  if (lowerType.includes('doc') || lowerType.includes('docx')) return <FileWordOutlined />;
  if (lowerType.includes('xls') || lowerType.includes('xlsx')) return <FileExcelOutlined />;
  if (lowerType.includes('image') || lowerType.includes('jpg') || lowerType.includes('png')) return <FileImageOutlined />;
  return <FileTextOutlined />;
};

const getFileSize = (size: number | undefined) => {
  if (!size) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
};

const EvaluationItemManager: React.FC = () => {
  const [items, setItems] = useState<EvaluationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editingItem, setEditingItem] = useState<EvaluationItem | null>(null);
  const [formData, setFormData] = useState({
    item_code: '',
    item_name: '',
    item_content: '',
    is_active: true,
    workflow_id: '',
    base_url: '',
    api_key: ''
  });
  const [currentItemFiles, setCurrentItemFiles] = useState<FileInfo[]>([]);
  const [deletedFileIds, setDeletedFileIds] = useState<number[]>([]);
  const [newFileName, setNewFileName] = useState('');
  const [previewContent, setPreviewContent] = useState('');

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
      item_content: '',
      is_active: true,
      workflow_id: '',
      base_url: '',
      api_key: ''
    });
    setCurrentItemFiles([]);
    setDeletedFileIds([]);
    setNewFileName('');
    setShowModal(true);
  };

  const handleEdit = async (item: EvaluationItem) => {
    setEditingItem(item);
    
    try {
      const latestItem = await evaluationItemService.getItem(item.id);
      setFormData({
        item_code: latestItem.item_code,
        item_name: latestItem.item_name,
        item_content: latestItem.item_content || '',
        is_active: latestItem.is_active,
        workflow_id: latestItem.workflow_id || '',
        base_url: latestItem.base_url || '',
        api_key: latestItem.api_key || ''
      });
      setCurrentItemFiles(latestItem.files || []);
    } catch {
      // 如果获取失败，使用表格中的数据
      setFormData({
        item_code: item.item_code,
        item_name: item.item_name,
        item_content: item.item_content || '',
        is_active: item.is_active,
        workflow_id: item.workflow_id || '',
        base_url: item.base_url || '',
        api_key: item.api_key || ''
      });
      setCurrentItemFiles([]);
    }
    
    setDeletedFileIds([]);
    setNewFileName('');
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
        const newFiles = currentItemFiles.filter(f => f.id < 0);
        const updateData: any = {
          ...formData,
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
        const newItem = await evaluationItemService.createItem(formData);
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
      fetchItems();
    } catch (error: any) {
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const handleAddFile = () => {
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
  
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddFile();
    }
  };

  const handleRemoveFile = (fileId: number) => {
    // 如果是临时文件（ID 为负数），直接从列表中移除
    if (fileId < 0) {
      setCurrentItemFiles(prev => prev.filter(f => f.id !== fileId));
    } else {
      // 如果是已有文件，添加到待删除列表，并从显示列表中移除
      setDeletedFileIds(prev => {
        if (!prev.includes(fileId)) {
          return [...prev, fileId];
        }
        return prev;
      });
      setCurrentItemFiles(prev => prev.filter(f => f.id !== fileId));
    }
  };

  const handlePreview = () => {
    setPreviewContent(formData.item_content || '暂无内容');
    setShowPreview(true);
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
      title: '工作流ID',
      dataIndex: 'workflow_id',
      key: 'workflow_id',
      width: 200,
      render: (workflowId: string) => (
        workflowId ? (
          <Tag color="purple" style={{ fontSize: 12 }}>
            <Tooltip title={workflowId}>
              <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block' }}>
                {workflowId}
              </span>
            </Tooltip>
          </Tag>
        ) : (
          <Text type="secondary">-</Text>
        )
      )
    },
    {
      title: 'API配置',
      key: 'api_config',
      width: 180,
      render: (_: any, record: EvaluationItem) => (
        record.api_key || record.base_url ? (
          <Tooltip title={record.base_url ? `地址: ${record.base_url}` : '使用全局配置'}>
            <Tag color="cyan">已配置</Tag>
          </Tooltip>
        ) : (
          <Text type="secondary">-</Text>
        )
      )
    },
    {
      title: '关联文件数',
      key: 'file_count',
      width: 120,
      render: (_: any, record: EvaluationItem) => (
        <Tag color="blue">{record.files?.length || 0} 个</Tag>
      )
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
      title: '评审项内容',
      dataIndex: 'item_content',
      key: 'item_content',
      render: (content: string) => (
        <Tooltip title={content || '无内容'}>
          <span style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', whiteSpace: 'nowrap' }}>
            {content || '-'}
          </span>
        </Tooltip>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
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
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <PageHeader
          title="评审项管理"
          description="管理和配置评审项，可在包中选择需要的评审项"
          icon={<SettingOutlined />}
        />
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
        width={800}
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
            <Col span={24}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>工作流ID</label>
              <Input
                value={formData.workflow_id}
                onChange={(e) => setFormData({ ...formData, workflow_id: e.target.value })}
                placeholder="Dify 工作流 ID"
              />
            </Col>
          </Row>
          <Row gutter={16} style={{ marginTop: 16 }}>
            <Col span={12}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Dify API 基础地址</label>
              <Input
                value={formData.base_url}
                onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                placeholder="如: http://localhost:8083/v1"
              />
            </Col>
            <Col span={12}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Dify API Key</label>
              <Input
                value={formData.api_key}
                onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                placeholder="Dify API Key"
              />
            </Col>
          </Row>
          <Row style={{ marginTop: 16 }}>
            <Col span={24}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>评审项内容（Markdown格式）</label>
                <Button size="small" icon={<EyeOutlined />} onClick={handlePreview}>
                  预览
                </Button>
              </div>
              <Input.TextArea
                value={formData.item_content}
                onChange={(e) => setFormData({ ...formData, item_content: e.target.value })}
                placeholder="支持 Markdown 格式，如：\n\n## 评审标准\n\n- 标准一\n- 标准二\n\n**重要说明：** ..."
                rows={6}
              />
            </Col>
          </Row>

          {/* 文件列表 */}
          <Divider style={{ marginTop: 20, marginBottom: 16 }}>绑定文件</Divider>
          <Row gutter={16}>
            <Col span={24}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text strong>已绑定文件</Text>
              </div>
              
              {currentItemFiles.filter(f => !deletedFileIds.includes(f.id)).length === 0 ? (
                <Empty 
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={<Text type="secondary">暂无绑定文件</Text>}
                  style={{ margin: 0 }}
                />
              ) : (
                <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e8e8e8', borderRadius: 4 }}>
                  {currentItemFiles.filter(f => !deletedFileIds.includes(f.id)).map(file => (
                    <div 
                      key={file.id} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        padding: '10px 12px', 
                        borderBottom: currentItemFiles.filter(f => !deletedFileIds.includes(f.id))[currentItemFiles.filter(f => !deletedFileIds.includes(f.id)).length - 1]?.id === file.id ? 'none' : '1px solid #f0f0f0'
                      }}
                    >
                      <span style={{ marginRight: 10, color: '#1890ff' }}>{getFileIcon(file.file_type)}</span>
                      <div style={{ flex: 1 }}>
                        <Text strong>{file.file_name}</Text>
                        <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>{getFileSize(file.file_size)}</Text>
                          {file.description && <Text type="secondary" style={{ fontSize: 12 }}>{file.description}</Text>}
                        </div>
                      </div>
                      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleRemoveFile(file.id)} />
                    </div>
                  ))}
                </div>
              )}
              
              {/* 添加文件输入框 */}
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <Input
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="输入文件名，回车确认添加"
                  style={{ flex: 1 }}
                />
                <Button size="small" type="primary" icon={<PlusOutlined />} onClick={handleAddFile}>
                  添加
                </Button>
              </div>
              <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
                评审时将自动从投标人文件夹下查找同名的.md文件
              </Text>
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

      {/* 预览模态框 */}
      <Modal
        title="评审内容预览"
        visible={showPreview}
        footer={null}
        onCancel={() => setShowPreview(false)}
        width={700}
      >
        <div style={{ padding: 16 }}>
          <div style={{ 
            minHeight: 300, 
            padding: 20, 
            backgroundColor: '#fafafa', 
            borderRadius: 8,
            whiteSpace: 'pre-wrap',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            lineHeight: 1.6
          }}>
            {previewContent || '暂无内容'}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default EvaluationItemManager;
