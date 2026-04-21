import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Button,
  Space,
  Checkbox,
  Progress,
  message,
  Typography,
  Tag,
  Empty,
  Spin,
  Divider,
  Tooltip,
  Row,
  Col,
  Avatar
} from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  RollbackOutlined,
  CopyOutlined,
  ClearOutlined,
  SendOutlined,
  FileTextOutlined,
  SwapOutlined
} from '@ant-design/icons';
import apiClient from '../services/api';
import './BatchAssignmentPanel.css';

const { Title, Text } = Typography;

// ==================== 类型定义 ====================

export interface TeamMember {
  id: number;
  real_name: string;
  role: string;
  avatar?: string;
}

export interface Criteria {
  id: number;
  item_name: string;
  max_score: number;
  criteria_type: 'technical' | 'business';
}

export interface Company {
  id: number;
  company_name: string;
  file_count?: number;
}

export interface BatchAssignmentPanelProps {
  packageId: number;
  mode: 'by_criteria' | 'by_company';
  onSubmit: (assignments: Assignment[]) => void;
  useRefineAPI?: boolean;  // 是否使用 refine API（默认 false，使用批量分配 API）
  projectId?: number;      // 项目 ID（useRefineAPI=true 时需要）
}

export interface Assignment {
  evaluator_id: number;
  resource_ids: number[]; // 评审项 ID 或公司 ID
}

// ==================== 组件实现 ====================

