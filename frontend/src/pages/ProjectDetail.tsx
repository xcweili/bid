import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Tag,
  Space,
  Typography,
  message,
  Upload,
  Progress,
  Modal,
  Row,
  Col,
  Input,
  Drawer,
  Empty,
  Badge,
  Divider,
  Spin,
  Alert,
  Tooltip,
  Descriptions,
  List,
  Skeleton
} from 'antd';
import {
  ArrowLeftOutlined,
  UploadOutlined,
  TeamOutlined,
  FileTextOutlined,
  StopOutlined,
  ReloadOutlined,
  FolderOutlined,
  SearchOutlined,
  CloseCircleOutlined,
  FileZipOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  LoadingOutlined,
  FileOutlined,
  UserOutlined,
  BarChartOutlined,
  LockOutlined,
  PlayCircleOutlined,
  InfoCircleOutlined,
  ImportOutlined
} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import apiClient from '../services/api';
import FileTreeExplorer from '../components/FileTreeExplorer';
import EvaluationConfigPanel from '../components/EvaluationConfigPanel';
import './ProjectDetail.css';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface FileNode {
  key: string;
  title: string;
  type: 'folder' | 'pdf' | 'doc' | 'docx' | 'txt' | 'xls' | 'xlsx' | 'image' | 'other';
  size?: number;
  children?: FileNode[];
  isLeaf?: boolean;
  path?: string;
}

interface Company {
  id: number;
  company_name: string;
  status: string;
  file_count?: number;
  bid_folder_path?: string;
  total_score?: number;
  created_at?: string;
}

interface Project {
  id: number;
  project_name: string;
  project_type: string;
  status: string;
  total_packages?: number;
  total_companies?: number;
  created_at?: string;
  upload_status?: 'idle' | 'uploading' | 'parsing' | 'parsed' | 'error';
  parse_progress?: number;
  total_files?: number;
  parsed_files?: number;
  companies?: Company[];
  zip_file_path?: string;
  ocr_status?: string;
  total_score_avg?: number;
}

interface ParseStatus {
  status: string;
  progress: number;
  total_files: number;
  parsed_files: number;
  error: string | null;
  upload_status: string;
  company_count: number;
}

interface LogEntry {
  time: string;
  level: string;
  message: string;
}

// 状态配置 - 使用柔和配色
const STATUS_CONFIG = {
  idle: { color: 'default', icon: <ClockCircleOutlined />, text: '待上传', bg: '#f5f5f5' },
  uploading: { color: 'processing', icon: <LoadingOutlined spin />, text: '上传中', bg: '#e6f7ff' },
  parsing: { color: 'blue', icon: <LoadingOutlined spin />, text: '解析中', bg: '#e6f7ff' },
  parsed: { color: 'success', icon: <CheckCircleOutlined />, text: '已完成', bg: '#f6ffed' },
  completed: { color: 'success', icon: <CheckCircleOutlined />, text: '已完成', bg: '#f6ffed' },
  error: { color: 'error', icon: <ExclamationCircleOutlined />, text: '失败', bg: '#fff2f0' }
};

// 公司状态配置
const COMPANY_STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; text: string }> = {
  pending: { color: 'default', icon: <ClockCircleOutlined />, text: '待解析' },
  processing: { color: 'processing', icon: <LoadingOutlined spin />, text: '解析中' },
  parsed: { color: 'success', icon: <CheckCircleOutlined />, text: '已解析' },
  completed: { color: 'success', icon: <CheckCircleOutlined />, text: '已完成' },
  error: { color: 'error', icon: <ExclamationCircleOutlined />, text: '错误' },
  failed: { color: 'error', icon: <ExclamationCircleOutlined />, text: '失败' }
};

