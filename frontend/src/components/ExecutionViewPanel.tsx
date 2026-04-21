import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Button,
  Space,
  Input,
  InputNumber,
  Typography,
  message,
  Tag,
  Select,
  Divider,
  Spin,
  Empty,
  Alert,
  Steps,
  Row,
  Col,
  Badge,
  Tooltip,
  List,
  Progress
} from 'antd';
import {
  FileTextOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  SaveOutlined,
  SendOutlined,
  ReloadOutlined,
  LeftOutlined,
  RightOutlined,
  FolderOutlined,
  FileOutlined,
  StarOutlined,
  EyeOutlined
} from '@ant-design/icons';
import apiClient from '../services/api';
import FileTreeExplorer from './FileTreeExplorer';
import './ExecutionViewPanel.css';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// ==================== 类型定义 ====================

export interface ExecutionViewPanelProps {
  assignmentId: number;
  assignmentType: 'by_criteria' | 'by_company';
  onComplete?: () => void;
}

export interface Company {
  id: number;
  company_name: string;
  status: 'pending' | 'in_progress' | 'completed';
  file_count?: number;
}

export interface Criteria {
  id: number;
  item_name: string;
  max_score: number;
  criteria_type: 'technical' | 'business';
  is_assigned: boolean; // 是否分配给当前成员
}

export interface FileNode {
  key: string;
  title: string;
  type: 'folder' | 'pdf' | 'doc' | 'docx' | 'txt' | 'xls' | 'xlsx' | 'image' | 'other';
  children?: FileNode[];
  path?: string;
}

export interface ExecutionData {
  companies: Company[];
  criteria_list: Criteria[];
  current_company_id?: number;
  current_criteria_id?: number;
  progress: number;
  total_companies: number;
  completed_companies: number;
}

export interface ScoreRecord {
  company_id: number;
  criteria_id: number;
  score: number;
  comment: string;
  evidence?: string;
}

// ==================== 组件实现 ====================

