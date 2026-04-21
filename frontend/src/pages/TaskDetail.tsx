import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  Card, Button, Typography, Upload, message, Table, Tag, 
  Descriptions, Progress, Space, Modal, Steps, Divider, 
  Statistic, Checkbox, Alert, List, Drawer, Input, Empty,
  Row, Col
} from 'antd';
import { 
  UploadOutlined, ArrowLeftOutlined,
  CheckCircleOutlined, ClockCircleOutlined,
  FolderOutlined, RobotOutlined, RightOutlined, LeftOutlined,
  DeleteOutlined, ReloadOutlined, StopOutlined, EyeOutlined,
  SearchOutlined, FileTextOutlined, TeamOutlined,
  ThunderboltOutlined, DashboardOutlined, PlayCircleOutlined, BarChartOutlined
} from '@ant-design/icons';
import { taskService } from '../services/taskService';
import { ruleService } from '../services/ruleService';
import FileTreeExplorer from '../components/FileTreeExplorer';
import FileSelector from '../components/FileSelector';
import ExecutionViewPanel from '../components/ExecutionViewPanel';
import apiClient from '../services/api';
import './TaskDetail.css';

const { Title, Text, Link } = Typography;

// ==================== 类型定义 ====================

interface Company {
  id: number;
  company_name: string;
  status: string;
  total_score: number | null;
  file_count?: number;
  processed_rules?: number;
  bid_folder_path?: string;
}

interface RuleTemplate {
  id: number;
  rule_name: string;
  rule_content: string;
  source_files?: string[];
  config?: {
    items?: Array<{
      source_files?: string[];
    }>;
  };
}

interface Task {
  id: number;
  task_name: string;
  status: string;
  total_companies: number;
  total_score_avg: number | null;
  created_at: string;
  zip_file_path?: string;
  companies: Company[];
  rule_ids: number[];
  ocr_status?: 'idle' | 'processing';
}

// Assignment 相关类型
interface Assignment {
  assignment_id: number;
  assignment_type: 'by_criteria' | 'by_company' | 'by_package';
  dispatch_mode?: 'by_criteria' | 'by_company';
  evaluator_id: number;
  evaluator_name: string;
  package_id?: number;
  status: string;
  progress: number;
}

// ==================== 组件实现 ====================

const TaskDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  
  // 任务相关状态
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ruleTemplates, setRuleTemplates] = useState<RuleTemplate[]>([]);
  const [selectedRuleIds, setSelectedRuleIds] = useState<number[]>([]);
  const [savingRules, setSavingRules] = useState(false);
  const [showFileTree, setShowFileTree] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [showFileSelector, setShowFileSelector] = useState(false);
  const [ruleDetails, setRuleDetails] = useState<Record<number, { source_files: string[] }>>({});
  
  // 搜索和分页状态
  const [companySearchText, setCompanySearchText] = useState('');
  const [companyPagination, setCompanyPagination] = useState({ current: 1, pageSize: 10 });

  // 步骤相关状态
  const steps = [
    { title: '新建任务', description: '任务已创建' },
    { title: '上传标书', description: '上传 ZIP 格式的标书文件' },
    { title: '配置规则', description: '选择评审规则模板' },
    { title: 'AI 评审', description: '开始自动评审' },
    { title: '查看结果', description: '查看评审结果' },
  ];

  const [currentStep, setCurrentStep] = useState(0);

  // Assignment 相关状态
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [assignmentLoading, setAssignmentLoading] = useState(false);

  // ==================== 生命周期 ====================

  useEffect(() => {
    if (id) {
      fetchTask();
      fetchRuleTemplates();
      fetchAssignment();
    }
  }, [id]);

  useEffect(() => {
    if (task) {
      const newStep = getCurrentStep();
      if (newStep !== currentStep) {
        setCurrentStep(newStep);
      }
    }
  }, [task]);

  // 自动刷新任务状态
  useEffect(() => {
    let interval: any;
    if (task && task.status === 'processing') {
      interval = setInterval(() => {
        fetchTask();
      }, 60000);
    }
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [task]);

  // 自动刷新 OCR 状态
  useEffect(() => {
    let interval: any;
    if (task && task.ocr_status === 'processing') {
      interval = setInterval(() => {
        fetchTask();
      }, 60000);
    }
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [task]);

  // ==================== 数据加载 ====================

  const fetchTask = async () => {
    setLoading(true);
    try {
      const data = await taskService.getTask(parseInt(id!));
      setTask(data);
      setSelectedRuleIds(data.rule_ids || []);
    } catch (error) {
      console.error('❌ 获取任务详情失败:', error);
      message.error('获取任务详情失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchRuleTemplates = async () => {
    try {
      const data = await ruleService.getRules();
      setRuleTemplates(data);
      const details: Record<number, { source_files: string[] }> = {};
      data.forEach((rule: RuleTemplate) => {
        let sourceFiles: string[] = [];
        if (rule.config?.items && rule.config.items.length > 0) {
          sourceFiles = rule.config.items[0].source_files || [];
        } else if (rule.source_files) {
          sourceFiles = rule.source_files;
        }
        details[rule.id] = {
          source_files: sourceFiles
        };
      });
      setRuleDetails(details);
    } catch (error) {
      console.error('获取规则模板失败:', error);
    }
  };

  const fetchAssignment = async () => {
    setAssignmentLoading(true);
    try {
      const assignmentId = location.state?.assignmentId || parseInt(id!);
      const response = await apiClient.get(`/api/assignments/${assignmentId}`);
      const assignmentData = response.data;
      
      setAssignment({
        assignment_id: assignmentData.assignment_id,
        assignment_type: assignmentData.assignment_type,
        dispatch_mode: assignmentData.dispatch_mode,
        evaluator_id: assignmentData.evaluator_id,
        evaluator_name: assignmentData.evaluator_name,
        package_id: assignmentData.package_id,
        status: assignmentData.status,
        progress: assignmentData.progress
      });
    } catch (error) {
      console.log('未找到 assignment 信息，使用传统模式');
    } finally {
      setAssignmentLoading(false);
    }
  };

  // ==================== 步骤计算 ====================

  const getCurrentStep = () => {
    if (!task) return 0;
    if (task.status === 'completed') return 4;
    if (task.status === 'processing') return 3;
    if (task.total_companies > 0) {
      if (task.rule_ids && task.rule_ids.length > 0) return 2;
      return 1;
    }
    return 0;
  };

  // ==================== 文件处理 ====================

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const result = await taskService.uploadBidZip(parseInt(id!), file);
      message.success('上传成功，已识别公司文件并开始解析');
      await fetchTask();
    } catch (error) {
      console.error('上传失败:', error);
      message.error('上传失败');
    } finally {
      setUploading(false);
    }
    return false;
  };

  const handleReUpload = async () => {
    if (task?.ocr_status === 'processing') {
      message.warning('请先停止正在进行的文件解析');
      return;
    }
    
    Modal.confirm({
      title: '确认删除原文档',
      content: '此操作将删除已上传的文件及相关数据，不可恢复！',
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const result = await taskService.deleteTaskZip(parseInt(id!));
          message.success(result.message || '原文件已删除');
          await fetchTask();
        } catch (error) {
          message.error('删除原文件失败');
        }
      }
    });
  };

  const handleOcrDocuments = async () => {
    if (!task) return;
    setShowFileSelector(true);
  };

  const handleSelectFiles = async (files: string[]) => {
    if (!task) return;
    
    try {
      await taskService.ocrFiles(task.id, files);
      message.success(`OCR 处理已启动，将处理 ${files.length} 个文件`);
      await fetchTask();
      let checkCount = 0;
      const interval = setInterval(async () => {
        checkCount++;
        try {
          const data = await taskService.getTask(parseInt(id!));
          if (data.ocr_status !== 'processing' || checkCount >= 60) {
            clearInterval(interval);
            await fetchTask();
          }
        } catch {
          clearInterval(interval);
        }
      }, 2000);
    } catch (error) {
      message.error('启动 OCR 处理失败');
    }
  };

  const handleStopOcr = async () => {
    if (!task) return;
    Modal.confirm({
      title: '确认停止解析',
      content: '确定要停止当前的文档解析吗？',
      okText: '停止',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await taskService.stopOcrDocuments(task.id);
          message.success('解析已停止');
          await fetchTask();
        } catch (error) {
          message.error('停止解析失败');
        }
      }
    });
  };

  // ==================== 规则管理 ====================

  const handleSaveRules = async () => {
    if (!task) return;
    
    const rulesWithoutFiles = selectedRuleIds.filter(ruleId => {
      const rule = ruleDetails[ruleId];
      return !rule || !rule.source_files || rule.source_files.length === 0;
    });
    
    if (rulesWithoutFiles.length > 0) {
      const ruleNames = rulesWithoutFiles
        .map(ruleId => ruleTemplates.find(r => r.id === ruleId)?.rule_name)
        .filter(Boolean);
      
      Modal.confirm({
        title: '规则未绑定文件',
        content: (
          <div>
            <p>以下规则模板未绑定源文件：</p>
            <ul>
              {ruleNames.map((name, index) => (
                <li key={index}>{name}</li>
              ))}
            </ul>
            <p>未绑定文件的规则将无法进行 AI 评审。</p>
            <p>是否前往规则配置页面绑定文件？</p>
          </div>
        ),
        okText: '前往配置',
        cancelText: '继续保存',
        onOk: () => {
          navigate('/rules');
        },
        onCancel: async () => {
          saveRules();
        }
      });
    } else {
      saveRules();
    }
  };
  
  const saveRules = async () => {
    if (!task) return;
    setSavingRules(true);
    try {
      await taskService.updateTaskRules(task.id, selectedRuleIds);
      message.success('规则保存成功');
      await fetchTask();
      await fetchRuleTemplates();
    } catch (error) {
      message.error('保存规则失败');
    } finally {
      setSavingRules(false);
    }
  };

  // ==================== 任务执行 ====================

  const handleStartTask = async () => {
    if (!task) return;
    
    Modal.confirm({
      title: '启动 AI 评审',
      content: '确定要对 ' + task.total_companies + ' 家公司进行 AI 评审吗？',
      okText: '启动',
      cancelText: '取消',
      onOk: async () => {
        try {
          await taskService.startTask(task.id);
          message.success('评审任务已启动');
          fetchTask();
        } catch (error) {
          console.error('❌ 启动任务失败:', error);
          message.error('启动任务失败');
        }
      }
    });
  };

  const handleStopTask = async () => {
    if (!task) return;
    
    Modal.confirm({
      title: '停止 AI 评审',
      content: '确定要停止当前正在进行的评审任务吗？',
      okText: '停止',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await taskService.stopTask(task.id);
          message.success('评审任务已停止');
          fetchTask();
        } catch (error) {
          console.error('❌ 停止任务失败:', error);
          message.error('停止任务失败');
        }
      }
    });
  };

  // ==================== 状态渲染辅助函数 ====================

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; text: string; icon: React.ReactNode }> = {
      pending: { color: 'default', text: '待处理', icon: <ClockCircleOutlined /> },
      processing: { color: 'orange', text: '评审中', icon: <RobotOutlined /> },
      completed: { color: 'success', text: '已完成', icon: <CheckCircleOutlined /> },
      failed: { color: 'error', text: '失败', icon: <DeleteOutlined /> },
    };
    return configs[status] || configs.pending;
  };

  const handlePrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleNextStep = () => {
    if (currentStep < steps.length - 1) {
      if (currentStep === 1 && task?.total_companies === 0) {
        message.warning('请先上传标书文件');
        return;
      }
      if (currentStep === 2 && task?.rule_ids && task.rule_ids.length === 0) {
        message.warning('请至少选择一个规则模板');
        return;
      }
      if (currentStep === 3 && task?.status !== 'completed') {
        message.warning('评审未完成，请等待完成');
        return;
      }
      setCurrentStep(currentStep + 1);
    }
  };

  // ==================== 步骤内容渲染 ====================

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <Card className="step-info-card">
            <div className="step-content">
              <div className="step-icon-wrapper step-icon-0">
                <FileTextOutlined />
              </div>
              <div className="step-info">
                <Title level={5} className="step-title">任务已创建</Title>
                <Text type="secondary">任务基本信息已保存，请继续下一步操作</Text>
              </div>
            </div>
          </Card>
        );

      case 1:
        return (
          <div className="step-content-wrapper">
            {task.total_companies === 0 ? (
              <Card className="upload-card">
                <div className="upload-content">
                  <div className="upload-icon-wrapper">
                    <UploadOutlined />
                  </div>
                  <Title level={5} className="upload-title">请上传标书文件</Title>
                  <Text type="secondary" className="upload-desc">
                    支持 ZIP 格式的标书文件，系统将自动识别其中的公司文件夹
                  </Text>
                  <Upload
                    accept=".zip"
                    showUploadList={false}
                    beforeUpload={handleUpload}
                  >
                    <Button 
                      type="primary" 
                      icon={<UploadOutlined />} 
                      loading={uploading}
                      size="large"
                      className="upload-btn"
                    >
                      上传标书 ZIP
                    </Button>
                  </Upload>
                </div>
              </Card>
            ) : (
              <Card className="upload-success-card">
                <div className="upload-success-content">
                  <Alert
                    message={
                      <Space>
                        <CheckCircleOutlined style={{ color: '#52c41a' }} />
                        <span>已上传标书</span>
                      </Space>
                    }
                    description={
                      <div>
                        <div>已识别 <strong>{task.total_companies}</strong> 家公司</div>
                        <div style={{ marginTop: 4 }}>
                          文件解析状态：{task.ocr_status === 'processing' ? '解析中' : task.ocr_status === 'idle' ? '已完成' : '待处理'}
                        </div>
                      </div>
                    }
                    type={task.ocr_status === 'processing' ? 'info' : 'success'}
                    showIcon
                    className="file-status-alert"
                  />
                  
                  <div className="upload-actions">
                    {task?.ocr_status === 'processing' ? (
                      <Space>
                        <Button 
                          danger
                          icon={<StopOutlined />}
                          onClick={handleStopOcr}
                          size="large"
                        >
                          停止解析
                        </Button>
                        <Text type="secondary">文件正在解析中，请稍候...</Text>
                      </Space>
                    ) : (
                      <Space wrap>
                        <Button 
                          icon={<ReloadOutlined />}
                          onClick={handleOcrDocuments}
                          type="primary"
                          size="large"
                          className="ocr-btn"
                        >
                          {task.ocr_status === 'idle' ? '重新解析文档' : '开始解析文档'}
                        </Button>
                        <Button 
                          danger
                          icon={<DeleteOutlined />}
                          onClick={handleReUpload}
                          size="large"
                        >
                          删除原文档
                        </Button>
                      </Space>
                    )}
                  </div>
                  
                  <div className="upload-tip">
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      <ThunderboltOutlined /> 点击"开始解析文档"可将 .doc/.docx/.pdf 文件转换为文本格式，便于 AI 评审
                    </Text>
                  </div>
                </div>
              </Card>
            )}
          </div>
        );

      case 2:
        return (
          <div className="rules-content">
            <Alert
              message={
                <Space>
                  <FileTextOutlined />
                  <span>选择评审规则模板</span>
                </Space>
              }
              description="从已配置的规则模板中选择需要应用于本任务的规则"
              type="info"
              showIcon
              className="rules-alert"
            />
            
            {ruleTemplates.length === 0 ? (
              <Card className="no-rules-card">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <div>
                      <Text type="secondary">暂无规则模板</Text>
                      <br />
                      <Link onClick={() => navigate('/rules')} style={{ marginTop: 8, display: 'inline-block' }}>
                        前往规则配置页面创建
                      </Link>
                    </div>
                  }
                />
              </Card>
            ) : (
              <div className="rules-list">
                {ruleTemplates.map((item) => {
                  const hasFiles = ruleDetails[item.id]?.source_files?.length > 0;
                  const isSelected = selectedRuleIds.includes(item.id);
                  return (
                    <Card
                      key={item.id}
                      className={`rule-card ${isSelected ? 'rule-card-selected' : ''} ${!hasFiles ? 'rule-card-no-files' : ''}`}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedRuleIds(selectedRuleIds.filter(id => id !== item.id));
                        } else {
                          setSelectedRuleIds([...selectedRuleIds, item.id]);
                        }
                      }}
                      hoverable={!hasFiles}
                    >
                      <div className="rule-card-content">
                        <div className="rule-card-header">
                          <div className="rule-card-title">
                            <FileTextOutlined className="rule-icon" />
                            <span>{item.rule_name}</span>
                          </div>
                          <Checkbox
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              if (e.target.checked) {
                                setSelectedRuleIds([...selectedRuleIds, item.id]);
                              } else {
                                setSelectedRuleIds(selectedRuleIds.filter(id => id !== item.id));
                              }
                            }}
                            disabled={!hasFiles}
                          />
                        </div>
                        <div className="rule-card-body">
                          <Text type="secondary" className="rule-content-text">
                            {item.rule_content?.substring(0, 150) + (item.rule_content?.length > 150 ? '...' : '')}
                          </Text>
                        </div>
                        <div className="rule-card-footer">
                          <Space>
                            {hasFiles ? (
                              <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontSize: 12 }}>
                                已绑定文件
                              </Tag>
                            ) : (
                              <Tag color="warning" icon={<ClockCircleOutlined />} style={{ fontSize: 12 }}>
                                未绑定文件
                              </Tag>
                            )}
                            {ruleDetails[item.id]?.source_files?.length > 0 && (
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {ruleDetails[item.id].source_files.length} 个文件
                              </Text>
                            )}
                          </Space>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            <Divider />
            
            <div className="rules-actions">
              <Space>
                <Button 
                  type="primary"
                  onClick={handleSaveRules}
                  loading={savingRules}
                  disabled={selectedRuleIds.length === 0}
                  size="large"
                  className="save-rules-btn"
                >
                  保存规则配置
                </Button>
                <Text type="secondary">已选择 {selectedRuleIds.length} 个规则模板</Text>
              </Space>
            </div>

            {task.rule_ids && task.rule_ids.length > 0 && (
              <div className="selected-rules">
                <Title level={5}>当前关联的规则模板</Title>
                <Space wrap>
                  {task.rule_ids.map(ruleId => {
                    const rule = ruleTemplates.find(r => r.id === ruleId);
                    return rule ? (
                      <Tag key={ruleId} color="blue" icon={<FileTextOutlined />}>
                        {rule.rule_name}
                      </Tag>
                    ) : null;
                  })}
                </Space>
              </div>
            )}
          </div>
        );

      case 3:
        return (
          <div className="execute-content">
            <Alert
              message={
                <Space>
                  <RobotOutlined />
                  <span>准备启动 AI 评审</span>
                </Space>
              }
              description={'将对 ' + (task?.total_companies || 0) + ' 家公司进行自动评审'}
              type="info"
              showIcon
              className="execute-alert"
            />
            
            <div className="execute-actions">
              <Space size="large">
                <Button 
                  type="primary" 
                  icon={<RobotOutlined />}
                  onClick={handleStartTask}
                  size="large"
                  disabled={task.status === 'processing' || task.ocr_status === 'processing' || task.total_companies === 0 || !task.rule_ids || task.rule_ids.length === 0}
                  className="start-task-btn"
                >
                  {task.status === 'processing' ? '评审进行中...' : '启动 AI 评审'}
                </Button>
                
                {task.status === 'processing' && (
                  <Button 
                    danger
                    icon={<StopOutlined />}
                    onClick={handleStopTask}
                    size="large"
                  >
                    停止评审
                  </Button>
                )}
              </Space>
            </div>

            {task.rule_ids && task.rule_ids.length > 0 && (
              <Card className="rules-summary-card">
                <Title level={5}>评审规则模板</Title>
                <Space wrap>
                  {task.rule_ids.map(ruleId => {
                    const rule = ruleTemplates.find(r => r.id === ruleId);
                    return rule ? (
                      <Tag key={ruleId} color="success" icon={<CheckCircleOutlined />}>
                        {rule.rule_name}
                      </Tag>
                    ) : null;
                  })}
                </Space>
              </Card>
            )}
          </div>
        );

      case 4:
        return (
          <Card className="completed-card">
            <div className="completed-content">
              <div className="completed-icon">
                <CheckCircleOutlined />
              </div>
              <Title level={4}>评审已完成</Title>
              <Text type="secondary">请前往「公司列表」查看各公司的详细评审结果</Text>
              <Button 
                type="primary"
                icon={<DashboardOutlined />}
                onClick={() => {
                  // 跳转到公司列表或进度页面
                }}
                style={{ marginTop: 16 }}
              >
                查看结果
              </Button>
            </div>
          </Card>
        );

      default:
        return null;
    }
  };

  // ==================== 主渲染 ====================

  if (!task && !assignment && loading) {
    return (
      <div className="detail-loading">
        <div className="loading-spinner">
          <ReloadOutlined spin className="spinner-icon" />
          <Text type="secondary">加载中...</Text>
        </div>
      </div>
    );
  }

  // Assignment 新类型
  if (assignment && !loading) {
    const isNewType = assignment.assignment_type === 'by_criteria' || 
                      assignment.assignment_type === 'by_company';
    
    if (isNewType) {
      return (
        <div className="assignment-detail">
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={() => navigate('/my-tasks')}
            className="back-btn"
          >
            返回任务列表
          </Button>

          <Card className="assignment-header-card">
            <Row align="middle" justify="space-between">
              <Col>
                <div className="assignment-title-wrapper">
                  <div className={`assignment-icon-wrapper ${assignment.assignment_type === 'by_criteria' ? 'icon-criteria' : 'icon-company'}`}>
                    {assignment.assignment_type === 'by_criteria' ? (
                      <FileTextOutlined />
                    ) : (
                      <TeamOutlined />
                    )}
                  </div>
                  <div className="assignment-info">
                    <Title level={4} style={{ margin: 0 }}>
                      {assignment.assignment_type === 'by_criteria' ? '按评审项评审' : '按公司评审'}
                    </Title>
                    <Space style={{ marginTop: 8 }}>
                      <Tag color={assignment.assignment_type === 'by_criteria' ? 'orange' : 'green'}>
                        {assignment.assignment_type === 'by_criteria' ? '按评审项' : '按公司'}
                      </Tag>
                      <Tag color={assignment.status === 'completed' ? 'success' : 'processing'}>
                        {assignment.status === 'completed' ? '已完成' : '进行中'}
                      </Tag>
                      <Text type="secondary">任务 ID: #{assignment.assignment_id}</Text>
                    </Space>
                  </div>
                </div>
              </Col>
              <Col>
                <Statistic 
                  title="进度"
                  value={assignment.progress}
                  suffix="%"
                  valueStyle={{ fontSize: 28, fontWeight: 700 }}
                  prefix={<Progress percent={assignment.progress} size="small" showInfo={false} />}
                />
              </Col>
            </Row>
          </Card>

          <ExecutionViewPanel
            assignmentId={assignment.assignment_id}
            assignmentType={assignment.assignment_type === 'by_criteria' || assignment.assignment_type === 'by_company' ? assignment.assignment_type : 'by_criteria'}
            onComplete={() => {
              fetchAssignment();
            }}
          />
        </div>
      );
    }
  }

  if (!task) return (
    <div className="detail-loading">
      <Empty description="任务不存在" />
    </div>
  );

  const status = getStatusConfig(task.status);

  const filteredCompanies = task.companies ? task.companies.filter(company => 
    company.company_name.toLowerCase().includes(companySearchText.toLowerCase())
  ) : [];

  // 计算评审进度
  const evaluationStats = {
    total: task.total_companies || 0,
    completed: (task.companies || []).filter(c => c.status === 'completed').length,
    processing: (task.companies || []).filter(c => c.status === 'processing').length,
    pending: (task.companies || []).filter(c => c.status === 'pending').length,
    percentage: task.total_companies > 0 ? Math.round(((task.companies || []).filter(c => c.status === 'completed').length / task.total_companies) * 100) : 0
  };

  return (
    <div className="task-detail-container">
      <Button 
        icon={<ArrowLeftOutlined />} 
        onClick={() => navigate('/tasks')}
        className="back-btn"
      >
        返回任务列表
      </Button>

      {/* 任务信息卡片 */}
      <Card className="task-info-card">
        <div className="task-info-header">
          <div className="task-info-left">
            <Title level={4} style={{ margin: '0 0 8px 0' }} className="task-name">
              {task.task_name}
            </Title>
            <Space>
              <Tag icon={status.icon} color={status.color} style={{ fontSize: 14, fontWeight: 500 }}>
                {status.text}
              </Tag>
              <Text type="secondary">任务 ID: #{task.id}</Text>
              <Text type="secondary">创建于：{new Date(task.created_at).toLocaleString('zh-CN')}</Text>
            </Space>
          </div>
          <div className="task-info-right">
            <Row gutter={16}>
              <Col>
                <Statistic 
                  title="公司数"
                  value={task.total_companies} 
                  valueStyle={{ fontSize: 28, fontWeight: 700 }}
                  prefix={<TeamOutlined />}
                />
              </Col>
              {task.total_score_avg !== null && (
                <Col>
                  <Statistic 
                    title="平均分"
                    value={task.total_score_avg} 
                    precision={2}
                    valueStyle={{ fontSize: 28, fontWeight: 700 }}
                    prefix={<DashboardOutlined />}
                  />
                </Col>
              )}
            </Row>
            <div className="task-info-actions">
              <Button 
                size="small"
                type="link"
                icon={<EyeOutlined />}
                onClick={() => navigate('/tasks/' + id + '/progress')}
              >
                查询日志/进度
              </Button>
            </div>
          </div>
        </div>

        <Divider className="task-info-divider" />

        {/* 步骤条 */}
        <Steps 
          current={currentStep} 
          items={steps} 
          size="small" 
          className="task-steps"
        />

        <Divider className="task-info-divider" />

        {/* 步骤导航按钮 */}
        <div className="step-navigation">
          <Space>
            {currentStep > 0 && (
              <Button 
                onClick={handlePrevStep} 
                icon={<LeftOutlined />}
                size="large"
              >
                上一步
              </Button>
            )}
            {currentStep < steps.length - 1 && (
              <Button 
                onClick={handleNextStep} 
                icon={<RightOutlined />}
                size="large"
                type="primary"
                disabled={currentStep === 3 && task?.status !== 'completed'}
              >
                下一步
              </Button>
            )}
          </Space>
        </div>

        {/* 步骤内容 */}
        <Card className="step-content-card">
          {renderStepContent()}
        </Card>
      </Card>

      {/* 公司列表 */}
      {task.companies && task.companies.length > 0 && (
        <>
          {/* 评审进度 Card */}
          <Card className="evaluation-progress-card" bordered={false} style={{ marginBottom: 16 }}>
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
                  {evaluationStats.completed} / {evaluationStats.total}
                </div>
                <Text type="secondary">家公司</Text>
              </div>
            </div>
            <Progress 
              percent={evaluationStats.percentage} 
              strokeColor={{
                '0%': '#108ee9',
                '100%': '#87d068',
              }}
              style={{ marginTop: 16 }}
            />
          </Card>

          <Card 
            title={
              <Space>
                <TeamOutlined />
                <span>公司列表</span>
              </Space>
            }
            extra={
              <Space>
                <Text type="secondary">{task.total_companies} 家</Text>
                <Input
                  placeholder="搜索公司名称"
                  value={companySearchText}
                  onChange={(e) => setCompanySearchText(e.target.value)}
                  prefix={<SearchOutlined />}
                  style={{ width: 250 }}
                  className="company-search"
                />
              </Space>
            }
            className="companies-card"
          >
          <Table
            columns={[
              {
                title: '公司名称',
                dataIndex: 'company_name',
                key: 'company_name',
                width: 280,
                fixed: 'left',
                render: (text: string) => (
                  <span className="company-name">{text}</span>
                )
              },
              {
                title: '状态',
                dataIndex: 'status',
                key: 'status',
                width: 120,
                render: (status: string) => {
                  const config = getStatusConfig(status);
                  return (
                    <Tag icon={config.icon} color={config.color} style={{ fontWeight: 500 }}>
                      {config.text}
                    </Tag>
                  );
                }
              },
              {
                title: '文件数',
                key: 'file_count',
                width: 120,
                render: (_: any, record: Company) => (
                  <Space>
                    <FolderOutlined style={{ color: '#1890ff' }} />
                    <Text type="secondary">{record.file_count || 0} 个文件</Text>
                  </Space>
                )
              },
              {
                title: '规则进度',
                key: 'rule_progress',
                width: 180,
                render: (_: any, record: Company) => {
                  const totalRules = task.rule_ids?.length || 0;
                  const processedRules = record.processed_rules || 0;
                  const percent = totalRules > 0 ? (processedRules / totalRules) * 100 : 0;
                  return (
                    <div className="company-progress">
                      <Progress 
                        percent={percent}
                        size="small"
                        format={() => `${processedRules}/${totalRules}`}
                        status={percent === 100 ? 'success' : 'active'}
                      />
                      <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                        {totalRules > 0 ? '规则评审中' : '待配置规则'}
                      </Text>
                    </div>
                  );
                }
              },
              {
                title: '操作',
                key: 'action',
                width: 120,
                fixed: 'right',
                render: (_: any, record: Company) => (
                  <Button 
                    size="small"
                    type="link"
                    icon={<ArrowRightOutlined />}
                    onClick={() => navigate('/companies/' + record.id)}
                  >
                    详情
                  </Button>
                )
              }
            ]}
            dataSource={filteredCompanies}
            rowKey="id"
            pagination={{
              current: companyPagination.current,
              pageSize: companyPagination.pageSize,
              onChange: (current, pageSize) => setCompanyPagination({ current, pageSize }),
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50'],
              showTotal: (total) => `共 ${total} 家公司`
            }}
            scroll={{ x: 1000 }}
            className="companies-table"
          />
          </Card>
        </>
      )}

      <Drawer
        title={
          <Space>
            <FolderOutlined /> 
            <span>文件树 - {selectedCompany?.company_name}</span>
          </Space>
        }
        placement="right"
        width={1500}
        open={showFileTree}
        onClose={() => setShowFileTree(false)}
        className="file-tree-drawer"
      >
        {selectedCompany?.bid_folder_path && (
          <FileTreeExplorer 
            companyId={selectedCompany.id}
            companyFolder={selectedCompany.bid_folder_path}
          />
        )}
      </Drawer>

      <FileSelector
        taskId={parseInt(id!)}
        visible={showFileSelector}
        onCancel={() => setShowFileSelector(false)}
        onSelect={handleSelectFiles}
      />
    </div>
  );
};

export default TaskDetail;
