import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Tag,
  Space,
  Typography,
  message,
  Alert,
  Progress,
  Table,
  Divider,
  Descriptions,
  Button,
  Row,
  Col,
  Modal,
  Empty,
  Input,
  Drawer,
  Tooltip
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  TeamOutlined,
  DashboardOutlined,
  UserOutlined,
  ThunderboltOutlined,
  FolderOutlined,
  EyeOutlined,
  FolderOpenOutlined,
  SearchOutlined,
  ClockCircleOutlined,
  StopOutlined,
  DownOutlined
} from '@ant-design/icons';
import apiClient from '../services/api';
import FileTreeExplorer from '../components/FileTreeExplorer';
import './EvaluationForm.css';
import { colors } from '../styles/designTokens';

const { Title, Text } = Typography;
const { Search } = Input;

interface Criteria {
  id: number;
  criteria_name: string;
  criteria_type: string;
  max_score: number;
  scoring_criteria: string;
  source_files?: string[];
}

interface Company {
  id: number;
  company_name: string;
  total_score?: number;
  ranking?: number;
  bid_folder_path?: string;
}

interface EvaluationResult {
  company_id: number;
  company_name: string;
  criteria_id: number;
  score: number;
  reason: string;
  evidence: string;
  evidence_details?: any[] | string;
}

interface Assignment {
  id: number;
  assignment_name: string;
  status: string;
  progress: number;
  mode: string;
  evaluator_name?: string;
  package_id?: number;
  assigned_criteria?: Criteria[];
}

const EvaluationForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const assignmentId = parseInt(id || '0');

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [evaluatorName, setEvaluatorName] = useState<string>('');
  const [criteriaList, setCriteriaList] = useState<Criteria[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);
  const [evidenceModalData, setEvidenceModalData] = useState<any>(null);
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [showLogPanel, setShowLogPanel] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logPolling, setLogPolling] = useState(false);
  const [showFileTree, setShowFileTree] = useState(false);
  const [selectedCompanyForFiles, setSelectedCompanyForFiles] = useState<Company | null>(null);
  const [showCriteriaDetail, setShowCriteriaDetail] = useState(false);
  const [expandedCriteria, setExpandedCriteria] = useState<Set<number>>(new Set());
  const [selectedCriteria, setSelectedCriteria] = useState<Criteria | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);  // 自动刷新

  useEffect(() => {
    fetchAssignmentData();
  }, [assignmentId]);

  // 自动刷新数据（每 30 秒）
  useEffect(() => {
    let refreshTimer: NodeJS.Timeout;
    
    if (autoRefresh && assignment && assignment.status === 'in_progress') {
      refreshTimer = setInterval(() => {
        console.log('自动刷新数据...');
        fetchAssignmentData();
      }, 30000);  // 30 秒刷新一次
    }
    
    return () => {
      if (refreshTimer) clearInterval(refreshTimer);
    };
  }, [autoRefresh, assignment]);

  // 日志轮询
  useEffect(() => {
    let pollingTimer: NodeJS.Timeout;
    
    if (logPolling && showLogPanel) {
      pollingTimer = setInterval(() => {
        fetchLogs();
      }, 2000); // 每 2 秒轮询一次
    }
    
    return () => {
      if (pollingTimer) clearInterval(pollingTimer);
    };
  }, [logPolling, showLogPanel, assignmentId]);

  const fetchLogs = async () => {
    if (!assignmentId) return;
    
    try {
      const response = await apiClient.get(`/api/logs/tail-logs?assignment_id=${assignmentId}&lines=50`);
      if (response.data && response.data.logs) {
        setLogs(response.data.logs);
      }
    } catch (error) {
      console.error('获取日志失败:', error);
    }
  };

  const fetchAssignmentData = async () => {
    setLoading(true);
    try {
      const assignmentRes = await apiClient.get(`/api/subtasks/${assignmentId}`);
      const assignmentData = assignmentRes.data;
      console.log('获取到的任务数据:', assignmentData);
      console.log('任务状态:', assignmentData.status);
      setAssignment(assignmentData);
      
      if (assignmentData.evaluator_name) {
        setEvaluatorName(assignmentData.evaluator_name);
      } else {
        setEvaluatorName('未分配');
      }

      // 根据子任务的分配模式获取评审项
      if (assignmentData.mode === 'by_criteria' && assignmentData.assigned_criteria && assignmentData.assigned_criteria.length > 0) {
        // 按评审项模式：使用分配的评审项
        setCriteriaList(assignmentData.assigned_criteria);
      } else if (assignmentData.mode === 'by_company') {
        // 按公司模式：获取项目的所有评审项
        try {
          console.log('正在获取项目评审项，package_id:', assignmentData.package_id);
          const criteriaRes = await apiClient.get(`/api/projects/${assignmentData.package_id}/rules`);
          console.log('获取到的评审项原始数据:', criteriaRes.data);
          const rulesData = criteriaRes.data?.rules || [];
          console.log('rulesData:', rulesData);
          // 转换为前端需要的格式
          const criteriaListData = rulesData.map((r: any) => ({
            id: r.id,
            criteria_name: r.item_name || r.rule_name,
            criteria_type: 'technical',  // 统一设置为 technical
            max_score: r.max_score || 100,
            scoring_criteria: r.scoring_criteria || '',
            source_files: r.source_files || []
          }));
          console.log('转换后的评审项:', criteriaListData);
          setCriteriaList(criteriaListData);
        } catch (error) {
          console.error('获取评审项失败:', error);
          setCriteriaList([]);
        }
      } else {
        setCriteriaList([]);
      }

      // 获取项目下的所有公司
      const companiesRes = await apiClient.get(`/api/evaluation/package/${assignmentData.package_id}/companies`);
      const allCompanies = companiesRes.data || [];
      console.log('获取到的所有公司:', allCompanies);
      
      // 根据子任务的分配模式过滤公司列表
      let filteredCompanies = allCompanies;
      if (assignmentData.mode === 'by_company' && assignmentData.assigned_documents) {
        // 按公司模式：assigned_documents 存储的是公司 ID 列表
        const assignedCompanyIds = assignmentData.assigned_documents;
        filteredCompanies = allCompanies.filter((c: any) => assignedCompanyIds.includes(c.id));
        console.log('过滤后的公司 (by_company 模式):', filteredCompanies);
      }
      // 按评审项模式：显示项目下所有公司
      
      setCompanies(filteredCompanies);

      const resultsRes = await apiClient.get(`/api/evaluation/subtask/${assignmentId}/result`);
      console.log('获取到的评审结果:', resultsRes.data);
      // 将嵌套结构展平，方便前端处理
      const flattenedEvaluations = (resultsRes.data || []).flatMap((companyResult: any) => 
        companyResult.detail.map((d: any) => ({
          ...d,
          company_id: companyResult.company_id,
          company_name: companyResult.company_name
        }))
      );
      console.log('展平后的评审结果:', flattenedEvaluations);
      setEvaluations(flattenedEvaluations);
    } catch (error) {
      console.error('Failed to fetch assignment:', error);
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'green';
    if (score >= 60) return 'orange';
    return 'red';
  };

  // 计算统计信息
  // 规则：一家公司的所有评审项都评完了且有有效分数，视为完成了这家公司
  const calculateCompletedCompanyCount = () => {
    if (!assignment || companies.length === 0) return 0;
    
    // 如果没有评审项，无法完成任何公司
    if (criteriaList.length === 0) return 0;

    // 获取当前分配的公司列表
    let assignedCompanyIds: number[] = [];
    
    if (assignment.mode === 'by_company' && assignment.assigned_documents) {
      // by_company 模式，assigned_documents 存储公司 ID 列表
      try {
        assignedCompanyIds = typeof assignment.assigned_documents === "string" ? JSON.parse(assignment.assigned_documents) : assignment.assigned_documents;
      } catch {
        assignedCompanyIds = [];
      }
    } else {
      // by_criteria 模式或默认：使用当前显示的公司列表
      assignedCompanyIds = companies.map(c => c.id);
    }

    // 对于每家公司，检查是否所有评审项都有有效评分
    let completedCount = 0;
    
    for (const company of companies) {
      if (!assignedCompanyIds.includes(company.id)) continue;
      
      // 检查这家公司的所有评审项是否都有有效评审结果
      const allEvaluated = criteriaList.every(criteria => {
        const evals = evaluations.filter(e => 
          e.criteria_id === criteria.id && e.company_id === company.id
        );
        // 必须有评审结果 AND 分数有效（不为 null/undefined）
        return evals.length > 0 && evals.some(e => e.score !== null && e.score !== undefined);
      });
      
      if (allEvaluated) {
        completedCount++;
      }
    }
    
    return completedCount;
  };

  const stats = {
    totalCompanies: companies.length,
    totalCriteria: criteriaList.length,
    completedCompanyCount: calculateCompletedCompanyCount(),
    totalEvaluations: evaluations.length,
    avgScore: companies.length > 0 
      ? companies.reduce((sum, c) => sum + (c.total_score || 0), 0) / companies.length 
      : 0
  };

  // 按公司分组评审结果（展平后的数据）
  const getEvaluationsByCompany = (companyId: number) => {
    console.log(`=== 查询公司 ${companyId} 的评审结果 ===`);
    console.log(`当前 evaluations 数组长度:`, evaluations.length);
    console.log(`evaluations 数组:`, evaluations);
    console.log(`company_id 类型检查:`, evaluations.map((e: any) => ({ id: e.company_id, type: typeof e.company_id, value: e.company_id })));
    
    const result = evaluations.filter((e: any) => {
      const match = Number(e.company_id) === Number(companyId);
      console.log(`  - company_id=${e.company_id}, 匹配结果: ${match}`);
      return match;
    });
    
    console.log(`查询结果长度:`, result.length);
    console.log(`查询结果:`, result);
    console.log(`=== 查询结束 ===`);
    return result;
  };

  // 过滤后的公司列表（按公司名称搜索）
  const filteredCompanies = companies.filter(company =>
    company.company_name.toLowerCase().includes(searchKeyword.toLowerCase())
  );

  // 处理证据详情
  const parseEvidenceDetails = (evidenceDetails: any[] | string | undefined): any[] => {
    if (!evidenceDetails) return [];
    if (Array.isArray(evidenceDetails)) return evidenceDetails;
    if (typeof evidenceDetails === 'string') {
      try {
        return JSON.parse(evidenceDetails);
      } catch {
        return [];
      }
    }
    return [];
  };

  // 查看证据原文
  const handleViewEvidence = (evalResult: EvaluationResult, criteria: Criteria) => {
    const evidenceDetails = parseEvidenceDetails(evalResult.evidence_details);
    
    Modal.info({
      title: `评审依据 - ${criteria.criteria_name}`,
      width: 800,
      content: (
        <div>
          <Descriptions bordered column={1} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="评审项">
              <Space>
                <Tag color={criteria.criteria_type === 'technical' ? 'blue' : 'green'}>
                  {criteria.criteria_type === 'technical' ? '技术' : '商务'}
                </Tag>
                <span>{criteria.criteria_name}</span>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="得分">
              <Tag color={getScoreColor(evalResult.score)} icon={<CheckCircleOutlined />}>
                {evalResult.score}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="评分理由">{evalResult.reason || '-'}</Descriptions.Item>
            <Descriptions.Item label="依据说明">{evalResult.evidence || '-'}</Descriptions.Item>
          </Descriptions>
          
          {evidenceDetails.length > 0 && (
            <div>
              <Text strong style={{ marginBottom: 8, display: 'block' }}>原文引用：</Text>
              {evidenceDetails.map((d, i) => (
                <div key={i} style={{ 
                  background: '#f5f5f5', 
                  padding: 12, 
                  borderRadius: 6,
                  marginBottom: 8,
                  borderLeft: `4px solid ${colors.primary}`
                }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    📄 {d.file} (第{d.page}页)
                  </Text>
                  <div style={{ marginTop: 4 }}>
                    <Text>{d.content}</Text>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ),
      okText: '关闭'
    });
  };

  const handleViewCompanyFiles = (company: Company) => {
    setSelectedCompanyForFiles(company);
    setShowFileTree(true);
  };

  const handleViewCriteriaDetail = (criteria: Criteria) => {
    setSelectedCriteria(criteria);
    setShowCriteriaDetail(true);
  };

  // 切换评审项展开/折叠状态
  const toggleCriteriaExpand = (criteriaId: number) => {
    const newExpanded = new Set(expandedCriteria);
    if (newExpanded.has(criteriaId)) {
      newExpanded.delete(criteriaId);
    } else {
      newExpanded.add(criteriaId);
    }
    setExpandedCriteria(newExpanded);
  };

  // 构建公司列表表格列
  const companyColumns = [
    {
      title: '公司名称',
      dataIndex: 'company_name',
      key: 'company_name',
      width: 200,
      fixed: 'left' as const,
      render: (name: string, record: Company) => (
        <Space>
          <TeamOutlined />
          <span style={{ fontWeight: 500 }}>{name}</span>
        </Space>
      )
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      fixed: 'left' as const,
      render: (_: any, record: Company) => (
        <Space>
          <Button
            size="small"
            icon={<FolderOutlined />}
            onClick={() => handleViewCompanyFiles(record)}
          >
            查看文件
          </Button>
        </Space>
      )
    },
    {
      title: '总分',
      key: 'total_score',
      width: 130,
      render: (_: any, record: Company) => (
        <Tag 
          color={record.total_score && record.total_score >= 80 ? 'green' : record.total_score && record.total_score >= 60 ? 'orange' : 'red'}
          style={{ fontSize: 15, fontWeight: 600, padding: '6px 14px' }}
          icon={record.total_score ? <CheckCircleOutlined /> : undefined}
        >
          {record.total_score?.toFixed(1) || '-'} 分
        </Tag>
      )
    },
    {
      title: '排名',
      key: 'ranking',
      width: 90,
      render: (_: any, record: Company) => (
        <Text strong>{record.ranking || '-'}</Text>
      )
    },
    {
      title: '评审进度',
      key: 'progress',
      width: 160,
      render: (_: any, record: Company) => {
        // 计算这个公司已经完成的评审项数量
        const completedForThisCompany = criteriaList.filter(criteria => {
          return evaluations.some(e => 
            e.company_id === record.id && e.criteria_id === criteria.id
          );
        }).length;
        
        const percent = stats.totalCriteria > 0 ? (completedForThisCompany / stats.totalCriteria) * 100 : 0;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
            <Progress 
              percent={percent} 
              size="small" 
              showInfo={false}
              strokeColor={percent === 100 ? '#52c41a' : '#1890ff'}
              style={{ flex: 1 }}
            />
            <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap', minWidth: 36 }}>
              {completedForThisCompany}/{stats.totalCriteria}
            </Text>
          </div>
        );
      }
    }
  ];

  // 展开行渲染：显示该公司的评审项详情
  const renderExpandedRow = (record: Company) => {
    const companyEvaluations = getEvaluationsByCompany(record.id);
    
    console.log(`公司 ${record.id} 的评审结果:`, companyEvaluations);
    console.log('评审项列表:', criteriaList);
    
    if (companyEvaluations.length === 0) {
      return (
        <div style={{ padding: 24, textAlign: 'center', background: '#fafafa' }}>
          <Empty description="暂无评审结果" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      );
    }

    // 按评审项类型分组（如果 criteriaList 为空，直接展示所有评审结果）
    console.log(`criteriaList.length:`, criteriaList.length);
    console.log(`companyEvaluations.length:`, companyEvaluations.length);
    
    const technicalEvaluations = criteriaList.length > 0 ? companyEvaluations.filter((e: any) => {
      const criteria = criteriaList.find((c: any) => c.id === e.criteria_id);
      return criteria?.criteria_type === 'technical';
    }) : companyEvaluations;
    
    const businessEvaluations = criteriaList.length > 0 ? companyEvaluations.filter((e: any) => {
      const criteria = criteriaList.find((c: any) => c.id === e.criteria_id);
      return criteria?.criteria_type === 'business';
    }) : [];
    
    console.log(`technicalEvaluations:`, technicalEvaluations);
    console.log(`businessEvaluations:`, businessEvaluations);

    const EvaluationSection = ({ title, evaluations: evals, color }: { title: string, evaluations: EvaluationResult[], color: string }) => {
      if (evals.length === 0) return null;
      
      return (
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <Tag color={color}>{title}</Tag>
          </div>
          <Table
            rowKey={(record: EvaluationResult) => `${record.company_id}-${record.criteria_id}`}
            columns={[
              {
                title: '评审项',
                dataIndex: 'criteria_name',
                key: 'criteria_name',
                width: 200,
                render: (_: any, record: EvaluationResult) => {
                  const criteria = criteriaList.find(c => c.id === record.criteria_id);
                  return (
                    <Space>
                      <FileTextOutlined />
                      <span>{criteria?.criteria_name || `评审项 ${record.criteria_id}`}</span>
                    </Space>
                  );
                }
              },
              {
                title: '得分',
                key: 'score',
                width: 100,
                render: (_: any, record: EvaluationResult) => (
                  <Tag 
                    color={getScoreColor(record.score)}
                    style={{ fontSize: 14, fontWeight: 600, padding: '4px 12px' }}
                    icon={<CheckCircleOutlined />}
                  >
                    {record.score}
                  </Tag>
                )
              },
              {
                title: '评审理由',
                key: 'reason',
                width: 250,
                render: (_: any, record: EvaluationResult) => (
                  <Text style={{ fontSize: 13 }}>{record.reason || '-'}</Text>
                )
              },
              {
                title: '依据',
                key: 'evidence',
                width: 250,
                render: (_: any, record: EvaluationResult) => {
                  if (!record.evidence) return <Text type="secondary">-</Text>;
                  return (
                    <Text style={{ fontSize: 13, maxWidth: 250 }} ellipsis>
                      {record.evidence}
                    </Text>
                  );
                }
              },
              {
                title: '操作',
                key: 'action',
                width: 100,
                fixed: 'right' as const,
                render: (_: any, record: EvaluationResult) => {
                  const criteria = criteriaList.find(c => c.id === record.criteria_id);
                  return (
                    <Button
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={() => handleViewEvidence(record, criteria!)}
                    >
                      查看原文
                    </Button>
                  );
                }
              }
            ]}
            dataSource={evals}
            rowKey={(record: any) => `${record.company_id}-${record.criteria_id}`}
            pagination={false}
            size="middle"
            scroll={{ x: 'max-content' }}
            style={{ background: '#fff' }}
          />
        </div>
      );
    };

    return (
      <div style={{ padding: 16, background: '#fafafa' }}>
        <EvaluationSection 
          title="技术评审" 
          evaluations={technicalEvaluations} 
          color="blue" 
        />
        <EvaluationSection 
          title="商务评审" 
          evaluations={businessEvaluations} 
          color="green" 
        />
        {technicalEvaluations.length === 0 && businessEvaluations.length === 0 && (
          <Empty description="暂无评审数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </div>
    );
  };

  const handleStartEvaluation = async () => {
    console.log('当前公司列表:', companies);
    console.log('公司数量:', companies.length);
    
    // 检查是否有公司没有文件夹路径
    const companiesWithoutPath = companies.filter(c => !c.bid_folder_path);
    console.log('没有 bid_folder_path 的公司:', companiesWithoutPath);
    
    if (companiesWithoutPath.length > 0) {
      Modal.error({
        title: '无法启动评审',
        content: `有 ${companiesWithoutPath.length} 家公司没有上传标书文件，请先上传标书后再启动评审。`,
        okText: '知道了',
      });
      return;
    }
    
    if (companies.length === 0) {
      Modal.error({
        title: '无法启动评审',
        content: '没有可评审的公司，请先添加公司。',
        okText: '知道了',
      });
      return;
    }

    Modal.confirm({
      title: assignment.status === 'in_progress' ? '停止 AI 评审' : '启动 AI 评审',
      content: assignment.status === 'in_progress' 
        ? `确定要停止当前的 AI 评审吗？已生成的评审结果将保留。`
        : `确定要启动对 ${stats.totalCompanies} 家公司的 AI 评审吗？系统将自动分析所有文档并生成评审结果。`,
      okText: assignment.status === 'in_progress' ? '停止' : '启动',
      cancelText: '取消',
      okButtonProps: assignment.status === 'in_progress' ? { danger: true } : {},
      onOk: async () => {
        setStarting(true);
        
        try {
          if (assignment.status === 'in_progress') {
            // 停止评审
            await apiClient.post('/api/evaluate/stop', {
              assignment_id: assignmentId
            });
            message.success('评审任务已停止');
          } else {
            // 启动评审
            setShowLogPanel(true);
            setLogPolling(true);
            setLogs([]);
            
            await apiClient.post('/api/evaluate/start', {
              assignment_id: assignmentId
            });
            
            // 立即获取一次日志
            await fetchLogs();
            
            message.success('评审任务已启动，正在实时记录日志...');
          }
          
          // 刷新数据
          await fetchAssignmentData();
        } catch (error: any) {
          message.error(error.response?.data?.detail || '操作失败');
          setLogPolling(false);
        } finally {
          setStarting(false);
        }
      }
    });
  };

  const toggleExpandAll = () => {
    if (expandedRowKeys.length === companies.length) {
      setExpandedRowKeys([]);
    } else {
      setExpandedRowKeys(companies.map(c => c.id));
    }
  };

  return (
    <div className="evaluation-detail">
      {/* 顶部导航 */}
      <div className="detail-header">
        <Button 
          icon={<ArrowLeftOutlined />} 
          onClick={() => navigate('/my-tasks')}
          className="back-btn"
        >
          返回任务列表
        </Button>
        <div className="header-title">
          <Title level={4} style={{ margin: 0 }}>
            评审详情
          </Title>
        </div>
      </div>

      <div className="detail-content">
        {/* 任务信息卡片 */}
        {assignment && (
          <Card className="assignment-info-card">
            <Row gutter={[24, 0]} align="middle">
              <Col flex="auto">
                <Space size="large">
                  <div className={`assignment-icon ${assignment.mode === 'by_criteria' ? 'icon-criteria' : 'icon-company'}`}>
                    {assignment.mode === 'by_criteria' ? <FileTextOutlined /> : <TeamOutlined />}
                  </div>
                  <div>
                    <Title level={5} style={{ margin: 0 }}>
                      {assignment.mode === 'by_criteria' ? '按评审项评审' : '按公司评审'}
                    </Title>
                    <Space style={{ marginTop: 8 }}>
                      <Tag color="default">ID: #{assignment.id}</Tag>
                      <Tag color={assignment.status === 'completed' ? 'success' : 'processing'}>
                        {assignment.status === 'completed' ? '已完成' : '进行中'}
                      </Tag>
                      <Tag color="blue">
                        <UserOutlined /> 分配给：{evaluatorName}
                      </Tag>
                    </Space>
                  </div>
                </Space>
              </Col>
              <Col>
                <div className="assignment-progress">
                  <Text type="secondary">进度</Text>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>
                    {assignment.progress_percent || 0}%
                  </div>
                  <Progress 
                    percent={assignment.progress_percent || 0} 
                    size="small" 
                    showInfo={false}
                    strokeColor={assignment.progress_percent === 100 ? '#52c41a' : '#1890ff'}
                  />
                </div>
              </Col>
            </Row>
            
            <Divider style={{ margin: '16px 0' }} />
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <Button
                  icon={<ThunderboltOutlined />}
                  onClick={() => {
                    setShowLogPanel(true);
                    setLogPolling(true);
                    fetchLogs();
                  }}
                  size="large"
                  disabled={!assignmentId}
                >
                  查看日志
                </Button>
                <Button
                  icon={<FileTextOutlined />}
                  onClick={() => setShowCriteriaDetail(true)}
                  size="large"
                >
                  查看评审项
                </Button>
              </Space>
              
              <Button
                type="primary"
                size="large"
                icon={assignment.status === 'in_progress' ? <StopOutlined /> : <ThunderboltOutlined />}
                onClick={handleStartEvaluation}
                disabled={
                  starting ||
                  stats.totalCompanies === 0 ||
                  stats.totalCriteria === 0 ||
                  !assignmentId
                }
                loading={starting}
                danger={assignment.status === 'in_progress'}
              >
                {assignment.status === 'in_progress' ? '停止评审' : 
                 assignment.status === 'stopped' || assignment.status === 'completed' ? '重新启动评审' : 
                 '启动评审'}
              </Button>
            </div>
          </Card>
        )}

        {/* 统计卡片 */}
        <Row gutter={[24, 24]} className="stats-row">
          <Col xs={24} sm={12} md={6}>
            <Card className="stat-card">
              <div className="stat-content">
                <div className="stat-icon warning">
                  <ClockCircleOutlined />
                </div>
                <div className="stat-info">
                  <Text className="stat-label">待评审公司</Text>
                  <Title level={3} style={{ margin: 0 }}>{stats.totalCompanies}</Title>
                </div>
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="stat-card">
              <div className="stat-content">
                <div className="stat-icon primary">
                  <FileTextOutlined />
                </div>
                <div className="stat-info">
                  <Text className="stat-label">评审项</Text>
                  <Title level={3} style={{ margin: 0 }}>{stats.totalCriteria}</Title>
                </div>
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="stat-card">
              <div className="stat-content">
                <div className="stat-icon success">
                  <CheckCircleOutlined />
                </div>
                <div className="stat-info">
                  <Text className="stat-label">已完成评审公司</Text>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <Title level={3} style={{ margin: 0 }}>{stats.completedCompanyCount}</Title>
                    <Text type="secondary" style={{ fontSize: 16 }}>
                      / {stats.totalCompanies} 家公司
                    </Text>
                  </div>
                </div>
              </div>
            </Card>
          </Col>
        </Row>

        {/* 公司评审结果列表（合并展示） */}
        <Card 
          title={
            <Space>
              <TeamOutlined />
              <span>公司评审结果</span>
            </Space>
          }
          className="companies-card"
          extra={
            <Space>
              <Search
                placeholder="搜索公司名称"
                allowClear
                enterButton={<SearchOutlined />}
                size="small"
                style={{ width: 200 }}
                onSearch={setSearchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
              />
              {companies.length > 0 && (
                <Button
                  size="small"
                  type="link"
                  icon={expandedRowKeys.length === filteredCompanies.length ? <FolderOutlined /> : <FolderOpenOutlined />}
                  onClick={toggleExpandAll}
                >
                  {expandedRowKeys.length === filteredCompanies.length ? '收起全部' : '展开全部'}
                </Button>
              )}
            </Space>
          }
        >
          {filteredCompanies.length === 0 ? (
            <Empty 
              description={searchKeyword ? '未找到匹配的公司' : '暂无公司数据'} 
            />
          ) : (
            <Table
              columns={companyColumns}
              dataSource={filteredCompanies}
              rowKey="id"
              loading={loading}
              expandedRowRender={renderExpandedRow}
              expandedRowKeys={expandedRowKeys}
              onExpand={(expanded, record) => {
                if (expanded) {
                  setExpandedRowKeys([...expandedRowKeys, record.id]);
                } else {
                  setExpandedRowKeys(expandedRowKeys.filter(key => key !== record.id));
                }
              }}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 家公司`
              }}
              scroll={{ x: 'max-content' }}
              bordered
              size="middle"
            />
          )}
        </Card>
      </div>

      {/* 公司文件预览 Drawer */}
      <Drawer
        title={
          <Space>
            <FolderOutlined />
            <span>{selectedCompanyForFiles?.company_name}</span>
          </Space>
        }
        placement="right"
        width={1200}
        height="100vh"
        open={showFileTree}
        onClose={() => setShowFileTree(false)}
        className="file-tree-drawer"
        styles={{
          body: { padding: 0, height: '100%', overflow: 'hidden' }
        }}
      >
        {selectedCompanyForFiles?.bid_folder_path ? (
          <FileTreeExplorer 
            companyId={selectedCompanyForFiles.id}
            companyFolder={selectedCompanyForFiles.bid_folder_path}
          />
        ) : (
          <Empty description="暂无文件数据" />
        )}
      </Drawer>

      {/* 评审项详情 Drawer */}
      <Drawer
        title={
          <Space>
            <FileTextOutlined />
            <span>评审项详情</span>
          </Space>
        }
        placement="right"
        width={900}
        open={showCriteriaDetail}
        onClose={() => setShowCriteriaDetail(false)}
        className="criteria-detail-drawer"
      >
        <div style={{ padding: '16px 0' }}>
          <Alert
            message={
              <Space>
                <ThunderboltOutlined />
                <span>当前任务需要评审的评审项</span>
              </Space>
            }
            description={`共 ${criteriaList.length} 个评审项，请逐一评审`}
            type="info"
            showIcon
            style={{ marginBottom: 24 }}
          />

          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {criteriaList.map((criteria, index) => {
              const isExpanded = expandedCriteria.has(criteria.id);
              return (
                <div
                  key={criteria.id}
                  onClick={() => toggleCriteriaExpand(criteria.id)}
                  style={{
                    background: isExpanded ? '#f0f7ff' : '#fff',
                    border: `1px solid ${isExpanded ? '#91d5ff' : '#d9d9d9'}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = isExpanded ? '#40a9ff' : '#40a9ff';
                    e.currentTarget.style.background = isExpanded ? '#f0f7ff' : '#fafafa';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = isExpanded ? '#91d5ff' : '#d9d9d9';
                    e.currentTarget.style.background = isExpanded ? '#f0f7ff' : '#fff';
                  }}
                >
                  <div style={{ 
                    padding: '16px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between' 
                  }}>
                    <Space>
                      <Tag color={criteria.criteria_type === 'technical' ? 'blue' : 'green'}>
                        {criteria.criteria_type === 'technical' ? '技术' : '商务'}
                      </Tag>
                      <span style={{ fontWeight: 500, fontSize: 15 }}>
                        {index + 1}. {criteria.criteria_name}
                      </span>
                    </Space>
                    <Space>
                      {criteria.source_files && criteria.source_files.length > 0 && (
                        <Tooltip
                          title={
                            <Space direction="vertical" size={0}>
                              {criteria.source_files.map((file, idx) => (
                                <div key={idx} style={{ padding: '4px 0', borderBottom: idx < criteria.source_files.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                                  <FileTextOutlined style={{ color: '#1890ff', marginRight: 6 }} />
                                  {file}
                                </div>
                              ))}
                            </Space>
                          }
                          placement="left"
                        >
                          <Tag color="default" style={{ fontSize: 12, cursor: 'pointer' }}>
                            <FileTextOutlined style={{ marginRight: 4 }} />
                            {criteria.source_files[0]}
                            {criteria.source_files.length > 1 && `... (${criteria.source_files.length})`}
                          </Tag>
                        </Tooltip>
                      )}
                      <DownOutlined 
                        style={{ 
                          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s'
                        }} 
                      />
                    </Space>
                  </div>
                  
                  {isExpanded && (
                    <div style={{ 
                      padding: '0 16px 16px 16px',
                      borderTop: '1px solid #f0f0f0',
                      marginTop: '8px',
                      paddingTop: '16px'
                    }}>
                      {criteria.source_files && criteria.source_files.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontWeight: 500, marginBottom: 12, color: '#262626', fontSize: 14 }}>
                            绑定文件：
                          </div>
                          <Space direction="vertical" style={{ width: '100%' }} size={8}>
                            {criteria.source_files.map((file, idx) => (
                              <div key={idx} style={{ 
                                background: '#f5f5f5', 
                                padding: '12px 16px', 
                                borderRadius: 6,
                                fontSize: 14,
                                display: 'flex',
                                alignItems: 'center'
                              }}>
                                <FileTextOutlined style={{ color: '#1890ff', marginRight: 12, fontSize: 16 }} />
                                <span style={{ color: '#262626' }}>{file}</span>
                              </div>
                            ))}
                          </Space>
                        </div>
                      )}
                      
                      <div>
                        <div style={{ fontWeight: 500, marginBottom: 12, color: '#262626', fontSize: 14 }}>
                          评审标准：
                        </div>
                        <div style={{ 
                          background: '#fafafa', 
                          padding: 16, 
                          borderRadius: 6,
                          lineHeight: 1.8, 
                          color: '#595959',
                          fontSize: 14,
                          whiteSpace: 'pre-wrap'
                        }}>
                          {criteria.scoring_criteria}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </Space>
        </div>
      </Drawer>

      {/* 实时日志面板 */}
      <Modal
        title={
          <Space>
            <ThunderboltOutlined />
            <span>评审实时日志</span>
            {logPolling && <Tag color="green">实时追踪中</Tag>}
          </Space>
        }
        open={showLogPanel}
        onCancel={() => {
          setShowLogPanel(false);
          setLogPolling(false);
        }}
        width={900}
        footer={[
          <Button
            key="stop"
            type={logPolling ? 'default' : 'primary'}
            icon={logPolling ? null : <ThunderboltOutlined />}
            onClick={() => setLogPolling(!logPolling)}
          >
            {logPolling ? '停止追踪' : '开始追踪'}
          </Button>,
          <Button
            key="refresh"
            icon={<CheckCircleOutlined />}
            onClick={fetchLogs}
          >
            刷新
          </Button>,
          <Button
            key="close"
            type="primary"
            onClick={() => {
              setShowLogPanel(false);
              setLogPolling(false);
              setTimeout(() => window.location.reload(), 500);
            }}
          >
            完成并刷新
          </Button>
        ]}
      >
        <div style={{ 
          background: '#1e1e1e', 
          padding: 16, 
          borderRadius: 8,
          maxHeight: 500,
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: 12,
          lineHeight: 1.5
        }}>
          {logLoading ? (
            <div style={{ color: '#999', textAlign: 'center', padding: 20 }}>
              加载中...
            </div>
          ) : logs.length === 0 ? (
            <div style={{ color: '#999', textAlign: 'center', padding: 20 }}>
              暂无日志，点击"开始追踪"按钮启动日志轮询
            </div>
          ) : (
            logs.map((log, index) => {
              // 根据日志级别设置颜色
              let color = '#fff';
              if (log.includes('[错误]') || log.includes('[评审启动失败]') || log.includes('[评审失败]') || log.includes('ERROR')) {
                color = '#ff4d4f';
              } else if (log.includes('[警告]') || log.includes('WARNING')) {
                color = '#faad14';
              } else if (log.includes('[评审完成]') || log.includes('SUCCESS')) {
                color = '#52c41a';
              } else if (log.includes('[步骤') || log.includes('[模式选择]') || log.includes('[模式]')) {
                color = '#69c0ff';
              }
              
              return (
                <div key={index} style={{ color, marginBottom: 4, whiteSpace: 'pre-wrap' }}>
                  {log}
                </div>
              );
            })
          )}
        </div>
      </Modal>
    </div>
  );
};

export default EvaluationForm;