const ExecutionViewPanel: React.FC<ExecutionViewPanelProps> = ({
  assignmentId,
  assignmentType,
  onComplete
}) => {
  // ==================== 状态管理 ====================
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [executionData, setExecutionData] = useState<ExecutionData | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [criteriaList, setCriteriaList] = useState<Criteria[]>([]);
  
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [currentCriteria, setCurrentCriteria] = useState<Criteria | null>(null);
  
  const [scores, setScores] = useState<Record<string, number>>({}); // `${company_id}_${criteria_id}`: score
  const [comments, setComments] = useState<Record<string, string>>({}); // `${company_id}_${criteria_id}`: comment
  const [evidence, setEvidence] = useState<Record<string, string>>({}); // `${company_id}_${criteria_id}`: evidence
  
  const [selectedCompany, setSelectedCompany] = useState<number | null>(null);
  const [selectedCriteria, setSelectedCriteria] = useState<number | null>(null);
  
  const [fileTreeLoading, setFileTreeLoading] = useState(false);
  const [companyIdForFiles, setCompanyIdForFiles] = useState<number | null>(null);

  // ==================== 数据加载 ====================

  useEffect(() => {
    fetchExecutionData();
  }, [assignmentId]);

  const fetchExecutionData = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/api/assignments/${assignmentId}/execution-view`);
      const data = response.data;
      
      setExecutionData(data);
      setCompanies(data.companies || []);
      setCriteriaList(data.criteria_list || []);
      
      // 设置当前评审项
      if (data.current_company_id) {
        const company = (data.companies || []).find(c => c.id === data.current_company_id);
        if (company) {
          setCurrentCompany(company);
          setSelectedCompany(company.id);
          // 加载该公司的文件
          setCompanyIdForFiles(company.id);
        }
      }
      
      if (data.current_criteria_id) {
        const criteria = (data.criteria_list || []).find(c => c.id === data.current_criteria_id);
        if (criteria) {
          setCurrentCriteria(criteria);
          setSelectedCriteria(criteria.id);
        }
      }
      
      // 加载已有的评分数据
      if (data.scores) {
        setScores(data.scores);
      }
      if (data.comments) {
        setComments(data.comments);
      }
      if (data.evidence) {
        setEvidence(data.evidence);
      }
    } catch (error: any) {
      console.error('获取执行视图数据失败:', error);
      message.error('加载数据失败：' + (error.response?.data?.detail || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  // ==================== 评审逻辑 ====================

  // 获取当前公司下分配给当前成员的评审项
  const getAssignedCriteriaForCompany = useCallback((): Criteria[] => {
    return criteriaList.filter(c => c.is_assigned);
  }, [criteriaList]);

  // 获取当前评审项的得分
  const getCurrentScore = (): number => {
    if (!currentCompany || !currentCriteria) return 0;
    const key = `${currentCompany.id}_${currentCriteria.id}`;
    return scores[key] || 0;
  };

  // 获取当前评审项的评论
  const getCurrentComment = (): string => {
    if (!currentCompany || !currentCriteria) return '';
    const key = `${currentCompany.id}_${currentCriteria.id}`;
    return comments[key] || '';
  };

  // 获取当前评审项的证据
  const getCurrentEvidence = (): string => {
    if (!currentCompany || !currentCriteria) return '';
    const key = `${currentCompany.id}_${currentCriteria.id}`;
    return evidence[key] || '';
  };

  // 更新评分
  const handleScoreChange = (value: number | null) => {
    if (!currentCompany || !currentCriteria) return;
    const key = `${currentCompany.id}_${currentCriteria.id}`;
    setScores(prev => ({
      ...prev,
      [key]: value || 0
    }));
  };

  // 更新评论
  const handleCommentChange = (value: string) => {
    if (!currentCompany || !currentCriteria) return;
    const key = `${currentCompany.id}_${currentCriteria.id}`;
    setComments(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // 更新证据
  const handleEvidenceChange = (value: string) => {
    if (!currentCompany || !currentCriteria) return;
    const key = `${currentCompany.id}_${currentCriteria.id}`;
    setEvidence(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // 保存草稿
  const handleSaveDraft = async () => {
    if (!currentCompany || !currentCriteria) {
      message.warning('请选择评审项');
      return;
    }

    setSaving(true);
    try {
      await apiClient.put(`/api/assignments/${assignmentId}/progress`, {
        company_id: currentCompany.id,
        criteria_id: currentCriteria.id,
        score: getCurrentScore(),
        comment: getCurrentComment(),
        evidence: getCurrentEvidence(),
        status: 'draft'
      });
      message.success('草稿已保存');
    } catch (error: any) {
      console.error('保存草稿失败:', error);
      message.error('保存失败：' + (error.response?.data?.detail || '未知错误'));
    } finally {
      setSaving(false);
    }
  };

  // 提交评审
  const handleSubmitEvaluation = async () => {
    if (!currentCompany || !currentCriteria) {
      message.warning('请选择评审项');
      return;
    }

    const score = getCurrentScore();
    if (score === 0) {
      message.warning('请输入评分');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/api/evaluate/submit', {
        company_id: currentCompany.id,
        criteria_id: currentCriteria.id,
        score: score,
        max_score: currentCriteria.max_score,
        reason: getCurrentComment(),
        evidence: getCurrentEvidence()
      });

      message.success('评审提交成功');

      // 更新本地状态
      const key = `${currentCompany.id}_${currentCriteria.id}`;
      setScores(prev => ({ ...prev, [key]: score }));
      setComments(prev => ({ ...prev, [key]: getCurrentComment() }));

      // 自动跳转到下一个评审项
      moveToNextCriteria();

      // 通知父组件
      if (onComplete) {
        onComplete();
      }
    } catch (error: any) {
      console.error('提交评审失败:', error);
      message.error('提交失败：' + (error.response?.data?.detail || '未知错误'));
    } finally {
      setSubmitting(false);
    }
  };

  // 跳转到下一个评审项
  const moveToNextCriteria = () => {
    if (!currentCompany) return;

    const assignedCriteria = getAssignedCriteriaForCompany();
    const currentIndex = assignedCriteria.findIndex(c => c.id === currentCriteria?.id);

    if (currentIndex < assignedCriteria.length - 1) {
      // 同一公司下还有未评审的项
      const nextCriteria = assignedCriteria[currentIndex + 1];
      setCurrentCriteria(nextCriteria);
      setSelectedCriteria(nextCriteria.id);
    } else {
      // 当前公司评审完成，跳转到下一家公司
      const companyIndex = companies.findIndex(c => c.id === currentCompany.id);
      if (companyIndex < companies.length - 1) {
        const nextCompany = companies[companyIndex + 1];
        setCurrentCompany(nextCompany);
        setSelectedCompany(nextCompany.id);
        setCompanyIdForFiles(nextCompany.id);
        
        // 加载下一家公司的第一个评审项
        const nextAssignedCriteria = criteriaList.filter(c => c.is_assigned);
        if (nextAssignedCriteria.length > 0) {
          setCurrentCriteria(nextAssignedCriteria[0]);
          setSelectedCriteria(nextAssignedCriteria[0].id);
        }
      }
    }
  };

  // 跳转到上一个评审项
  const moveToPrevCriteria = () => {
    if (!currentCompany) return;

    const assignedCriteria = getAssignedCriteriaForCompany();
    const currentIndex = assignedCriteria.findIndex(c => c.id === currentCriteria?.id);

    if (currentIndex > 0) {
      const prevCriteria = assignedCriteria[currentIndex - 1];
      setCurrentCriteria(prevCriteria);
      setSelectedCriteria(prevCriteria.id);
    }
  };

  // 切换公司
  const handleCompanyChange = (companyId: number) => {
    const company = companies.find(c => c.id === companyId);
    if (company) {
      setCurrentCompany(company);
      setSelectedCompany(companyId);
      setCompanyIdForFiles(companyId);

      // 加载该公司的第一个分配评审项
      const assignedCriteria = getAssignedCriteriaForCompany();
      if (assignedCriteria.length > 0) {
        setCurrentCriteria(assignedCriteria[0]);
        setSelectedCriteria(assignedCriteria[0].id);
      }
    }
  };

  // 切换评审项
  const handleCriteriaChange = (criteriaId: number) => {
    const criteria = criteriaList.find(c => c.id === criteriaId);
    if (criteria && criteria.is_assigned) {
      setCurrentCriteria(criteria);
      setSelectedCriteria(criteriaId);
    }
  };

  // ==================== 进度计算 ====================

  const calculateProgress = (): number => {
    if (!executionData) return 0;
    return Math.round((executionData.completed_companies / executionData.total_companies) * 100);
  };

  const getCompletedCount = (): number => {
    let count = 0;
    companies.forEach(company => {
      const assignedCriteria = criteriaList.filter(c => c.is_assigned);
      assignedCriteria.forEach(criteria => {
        const key = `${company.id}_${criteria.id}`;
        if (scores[key] && scores[key] > 0) {
          count++;
        }
      });
    });
    return count;
  };

  const getTotalCount = (): number => {
    let count = 0;
    companies.forEach(company => {
      const assignedCriteria = criteriaList.filter(c => c.is_assigned);
      count += assignedCriteria.length;
    });
    return count;
  };

  // ==================== 渲染辅助函数 ====================

  const getStatusTag = (status: string) => {
    const statusConfig: Record<string, [string, string, React.ReactNode]> = {
      pending: ['default', '待评审', <FileOutlined />],
      in_progress: ['processing', '进行中', <StarOutlined />],
      completed: ['success', '已完成', <CheckCircleOutlined />]
    };
    const [color, text, icon] = statusConfig[status] || ['default', status, null];
    return <Tag color={color} icon={icon}>{text}</Tag>;
  };

  const getCriteriaStatus = (criteria: Criteria, company: Company): string => {
    const key = `${company.id}_${criteria.id}`;
    if (scores[key] && scores[key] > 0) {
      return 'completed';
    }
    if (currentCompany?.id === company.id && currentCriteria?.id === criteria.id) {
      return 'in_progress';
    }
    return 'pending';
  };

  // ==================== 渲染 ====================

  const progress = calculateProgress();
  const completedCount = getCompletedCount();
  const totalCount = getTotalCount();

  if (loading) {
    return (
      <div className="execution-view-panel loading">
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  if (!executionData || companies.length === 0) {
    return (
      <div className="execution-view-panel">
        <Empty description="暂无评审任务" />
      </div>
    );
  }

  return (
    <div className="execution-view-panel">
      {/* 顶部信息栏 */}
      <div className="execution-header">
        <div className="execution-info">
          <Title level={4} style={{ margin: 0 }}>
            {assignmentType === 'by_criteria' ? (
              <><FileTextOutlined /> 按评审项评审</>
            ) : (
              <><TeamOutlined /> 按公司评审</>
            )}
          </Title>
          <Text type="secondary" style={{ marginLeft: 12 }}>
            进度：{completedCount} / {totalCount}
          </Text>
        </div>
        <div className="execution-progress">
          <Space>
            <Progress
              percent={progress}
              status={progress === 100 ? 'success' : 'active'}
              strokeColor={progress === 100 ? '#52c41a' : '#1890ff'}
              size={24}
            />
            <Tag color={progress === 100 ? 'green' : 'blue'}>
              {progress}%
            </Tag>
          </Space>
        </div>
      </div>

      <Divider style={{ margin: '12px 0' }} />

      {/* 三栏布局 */}
      <div className="execution-content">
        {/* 左侧：公司/评审项列表 */}
        <Card className="execution-list-panel" size="small" title="评审列表">
          {assignmentType === 'by_criteria' ? (
            // 模式 A：按评审项目 - 显示公司列表
            <div className="company-list">
              {companies.map(company => {
                const companyAssignedCriteria = criteriaList.filter(c => c.is_assigned);
                const completedCriteria = companyAssignedCriteria.filter(c => {
                  const key = `${company.id}_${c.id}`;
                  return scores[key] && scores[key] > 0;
                }).length;

                return (
                  <div
                    key={company.id}
                    className={`company-item ${currentCompany?.id === company.id ? 'selected' : ''}`}
                    onClick={() => handleCompanyChange(company.id)}
                  >
                    <div className="company-info">
                      <div className="company-name">
                        <TeamOutlined />
                        <span>{company.company_name}</span>
                      </div>
                      <div className="company-stats">
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {completedCriteria} / {companyAssignedCriteria.length}
                        </Text>
                      </div>
                    </div>
                    <div className="company-status">
                      {company.status === 'completed' ? (
                        <Tag color="green" icon={<CheckCircleOutlined />}>已完成</Tag>
                      ) : company.status === 'in_progress' ? (
                        <Tag color="blue" icon={<StarOutlined />}>进行中</Tag>
                      ) : (
                        <Tag color="default" icon={<FileOutlined />}>待评审</Tag>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // 模式 B：按公司 - 显示公司选择下拉框
            <div className="company-selector-mode">
              <Select
                value={selectedCompany}
                onChange={handleCompanyChange}
                style={{ width: '100%', marginBottom: 16 }}
                size="large"
                dropdownRender={(menu) => (
                  <div style={{ padding: 8 }}>
                    {menu}
                  </div>
                )}
              >
                {companies.map(company => (
                  <Select.Option key={company.id} value={company.id}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <span>{company.company_name}</span>
                      {company.status === 'completed' ? (
                        <Tag color="green" style={{ fontSize: 11 }}>已完成</Tag>
                      ) : (
                        <Tag color="blue" style={{ fontSize: 11 }}>进行中</Tag>
                      )}
                    </Space>
                  </Select.Option>
                ))}
              </Select>

              <Divider>评审项列表</Divider>

              <div className="criteria-list-mode-b">
                {criteriaList.filter(c => c.is_assigned).map(criteria => {
                  const status = currentCompany ? getCriteriaStatus(criteria, currentCompany) : 'pending';
                  const isCompleted = status === 'completed';

                  return (
                    <div
                      key={criteria.id}
                      className={`criteria-item-mode-b ${selectedCriteria === criteria.id ? 'selected' : ''} ${isCompleted ? 'completed' : ''}`}
                      onClick={() => handleCriteriaChange(criteria.id)}
                    >
                      <div className="criteria-info-mode-b">
                        <FileTextOutlined />
                        <span>{criteria.item_name}</span>
                      </div>
                      <div className="criteria-score-mode-b">
                        {isCompleted ? (
                          <Tag color="green" icon={<CheckCircleOutlined />}>
                            {scores[currentCompany!.id + '_' + criteria.id]} / {criteria.max_score}
                          </Tag>
                        ) : (
                          <Tag color="default">待评审</Tag>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        {/* 中间：评审表单 */}
        <Card
          className="execution-form-panel"
          size="small"
          title={
            <Space>
              <FileTextOutlined />
              <span>评审表单</span>
              {currentCriteria && (
                <Tag color="blue">{currentCriteria.item_name}</Tag>
              )}
            </Space>
          }
          extra={
            currentCriteria && (
              <Space size="small">
                <Tooltip title="上一条">
                  <Button
                    size="small"
                    icon={<LeftOutlined />}
                    onClick={moveToPrevCriteria}
                    disabled={!currentCriteria}
                  />
                </Tooltip>
                <Tooltip title="下一条">
                  <Button
                    size="small"
                    icon={<RightOutlined />}
                    onClick={moveToNextCriteria}
                    disabled={!currentCriteria}
                  />
                </Tooltip>
              </Space>
            )
          }
        >
          {!currentCompany || !currentCriteria ? (
            <Empty description="请选择评审项" />
          ) : (
            <div className="evaluation-form">
              {/* 公司信息 */}
              <div className="form-section">
                <Title level={5}>公司信息</Title>
                <Space>
                  <Tag color="blue">{currentCompany.company_name}</Tag>
                  {currentCompany.file_count && (
                    <Tag>{currentCompany.file_count} 个文件</Tag>
                  )}
                </Space>
              </div>

              <Divider />

              {/* 评审项信息 */}
              <div className="form-section">
                <Title level={5}>评审项详情</Title>
                <Space direction="vertical" style={{ width: '100%' }} size="small">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text strong>{currentCriteria.item_name}</Text>
                    <Tag color="orange">满分：{currentCriteria.max_score}分</Tag>
                  </div>
                  <Tag color={currentCriteria.criteria_type === 'technical' ? 'blue' : 'green'}>
                    {currentCriteria.criteria_type === 'technical' ? '技术评审' : '商务评审'}
                  </Tag>
                </Space>
              </div>

              <Divider />

              {/* 评分输入 */}
              <div className="form-section">
                <Title level={5}>
                  <StarOutlined /> 评分
                </Title>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <InputNumber
                    min={0}
                    max={currentCriteria.max_score}
                    value={getCurrentScore()}
                    onChange={handleScoreChange}
                    style={{ width: 200 }}
                    size="large"
                    placeholder={`请输入 0 - ${currentCriteria.max_score} 分`}
                    formatter={value => `${value} 分`}
                    parser={value => Number(value?.replace(' 分', ''))}
                  />
                  <Progress
                    percent={(getCurrentScore() / currentCriteria.max_score) * 100}
                    size="small"
                    style={{ flex: 1 }}
                  />
                </div>
              </div>

              <Divider />

              {/* 评审意见 */}
              <div className="form-section">
                <Title level={5}>
                  <FileTextOutlined /> 评审意见
                </Title>
                <TextArea
                  rows={6}
                  value={getCurrentComment()}
                  onChange={(e) => handleCommentChange(e.target.value)}
                  placeholder="请详细阐述评分理由，包括优点和不足..."
                  style={{ resize: 'vertical' }}
                />
              </div>

              <Divider />

              {/* 证据材料 */}
              <div className="form-section">
                <Title level={5}>
                  <FolderOutlined /> 证据材料
                </Title>
                <TextArea
                  rows={4}
                  value={getCurrentEvidence()}
                  onChange={(e) => handleEvidenceChange(e.target.value)}
                  placeholder="请提供评分依据，如文件路径、截图链接等..."
                  style={{ resize: 'vertical' }}
                />
              </div>

              {/* 操作按钮 */}
              <div className="form-actions">
                <Space size="middle" style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Button
                    icon={<SaveOutlined />}
                    onClick={handleSaveDraft}
                    loading={saving}
                  >
                    保存草稿
                  </Button>
                  <Button
                    type="primary"
                    size="large"
                    icon={<SendOutlined />}
                    onClick={handleSubmitEvaluation}
                    loading={submitting}
                  >
                    提交评审
                  </Button>
                </Space>
              </div>
            </div>
          )}
        </Card>

        {/* 右侧：文件树 */}
        <Card className="execution-file-panel" size="small" title="标书文件">
          {companyIdForFiles ? (
            <FileTreeExplorer
              companyFolder={`/projects/packages/${assignmentId}/companies/${companyIdForFiles}`}
              companyId={companyIdForFiles}
            />
          ) : (
            <Empty description="请选择公司查看文件" />
          )}
        </Card>
      </div>
    </div>
  );
};

export default ExecutionViewPanel;