const BatchAssignmentPanel: React.FC<BatchAssignmentPanelProps> = ({
  packageId,
  mode,
  onSubmit,
  useRefineAPI = false,
  projectId
}) => {
  // ==================== 状态管理 ====================
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [criteriaList, setCriteriaList] = useState<Criteria[]>([]);
  const [companyList, setCompanyList] = useState<Company[]>([]);
  const [assignments, setAssignments] = useState<Record<number, number[]>>({});
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ==================== 数据加载 ====================

  useEffect(() => {
    fetchTeamMembers();
    if (mode === 'by_criteria') {
      fetchCriteriaList();
    } else if (mode === 'by_company') {
      fetchCompanyList();
    }
  }, [packageId, mode]);

  const fetchTeamMembers = async () => {
    try {
      // 获取当前团队信息
      const userData = localStorage.getItem('user');
      if (userData) {
        const currentUser = JSON.parse(userData);
        if (currentUser.team_id) {
          const response = await apiClient.get(`/api/teams/${currentUser.team_id}`);
          setTeamMembers(response.data.members || []);
        }
      }
    } catch (error) {
      console.error('获取团队成员失败:', error);
      message.error('获取团队成员失败');
    }
  };

  const fetchCriteriaList = async () => {
    try {
      const response = await apiClient.get(`/api/criteria/package/${packageId}`);
      setCriteriaList(response.data || []);
    } catch (error) {
      console.error('获取评审项列表失败:', error);
      message.error('获取评审项列表失败');
    }
  };

  const fetchCompanyList = async () => {
    try {
      const response = await apiClient.get(`/api/projects/packages/${packageId}/companies`);
      setCompanyList(response.data || []);
    } catch (error) {
      console.error('获取公司列表失败:', error);
      message.error('获取公司列表失败');
    }
  };

  // ==================== 分配逻辑 ====================

  // 获取当前成员已分配的资源数量
  const getMemberAssignedCount = useCallback((memberId: number): number => {
    return assignments[memberId]?.length || 0;
  }, [assignments]);

  // 获取所有已分配的资源 ID
  const getAllAssignedResourceIds = useCallback((): Set<number> => {
    const assignedIds = new Set<number>();
    Object.values(assignments).forEach(ids => {
      ids.forEach(id => assignedIds.add(id));
    });
    return assignedIds;
  }, [assignments]);

  // 获取未分配的资源列表
  const getUnassignedResources = useCallback((): (Criteria | Company)[] => {
    const assignedIds = getAllAssignedResourceIds();
    if (mode === 'by_criteria') {
      return criteriaList.filter(c => !assignedIds.has(c.id));
    } else if (mode === 'by_company') {
      return companyList.filter(c => !assignedIds.has(c.id));
    }
    return [];
  }, [mode, criteriaList, companyList, getAllAssignedResourceIds]);

  // 处理资源选择变更
  const handleResourceChange = (checked: boolean, resourceId: number) => {
    if (!selectedMemberId) {
      message.warning('请先选择团队成员');
      return;
    }

    setAssignments(prev => {
      const currentAssignments = prev[selectedMemberId] || [];
      let newAssignments: number[];

      if (checked) {
        // 检查是否已被其他人分配
        const isAssigned = Object.entries(prev).some(
          ([memberId, ids]) => Number(memberId) !== selectedMemberId && ids.includes(resourceId)
        );
        if (isAssigned) {
          message.warning('该资源已被分配给其他成员');
          return prev;
        }
        newAssignments = [...currentAssignments, resourceId];
      } else {
        newAssignments = currentAssignments.filter(id => id !== resourceId);
      }

      return {
        ...prev,
        [selectedMemberId]: newAssignments
      };
    });
  };

  // 处理成员选择
  const handleMemberSelect = (memberId: number) => {
    setSelectedMemberId(memberId);
  };

  // ==================== 快捷操作 ====================

  // 平均分配
  const handleAverageAssign = () => {
    if (teamMembers.length === 0) {
      message.warning('没有团队成员');
      return;
    }

    const resources = mode === 'by_criteria' ? criteriaList : companyList;
    const newAssignments: Record<number, number[]> = {};
    const memberIds = teamMembers.map(m => m.id);

    resources.forEach((resource, index) => {
      const memberIndex = index % memberIds.length;
      const memberId = memberIds[memberIndex];
      if (!newAssignments[memberId]) {
        newAssignments[memberId] = [];
      }
      newAssignments[memberId].push(resource.id);
    });

    setAssignments(newAssignments);
    message.success('已平均分配');
  };

  // 清空所有分配
  const handleClearAll = () => {
    if (teamMembers.length === 0) {
      return;
    }

    const newAssignments: Record<number, number[]> = {};
    teamMembers.forEach(member => {
      newAssignments[member.id] = [];
    });
    setAssignments(newAssignments);
    message.success('已清空所有分配');
  };

  // 复制上一个成员的配置
  const handleCopyPrevious = () => {
    if (!selectedMemberId) {
      message.warning('请先选择团队成员');
      return;
    }

    const memberIndex = teamMembers.findIndex(m => m.id === selectedMemberId);
    if (memberIndex <= 0) {
      message.warning('没有可复制的配置');
      return;
    }

    const previousMemberId = teamMembers[memberIndex - 1].id;
    const previousAssignments = assignments[previousMemberId] || [];

    setAssignments(prev => ({
      ...prev,
      [selectedMemberId]: [...previousAssignments]
    }));

    message.success('已复制上一个成员的配置');
  };

  // ==================== 提交 ====================

  // 检查是否可以提交
  const canSubmit = (): boolean => {
    if (teamMembers.length === 0) return false;

    // 检查是否所有成员都已分配（至少有一个资源）
    const allMembersAssigned = teamMembers.every(member => {
      const assignedCount = assignments[member.id]?.length || 0;
      return assignedCount > 0;
    });

    return allMembersAssigned;
  };

  // 计算进度
  const calculateProgress = (): number => {
    const totalResources = mode === 'by_criteria' ? criteriaList.length : companyList.length;
    const assignedIds = getAllAssignedResourceIds();
    if (totalResources === 0) return 0;
    return Math.round((assignedIds.size / totalResources) * 100);
  };

  // 提交分配
  const handleSubmit = async () => {
    if (!canSubmit()) {
      message.warning('请完成所有分配后再提交');
      return;
    }

    setSubmitting(true);
    try {
      const assignmentList: Assignment[] = teamMembers
        .filter(member => (assignments[member.id] || []).length > 0)
        .map(member => ({
          evaluator_id: member.id,
          resource_ids: assignments[member.id] || []
        }));

      // 如果使用 refine API，直接调用回调，由父组件处理
      if (useRefineAPI && projectId) {
        onSubmit(assignmentList);
        return;
      }

      // 否则使用批量分配 API
      if (mode === 'by_criteria') {
        await apiClient.post('/api/assignments/batch-assign-criteria', {
          package_id: packageId,
          team_assignments: assignmentList.map(a => ({
            evaluator_id: a.evaluator_id,
            criteria_ids: a.resource_ids
          }))
        });
        message.success('评审项分配成功');
      } else if (mode === 'by_company') {
        await apiClient.post('/api/assignments/batch-assign-companies', {
          package_id: packageId,
          team_assignments: assignmentList.map(a => ({
            evaluator_id: a.evaluator_id,
            company_ids: a.resource_ids
          }))
        });
        message.success('公司分配成功');
      }

      onSubmit(assignmentList);
    } catch (error: any) {
      console.error('提交分配失败:', error);
      message.error(error?.response?.data?.detail || '分配失败');
    } finally {
      setSubmitting(false);
    }
  };

  // ==================== 渲染 ====================

  const assignedIds = getAllAssignedResourceIds();
  const unassignedResources = getUnassignedResources();
  const progress = calculateProgress();

  return (
    <div className="batch-assignment-panel">
      {/* 顶部信息栏 */}
      <div className="assignment-header">
        <div className="assignment-info">
          <Title level={4} style={{ margin: 0 }}>
            <TeamOutlined />
            {mode === 'by_criteria' ? '按评审项分配' : '按公司分配'}
          </Title>
          <Text type="secondary" style={{ marginLeft: 12 }}>
            共 {teamMembers.length} 位成员，{mode === 'by_criteria' ? criteriaList.length : companyList.length} 个待分配项
          </Text>
        </div>
        <div className="assignment-progress">
          <Progress
            percent={progress}
            status={canSubmit() ? 'success' : 'active'}
            strokeColor={canSubmit() ? '#52c41a' : '#1890ff'}
          />
        </div>
      </div>

      <Divider style={{ margin: '12px 0' }} />

      {/* 三栏布局 */}
      <div className="assignment-content">
        {/* 左侧：团队成员列表 */}
        <Card className="assignment-member-panel" size="small" title="团队成员">
          {teamMembers.length === 0 ? (
            <Empty description="暂无团队成员" />
          ) : (
            <div className="member-list">
              {teamMembers.map(member => {
                const assignedCount = getMemberAssignedCount(member.id);
                const totalCount = mode === 'by_criteria' ? criteriaList.length : companyList.length;
                const isCompleted = assignedCount > 0 && assignedCount === totalCount;

                return (
                  <div
                    key={member.id}
                    className={`member-card ${selectedMemberId === member.id ? 'selected' : ''} ${isCompleted ? 'completed' : ''}`}
                    onClick={() => handleMemberSelect(member.id)}
                  >
                    <div className="member-info">
                      <Avatar
                        size={40}
                        icon={<UserOutlined />}
                        style={{ backgroundColor: selectedMemberId === member.id ? '#1890ff' : '#d9d9d9' }}
                      />
                      <div className="member-details">
                        <Text strong style={{ display: 'block' }}>{member.real_name}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>{member.role}</Text>
                      </div>
                    </div>
                    <div className="member-stats">
                      <Tag
                        color={isCompleted ? 'green' : assignedCount > 0 ? 'blue' : 'default'}
                        icon={isCompleted ? <CheckCircleOutlined /> : undefined}
                      >
                        已分配 {assignedCount}
                      </Tag>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* 中间：资源列表 */}
        <Card
          className="assignment-resource-panel"
          size="small"
          title={
            <Space>
              {mode === 'by_criteria' ? <FileTextOutlined /> : <TeamOutlined />}
              <span>{mode === 'by_criteria' ? '评审项列表' : '公司列表'}</span>
              <Tag color={unassignedResources.length === 0 ? 'green' : 'orange'}>
                剩余 {unassignedResources.length}
              </Tag>
            </Space>
          }
          extra={
            selectedMemberId && (
              <Tooltip title="复制上一个成员配置">
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={handleCopyPrevious}
                />
              </Tooltip>
            )
          }
        >
          {!selectedMemberId ? (
            <Empty
              description="请先选择左侧的团队成员"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : unassignedResources.length === 0 ? (
            <Empty
              description="所有资源已分配完毕"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <div className="resource-list">
              {unassignedResources.map(resource => (
                <div key={resource.id} className="resource-item">
                  <Checkbox
                    onChange={(e) =>
                      handleResourceChange(e.target.checked, resource.id)
                    }
                  >
                    <Space style={{ width: '100%' }}>
                      <div style={{ flex: 1 }}>
                        {mode === 'by_criteria' ? (
                          <span>{(resource as Criteria).item_name}</span>
                        ) : (
                          <span>{(resource as Company).company_name}</span>
                        )}
                      </div>
                      {mode === 'by_criteria' && (
                        <Tag color="orange" style={{ fontSize: 11 }}>
                          {(resource as Criteria).max_score}分
                        </Tag>
                      )}
                      {mode === 'by_company' && (resource as Company).file_count && (
                        <Tag color="blue" style={{ fontSize: 11 }}>
                          {(resource as Company).file_count} 文件
                        </Tag>
                      )}
                    </Space>
                  </Checkbox>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 右侧：已分配预览 */}
        <Card className="assignment-preview-panel" size="small" title="分配预览">
          {selectedMemberId ? (
            <>
              <Text strong style={{ display: 'block', marginBottom: 12 }}>
                {teamMembers.find(m => m.id === selectedMemberId)?.real_name} 的分配：
              </Text>
              <div className="assignment-preview-list">
                {(assignments[selectedMemberId] || []).length === 0 ? (
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    暂无分配
                  </Text>
                ) : (
                  <Space direction="vertical" style={{ width: '100%' }} size="small">
                    {(assignments[selectedMemberId] || []).map(id => {
                      if (mode === 'by_criteria') {
                        const criteria = criteriaList.find(c => c.id === id);
                        return criteria ? (
                          <Tag key={id} color="blue" style={{ fontSize: 12 }}>
                            {criteria.item_name}
                          </Tag>
                        ) : null;
                      } else if (mode === 'by_company') {
                        const company = companyList.find(c => c.id === id);
                        return company ? (
                          <Tag key={id} color="green" style={{ fontSize: 12 }}>
                            {company.company_name}
                          </Tag>
                        ) : null;
                      }
                      return null;
                    })}
                  </Space>
                )}
              </div>
            </>
          ) : (
            <Empty
              description="选择成员查看分配详情"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </Card>
      </div>

      {/* 底部操作栏 */}
      <div className="assignment-footer">
        <Space size="middle">
          <Tooltip title="平均分配">
            <Button
              icon={<SwapOutlined />}
              onClick={handleAverageAssign}
              disabled={teamMembers.length === 0}
            >
              平均分配
            </Button>
          </Tooltip>
          <Tooltip title="清空所有">
            <Button
              icon={<ClearOutlined />}
              onClick={handleClearAll}
              disabled={teamMembers.length === 0}
            >
              清空已选
            </Button>
          </Tooltip>
          <Tooltip title="复制配置">
            <Button
              icon={<CopyOutlined />}
              onClick={handleCopyPrevious}
              disabled={!selectedMemberId}
            >
              复制上一个人
            </Button>
          </Tooltip>
        </Space>

        <Space>
          <Button
            icon={<RollbackOutlined />}
            onClick={() => {
              setAssignments({});
              setSelectedMemberId(null);
            }}
          >
            重置
          </Button>
          <Button
            type="primary"
            size="large"
            icon={<SendOutlined />}
            onClick={handleSubmit}
            loading={submitting}
            disabled={!canSubmit()}
          >
            确定下发
          </Button>
        </Space>
      </div>
    </div>
  );
};

export default BatchAssignmentPanel;
