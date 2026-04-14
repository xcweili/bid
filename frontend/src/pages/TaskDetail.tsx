import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  Card, Button, Typography, Upload, message, Table, Tag, 
  Descriptions, Progress, Space, Modal, Steps, Divider, 
  Statistic, Checkbox, Alert, List, Drawer, Input
} from 'antd';
import { 
  UploadOutlined, ArrowLeftOutlined,
  CheckCircleOutlined, ClockCircleOutlined,
  FolderOutlined, RobotOutlined, RightOutlined, LeftOutlined,
  DeleteOutlined, ReloadOutlined, StopOutlined, EyeOutlined,
  SearchOutlined
} from '@ant-design/icons';
import { taskService } from '../services/taskService';
import { ruleService } from '../services/ruleService';
import FileTreeExplorer from '../components/FileTreeExplorer';
import FileSelector from '../components/FileSelector';

const { Title, Text } = Typography;

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

const TaskDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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

  const steps = [
    { title: '新建任务', description: '任务已创建' },
    { title: '上传标书', description: '上传 ZIP 格式的标书文件' },
    { title: '配置规则', description: '选择评审规则模板' },
    { title: 'AI 评审', description: '开始自动评审' },
    { title: '查看结果', description: '查看评审结果' },
  ];

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

  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (id) {
      fetchTask();
      fetchRuleTemplates();
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

  // 自动刷新任务状态，当任务处于processing状态时
  useEffect(() => {
    let interval: any;
    if (task && task.status === 'processing') {
      // 每1分钟刷新一次任务状态
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

  // 自动刷新OCR状态，当文档解析中时
  useEffect(() => {
    let interval: any;
    if (task && task.ocr_status === 'processing') {
      // 每1分钟刷新一次OCR状态
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
      // 构建规则详情对象，包含绑定的文件列表
      const details: Record<number, { source_files: string[] }> = {};
      data.forEach((rule: RuleTemplate) => {
        // 从规则配置中提取source_files
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

  const handleUpload = async (file: File) => {
    console.log('开始上传文件...');
    setUploading(true);
    try {
      const result = await taskService.uploadBidZip(parseInt(id!), file);
      console.log('上传成功，返回结果:', result);
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
    // 打开文件选择器
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
          console.log('OCR 状态轮询', data.ocr_status);
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

  const handleSaveRules = async () => {
    if (!task) return;
    
    // 检查是否所有选择的规则都已绑定文件
    const rulesWithoutFiles = selectedRuleIds.filter(ruleId => {
      const rule = ruleDetails[ruleId];
      return !rule || !rule.source_files || rule.source_files.length === 0;
    });
    
    if (rulesWithoutFiles.length > 0) {
      // 找出未绑定文件的规则名称
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
            <p>未绑定文件的规则将无法进行AI评审。</p>
            <p>是否前往规则配置页面绑定文件？</p>
          </div>
        ),
        okText: '前往配置',
        cancelText: '继续保存',
        onOk: () => {
          navigate('/rules');
        },
        onCancel: async () => {
          // 继续保存，即使有些规则未绑定文件
          saveRules();
        }
      });
    } else {
      // 所有规则都已绑定文件，直接保存
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
      await fetchRuleTemplates(); // 重新获取规则模板，更新绑定文件状态
    } catch (error) {
      message.error('保存规则失败');
    } finally {
      setSavingRules(false);
    }
  };

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

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; text: string; icon: React.ReactNode }> = {
      pending: { color: 'default', text: '待处理', icon: <ClockCircleOutlined /> },
      processing: { color: 'processing', text: '评审中', icon: <RobotOutlined /> },
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
    console.log('=== handleNextStep 被调用 ===');
    console.log('currentStep:', currentStep);
    console.log('task?.total_companies:', task?.total_companies);
    console.log('task?.rule_ids:', task?.rule_ids);
    console.log('task?.status:', task?.status);
    
    if (currentStep < steps.length - 1) {
      if (currentStep === 1 && task?.total_companies === 0) {
        console.log('触发提示：请先上传标书文件');
        message.warning('请先上传标书文件');
        return;
      }
      if (currentStep === 2 && task?.rule_ids && task.rule_ids.length === 0) {
        console.log('触发提示：请至少选择一个规则模板');
        message.warning('请至少选择一个规则模板');
        return;
      }
      if (currentStep === 3 && task?.status !== 'completed') {
        console.log('触发提示：评审未完成，请等待完成');
        message.warning('评审未完成，请等待完成');
        return;
      }
      console.log('设置 currentStep =', currentStep + 1);
      setCurrentStep(currentStep + 1);
    }
  };

  if (!task) return <div style={{ padding: 40, textAlign: 'center' }}>加载中...</div>;

  const status = getStatusConfig(task.status);

  // 计算过滤后的公司数据
  const filteredCompanies = task.companies ? task.companies.filter(company => 
    company.company_name.toLowerCase().includes(companySearchText.toLowerCase())
  ) : [];

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <Alert
            message="任务已创建"
            description="任务基本信息已保存，请继续下一步操作"
            type="info"
            showIcon
          />
        );

      case 1:
        return (
          <div>
            {task.total_companies === 0 ? (
              <Space direction="vertical" size="middle">
                <Alert
                  message="请上传标书文件"
                  description="支持 ZIP 格式的标书文件，系统将自动识别其中的公司文件夹"
                  type="info"
                  showIcon
                />
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
                  >
                    上传标书 ZIP
                  </Button>
                </Upload>
              </Space>
            ) : (
              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <Alert
                  message="已上传标书"
                  description={`已识别 ${task.total_companies} 家公司，文件解析状态：${task.ocr_status === 'processing' ? '解析中' : task.ocr_status === 'idle' ? '已完成' : '待处理'}`}
                  type={task.ocr_status === 'processing' ? 'info' : 'success'}
                  showIcon
                />
                
                <Space wrap>
                  {task?.ocr_status === 'processing' ? (
                    <>
                      <Button 
                        danger
                        icon={<StopOutlined />}
                        onClick={handleStopOcr}
                      >
                        停止解析
                      </Button>
                      <Text type="secondary">文件正在解析中，请稍候...</Text>
                    </>
                  ) : (
                    <>
                      <Button 
                        icon={<ReloadOutlined />}
                        onClick={handleOcrDocuments}
                        type="primary"
                      >
                        {task.ocr_status === 'idle' ? '重新解析文档' : '开始解析文档'}
                      </Button>
                      <Button 
                        danger
                        icon={<DeleteOutlined />}
                        onClick={handleReUpload}
                      >
                        删除原文档
                      </Button>
                    </>
                  )}
                </Space>
                
                <Text type="secondary" style={{ fontSize: 12 }}>
                  💡 点击"开始解析文档"可将 .doc/.docx/.pdf 文件转换为文本格式，便于 AI 评审
                </Text>
              </Space>
            )}
          </div>
        );

      case 2:
        return (
          <div>
            <Alert
              message="选择评审规则模板"
              description="从已配置的规则模板中选择需要应用于本任务的规则"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            
            {ruleTemplates.length === 0 ? (
              <Alert
                message="暂无规则模板"
                description="请先在「规则配置」页面创建规则模板"
                type="warning"
                showIcon
                action={
                  <Button size="small" type="primary" onClick={() => navigate('/rules')}>
                    配置
                  </Button>
                }
              />
            ) : (
              <List
                dataSource={ruleTemplates}
                renderItem={(item) => {
                  const hasFiles = ruleDetails[item.id]?.source_files?.length > 0;
                  const isSelected = selectedRuleIds.includes(item.id);
                  return (
                    <List.Item
                      onClick={() => {
                        if (isSelected) {
                          setSelectedRuleIds(selectedRuleIds.filter(id => id !== item.id));
                        } else {
                          setSelectedRuleIds([...selectedRuleIds, item.id]);
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                      actions={[
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
                        >
                          {isSelected ? '已选择' : '选择'}
                        </Checkbox>
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Space>
                            {item.rule_name}
                            {hasFiles ? (
                              <Tag color="green">已绑定文件</Tag>
                            ) : (
                              <Tag color="orange">未绑定文件</Tag>
                            )}
                          </Space>
                        }
                        description={
                          <div>
                            <div>{item.rule_content?.substring(0, 100) + '...'}</div>
                            {!hasFiles && (
                              <div style={{ marginTop: 4, fontSize: 12, color: '#ff4d4f' }}>
                                ⚠️ 未绑定源文件，AI评审时可能无法获取相关信息
                              </div>
                            )}
                          </div>
                        }
                      />
                    </List.Item>
                  );
                }}
              />
            )}

            <Divider />
            
            <Space>
              <Button 
                type="primary"
                onClick={handleSaveRules}
                loading={savingRules}
                disabled={selectedRuleIds.length === 0}
              >
                保存规则配置
              </Button>
              <Text type="secondary">已选择 {selectedRuleIds.length} 个规则模板</Text>
            </Space>

            {task.rule_ids && task.rule_ids.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <Title level={5}>当前关联的规则模板</Title>
                <Space wrap>
                  {task.rule_ids.map(ruleId => {
                    const rule = ruleTemplates.find(r => r.id === ruleId);
                    return rule ? (
                      <Tag key={ruleId} color="blue">{rule.rule_name}</Tag>
                    ) : null;
                  })}
                </Space>
              </div>
            )}
          </div>
        );

      case 3:
        return (
          <div>
            <Alert
              message="准备启动 AI 评审"
              description={'将对 ' + (task?.total_companies || 0) + ' 家公司进行自动评审'}
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            
            <Space size="middle">
              <Button 
                type="primary" 
                icon={<RobotOutlined />}
                onClick={handleStartTask}
                size="large"
                disabled={task.status === 'processing' || task.ocr_status === 'processing' || task.total_companies === 0 || !task.rule_ids || task.rule_ids.length === 0}
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

            {task.rule_ids && task.rule_ids.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <Title level={5}>评审规则模板</Title>
                <Space wrap>
                  {task.rule_ids.map(ruleId => {
                    const rule = ruleTemplates.find(r => r.id === ruleId);
                    return rule ? (
                      <Tag key={ruleId} color="green">{rule.rule_name}</Tag>
                    ) : null;
                  })}
                </Space>
              </div>
            )}
          </div>
        );

      case 4:
        return (
          <Alert
            message="评审已完成"
            description="请前往「公司列表」查看各公司的详细评审结果"
            type="success"
            showIcon
          />
        );

      default:
        return null;
    }
  };

  return (
    <div>
      <Button 
        icon={<ArrowLeftOutlined />} 
        onClick={() => navigate('/tasks')}
        style={{ marginBottom: 16 }}
      >
        返回任务列表
      </Button>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Title level={4} style={{ margin: '0 0 8px 0' }}>{task.task_name}</Title>
            <Space>
              <Tag icon={status.icon} color={status.color} style={{ fontSize: 14 }}>
                {status.text}
              </Tag>
              <Text type="secondary">任务 ID: #{task.id}</Text>
            </Space>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Statistic 
              title="公司数"
              value={task.total_companies} 
              valueStyle={{ fontSize: 24 }}
            />
            <div style={{ marginTop: 8 }}>
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

        <Divider style={{ margin: '16px 0' }} />

        <Steps current={currentStep} items={steps} size="small" />

        <Divider style={{ margin: '16px 0' }} />

        <Space wrap style={{ marginBottom: 16 }}>
          {currentStep > 0 && (
            <Button onClick={handlePrevStep} icon={<LeftOutlined />}>
              上一步
            </Button>
          )}
          {currentStep < steps.length - 1 && (
            <Button 
              onClick={handleNextStep} 
              icon={<RightOutlined />}
              disabled={currentStep === 3 && task?.status !== 'completed'}
            >
              下一步
            </Button>
          )}
        </Space>

        <Card>
          {renderStepContent()}
        </Card>
      </Card>

      {/* 公司列表 - 始终显示，不管在哪个步骤 */}
      {task.companies && task.companies.length > 0 && (
        <Card 
          title="公司列表" 
          extra={<Text type="secondary">{task.total_companies} 家</Text>}
        >
          {/* 搜索框 */}
          <div style={{ marginBottom: 16 }}>
            <Input
              placeholder="搜索公司名称"
              value={companySearchText}
              onChange={(e) => setCompanySearchText(e.target.value)}
              prefix={<SearchOutlined />}
              style={{ width: 300 }}
            />
          </div>

          <Table
            columns={[
              {
                title: '公司名称',
                dataIndex: 'company_name',
                key: 'company_name',
                width: 250,
                render: (text: string) => <Text strong>{text}</Text>
              },
              {
                title: '状态',
                dataIndex: 'status',
                key: 'status',
                width: 100,
                render: (status: string) => {
                  const config = getStatusConfig(status);
                  return <Tag icon={config.icon} color={config.color}>{config.text}</Tag>;
                }
              },
              {
                title: '文件数',
                key: 'file_count',
                width: 100,
                render: (_: any, record: Company) => (
                  <Text type="secondary">{record.file_count || 0} 个文件</Text>
                )
              },
              {
                title: '规则进度',
                key: 'rule_progress',
                width: 150,
                render: (_: any, record: Company) => {
                  const totalRules = task.rule_ids?.length || 0;
                  const processedRules = record.processed_rules || 0;
                  return (
                    <Space direction="vertical" size={0} style={{ width: '100%' }}>
                      <Progress 
                        percent={totalRules > 0 ? (processedRules / totalRules) * 100 : 0}
                        size="small"
                        format={() => processedRules + '/' + totalRules}
                      />
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {totalRules > 0 ? '规则评审中' : '待配置规则'}
                      </Text>
                    </Space>
                  );
                }
              },
              {
                title: '操作',
                key: 'action',
                width: 180,
                render: (_: any, record: Company) => (
                  <Space>
                    <Button 
                      size="small"
                      icon={<FolderOutlined />}
                      onClick={() => {
                        setSelectedCompany(record);
                        setShowFileTree(true);
                      }}
                    >
                      文件树
                    </Button>
                    <Button 
                      size="small"
                      type="link"
                      onClick={() => navigate('/companies/' + record.id)}
                    >
                      详情
                    </Button>
                  </Space>
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
            scroll={{ x: 700 }}
          />
        </Card>
      )}

      <Drawer
        title={<Space><FolderOutlined /> 文件树 - {selectedCompany?.company_name}</Space>}
        placement="right"
        width={1500}
        open={showFileTree}
        onClose={() => setShowFileTree(false)}
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