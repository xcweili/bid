import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Card, Typography, Row, Col, Statistic, Table, Tag, 
  Progress, Space, Button, Descriptions,
  Divider, List, Modal, Empty, Alert,
  Drawer, message, Upload, Badge, Skeleton, Input
} from 'antd';
import { 
  DashboardOutlined, FileTextOutlined, RobotOutlined,
  CheckCircleOutlined, ClockCircleOutlined,
  EyeOutlined, DeleteOutlined, PlusOutlined, UploadOutlined,
  ReloadOutlined, BarChartOutlined,
  TeamOutlined, ArrowRightOutlined, FolderOutlined,
  ThunderboltOutlined, ClockCircleOutlined as TimeIcon,
  SearchOutlined
} from '@ant-design/icons';
import { taskService } from '../services/taskService';

const { Title, Text } = Typography;

// 设计令牌 - 统一的视觉风格
const designTokens = {
  colors: {
    primary: '#1890ff',
    primaryLight: '#e6f7ff',
    success: '#52c41a',
    successLight: '#f6ffed',
    warning: '#faad14',
    warningLight: '#fffbe6',
    error: '#ff4d4f',
    errorLight: '#fff1f0',
    background: '#f5f7fa',
    cardBg: '#ffffff',
    textPrimary: '#1f1f1f',
    textSecondary: '#8c8c8c',
    border: '#e8e8e8',
  },
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 24,
    xl: 32,
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 16,
  },
  shadow: {
    sm: '0 2px 8px rgba(0,0,0,0.06)',
    md: '0 4px 16px rgba(0,0,0,0.08)',
    lg: '0 8px 24px rgba(0,0,0,0.12)',
  }
};

interface TaskStats {
  id: number;
  task_name: string;
  total_companies: number;
  processed_companies: number;
  status: string;
  created_at: string;
  company_details: CompanyProgress[];
  zip_file_path?: string;
  rule_ids?: number[];
  rule_count?: number;
  ocr_status?: 'idle' | 'processing';
}

interface CompanyProgress {
  id: number;
  company_name: string;
  total_items: number;
  processed_items: number;
  status: string;
  total_score: number | null;
  current_step: 'pending' | 'file_analysis' | 'ai_evaluation' | 'completed';
  rule_scores?: RuleScore[];
  bid_folder_path?: string;
  task_id?: number;
  total_rules?: number;
  processed_rules?: number;
  ocr_status?: 'pending' | 'processing' | 'completed' | 'failed';
}

interface RuleScore {
  rule_id: number;
  rule_name: string;
  item_name: string;
  score: number;
  max_score: number;
  reason: string;
  evidence: string;
  evidence_details?: any[];
  status: string;
}

