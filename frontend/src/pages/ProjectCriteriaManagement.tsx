import React, { useState, useEffect } from 'react';
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
  Upload,
  List,
  Alert,
  Switch,
  Tooltip
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
  SyncOutlined,
  CheckCircleOutlined,
  CopyOutlined
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
  attached_files?: string[];
  is_template?: boolean;
  template_source?: string;
  created_at: string;
  updated_at?: string;
}

interface ProjectInfo {
  id: number;
  project_name: string;
  project_type: string;
}

const ProjectCriteriaManagement: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projectId = parseInt(id || '0');

  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [criteriaList, setCriteriaList] = useState<Criteria[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingCriteria, setEditingCriteria] = useState<Criteria | null>(null);
  const [form] = Form.useForm();

  // 从模板导入相关状态
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [importingFromTemplate, setImportingFromTemplate] = useState(false);
  const [shouldOverwrite, setShouldOverwrite] = useState(false);

  // 从文件导入相关状态
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importType, setImportType] = useState<'technical' | 'business'>('technical');
  const [uploadedFiles, setUploadedFiles] = useState<UploadFile[]>([]);
  const [importTab, setImportTab] = useState<'excel' | 'md'>('md');

  useEffect(() => {
    fetchProjectInfo();
    fetchCriteria();
  }, [projectId]);

  const fetchProjectInfo = async () => {
    try {
      const response = await apiClient.get(`/api/projects/${projectId}`);
      setProjectInfo(response.data);
    } catch (error) {
      message.error('获取项目信息失败');
    }
  };

  const fetchCriteria = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/api/projects/${projectId}/criteria`);
      setCriteriaList(response.data);
    } catch (error) {
      message.error('获取评审项失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingCriteria(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record: Criteria) => {
    setEditingCriteria(record);
    form.setFieldsValue(record);
    setIsModalVisible(true);
  };

  const handleDelete = (id: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个评审项吗？删除后不可恢复。',
      onOk: async () => {
        try {
          await apiClient.delete(`/api/projects/${projectId}/criteria/${id}`);
          message.success('删除成功');
          fetchCriteria();
        } catch (error: any) {
          message.error(error.response?.data?.detail || '删除失败');
        }
      }
    });
  };

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingCriteria) {
        await apiClient.put(`/api/projects/${projectId}/criteria/${editingCriteria.id}`, values);
        message.success('更新成功');
      } else {
        await apiClient.post(`/api/projects/${projectId}/criteria`, values);
        message.success('创建成功');
      }
      
      setIsModalVisible(false);
      fetchCriteria();
    } catch (error: any) {
      if (error.response?.data?.detail) {
        message.error(error.response.data.detail);
      } else {
        message.error('操作失败');
      }
    }
  };

  // 从模板导入评审项
  const handleImportFromTemplate = async () => {
    if (!selectedTemplate) {
      message.warning('请选择模板类型');
      return;
    }

    setImportingFromTemplate(true);
    try {
      const response = await apiClient.post(
        `/api/projects/${projectId}/criteria/from-template?template_type=${selectedTemplate}&overwrite=${shouldOverwrite}`
      );
      
      const importedCount = response.data?.imported_count || 0;
      message.success(`从模板导入成功，共导入 ${importedCount} 个评审项`);
      setTemplateModalVisible(false);
      setSelectedTemplate('');
      setShouldOverwrite(false);
      fetchCriteria();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '导入模板失败');
    } finally {
      setImportingFromTemplate(false);
    }
  };

  // 从文件导入评审项
  const handleImportFromFiles = async () => {
    if (uploadedFiles.length === 0) {
      message.warning('请至少上传一个文件');
      return;
    }

    try {
      let newCriteriaList: Criteria[] = [];

      if (importTab === 'excel') {
        const excelFiles = uploadedFiles.filter(file => 
          file.name?.endsWith('.xlsx') || file.name?.endsWith('.xls')
        );
        
        if (excelFiles.length === 0) {
          message.warning('请上传 Excel 文件（.xlsx 或 .xls）');
          return;
        }

        for (const file of excelFiles) {
          const arrayBuffer = await file.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || row.length === 0) continue;

            const criteriaName = row[0]?.toString() || '';
            const criteriaTypeStr = row[1]?.toString() || '';
            const scoringCriteria = row[2]?.toString() || '';
            const attachedFilesStr = row[3]?.toString() || '';

            let criteriaType: 'technical' | 'business' = importType;
            if (criteriaTypeStr.includes('商务') || criteriaTypeStr === 'business') {
              criteriaType = 'business';
            } else {
              criteriaType = 'technical';
            }

            const attachedFiles = attachedFilesStr
              ? attachedFilesStr.split(',').map(f => f.trim()).filter(f => f)
              : [];

            if (criteriaName && scoringCriteria) {
              newCriteriaList.push({
                criteria_name: criteriaName,
                criteria_type: criteriaType,
                scoring_criteria: scoringCriteria,
                attached_files: attachedFiles,
                id: 0,
                created_at: new Date().toISOString()
              });
            }
          }
        }
      } else {
        const mdFiles = uploadedFiles.filter(file => file.name?.endsWith('.md'));
        
        if (mdFiles.length === 0) {
          message.warning('请上传 MD 文件（.md）');
          return;
        }

        for (const file of mdFiles) {
          const criteriaName = file.name?.replace(/\.md$/i, '') || '';
          const text = await file.text();
          
          newCriteriaList.push({
            criteria_name: criteriaName,
            criteria_type: importType,
            scoring_criteria: text,
            attached_files: [file.name || ''],
            id: 0,
            created_at: new Date().toISOString()
          });
        }
      }

      if (newCriteriaList.length === 0) {
        message.warning('未找到有效的评审项数据');
        return;
      }

      // 批量添加评审项
      for (const criteria of newCriteriaList) {
        await apiClient.post(`/api/projects/${projectId}/criteria`, criteria);
      }

      message.success(`成功导入 ${newCriteriaList.length} 个评审项`);
      setImportModalVisible(false);
      setUploadedFiles([]);
      setImportType('technical');
      setImportTab('md');
      fetchCriteria();
    } catch (error) {
      console.error('导入失败:', error);
      message.error('导入评审项失败');
    }
  };

  const handleBeforeUpload = (file: File) => {
    const isMdFile = file.name.endsWith('.md');
    if (!isMdFile) {
      message.error('只能上传 .md 文件!');
    }
    return isMdFile;
  };

  const handleBeforeUploadExcel = (file: File) => {
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
      width: 100,
      render: (type: string) => (
        <Tag color={type === 'technical' ? 'blue' : 'green'}>
          {type === 'technical' ? '技术' : '商务'}
        </Tag>
      )
    },
    {
      title: '评审标准',
      dataIndex: 'scoring_criteria',
      key: 'scoring_criteria',
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text}>
          <div style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {text}
          </div>
        </Tooltip>
      )
    },
    {
      title: '来源',
      key: 'source',
      width: 120,
      render: (_: any, record: Criteria) => {
        if (record.is_template) {
          return <Tag icon={<CopyOutlined />} color="purple">从模板导入</Tag>;
        }
        return <Tag color="default">手动创建</Tag>;
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: Criteria) => (
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
            onClick={() => handleDelete(record.id)}
          >
            删除
          </Button>
        </Space>
      )
    }
  ];

  const criteriaListTechnical = criteriaList.filter(c => c.criteria_type === 'technical');
  const criteriaListBusiness = criteriaList.filter(c => c.criteria_type === 'business');

  const getProjectTypeText = (type: string) => {
    const typeMap: Record<string, string> = {
      service: '服务类',
      material: '物资类',
      engineering: '工程类'
    };
    return typeMap[type] || type;
  };

  return (
    <div className="criteria-management">
      <div className="page-header">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/projects/${projectId}`)}>
          返回
        </Button>
        <div className="header-content">
          <Title level={4} style={{ margin: 0 }}>项目评审项管理</Title>
          <Text type="secondary"> - {projectInfo?.project_name || projectId}</Text>
        </div>
      </div>

      {/* 项目信息卡片 */}
      <Card className="criteria-card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={5} style={{ margin: '0 0 8px 0' }}>
              {projectInfo?.project_name || '项目'}
            </Title>
            <Space>
              <Tag color="blue">{projectInfo ? getProjectTypeText(projectInfo.project_type) : '-'}</Tag>
              <Text type="secondary">
                技术评审项：{criteriaListTechnical.length} | 商务评审项：{criteriaListBusiness.length}
              </Text>
            </Space>
          </div>
          <Space>
            <Button
              icon={<ImportOutlined />}
              onClick={() => setTemplateModalVisible(true)}
            >
              从模板导入
            </Button>
            <Button
              icon={<UploadOutlined />}
              onClick={() => setImportModalVisible(true)}
            >
              从文件导入
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
      </Card>

      {/* 评审项列表 */}
      <Card className="criteria-card">
        <Tabs
          items={[
            {
              key: 'all',
              label: `全部评审项 (${criteriaList.length})`,
              children: (
                <Table 
                  columns={columns} 
                  dataSource={criteriaList} 
                  rowKey="id" 
                  loading={loading} 
                  pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
                  scroll={{ x: 900 }}
                />
              )
            },
            {
              key: 'technical',
              label: `技术评审项 (${criteriaListTechnical.length})`,
              children: (
                <Table 
                  columns={columns} 
                  dataSource={criteriaListTechnical} 
                  rowKey="id" 
                  loading={loading} 
                  pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
                  scroll={{ x: 900 }}
                />
              )
            },
            {
              key: 'business',
              label: `商务评审项 (${criteriaListBusiness.length})`,
              children: (
                <Table 
                  columns={columns} 
                  dataSource={criteriaListBusiness} 
                  rowKey="id" 
                  loading={loading} 
                  pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
                  scroll={{ x: 900 }}
                />
              )
            }
          ]}
        />
      </Card>

      {/* 新增/编辑评审项弹窗 */}
      <Modal
        title={editingCriteria ? '编辑评审项' : '新增评审项'}
        open={isModalVisible}
        onOk={handleFormSubmit}
        onCancel={() => setIsModalVisible(false)}
        okText="确定"
        cancelText="取消"
        width={600}
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
            <Input.TextArea rows={6} placeholder="输入详细的评审标准，描述如何对该项进行评分" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 从模板导入弹窗 */}
      <Modal
        title="从模板导入评审项"
        open={templateModalVisible}
        onOk={handleImportFromTemplate}
        onCancel={() => {
          setTemplateModalVisible(false);
          setSelectedTemplate('');
          setShouldOverwrite(false);
        }}
        okText="导入"
        cancelText="取消"
        confirmLoading={importingFromTemplate}
        width={600}
      >
        <div style={{ padding: '16px 0' }}>
          <Alert
            message="提示"
            description="从模板导入的评审项将作为项目自己的评审项，后续可以独立编辑，不会影响模板。"
            type="info"
            showIcon
            style={{ marginBottom: 24 }}
          />

          <div style={{ marginBottom: 24 }}>
            <Text strong>选择模板类型：</Text>
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

          <div style={{ marginBottom: 16 }}>
            <Text strong>导入方式：</Text>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Switch
                checked={shouldOverwrite}
                onChange={setShouldOverwrite}
                checkedChildren="覆盖现有"
                unCheckedChildren="追加到现有"
              />
              <Text type="secondary">
                {shouldOverwrite ? '将清空现有评审项，导入模板中的所有评审项' : '将模板评审项添加到现有评审项后面'}
              </Text>
            </div>
          </div>
        </div>
      </Modal>

      {/* 从文件导入弹窗 */}
      <Modal
        title="从文件导入评审项"
        open={importModalVisible}
        onOk={handleImportFromFiles}
        onCancel={() => {
          setImportModalVisible(false);
          setUploadedFiles([]);
          setImportType('technical');
          setImportTab('md');
        }}
        okText="导入"
        cancelText="取消"
        width={800}
      >
        <div style={{ padding: '16px 0' }}>
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

          <Tabs
            activeKey={importTab}
            onChange={(key) => setImportTab(key)}
            items={[
              {
                key: 'excel',
                label: 'Excel 导入',
                children: (
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <Text strong style={{ marginBottom: 8, display: 'block' }}>上传 Excel 文件</Text>
                      <Upload
                        multiple
                        accept=".xlsx,.xls"
                        beforeUpload={handleBeforeUploadExcel}
                        onRemove={(file) => handleFileRemove(file)}
                        fileList={uploadedFiles}
                        maxCount={10}
                        showUploadList={false}
                      >
                        <Button icon={<FileExcelOutlined />} block>
                          点击或拖拽上传 Excel 文件
                        </Button>
                      </Upload>

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

                    <div style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
                      <Text strong style={{ marginBottom: 8, display: 'block' }}>Excel 模板格式：</Text>
                      <Table
                        size="small"
                        bordered
                        pagination={false}
                        dataSource={[
                          { col1: '技术方案', col2: '技术评审', col3: '评估技术方案的可行性' },
                          { col1: '实施计划', col2: '技术评审', col3: '评估项目进度安排' }
                        ]}
                        columns={[
                          { title: '评审项名称', dataIndex: 'col1', width: 120 },
                          { title: '评审类型', dataIndex: 'col2', width: 100 },
                          { title: '评审标准', dataIndex: 'col3' }
                        ]}
                      />
                      <div style={{ marginTop: 12, fontSize: 12 }}>
                        <Text type="secondary">
                          • 第一行是表头，从第二行开始填写数据<br />
                          • 评审项名称、评审类型、评审标准为必填项
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
                    <div style={{ marginBottom: 16 }}>
                      <Text strong style={{ marginBottom: 8, display: 'block' }}>上传 MD 文件</Text>
                      <Upload
                        multiple
                        accept=".md"
                        beforeUpload={handleBeforeUpload}
                        onRemove={(file) => handleFileRemove(file)}
                        fileList={uploadedFiles}
                        maxCount={10}
                        showUploadList={false}
                      >
                        <Button icon={<FileTextOutlined />} block>
                          点击或拖拽上传 MD 文件
                        </Button>
                      </Upload>

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

                    <Alert
                      message="提示"
                      description="文件名将作为评审项名称（自动去掉 .md 后缀），文件内容将作为评审标准"
                      type="info"
                      showIcon
                      icon={<CheckCircleOutlined />}
                    />
                  </div>
                )
              }
            ]}
          />
        </div>
      </Modal>
    </div>
  );
};

export default ProjectCriteriaManagement;
