import React, { useState, useEffect, useRef } from 'react';
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
  Tabs,
  Descriptions,
  Spin,
  Upload,
  List,
  Table as AntTable
} from 'antd';
import {
  ArrowLeftOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ImportOutlined,
  UploadOutlined,
  FileTextOutlined,
  CloseCircleOutlined,
  FileExcelOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import type { UploadFile } from 'antd';
import * as XLSX from 'xlsx';
import apiClient from '../services/api';
import './CriteriaManagement.css';

const { Title, Text } = Typography;
const { Option } = Select;

interface Criteria {
  id: number;
  criteria_name: string;
  criteria_type: string;
  scoring_criteria: string;
  attached_files: string[];  // 必填：关联的文件名列表
  max_score?: number;  // 可选：满分值
  created_at: string;
}

interface TemplateData {
  id: number;
  template_name: string;
  project_type: string;
  description: string;
  config: {
    items: Criteria[];
  };
  created_at: string;
}

const RuleTemplateDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const templateId = parseInt(id || '0');

  const [templateData, setTemplateData] = useState<TemplateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [criteriaLoading, setCriteriaLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingCriteria, setEditingCriteria] = useState<Criteria | null>(null);
  const [form] = Form.useForm();

  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  
  // 多选相关
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  
  // 搜索和分页
  const [searchText, setSearchText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  // 从文件导入相关状态（支持 Excel 和 MD）
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importType, setImportType] = useState<'technical' | 'business'>('technical');
  const [uploadedFiles, setUploadedFiles] = useState<UploadFile[]>([]);
  const [importTab, setImportTab] = useState<'excel' | 'md'>('md');
  const importFormRef = useRef<any>(null);

  useEffect(() => {
    fetchTemplateDetail();
  }, [templateId]);

  const fetchTemplateDetail = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/api/rule-templates/${templateId}`);
      setTemplateData(response.data);
    } catch (error) {
      message.error('获取模板详情失败');
    } finally {
      setLoading(false);
    }
  };

  const getCriteriaList = (): Criteria[] => {
    return templateData?.config?.items || [];
  };

  const handleCreate = () => {
    setEditingCriteria(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record: Criteria) => {
    // 深拷贝记录，避免修改原对象导致所有评审项都变成编辑的那一项
    const recordCopy = JSON.parse(JSON.stringify(record));
    setEditingCriteria(recordCopy);
    form.setFieldsValue(recordCopy);
    setIsModalVisible(true);
  };

  const handleDelete = (criteriaId: number | undefined, criteriaName?: string, itemIndex?: number) => {
    if (!criteriaId && !criteriaName) {
      message.error('评审项 ID 无效');
      return;
    }
    
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个评审项吗？',
      onOk: async () => {
        try {
          const currentItems = templateData?.config?.items || [];
          
          const updatedItems = currentItems.filter((item, index) => {
            // 如果有有效 id，通过 id 匹配
            if (criteriaId && criteriaId > 0 && item.id === criteriaId) {
              return false;
            }
            // 如果 id 为 0 或没有 id，通过索引匹配（最准确）
            if (itemIndex !== undefined && index === itemIndex) {
              return false;
            }
            // 最后才通过 criteria_name 匹配（仅当没有索引信息时）
            if (criteriaName && (!item.id || item.id === 0) && itemIndex === undefined && item.criteria_name === criteriaName) {
              // 只删除第一个匹配项
              return false;
            }
            return true;
          });
          
          await apiClient.put(`/api/rule-templates/${templateId}`, {
            ...templateData,
            config: { items: updatedItems }
          });
          
          message.success('删除成功');
          fetchTemplateDetail();
          // 清除选中
          setSelectedRowKeys([]);
        } catch (error) {
          message.error('删除失败');
          console.error('删除失败:', error);
        }
      }
    });
  };

  const handleBatchDelete = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要删除的评审项');
      return;
    }
    
    Modal.confirm({
      title: '确认批量删除',
      content: `确定要删除选中的 ${selectedRowKeys.length} 个评审项吗？`,
      onOk: async () => {
        try {
          const currentItems = templateData?.config?.items || [];
          
          // 解析 selectedRowKeys，提取 criteria_name 用于匹配
          const namesToDelete = selectedRowKeys
            .filter(key => typeof key === 'string' && key.startsWith('criteria-'))
            .map(key => key.replace('criteria-', ''));
          
          // 兼容：如果 item 没有 id，通过 criteria_name 匹配
          const updatedItems = currentItems.filter(item => {
            // 如果有 id 且在 selectedRowKeys 中，删除
            if (item.id && selectedRowKeys.includes(item.id)) {
              return false;
            }
            // 如果没有 id 或 id 为 0，通过 criteria_name 匹配
            if (!item.id || item.id === 0) {
              if (namesToDelete.includes(item.criteria_name)) {
                return false;
              }
            }
            return true;
          });
          
          await apiClient.put(`/api/rule-templates/${templateId}`, {
            ...templateData,
            config: { items: updatedItems }
          });
          
          message.success(`成功删除 ${selectedRowKeys.length} 个评审项`);
          fetchTemplateDetail();
          setSelectedRowKeys([]);
        } catch (error) {
          message.error('删除失败');
          console.error('删除失败:', error);
        }
      }
    });
  };

  const onSelectChange = (newSelectedRowKeys: React.Key[]) => {
    setSelectedRowKeys(newSelectedRowKeys);
  };

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      const currentItems = templateData?.config?.items || [];
      
      let updatedItems: Criteria[];
      
      if (editingCriteria) {
        // 更新现有评审项 - 优先通过 id 匹配，id 为 0 时通过 criteria_name 匹配
        updatedItems = currentItems.map((item, index) => {
          // 如果有有效 id，通过 id 匹配
          if (editingCriteria.id && editingCriteria.id > 0 && item.id === editingCriteria.id) {
            return { ...item, ...values };
          }
          // 如果 id 为 0 或没有 id，通过 criteria_name 匹配（需要同时检查索引，避免重复名称时出错）
          if ((!editingCriteria.id || editingCriteria.id === 0) && item.criteria_name === editingCriteria.criteria_name) {
            // 确保只更新第一个匹配项
            const firstMatchIndex = currentItems.findIndex(i => i.criteria_name === editingCriteria.criteria_name);
            if (index === firstMatchIndex) {
              return { ...item, ...values };
            }
          }
          return item;
        });
      } else {
        // 添加新评审项
        const existingIds = currentItems.map(i => i.id).filter(id => id > 0);
        const newId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : Date.now();
        updatedItems = [...currentItems, { ...values, id: newId, created_at: new Date().toISOString() }];
      }
      
      await apiClient.put(`/api/rule-templates/${templateId}`, {
        ...templateData,
        config: { items: updatedItems }
      });
      
      message.success(editingCriteria ? '更新成功' : '添加成功');
      setIsModalVisible(false);
      fetchTemplateDetail();
    } catch (error: any) {
      if (error.response?.data?.detail) {
        message.error(error.response.data.detail);
      } else {
        message.error('操作失败');
      }
    }
  };

  const handleLoadFromTemplate = async () => {
    setCriteriaLoading(true);
    try {
      // 调用 API 从其他模板导入评审项
      const response = await apiClient.post(
        `/api/rule-templates/${templateId}/import?source_type=${selectedTemplate}`
      );
      
      message.success('从模板导入成功');
      setTemplateModalVisible(false);
      fetchTemplateDetail();
    } catch (error) {
      message.error('导入模板失败');
    } finally {
      setCriteriaLoading(false);
    }
  };

  // 从文件导入相关处理函数（支持 Excel 和 MD）
  const handleImportFromFiles = async () => {
    if (uploadedFiles.length === 0) {
      message.warning('请至少上传一个文件');
      return;
    }

    try {
      let newCriteriaList: Criteria[] = [];

      // 根据当前标签页处理不同类型的文件
      if (importTab === 'excel') {
        // Excel 文件处理
        const excelFiles = uploadedFiles.filter(file => 
          file.name?.endsWith('.xlsx') || file.name?.endsWith('.xls')
        );
        
        if (excelFiles.length === 0) {
          message.warning('请上传 Excel 文件（.xlsx 或 .xls）');
          return;
        }

        for (const file of excelFiles) {
          // customRequest 中传入的 file 已经是 File 对象
          const fileToRead = (file as any).originFileObj || (file as any).raw || file;
          const arrayBuffer = await (fileToRead as File).arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

          // 跳过表头，从第二行开始解析
          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || (row as any[]).length === 0) continue;

            // 解析行数据
            const criteriaName = row[0]?.toString() || '';
            const criteriaTypeStr = row[1]?.toString() || '';
            const maxScore = parseFloat(row[2]) || 100;
            const scoringCriteria = row[3]?.toString() || '';
            const attachedFilesStr = row[4]?.toString() || '';

            // 转换评审类型
            let criteriaType: 'technical' | 'business' = importType;
            if (criteriaTypeStr.includes('商务') || criteriaTypeStr === 'business') {
              criteriaType = 'business';
            } else {
              criteriaType = 'technical';
            }

            // 解析关联文件
            const attachedFiles = attachedFilesStr
              ? attachedFilesStr.split(',').map(f => f.trim()).filter(f => f)
              : [];

            if (criteriaName && scoringCriteria) {
              newCriteriaList.push({
                criteria_name: criteriaName,
                criteria_type: criteriaType,
                max_score: maxScore,
                scoring_criteria: scoringCriteria,
                attached_files: attachedFiles,
                id: 0, // 临时 ID，后端会生成
                created_at: new Date().toISOString()
              });
            }
          }
        }
      } else {
        // MD 文件处理
        const mdFiles = uploadedFiles.filter(file => file.name?.endsWith('.md'));
        
        if (mdFiles.length === 0) {
          message.warning('请上传 MD 文件（.md）');
          return;
        }

        for (const file of mdFiles) {
          // 从文件名提取评审项名称（去掉 .md 后缀）
          const criteriaName = file.name?.replace(/\.md$/i, '') || '';
          
          // 读取文件内容
          // customRequest 中传入的 file 已经是 File 对象
          const fileToRead = (file as any).originFileObj || (file as any).raw || file;
          const text = await (fileToRead as File).text();
          
          newCriteriaList.push({
            criteria_name: criteriaName,
            criteria_type: importType,
            scoring_criteria: text,
            max_score: 100, // 默认满分
            attached_files: [file.name || ''], // MD 文件名作为关联文件
            id: 0, // 临时 ID
            created_at: new Date().toISOString()
          });
        }
      }

      if (newCriteriaList.length === 0) {
        message.warning('未找到有效的评审项数据');
        return;
      }

      // 批量添加评审项到模板
      const currentItems = templateData?.config?.items || [];
      const updatedItems = [...currentItems, ...newCriteriaList];

      // 调用批量添加 API
      await apiClient.post(`/api/rule-templates/${templateId}/add-criteria`, {
        criteria_list: newCriteriaList
      });

      message.success(`成功导入 ${newCriteriaList.length} 个评审项`);
      setImportModalVisible(false);
      setUploadedFiles([]);
      setImportType('technical');
      setImportTab('md');
      fetchTemplateDetail();
    } catch (error: any) {
      console.error('导入失败:', error);
      message.error(error.response?.data?.detail || '导入评审项失败');
    }
  };

  const handleBeforeUpload = (file: File) => {
    // 只允许 .md 文件
    const isMdFile = file.name.endsWith('.md');
    if (!isMdFile) {
      message.error('只能上传 .md 文件!');
    }
    return isMdFile;
  };

  const handleBeforeUploadExcel = (file: File) => {
    // 只允许 .xlsx 或 .xls 文件
    const isExcelFile = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    if (!isExcelFile) {
      message.error('只能上传 Excel 文件 (.xlsx 或 .xls)!');
    }
    return isExcelFile;
  };

  const handleFileRemove = (file: UploadFile) => {
    setUploadedFiles(uploadedFiles.filter(f => f.uid !== file.uid));
  };

  const columns = [
    {
      title: '评审项名称',
      dataIndex: 'criteria_name',
      key: 'criteria_name',
      width: 200
    },
    {
      title: '类型',
      dataIndex: 'criteria_type',
      key: 'criteria_type',
      width: 120,
      render: (type: string) => (
        <Tag color={type === 'technical' ? 'blue' : 'green'}>
          {type === 'technical' ? '技术' : '商务'}
        </Tag>
      )
    },
    {
      title: '绑定文件',
      dataIndex: 'attached_files',
      key: 'attached_files',
      width: 300,
      render: (files: string[]) => (
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          {files && files.length > 0 ? (
            files.slice(0, 3).map((file, idx) => (
              <Tag key={idx} icon={<FileTextOutlined />} color="blue" style={{ fontSize: 11 }}>
                {file}
              </Tag>
            ))
          ) : (
            <Tag icon={<ExclamationCircleOutlined />} color="error" style={{ fontSize: 11 }}>
              未绑定
            </Tag>
          )}
          {files && files.length > 3 && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              还有 {files.length - 3} 个文件
            </Text>
          )}
        </Space>
      )
    },
    {
      title: '评审标准',
      dataIndex: 'scoring_criteria',
      key: 'scoring_criteria',
      ellipsis: true,
      width: 300
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: Criteria, index: number) => (
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
            onClick={() => handleDelete(record.id, record.criteria_name, index)}
          >
            删除
          </Button>
        </Space>
      )
    }
  ];

  const criteriaList = getCriteriaList();
  
  // 搜索过滤
  const filteredCriteriaList = criteriaList.filter(item => {
    if (!searchText) return true;
    const search = searchText.toLowerCase();
    return (
      item.criteria_name?.toLowerCase().includes(search) ||
      item.scoring_criteria?.toLowerCase().includes(search) ||
      (item.attached_files || []).some(f => f.toLowerCase().includes(search))
    );
  });
  
  // 行选择配置
  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys);
    },
    selections: [
      Table.SELECTION_ALL,
      Table.SELECTION_INVERT,
      Table.SELECTION_NONE
    ]
  };
  
  // 分页配置
  const paginationConfig = {
    current: currentPage,
    pageSize: pageSize,
    total: filteredCriteriaList.length,
    showSizeChanger: true,
    showTotal: (total: number) => `共 ${total} 条`,
    pageSizeOptions: ['5', '10', '20', '50', '100'],
    onChange: (page: number, size: number) => {
      setCurrentPage(page);
      setPageSize(size);
      setSelectedRowKeys([]); // 切换页时清除选中
    },
    onShowSizeChange: (current: number, size: number) => {
      setCurrentPage(1);
      setPageSize(size);
      setSelectedRowKeys([]);
    }
  };
  
  // 获取当前页数据
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentCriteriaList = filteredCriteriaList.slice(startIndex, endIndex);
  
  const tabs = [
    {
      key: 'all',
      label: '全部评审项',
      children: (
        <Table 
          columns={columns} 
          dataSource={currentCriteriaList} 
          rowKey={(record) => `criteria-${record.id || record.criteria_name || Math.random()}`} 
          rowSelection={rowSelection}
          loading={criteriaLoading} 
          pagination={paginationConfig}
        />
      )
    },
    {
      key: 'technical',
      label: '技术评审项',
      children: (
        <Table 
          columns={columns} 
          dataSource={currentCriteriaList.filter(c => c.criteria_type === 'technical')} 
          rowKey={(record) => `criteria-${record.id || record.criteria_name || Math.random()}`} 
          rowSelection={rowSelection}
          loading={criteriaLoading} 
          pagination={paginationConfig}
        />
      )
    },
    {
      key: 'business',
      label: '商务评审项',
      children: (
        <Table 
          columns={columns} 
          dataSource={currentCriteriaList.filter(c => c.criteria_type === 'business')} 
          rowKey={(record) => `criteria-${record.id || record.criteria_name || Math.random()}`} 
          rowSelection={rowSelection}
          loading={criteriaLoading} 
          pagination={paginationConfig}
        />
      )
    }
  ];

  const getProjectTypeText = (type: string) => {
    const typeMap: Record<string, string> = {
      service: '服务类',
      material: '物资类',
      engineering: '工程类'
    };
    return typeMap[type] || type;
  };

  if (loading) {
    return (
      <div className="criteria-management" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  if (!templateData) {
    return (
      <div className="criteria-management">
        <Card>
          <Title level={4}>模板不存在</Title>
          <Button onClick={() => navigate('/rule-templates')}>返回列表</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="criteria-management">
      <div className="page-header">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/rule-templates')}>
          返回
        </Button>
        <div className="header-content">
          <Title level={4} style={{ margin: 0 }}>模板详情</Title>
          <Text type="secondary"> - {templateData.template_name}</Text>
        </div>
      </div>

      {/* 模板基本信息 */}
      <Card className="criteria-card" style={{ marginBottom: 24 }}>
        <Descriptions title="模板信息" bordered column={3}>
          <Descriptions.Item label="模板名称">{templateData.template_name}</Descriptions.Item>
          <Descriptions.Item label="项目类型">
            <Tag color={
              templateData.project_type === 'service' ? 'blue' :
              templateData.project_type === 'material' ? 'green' : 'orange'
            }>
              {getProjectTypeText(templateData.project_type)}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {templateData.created_at ? new Date(templateData.created_at).toLocaleDateString('zh-CN') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="描述" span={3}>{templateData.description || '无描述'}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 评审项列表 */}
      <Card className="criteria-card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <Title level={5} style={{ margin: 0 }}>评审项列表</Title>
          <Space style={{ flex: 1, justifyContent: 'flex-end' }}>
            <Input.Search
              placeholder="搜索评审项名称、标准或文件"
              value={searchText}
              onChange={(e) => { setSearchText(e.target.value); setCurrentPage(1); }}
              style={{ width: 250 }}
              allowClear
            />
            {selectedRowKeys.length > 0 && (
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={handleBatchDelete}
              >
                批量删除 ({selectedRowKeys.length})
              </Button>
            )}
            <Button
              icon={<ImportOutlined />}
              onClick={() => setImportModalVisible(true)}
            >
              导入
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

        <Tabs 
          items={tabs} 
          style={{ marginTop: 16 }}
          className="criteria-tabs"
        />
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
            name="scoring_criteria"
            label="评审标准"
            rules={[{ required: true, message: '请输入评审标准' }]}
          >
            <Input.TextArea rows={4} placeholder="输入详细的评审标准" />
          </Form.Item>

      <Form.Item
            name="attached_files"
            label="绑定文件 *"
            rules={[{ required: true, message: '请至少绑定一个文件' }]}
            tooltip="AI 评审时将从这些文件中提取内容，支持多个文件"
          >
            <Select
              mode="tags"
              placeholder="输入文件名，按 Enter 添加（例如：技术方案.pdf）"
              style={{ width: '100%' }}
              tokenSeparators={[',']}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 从文件导入弹窗（支持 Excel 和 MD） */}
      <Modal
        title="导入评审项"
        open={importModalVisible}
        onOk={() => handleImportFromFiles()}
        onCancel={() => {
          setImportModalVisible(false);
          setUploadedFiles([]);
          setImportType('technical');
          setImportTab('md');
        }}
        okText="导入"
        cancelText="取消"
        width={800}
        okButtonProps={{ disabled: uploadedFiles.length === 0 }}
        destroyOnClose={false}
        footer={(_, { OkBtn }) => (
          <>
            <Button onClick={() => setImportModalVisible(false)}>取消</Button>
            <Button 
              type="primary" 
              onClick={() => handleImportFromFiles()}
              disabled={uploadedFiles.length === 0}
            >
              导入
            </Button>
          </>
        )}
      >
        <div style={{ padding: '16px 0' }}>
          {/* 评审类型选择 */}
          <div style={{ marginBottom: 24 }}>
            <Form.Item
              label="评审类型"
              rules={[{ required: true, message: '请选择评审类型' }]}
            >
              <Select
                value={importType}
                onChange={(value) => setImportType(value)}
                style={{ width: '100%' }}
              >
                <Option value="technical">技术评审</Option>
                <Option value="business">商务评审</Option>
              </Select>
            </Form.Item>
          </div>

          {/* 导入方式切换 */}
          <Tabs
            activeKey={importTab}
            onChange={(key) => setImportTab(key as 'excel' | 'md')}
            items={[
              {
                key: 'excel',
                label: 'Excel 导入',
                children: (
                  <div>
                    {/* 文件上传区域 */}
                    <div style={{ marginBottom: 16 }}>
                      <Text strong style={{ marginBottom: 8, display: 'block' }}>上传 Excel 文件</Text>
                      <Upload
                        multiple
                        accept=".xlsx,.xls"
                        beforeUpload={handleBeforeUploadExcel}
                        onRemove={(file) => {
                          setUploadedFiles(uploadedFiles.filter(f => f.uid !== file.uid));
                        }}
                        fileList={uploadedFiles}
                        maxCount={10}
                        showUploadList={false}
                        customRequest={({ file }) => {
                          // 禁用自动上传，文件保存在 fileList 中，由 handleImportFromFiles 处理
                          setUploadedFiles([...uploadedFiles, file]);
                        }}
                      >
                        <Button icon={<UploadOutlined />} block>
                          点击或拖拽上传 Excel 文件
                        </Button>
                      </Upload>

                      {/* 文件列表预览 */}
                      {uploadedFiles.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                          <Text type="secondary">已上传 {uploadedFiles.length} 个文件：</Text>
                          <List
                            size="small"
                            dataSource={uploadedFiles}
                            renderItem={(file) => (
                              <List.Item key={file.uid}
                                actions={[
                                  <Button
                                    type="text"
                                    danger
                                    icon={<CloseCircleOutlined />}
                                    onClick={() => handleFileRemove(file)}
                                  >
                                    删除
                                  </Button>
                                ]}
                              >
                                <List.Item.Meta
                                  avatar={<FileExcelOutlined style={{ fontSize: 18, color: '#52c41a' }} />}
                                  title={file.name}
                                />
                              </List.Item>
                            )}
                          />
                        </div>
                      )}
                    </div>

                    {/* Excel 模板示例 */}
                    <div style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
                      <Text strong style={{ marginBottom: 8, display: 'block' }}>Excel 模板格式说明：</Text>
                      <AntTable
                        size="small"
                        bordered
                        pagination={false}
                        dataSource={[
                          { key: '1', col1: '技术方案', col2: '技术评审', col3: '100', col4: '从架构设计、性能优化、安全性等方面评估', col5: '架构图.docx,性能报告.pdf' },
                          { key: '2', col1: '实施计划', col2: '技术评审', col3: '80', col4: '评估项目进度安排的合理性和可执行性', col5: '' }
                        ]}
                        columns={[
                          { title: '评审项名称', dataIndex: 'col1', width: 120 },
                          { title: '评审类型', dataIndex: 'col2', width: 100 },
                          { title: '满分', dataIndex: 'col3', width: 80 },
                          { title: '评审标准', dataIndex: 'col4' },
                          { title: '关联文件', dataIndex: 'col5' }
                        ]}
                      />
                      <div style={{ marginTop: 12, fontSize: 12 }}>
                        <Text type="secondary">
                          • 评审项名称：必填，评审项的名称<br />
                          • 评审类型：必填，填写"技术评审"或"商务评审"<br />
                          • 满分：必填，该评审项的满分值<br />
                          • 评审标准：必填，详细的评审标准描述<br />
                          • 关联文件：可选，多个文件名用逗号分隔
                        </Text>
                      </div>
                    </div>
                  </div>
                )
              },
              {
                key: 'md',
                label: 'MD 文件导入',
                children: (
                  <div>
                    {/* 文件上传区域 */}
                    <div style={{ marginBottom: 16 }}>
                      <Text strong style={{ marginBottom: 8, display: 'block' }}>上传 MD 文件</Text>
                      <Upload
                        multiple
                        accept=".md"
                        beforeUpload={handleBeforeUpload}
                        onRemove={(file) => {
                          setUploadedFiles(uploadedFiles.filter(f => f.uid !== file.uid));
                        }}
                        fileList={uploadedFiles}
                        maxCount={10}
                        showUploadList={false}
                        customRequest={({ file }) => {
                          // 禁用自动上传，文件保存在 fileList 中，由 handleImportFromFiles 处理
                          setUploadedFiles([...uploadedFiles, file]);
                        }}
                      >
                        <Button icon={<UploadOutlined />} block>
                          点击或拖拽上传 MD 文件
                        </Button>
                      </Upload>

                      {/* 文件列表预览 */}
                      {uploadedFiles.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                          <Text type="secondary">已上传 {uploadedFiles.length} 个文件：</Text>
                          <List
                            size="small"
                            dataSource={uploadedFiles}
                            renderItem={(file) => (
                              <List.Item key={file.uid}
                                actions={[
                                  <Button
                                    type="text"
                                    danger
                                    icon={<CloseCircleOutlined />}
                                    onClick={() => handleFileRemove(file)}
                                  >
                                    删除
                                  </Button>
                                ]}
                              >
                                <List.Item.Meta
                                  avatar={<FileTextOutlined style={{ fontSize: 18, color: '#1890ff' }} />}
                                  title={file.name}
                                />
                              </List.Item>
                            )}
                          />
                        </div>
                      )}
                    </div>

                    {/* 提示信息 */}
                    <div style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        💡 提示：文件名将作为评审项名称（自动去掉 .md 后缀），文件内容将作为评审标准
                      </Text>
                    </div>
                  </div>
                )
              }
            ]}
          />
        </div>
      </Modal>

      {/* 模板选择弹窗 */}
      <Modal
        title="从其他模板导入评审项"
        open={templateModalVisible}
        onOk={handleLoadFromTemplate}
        onCancel={() => setTemplateModalVisible(false)}
        okText="导入"
        cancelText="取消"
        confirmLoading={criteriaLoading}
      >
        <div style={{ padding: '16px 0' }}>
          <Text>选择要导入的模板类型：</Text>
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

export default RuleTemplateDetail;