interface FileNode {
  title: string;
  key: string;
  selectable?: boolean;
  children?: FileNode[];
  isLeaf?: boolean;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskStats[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [showFileTree, setShowFileTree] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  
  // 搜索和分页状态
  const [taskSearchText, setTaskSearchText] = useState('');
  const [companySearchText, setCompanySearchText] = useState('');
  const [taskPagination, setTaskPagination] = useState({ current: 1, pageSize: 10 });
  const [companyPagination, setCompanyPagination] = useState({ current: 1, pageSize: 10 });
  
  // 存储公司评审结果，避免轮询时丢失数据
  const companyResultsRef = useRef<Record<number, any>>({});

  useEffect(() => {
    fetchDashboardData();
    
    // 添加轮询机制，每1分钟刷新一次数据
    const interval = setInterval(() => {
      fetchDashboardData();
    }, 60000);
    
    // 清理函数
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const tasksData = await taskService.getTasks();
      
      // 先获取所有任务的详细信息
      const tasksWithDetails = await Promise.all(
        tasksData.map(async (task: any) => {
          const detail = await taskService.getTask(task.id);
          return {
            ...task,
            ...detail
          };
        })
      );
      
      // 处理任务数据，保留rule_scores
      const processedTasks = await Promise.all(
        tasksWithDetails.map(async (task: any) => {
          const ruleCount = task.rule_ids?.length || 0;
          
          // 获取每个公司的评审结果
          const companyDetails: CompanyProgress[] = await Promise.all(
            (task.companies || []).map(async (company: any) => {
              // 尝试获取公司评审结果
              let companyResults = companyResultsRef.current[company.id];
              if (!companyResults && company.status === 'completed') {
                try {
                  companyResults = await taskService.getCompanyResults(company.id);
                  companyResultsRef.current[company.id] = companyResults;
                } catch (error) {
                  console.error(`获取公司 ${company.id} 评审结果失败:`, error);
                }
              }
              
              return {
                id: company.id,
                company_name: company.company_name,
                task_id: task.id,
                total_items: ruleCount,
                processed_items: company.processed_rules || 0,
                status: company.status,
                total_score: companyResults?.total_score || company.total_score,
                current_step: company.status === 'completed' ? 'completed' :
                             company.status === 'processing' ? 'ai_evaluation' : 'pending',
                total_rules: ruleCount,
                processed_rules: company.processed_rules || 0,
                bid_folder_path: company.bid_folder_path,
                ocr_status: company.ocr_status || 'pending',
                rule_scores: companyResults?.rule_scores // 从ref中获取rule_scores
              };
            })
          );
          
          return {
            ...task,
            rule_count: ruleCount,
            processed_companies: companyDetails.filter(c => c.status === 'completed').length,
            company_details: companyDetails
          };
        })
      );
      
      setTasks(processedTasks);
    } catch (error) {
      console.error('获取看板数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTask = async () => {
    if (!newTaskName.trim()) {
      message.warning('请输入任务名称');
      return;
    }
    try {
      await taskService.createTask({ task_name: newTaskName });
      message.success('任务创建成功');
      setShowCreateModal(false);
      setNewTaskName('');
      fetchDashboardData();
    } catch (error) {
      message.error('创建失败');
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该任务吗？相关记录和文件都将被删除，此操作不可恢复！',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await taskService.deleteTask(taskId);
          message.success('任务已删除，所有相关文件已清理');
          // 清除选中状态
          setSelectedTaskId(null);
          setSelectedCompanyId(null);
          // 刷新数据
          await fetchDashboardData();
        } catch (error) {
          message.error('删除失败');
        }
      }
    });
  };