const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projectId = parseInt(id || '0');

  // 获取用户角色
  const userRole = typeof window !== 'undefined' ? localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!).role : null : null;
  
  // 根据角色决定返回路径
  const getBackPath = () => {
    if (userRole === 'technical_evaluator' || userRole === 'business_evaluator') {
      return '/my-tasks';
    }
    return '/projects';
  };

  const [project, setProject] = useState<Project | null>(null);
  const [parseStatus, setParseStatus] = useState<ParseStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showFileTree, setShowFileTree] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companySearchText, setCompanySearchText] = useState('');
  const [companyTypeFilter, setCompanyTypeFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('overview');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showLogDrawer, setShowLogDrawer] = useState(false);
  const [projectLogs, setProjectLogs] = useState<LogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const logPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // 任务派发前置条件检查
  const [canDispatch, setCanDispatch] = useState<boolean>(false);
  const [dispatchReason, setDispatchReason] = useState<string>('');
  const [checkingDispatch, setCheckingDispatch] = useState(false);

  // 自动刷新解析状态
  useEffect(() => {
    if (autoRefresh && (parseStatus?.status === 'parsing' || parseStatus?.upload_status === 'parsing')) {
      pollIntervalRef.current = setInterval(() => {
        fetchParseStatus();
      }, 3000);
      
      // 如果日志窗口打开，也自动刷新日志
      if (showLogDrawer) {
        logPollIntervalRef.current = setInterval(() => {
          fetchProjectLogs();
        }, 2000);
      }
    } else {
      if (logPollIntervalRef.current) {
        clearInterval(logPollIntervalRef.current);
      }
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (logPollIntervalRef.current) {
        clearInterval(logPollIntervalRef.current);
      }
    };
  }, [autoRefresh, parseStatus?.status, parseStatus?.upload_status, showLogDrawer]);

  useEffect(() => {
    fetchProject();
    fetchParseStatus();
    checkCanDispatch();
  }, [projectId]);

  // 当标书解析状态变化时，重新检查是否可以派发
  useEffect(() => {
    // 检查 ocr_status 或 upload_status 是否变为 completed
    const isParsed = parseStatus?.upload_status === 'completed' || 
                     parseStatus?.ocr_status === 'completed' ||
                     parseStatus?.status === 'parsed';
    if (isParsed) {
      checkCanDispatch();
    }
  }, [parseStatus?.upload_status, parseStatus?.ocr_status, parseStatus?.status]);

  // 当项目状态变化时，重新检查是否可以派发
  useEffect(() => {
    if (project?.status && project?.ocr_status) {
      checkCanDispatch();
    }
  }, [project?.status, project?.ocr_status]);

  const fetchProject = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/api/projects/${projectId}`);
      if (response.status === 200) {
        setProject(response.data);
      } else {
        throw new Error('Invalid response');
      }
    } catch (error: any) {
      console.error('获取项目详情失败:', error);
      if (error?.response?.status === 404) {
        message.error('项目不存在');
        navigate(getBackPath());
      } else {
        message.error(error?.response?.data?.detail || '获取项目详情失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchParseStatus = async () => {
    try {
      const response = await apiClient.get(`/api/projects/${projectId}/parse-status`);
      if (response.status === 200) {
        setParseStatus(response.data);
        
        // 更新项目状态 - 使用后端返回的 ocr_status 和 project_status
        if (response.data.ocr_status || response.data.project_status) {
          setProject(prev => prev ? {
            ...prev,
            upload_status: response.data.upload_status as any,
            parse_progress: response.data.progress,
            total_files: response.data.total_files,
            parsed_files: response.data.parsed_files,
            ocr_status: response.data.ocr_status || prev.ocr_status,
            status: response.data.project_status || prev.status
          } : null);
        }
        
        // 如果正在解析且日志窗口打开，自动刷新日志
        if (response.data.upload_status === 'parsing' && showLogDrawer) {
          fetchProjectLogs();
        }
      }
    } catch (error: any) {
      console.error('获取解析状态失败:', error);
      // 不显示错误消息，避免频繁弹窗
    }
  };

  const fetchProjectLogs = async () => {
    setLogLoading(true);
    try {
      const response = await apiClient.get(`/api/logs/project/${projectId}/tail`, {
        params: { lines: 200 }
      });
      if (response.status === 200) {
        setProjectLogs(response.data.logs || []);
      }
    } catch (error) {
      console.error('获取日志失败:', error);
      message.error('获取日志失败');
    } finally {
      setLogLoading(false);
    }
  };

  // 上传标书处理
  const handleUpload: UploadProps['beforeUpload'] = async (file) => {
    if (!file.name.endsWith('.zip')) {
      message.error('只支持上传 ZIP 格式文件');
      return false;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await apiClient.post(
        `/api/projects/${projectId}/upload-bid`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
            setUploadProgress(percent);
          }
        }
      );
      
      if (response.status === 200 || response.status === 201) {
        message.success('上传成功，已开始自动解析');
        setUploadProgress(100);
        await fetchProject();
        await fetchParseStatus();
        // 上传后开始解析，此时还不能派发，不需要调用 checkCanDispatch
      } else {
        throw new Error('Upload failed');
      }
    } catch (error: any) {
      console.error('上传失败:', error);
      message.error(error.response?.data?.detail || error.message || '上传失败，请重试');
      setUploadProgress(0);
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 2000);
    }
    
    return false;
  };

  // 停止解析
  const handleStopParse = async () => {
    Modal.confirm({
      title: '确认停止解析',
      content: '确定要停止当前的标书解析吗？已解析的数据将保留。',
      okText: '停止',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const response = await apiClient.post(`/api/projects/${projectId}/stop-parse`);
          if (response.status === 200) {
            message.success('解析已停止');
            await fetchProject();
            await fetchParseStatus();
            await checkCanDispatch();
          }
        } catch (error: any) {
          console.error('停止解析失败:', error);
          message.error(error.response?.data?.detail || '停止解析失败');
        }
      }
    });
  };

  // 重新解析
  const handleReParse = async () => {
    Modal.confirm({
      title: '确认重新解析',
      content: '将清除现有解析数据并重新解析标书，确定继续？',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const response = await apiClient.post(`/api/projects/${projectId}/reparse`);
          if (response.status === 200) {
            message.success('已开始重新解析');
            await fetchProject();
            await fetchParseStatus();
            await checkCanDispatch();
          }
        } catch (error: any) {
          console.error('重新解析失败:', error);
          message.error(error.response?.data?.detail || '重新解析失败');
        }
      }
    });
  };

  // 删除已上传的标书
  const handleDeleteBid = async () => {
    Modal.confirm({
      title: '确认删除标书',
      content: '此操作将删除已上传的标书文件及所有解析数据，不可恢复！',
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const response = await apiClient.delete(`/api/projects/${projectId}/bid`);
          if (response.status === 200) {
            message.success('标书已删除');
            await fetchProject();
            await fetchParseStatus();
            await checkCanDispatch();
          }
        } catch (error: any) {
          console.error('删除失败:', error);
          message.error(error.response?.data?.detail || '删除失败');
        }
      }
    });
  };

  // 删除整个项目
  const handleDeleteProject = async () => {
    Modal.confirm({
      title: '确认删除项目',
      content: '此操作将删除整个项目及其所有数据（包括标书、解析数据、评审结果等），不可恢复！',
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const response = await apiClient.delete(`/api/projects/${projectId}`);
          if (response.status === 200) {
            message.success('项目已删除');
            navigate(getBackPath());
          }
        } catch (error: any) {
          console.error('删除失败:', error);
          message.error(error.response?.data?.detail || '删除失败');
        }
      }
    });
  };

  // 检查是否可以派发任务
  const checkCanDispatch = async () => {
    setCheckingDispatch(true);
    try {
      const response = await apiClient.get(`/api/projects/${projectId}/can-dispatch`);
      if (response.data) {
        setCanDispatch(response.data.can_dispatch);
        setDispatchReason(response.data.reason || '');
      }
    } catch (error: any) {
      console.error('检查派发条件失败:', error);
      setCanDispatch(false);
      setDispatchReason('检查失败');
    } finally {
      setCheckingDispatch(false);
    }
  };

  // 分派任务按钮
  const handleDispatchTask = () => {
    if (!canDispatch) {
      message.warning(dispatchReason || '请先上传标书并配置评审规则');
      return;
    }
    Modal.info({
      title: '功能已废弃',
      content: '该功能已废弃，请在项目管理页面进行任务分派',
      okText: '知道了',
      onOk() {}
    });
  };

  // 配置评审项
  const handleConfigCriteria = () => {
    navigate(`/projects/${projectId}/criteria`);
  };

  // 去配置模板
  const handleGoToTemplateConfig = () => {
    navigate(`/rule-templates`);
  };

  // 过滤公司数据
  const filteredCompanies = (project?.companies || []).filter(company => {
    const matchesSearch = company.company_name.toLowerCase().includes(companySearchText.toLowerCase());
    const status = company.status || 'pending';
    const matchesType = companyTypeFilter === 'all' || 
      (companyTypeFilter === 'completed' && (status === 'parsed' || status === 'completed')) ||
      (companyTypeFilter === 'processing' && (status === 'processing' || status === 'pending')) ||
      (companyTypeFilter === 'error' && (status === 'error' || status === 'failed'));
    return matchesSearch && matchesType;
  });

  // 计算统计信息
  const stats = {
    totalCompanies: project?.companies?.length || 0,
    parsedCompanies: (project?.companies || []).filter(c => c.status === 'parsed' || c.status === 'completed').length,
    processingCompanies: (project?.companies || []).filter(c => c.status === 'processing' || c.status === 'pending').length,
    errorCompanies: (project?.companies || []).filter(c => c.status === 'error' || c.status === 'failed').length,
    totalFiles: parseStatus?.total_files || 0,
    parsedFiles: parseStatus?.parsed_files || 0
  };

  // 计算评审进度（任务下发后的评审状态）
  // 注意：这里应该显示的是"已分派任务的公司数"，而不是"已完成评审的公司数"
  // 因为任务还没下发，所以进度应该是 0
  const evaluationProgress = {
    completed: 0,  // 暂时没有任务下发，所有公司都是 0
    total: stats.totalCompanies,
    percentage: 0  // 任务未下发，进度为 0
  };

  if (loading) {
    return (
      <div className="project-detail-loading">
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="project-detail-empty">
        <Empty description="项目不存在" />
        <Button type="primary" onClick={() => navigate(getBackPath())}>返回项目列表</Button>
      </div>
    );
  }

  const currentStatus = parseStatus?.upload_status || project.upload_status || 'idle';
  const statusConfig = STATUS_CONFIG[currentStatus as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.idle;

  // 项目是否配置完成（标书已解析完成 AND 规则已配置）
  // 标书解析完成：ocr_status === 'completed'
  // 规则已配置：status === 'dispatching'
  const isConfigured = project?.ocr_status === 'completed' && project?.status === 'dispatching';

  return (
    <div className="project-detail-page">
      {/* 顶部导航 */}
      <div className="detail-header">
        <Button 
          icon={<ArrowLeftOutlined />} 
          onClick={() => navigate(getBackPath())}
          className="back-button"
        >
          返回
        </Button>
        <div className="header-content">
          <Title level={2} className="project-title">{project.project_name}</Title>
          <Space size="middle">
            <Tag color="default" icon={<FileTextOutlined />}>{project.project_type}</Tag>
            <Tag color={project.status === 'completed' ? 'success' : 'processing'}>
              {project.status}
            </Tag>
          </Space>
        </div>
        <Space className="header-actions">
          <Tooltip title="刷新数据">
            <Button 
              icon={<ReloadOutlined />} 
              onClick={fetchProject}
              shape="circle"
            />
          </Tooltip>
          <Tooltip title={canDispatch ? '任务分派' : (dispatchReason || '请先上传标书并配置评审规则')}>
            <Button 
              type="primary"
              icon={<TeamOutlined />}
              onClick={() => navigate(`/projects/${projectId}/assignment`)}
              disabled={!canDispatch || checkingDispatch}
              loading={checkingDispatch}
            >
              任务分派
            </Button>
          </Tooltip>
          <Tooltip title="删除整个项目（包含所有数据和文件）">
            <Button 
              danger
              icon={<CloseCircleOutlined />}
              onClick={handleDeleteProject}
            >
              删除项目
            </Button>
          </Tooltip>
        </Space>
      </div>

      {/* 项目基本信息 - 放在顶部 */}
      <Card className="project-basic-info" bordered={false}>
        <Descriptions bordered column={{ xs: 1, sm: 2, lg: 4 }} size="middle">
          <Descriptions.Item label="项目名称">{project.project_name}</Descriptions.Item>
          <Descriptions.Item label="项目类型">
            <Tag color="default">{project.project_type}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="公司数量">{project.total_companies || 0} 家</Descriptions.Item>
          <Descriptions.Item label="项目状态">
            <Tag color={project.status === 'completed' ? 'success' : 'processing'}>
              {project.status}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="状态说明" span={3}>
            {project.status === 'draft' && '项目未配置完成（需上传标书并配置评审规则）'}
            {project.status === 'dispatching' && '项目已配置完成，可以进行任务分派'}
            {project.status === 'evaluating' && '正在进行评审'}
            {project.status === 'completed' && '项目已完成所有评审'}
            {!['draft', 'dispatching', 'evaluating', 'completed'].includes(project.status) && project.status}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间" span={3}>
            {project.created_at ? new Date(project.created_at).toLocaleString('zh-CN') : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 评审进度 Card */}
      {stats.totalCompanies > 0 && (
        <Card className="evaluation-progress-card" bordered={false}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Title level={5} style={{ margin: 0 }}>
                <BarChartOutlined style={{ color: '#1890ff', marginRight: 8 }} />
                评审进度
              </Title>
              <Text type="secondary">已完成评审的公司数</Text>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 28, fontWeight: 'bold', color: '#1890ff' }}>
                {evaluationProgress.completed} / {evaluationProgress.total}
              </div>
              <Text type="secondary">家公司</Text>
            </div>
          </div>
          <Progress 
            percent={evaluationProgress.percentage} 
            strokeColor={{
              '0%': '#108ee9',
              '100%': '#87d068',
            }}
            style={{ marginTop: 16 }}
          />
        </Card>
      )}

      {/* 评审配置板块 - 上方独立容器 */}
      <EvaluationConfigPanel 
        isConfigured={isConfigured} 
        onGoToTemplateConfig={handleGoToTemplateConfig}
      />

      {/* 标书管理和公司列表 - 下方左右结构 */}
      <Row gutter={[16, 16]} className="main-content">
        {/* 左侧：标书上传与解析 */}
        <Col xs={24} lg={8}>
          <Card 
            className="bid-upload-card" 
            title={
              <Space>
                <FileZipOutlined />
                <span>标书管理</span>
              </Space>
            }
            bodyStyle={{ paddingTop: '16px' }}
          >
            {/* 状态徽章 */}
            <div className="status-badge" style={{ 
              backgroundColor: statusConfig.bg || '#f5f5f5',
              padding: '12px',
              borderRadius: '8px',
              marginBottom: '16px'
            }}>
              <Space>
                <Badge 
                  status={currentStatus === 'parsed' || currentStatus === 'completed' ? 'success' : currentStatus === 'error' ? 'error' : currentStatus === 'parsing' ? 'processing' : 'default'} 
                  text={statusConfig.text} 
                />
                {parseStatus?.progress !== undefined && parseStatus?.progress !== null && currentStatus === 'parsing' && (
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    进度：{parseStatus.progress}%
                  </Text>
                )}
              </Space>
            </div>

            {/* 上传区域 */}
            {currentStatus === 'idle' || currentStatus === 'error' ? (
              <Upload.Dragger
                accept=".zip"
                showUploadList={false}
                beforeUpload={handleUpload}
                disabled={uploading}
                className="upload-area"
                style={{ borderStyle: 'dashed' }}
              >
                <div className="upload-content">
                  <FileZipOutlined className="upload-icon" style={{ fontSize: '48px', color: '#999' }} />
                  <Paragraph className="upload-text" style={{ marginTop: '16px' }}>
                    {uploading ? `上传中 ${uploadProgress}%` : '点击或拖拽上传标书 ZIP 文件'}
                  </Paragraph>
                  <Text type="secondary" className="upload-hint">
                    系统将自动识别并解析标书内容
                  </Text>
                </div>
              </Upload.Dragger>
            ) : currentStatus === 'uploading' ? (
              <div className="upload-progress" style={{ padding: '24px 0' }}>
                <LoadingOutlined className="progress-icon" style={{ fontSize: '32px', color: '#1890ff' }} />
                <Progress percent={uploadProgress} status="active" style={{ marginTop: '16px' }} />
                <Text style={{ marginTop: '8px', display: 'block' }}>上传中...</Text>
              </div>
            ) : currentStatus === 'parsing' ? (
              <div className="parsing-progress" style={{ padding: '16px 0' }}>
                <LoadingOutlined className="progress-icon" style={{ fontSize: '32px', color: '#1890ff' }} />
                <Progress 
                  percent={parseStatus?.progress || 0} 
                  status="active"
                  format={() => `${parseStatus?.parsed_files || 0}/${parseStatus?.total_files || 0}`}
                  style={{ marginTop: '16px' }}
                />
                <div className="parsing-info" style={{ marginTop: '12px' }}>
                  <Text type="secondary">已解析 {parseStatus?.parsed_files || 0} / 共 {parseStatus?.total_files || 0} 个文件</Text>
                </div>
                <Button 
                  danger 
                  icon={<StopOutlined />} 
                  onClick={handleStopParse}
                  className="stop-button"
                  style={{ marginTop: '16px', width: '100%' }}
                >
                  停止解析
                </Button>
              </div>
            ) : (
              <Alert
                type="success"
                message="标书解析完成"
                description={
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Space>
                      <Text>共解析</Text>
                      <Text strong>{parseStatus?.total_files || 0}</Text>
                      <Text>个文件</Text>
                      <Text>，</Text>
                      <Text strong>{parseStatus?.company_count || 0}</Text>
                      <Text>家公司</Text>
                    </Space>
                    {parseStatus?.error && (
                      <Alert message={parseStatus.error} type="warning" showIcon />
                    )}
                  </Space>
                }
                showIcon
                icon={<CheckCircleOutlined />}
              />
            )}

            {/* 操作按钮 */}
            <div className="action-buttons" style={{ marginTop: '16px' }}>
              <Space size="small" style={{ width: '100%', justifyContent: 'space-between' }}>
                {project?.zip_file_path && (
                  <>
                    <Button 
                      block
                      icon={<ReloadOutlined />} 
                      onClick={handleReParse}
                      disabled={currentStatus === 'parsing'}
                      style={{ flex: 1 }}
                    >
                      重新解析
                    </Button>
                    <Button 
                      block
                      danger
                      icon={<CloseCircleOutlined />} 
                      onClick={handleDeleteBid}
                      disabled={currentStatus === 'parsing'}
                      style={{ flex: 1 }}
                    >
                      删除标书
                    </Button>
                  </>
                )}
              </Space>
            </div>
          </Card>
        </Col>

        {/* 右侧：公司列表 */}
        <Col xs={24} lg={16}>
          <Card 
            className="companies-card"
            title={
              <Space>
                <TeamOutlined />
                <span>公司列表</span>
              </Space>
            }
            extra={
              <Space>
                <Text type="secondary">{filteredCompanies.length} 家</Text>
              </Space>
            }
            bodyStyle={{ paddingTop: '16px' }}
          >
            {/* 搜索和筛选 */}
            <div className="company-toolbar" style={{ marginBottom: '16px' }}>
              <Input
                placeholder="搜索公司名称"
                value={companySearchText}
                onChange={(e) => setCompanySearchText(e.target.value)}
                prefix={<SearchOutlined />}
                allowClear
                className="company-search"
                style={{ maxWidth: '300px' }}
              />
              <Space>
                <Tag 
                  color={companyTypeFilter === 'all' ? 'default' : 'default'}
                  onClick={() => setCompanyTypeFilter('all')}
                  style={{ cursor: 'pointer', borderColor: companyTypeFilter === 'all' ? '#1890ff' : '#d9d9d9', color: companyTypeFilter === 'all' ? '#1890ff' : undefined }}
                >
                  全部
                </Tag>
                <Tag 
                  color={companyTypeFilter === 'completed' ? 'success' : 'default'}
                  onClick={() => setCompanyTypeFilter('completed')}
                  style={{ cursor: 'pointer' }}
                >
                  已完成
                </Tag>
                <Tag 
                  color={companyTypeFilter === 'processing' ? 'processing' : 'default'}
                  onClick={() => setCompanyTypeFilter('processing')}
                  style={{ cursor: 'pointer' }}
                >
                  处理中
                </Tag>
                <Tag 
                  color={companyTypeFilter === 'error' ? 'error' : 'default'}
                  onClick={() => setCompanyTypeFilter('error')}
                  style={{ cursor: 'pointer' }}
                >
                  异常
                </Tag>
              </Space>
            </div>

            {/* 公司卡片列表 */}
            <List
              grid={{ gutter: 16, column: 1 }}
              dataSource={filteredCompanies}
              renderItem={(company) => {
                const statusConfig = COMPANY_STATUS_CONFIG[company.status || 'pending'] || COMPANY_STATUS_CONFIG.pending;
                return (
                  <List.Item>
                    <Card 
                      className="company-card-item"
                      hoverable
                      onClick={() => {
                        setSelectedCompany(company);
                        setShowFileTree(true);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="company-card-content">
                        <div className="company-header">
                          <div className="company-name">
                            <UserOutlined className="company-icon" style={{ color: '#999', marginRight: '8px' }} />
                            <Text strong>{company.company_name}</Text>
                          </div>
                          <Tag color={statusConfig.color} icon={statusConfig.icon}>
                            {statusConfig.text}
                          </Tag>
                        </div>
                        <Divider style={{ margin: '12px 0' }} />
                        <div className="company-stats">
                          <Space size="large">
                            <div className="stat-item">
                              <FileOutlined className="stat-icon" style={{ color: '#999' }} />
                              <Text type="secondary">{company.file_count || 0} 文件</Text>
                            </div>
                            {company.total_score !== undefined && company.total_score !== null && (
                              <div className="stat-item">
                                <BarChartOutlined className="stat-icon" style={{ color: '#999' }} />
                                <Text type="secondary">{company.total_score.toFixed(1)} 分</Text>
                              </div>
                            )}
                          </Space>
                        </div>
                        <div className="company-actions">
                          <Space size="small">
                            <Button 
                              size="small"
                              type="primary"
                              icon={<FolderOutlined />}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCompany(company);
                                setShowFileTree(true);
                              }}
                            >
                              查看文件
                            </Button>
                            <Button 
                              size="small"
                              icon={<InfoCircleOutlined />}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCompany(company);
                                setShowLogDrawer(true);
                                fetchProjectLogs();
                              }}
                            >
                              查看日志
                            </Button>
                          </Space>
                        </div>
                      </div>
                    </Card>
                  </List.Item>
                );
              }}
              locale={{ emptyText: <Empty description="暂无公司数据" /> }}
            />
          </Card>
        </Col>
      </Row>

      {/* 文件树 Drawer */}
      <Drawer
        title={
          <Space>
            <FolderOutlined />
            <span>{selectedCompany?.company_name}</span>
            <Tag color="blue">{selectedCompany?.file_count || 0} 文件</Tag>
          </Space>
        }
        placement="right"
        width={1200}
        open={showFileTree}
        onClose={() => setShowFileTree(false)}
        className="file-tree-drawer"
      >
        {selectedCompany?.bid_folder_path ? (
          <FileTreeExplorer 
            companyId={selectedCompany.id}
            companyFolder={selectedCompany.bid_folder_path}
          />
        ) : (
          <Empty description="暂无文件数据" />
        )}
      </Drawer>

      {/* 项目日志 Drawer */}
      <Drawer
        title={
          <Space>
            <InfoCircleOutlined />
            <span>解析日志</span>
            {parseStatus?.status === 'parsing' && (
              <Tag color="blue" icon={<PlayCircleOutlined spin />}>实时</Tag>
            )}
          </Space>
        }
        placement="right"
        width={900}
        open={showLogDrawer}
        onClose={() => {
          setShowLogDrawer(false);
          if (logPollIntervalRef.current) {
            clearInterval(logPollIntervalRef.current);
          }
        }}
        className="log-drawer"
        extra={
          <Space>
            <Button 
              size="small"
              icon={<ReloadOutlined />}
              onClick={fetchProjectLogs}
              loading={logLoading}
            >
              刷新
            </Button>
            {parseStatus?.status === 'parsing' && (
              <Button 
                size="small"
                type={autoRefresh ? 'primary' : 'default'}
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                {autoRefresh ? '自动刷新' : '手动刷新'}
              </Button>
            )}
          </Space>
        }
      >
        <div style={{ height: 'calc(100% - 60px)', overflow: 'auto' }}>
          {logLoading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Spin tip="加载中..." />
            </div>
          ) : projectLogs.length === 0 ? (
            <Empty description="暂无日志数据" />
          ) : (
            <div style={{ background: '#1e1e1e', padding: '16px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.6' }}>
              {projectLogs.map((log, index) => (
                <div key={index} style={{ marginBottom: '4px' }}>
                  <span style={{ color: '#888' }}>{log.time}</span>{' '}
                  <span style={{ 
                    color: log.level === 'ERROR' ? '#ff4d4f' : 
                           log.level === 'WARNING' ? '#faad14' : 
                           log.level === 'DEBUG' ? '#888' : '#52c41a'
                  }}>
                    [{log.level}]
                  </span>{' '}
                  <span style={{ color: '#fff' }}>{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Drawer>
    </div>
  );
};

export default ProjectDetail;