  const handleUploadZip = async (taskId: number, file: File) => {
    try {
      await taskService.uploadBidZip(taskId, file);
      message.success('上传成功');
      fetchDashboardData();
    } catch (error) {
      message.error('上传失败');
    }
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; bg: string; icon: React.ReactNode; text: string }> = {
      pending: { 
        color: '#8c8c8c', 
        bg: '#f5f5f5', 
        icon: <TimeIcon />, 
        text: '待处理' 
      },
      processing: { 
        color: '#1890ff', 
        bg: '#e6f7ff', 
        icon: <ThunderboltOutlined />, 
        text: '评审中' 
      },
      completed: { 
        color: '#52c41a', 
        bg: '#f6ffed', 
        icon: <CheckCircleOutlined />, 
        text: '已完成' 
      },
      failed: { 
        color: '#ff4d4f', 
        bg: '#fff1f0', 
        icon: <DeleteOutlined />, 
        text: '失败' 
      },
    };
    return configs[status] || configs.pending;
  };

  // 统计卡片组件
  const StatCard: React.FC<{
    title: string;
    value: number;
    icon: React.ReactNode;
    color: string;
    bg: string;
    trend?: string;
  }> = ({ title, value, icon, color, bg, trend }) => (
    <Card 
      bordered={false}
      style={{ 
        background: bg,
        borderRadius: designTokens.radius.lg,
        boxShadow: designTokens.shadow.sm,
        height: '100%'
      }}
      bodyStyle={{ height: '100%' }}
    >
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        height: '100%',
        minHeight: 120
      }}>
        <div>
          <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{title}</Text>
          <Title level={2} style={{ margin: 0, color, fontSize: 36, fontWeight: 700 }}>{value}</Title>
          <div style={{ minHeight: 16 }}>
            {trend && <Text style={{ fontSize: 12, color: '#8c8c8c' }}>{trend}</Text>}
          </div>
        </div>
        <div style={{ 
          width: 64, 
          height: 64, 
          background: 'rgba(255,255,255,0.7)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color
        }}>
          {React.cloneElement(icon as React.ReactElement, { style: { fontSize: 28 } })}
        </div>
      </div>
    </Card>
  );

  // 任务状态标签
  const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const config = getStatusConfig(status);
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        background: config.bg,
        borderRadius: 20,
        fontSize: 13,
        color: config.color,
        fontWeight: 500
      }}>
        {React.cloneElement(config.icon as React.ReactElement, { style: { fontSize: 14 } })}
        {config.text}
      </span>
    );
  };

  // 任务表格列
  const taskColumns = [
    {
      title: '任务名称',
      dataIndex: 'task_name',
      key: 'task_name',
      width: 220,
      render: (text: string, record: TaskStats) => (
        <div>
          <a 
            href={`/tasks/${record.id}`}
            style={{ fontSize: 15, display: 'block', marginBottom: 2, fontWeight: 500 }}
          >
            {text}
          </a>
          <Text type="secondary" style={{ fontSize: 12 }}>#{record.id} · {new Date(record.created_at).toLocaleDateString('zh-CN')}</Text>
        </div>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => <StatusBadge status={status} />
    },
    {
      title: '评审进度',
      key: 'progress',
      width: 200,
      render: (_: any, record: TaskStats) => {
        const total = record.total_companies || 0;
        const processed = record.processed_companies || 0;
        const percent = total > 0 ? (processed / total) * 100 : 0;
        return (
          <div style={{ width: '100%' }}>
            <Progress 
              percent={percent}
              size="small"
              strokeColor={record.status === 'completed' ? designTokens.colors.success : designTokens.colors.primary}
              format={() => `${processed}/${total} 公司`}
              showInfo={true}
            />
          </div>
        );
      }
    },
    {
      title: '规则数',
      dataIndex: 'rule_count',
      key: 'rule_count',
      width: 100,
      render: (count: number) => (
        <Tag color="blue" style={{ fontSize: 13 }}>
          {count || 0} 项
        </Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      fixed: 'right' as const,
      render: (_: any, record: TaskStats) => (
        <Space wrap size="small">
          <Button 
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedTaskId(record.id);
              setSelectedCompanyId(null);
            }}
          >
            展开
          </Button>
          {record.status === 'pending' && record.total_companies === 0 && (
            <Upload
              accept=".zip"
              showUploadList={false}
              beforeUpload={(file: File) => {
                handleUploadZip(record.id, file);
                return false;
              }}
            >
              <Button size="small" icon={<UploadOutlined />} type="primary">
                上传
              </Button>
            </Upload>
          )}
          {record.total_companies > 0 && record.status === 'pending' && (
            <>
              {!record.rule_ids || record.rule_ids.length === 0 ? (
                <Button 
                  size="small"
                  icon={<FolderOutlined />}
                  onClick={() => navigate(`/tasks/${record.id}`)}
                >
                  配置
                </Button>
              ) : (
                <Button 
                  size="small" 
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  disabled={record.ocr_status === 'processing' || record.company_details?.some(c => c.ocr_status === 'processing')}
                  onClick={() => {
                    if (record.ocr_status === 'processing') {
                      message.warning('文档解析正在进行中，请等待解析完成');
                      return;
                    }
                    const processingCount = record.company_details?.filter(c => c.ocr_status === 'processing').length || 0;
                    if (processingCount > 0) {
                      message.warning(`还有${processingCount}家公司的文档正在解析中，请等待解析完成`);
                      return;
                    }
                    const pendingCount = record.company_details?.filter(c => c.ocr_status === 'pending').length || 0;
                    if (pendingCount > 0) {
                      message.warning(`还有${pendingCount}家公司的文档未解析，请先完成文档解析`);
                      return;
                    }
                    Modal.confirm({
                      title: '启动评审',
                      content: `确定要对 ${record.total_companies} 家公司进行 AI 评审吗？`,
                      onOk: async () => {
                        await taskService.startTask(record.id);
                        message.success('评审已启动');
                        fetchDashboardData();
                      }
                    });
                  }}
                >
                  启动
                </Button>
              )}
            </>
          )}

        </Space>
      )
    }
  ];

  // 公司表格列
  const companyColumns = [
    {
      title: '公司名称',
      dataIndex: 'company_name',
      key: 'company_name',
      width: 220,
      render: (text: string) => (
        <Text strong style={{ fontSize: 14 }}>{text}</Text>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => <StatusBadge status={status} />
    },
    {
      title: '评审进度',
      key: 'rule_progress',
      width: 180,
      render: (_: any, record: CompanyProgress) => {
        // 优先使用 rule_scores 中的实际数据
        const ruleScores = (record as any).rule_scores;
        const totalRules = record.total_rules || ruleScores?.length || 0;
        const processedRules = ruleScores ? ruleScores.filter((r: any) => r.status === 'completed').length : (record.processed_rules || 0);
        
        if (totalRules === 0) {
          return (
            <Tag color="default" style={{ fontSize: 12 }}>
              未配置规则
            </Tag>
          );
        }
        const percent = (processedRules / totalRules) * 100;
        return (
          <div style={{ width: '100%' }}>
            <Progress 
              percent={percent}
              size="small"
              format={() => `${processedRules}/${totalRules}`}
              strokeColor={percent === 100 ? designTokens.colors.success : designTokens.colors.primary}
              showInfo={true}
            />
          </div>
        );
      }
    },
    {
      title: '得分',
      key: 'score',
      width: 120,
      render: (_: any, record: CompanyProgress) => {
        const score = record.total_score;
        if (score === null || score === undefined) {
          return <Text type="secondary" style={{ fontSize: 14 }}>-</Text>;
        }
        const color = score >= 80 ? designTokens.colors.success : score >= 60 ? designTokens.colors.warning : designTokens.colors.error;
        return (
          <Tag color={color} style={{ fontSize: 15, fontWeight: 600, padding: '4px 10px' }}>
            {score.toFixed(1)} 分
          </Tag>
        );
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: CompanyProgress) => (
        <Button 
          size="small" 
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedCompanyId(record.id);
            fetchCompanyResults(record.id);
          }}
        >
          详情
        </Button>
      )
    }
  ];

  const currentTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) : null;
  
  // 获取包含评审结果的公司数据
  const currentCompany = selectedCompanyId && currentTask ? (
    {
      ...currentTask.company_details.find(c => c.id === selectedCompanyId),
      ...companyResultsRef.current[selectedCompanyId]
    }
  ) : null;

  const fetchCompanyResults = async (companyId: number) => {
    try {
      const results = await taskService.getCompanyResults(companyId);
      
      if (results && results.rule_scores) {
        // 存储公司评审结果到ref中
        companyResultsRef.current[companyId] = results;
        
        // 更新公司数据，保留原有的 total_rules 等字段
        const updatedCompany = { 
          ...currentTask?.company_details.find(c => c.id === companyId),
          ...results,
          rule_scores: results.rule_scores
        };
        if (currentTask) {
          const updatedCompanies = currentTask.company_details.map(c => 
            c.id === companyId ? updatedCompany : c
          );
          const updatedTask = { ...currentTask, company_details: updatedCompanies };
          setTasks(tasks.map(t => t.id === currentTask.id ? updatedTask : t));
        }
      }
    } catch (error) {
      console.error('❌ 获取公司评审结果失败:', error);
    }
  };

  // 计算过滤后的任务和公司数据
  const filteredTasks = tasks.filter(task => 
    task.task_name.toLowerCase().includes(taskSearchText.toLowerCase())
  );
  
  // 计算过滤后的公司数据（仅当有选中任务时）
  const filteredCompanies = currentTask ? currentTask.company_details.filter(company => 
    company.company_name.toLowerCase().includes(companySearchText.toLowerCase())
  ) : [];

  return (
    <div style={{ background: designTokens.colors.background, minHeight: '100vh' }}>
      {/* 顶部 Header */}
      <div style={{ 
        background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
        padding: '32px 24px',
        marginBottom: 24
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <DashboardOutlined style={{ fontSize: 36, color: '#fff' }} />
                <Title level={2} style={{ margin: 0, color: '#fff' }}>投标评审平台</Title>
              </div>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15 }}>
                数据看板 · 实时监控评审进度
              </Text>
            </div>
            <Space>
              <Button 
                size="large"
                icon={<ReloadOutlined />}
                onClick={fetchDashboardData}
                style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}
              >
                刷新
              </Button>
              <Button 
                type="primary" 
                size="large"
                icon={<PlusOutlined />}
                onClick={() => setShowCreateModal(true)}
                style={{ background: '#fff', color: '#1890ff', borderColor: '#fff' }}
              >
                新建任务
              </Button>
            </Space>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 24px' }}>
        {/* 统计卡片 */}
        <Row gutter={24} style={{ marginBottom: 32 }}>
          <Col span={8}>
            <StatCard
              title="总任务数"
              value={tasks.length}
              icon={<FileTextOutlined />}
              color={designTokens.colors.primary}
              bg={designTokens.colors.primaryLight}
            />
          </Col>
          <Col span={8}>
            <StatCard
              title="进行中"
              value={tasks.filter(t => t.status === 'processing').length}
              icon={<ThunderboltOutlined />}
              color={designTokens.colors.primary}
              bg={designTokens.colors.primaryLight}
              trend="AI 评审运行中"
            />
          </Col>
          <Col span={8}>
            <StatCard
              title="已完成"
              value={tasks.filter(t => t.status === 'completed').length}
              icon={<CheckCircleOutlined />}
              color={designTokens.colors.success}
              bg={designTokens.colors.successLight}
              trend="评审完成"
            />
          </Col>
        </Row>

        {/* 任务列表 */}
        <Card 
          bordered={false}
          style={{ 
            background: designTokens.colors.cardBg,
            borderRadius: designTokens.radius.lg,
            boxShadow: designTokens.shadow.md,
            marginBottom: 24
          }}
        >
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            marginBottom: 20,
            paddingBottom: 16,
            borderBottom: `1px solid ${designTokens.colors.border}`
          }}>
            <Space>
              <BarChartOutlined style={{ color: designTokens.colors.primary, fontSize: 20 }} />
              <Title level={4} style={{ margin: 0 }}>任务列表</Title>
            </Space>
            <Text type="secondary" style={{ fontSize: 13 }}>
              共 {tasks.length} 个任务
            </Text>
          </div>

          {/* 搜索框 */}
          <div style={{ marginBottom: 16 }}>
            <Input
              placeholder="搜索任务名称"
              value={taskSearchText}
              onChange={(e) => setTaskSearchText(e.target.value)}
              prefix={<SearchOutlined />}
              style={{ width: 300 }}
            />
          </div>

          <Table
            columns={taskColumns}
            dataSource={filteredTasks}
            rowKey="id"
            pagination={{
              current: taskPagination.current,
              pageSize: taskPagination.pageSize,
              onChange: (current, pageSize) => setTaskPagination({ current, pageSize }),
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50'],
              showTotal: (total) => `共 ${total} 个任务`
            }}
            loading={loading}
            locale={{ emptyText: (
              <div style={{ padding: '40px 0' }}>
                <Empty 
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <div>
                      <Text type="secondary" style={{ fontSize: 14 }}>暂无任务</Text>
                      <div style={{ marginTop: 12 }}>
                        <Button 
                          type="primary" 
                          icon={<PlusOutlined />}
                          onClick={() => setShowCreateModal(true)}
                        >
                          创建第一个任务
                        </Button>
                      </div>
                    </div>
                  }
                />
              </div>
            )}}
            scroll={{ x: 1000 }}
          />
        </Card>

        {/* 公司列表（选择任务后显示） */}
        {selectedTaskId && currentTask && (
          <Card 
            bordered={false}
            style={{ 
              background: designTokens.colors.cardBg,
              borderRadius: designTokens.radius.lg,
              boxShadow: designTokens.shadow.md,
              marginBottom: 24
            }}
          >
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              marginBottom: 20,
              paddingBottom: 16,
              borderBottom: `1px solid ${designTokens.colors.border}`
            }}>
              <TeamOutlined style={{ color: designTokens.colors.primary, fontSize: 20, marginRight: 8 }} />
              <Title level={4} style={{ margin: 0 }}>
                {currentTask.task_name} · 公司评审进度
              </Title>
            </div>

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
              columns={companyColumns}
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
              loading={loading}
              locale={{ emptyText: (
                <Empty 
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={<Text type="secondary">暂无公司信息，请上传标书 ZIP</Text>}
                />
              )}}
              scroll={{ x: 800 }}
            />
          </Card>
        )}

        {/* 评审项详情（选择公司后显示） */}
        {selectedCompanyId && currentCompany && (
          <Card 
            bordered={false}
            title={
              <Space>
                <TeamOutlined />
                <span>{currentCompany.company_name} · 评审项详情</span>
              </Space>
            }
            style={{ 
              background: designTokens.colors.cardBg,
              borderRadius: designTokens.radius.lg,
              boxShadow: designTokens.shadow.md,
              marginBottom: 24
            }}
          >
            <Row gutter={24}>
              <Col span={24}>
                <Descriptions bordered column={1} size="small">
                  <Descriptions.Item label="公司名称">
                    <Text strong>{currentCompany.company_name}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <StatusBadge status={currentCompany.status} />
                  </Descriptions.Item>
                  <Descriptions.Item label="总得分">
                    {currentCompany.total_score !== null ? (
                      <Tag 
                        color={currentCompany.total_score >= 80 ? 'green' : currentCompany.total_score >= 60 ? 'orange' : 'red'}
                        style={{ fontSize: 18, fontWeight: 600, padding: '6px 12px' }}
                      >
                        {(currentCompany.total_score || 0).toFixed(1)} 分
                      </Tag>
                    ) : <Text type="secondary">-</Text>}
                  </Descriptions.Item>
                </Descriptions>

                {/* 评审项明细 */}
                {currentCompany.rule_scores && currentCompany.rule_scores.length > 0 && (
                  <div style={{ marginTop: 24 }}>
                    <Title level={5} style={{ marginBottom: 16 }}>评审项明细</Title>
                    <List
                      dataSource={currentCompany.rule_scores}
                      size="small"
                      renderItem={(record: RuleScore) => (
                        <List.Item
                          style={{ 
                            padding: '12px 16px',
                            marginBottom: 8,
                            background: '#fafafa',
                            borderRadius: 8,
                            border: '1px solid #f0f0f0'
                          }}
                        >
                          <List.Item.Meta
                            title={
                              <Space>
                                <Text strong style={{ fontSize: 14 }}>{record.item_name || record.rule_name}</Text>
                                <Tag color={record.status === 'completed' ? 'green' : 'default'}>
                                  {record.status === 'completed' ? '已完成' : '未完成'}
                                </Tag>
                                {record.status === 'completed' && (
                                  <Tag 
                                    color={record.score / record.max_score >= 0.8 ? 'green' : record.score / record.max_score >= 0.6 ? 'orange' : 'red'}
                                    style={{ fontSize: 12 }}
                                  >
                                    {record.score} 分
                                  </Tag>
                                )}
                              </Space>
                            }
                            description={
                              <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 8 }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>{record.reason || '暂无评分理由'}</Text>
                                {record.status === 'completed' && record.evidence_details && (record.evidence_details as any[]).length > 0 && (
                                  <Space direction="vertical" size={4} style={{ fontSize: 12 }}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>原文出处：</Text>
                                    {(record.evidence_details as any[]).map((e: any, i: number) => (
                                      <div key={i} style={{ fontSize: 12 }}>
                                        📄 {e.file} <Text type="secondary" style={{ fontSize: 12 }}>(第{e.page}页)</Text>
                                      </div>
                                    ))}
                                  </Space>
                                )}
                              </Space>
                            }
                          />
                        </List.Item>
                      )}
                    />
                  </div>
                )}
              </Col>
            </Row>
          </Card>
        )}

        {/* 评审流程说明 */}
        <Alert
          message={
            <Space>
              <BarChartOutlined />
              <span>评审流程说明</span>
            </Space>
          }
          description={
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginTop: 16 }}>
              {[
                { step: '1', title: '创建任务', desc: '新建评审任务', color: '#1890ff' },
                { step: '2', title: '上传标书', desc: '上传 ZIP 文件', color: '#1890ff' },
                { step: '3', title: '文件分析', desc: '解析文件结构', color: '#52c41a' },
                { step: '4', title: 'AI 评审', desc: '自动评分', color: '#52c41a' },
                { step: '5', title: '完成', desc: '生成报告', color: '#faad14' },
              ].map((item, idx) => (
                <div key={idx} style={{ textAlign: 'center' }}>
                  <div style={{ 
                    width: 32, 
                    height: 32, 
                    background: item.color,
                    color: '#fff',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 8px',
                    fontWeight: 600
                  }}>
                    {item.step}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: '#8c8c8c' }}>{item.desc}</div>
                </div>
              ))}
            </div>
          }
          type="info"
          showIcon
          style={{ marginTop: 32, borderRadius: 12 }}
        />
      </div>

      {/* 新建任务 Modal */}
      <Modal
        title={
          <Space>
            <PlusOutlined />
            <span>新建评审任务</span>
          </Space>
        }
        open={showCreateModal}
        onOk={handleCreateTask}
        onCancel={() => {
          setShowCreateModal(false);
          setNewTaskName('');
        }}
        okText="创建"
        cancelText="取消"
        width={520}
      >
        <div style={{ padding: '16px 0' }}>
          <Input
            placeholder="请输入任务名称"
            value={newTaskName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTaskName(e.target.value)}
            onPressEnter={handleCreateTask}
            autoFocus
            size="large"
            style={{ fontSize: 15 }}
          />
        </div>
      </Modal>

      {/* 文件树 Drawer */}
      <Drawer
        title={<Space><FolderOutlined /> 文件目录</Space>}
        placement="right"
        width={400}
        open={showFileTree}
        onClose={() => setShowFileTree(false)}
      >
        <Text type="secondary">文件树功能开发中...</Text>
      </Drawer>
    </div>
  );
};

export default Dashboard;
