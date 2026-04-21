import React, { useState, useEffect } from 'react';
import { Modal, Steps, Button, Space, message, Spin, Tag } from 'antd';
import { 
  TeamOutlined, 
  FileTextOutlined, 
  CheckCircleOutlined,
  ShopOutlined,
  UserOutlined
} from '@ant-design/icons';
import apiClient from '../services/api.js';
import './TaskRefinementModal.css';

interface TaskRefinementModalProps {
  open: boolean;
  projectId: number;
  projectName: string;
  onCancel: () => void;
  onSuccess: () => void;
  teamMembers?: TeamMember[];
  criteriaList?: Criteria[];
  companyList?: Company[];
  onSubmit?: (mode: 'by_criteria' | 'by_company', assignments: Record<number, number[]>) => Promise<void>;
}

interface TeamMember {
  user_id: number;
  real_name?: string;
  username?: string;
  role: string;
}

interface Criteria {
  id: number;
  item_name: string;
  rule_name?: string;
  rule_type?: string;
  scoring_criteria?: string;
  criteria_name?: string;
  criteria_type?: string;
  max_score?: number;
  source_files?: string[];
}

interface Company {
  id: number;
  company_name: string;
}

const TaskRefinementModal: React.FC<TaskRefinementModalProps> = ({
  open,
  projectId,
  projectName,
  onCancel,
  onSuccess,
  teamMembers: externalMembers,
  criteriaList: externalCriteria,
  companyList: externalCompanies,
  onSubmit: externalOnSubmit
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  
  const [mode, setMode] = useState<'by_criteria' | 'by_company' | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [criteriaList, setCriteriaList] = useState<Criteria[]>([]);
  const [companyList, setCompanyList] = useState<Company[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [activeMemberId, setActiveMemberId] = useState<number | null>(null);
  const [expertAssignments, setExpertAssignments] = useState<Record<number, number[]>>({});

  useEffect(() => {
    if (open) {
      resetState();
      if (externalMembers) {
        setTeamMembers(externalMembers);
      } else {
        fetchProjectData();
      }
      if (externalCriteria) {
        setCriteriaList(externalCriteria);
      }
      if (externalCompanies) {
        setCompanyList(externalCompanies);
      }
    }
  }, [open, externalMembers, externalCriteria, externalCompanies]);

  const resetState = () => {
    setCurrentStep(0);
    setMode(null);
    setSelectedMemberIds([]);
    setActiveMemberId(null);
    setExpertAssignments({});
  };

  const isResourceAssignedToOther = (resourceId: number, excludeMemberId?: number) => {
    for (const [memberId, resourceIds] of Object.entries(expertAssignments)) {
      if (excludeMemberId && parseInt(memberId) === excludeMemberId) continue;
      if (resourceIds.includes(resourceId)) return true;
    }
    return false;
  };

  const isResourceAssignedToActive = (resourceId: number) => {
    if (!activeMemberId) return false;
    return (expertAssignments[activeMemberId] || []).includes(resourceId);
  };

  const fetchProjectData = async () => {
    setLoadingData(true);
    try {
      const [companiesRes, criteriaRes, teamRes] = await Promise.all([
        apiClient.get(`/api/projects/${projectId}/companies`),
        apiClient.get(`/api/projects/${projectId}/rules`),
        apiClient.get(`/api/teams/${projectId}`)
      ]);
      
      const companies = Array.isArray(companiesRes.data?.companies) ? companiesRes.data.companies : [];
      const criteria = Array.isArray(criteriaRes.data?.rules) ? criteriaRes.data.rules : [];
      const members = Array.isArray(teamRes.data?.members) ? teamRes.data.members : [];
      
      console.log('加载的数据:', { companies, criteria, members });
      
      setCompanyList(companies);
      setCriteriaList(criteria);
      setTeamMembers(members);
    } catch (error) {
      console.error('加载项目数据失败:', error);
      message.warning('加载项目数据失败');
      setCompanyList([]);
      setCriteriaList([]);
      setTeamMembers([]);
    } finally {
      setLoadingData(false);
    }
  };

  const renderStep1 = () => (
    <div className="step-content">
      <h3>选择分配模式</h3>
      <div className="mode-selection">
        <div 
          className={`mode-card ${mode === 'by_criteria' ? 'selected' : ''}`}
          onClick={() => setMode('by_criteria')}
        >
          <FileTextOutlined className="mode-icon" />
          <h4>按评审项分配</h4>
          <p>为每位专家分配若干评审项</p>
          <small>专家将负责：选中的评审项 + 所有公司</small>
        </div>
        
        <div 
          className={`mode-card ${mode === 'by_company' ? 'selected' : ''}`}
          onClick={() => setMode('by_company')}
        >
          <ShopOutlined className="mode-icon" />
          <h4>按公司分配</h4>
          <p>为每位专家分配若干家公司</p>
          <small>专家将负责：所有评审项 + 选中的公司</small>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => {
    const activeMember = activeMemberId ? teamMembers.find(m => m.user_id === activeMemberId) : null;
    const activeMemberName = activeMember?.real_name || activeMember?.username || `用户${activeMemberId}`;
    const activeAssignments = activeMemberId ? (expertAssignments[activeMemberId] || []) : [];
    
    return (
      <div className="step-content">
        {/* 顶部：选择团队成员 */}
        <div className="top-member-selection">
          <div className="section-title">选择团队成员</div>
          <div className="member-cards">
            {teamMembers.length === 0 ? (
              <div className="empty-text">暂无团队成员</div>
            ) : (
              teamMembers.map(member => {
                const memberName = member.real_name || member.username || `用户${member.user_id}`;
                const isSelected = selectedMemberIds.includes(member.user_id);
                
                return (
                  <div 
                    key={member.user_id}
                    className={`member-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedMemberIds(prev => 
                        isSelected 
                          ? prev.filter(id => id !== member.user_id)
                          : [...prev, member.user_id]
                      );
                    }}
                  >
                    <div className="member-card-inner">
                      <div className="member-checkbox">
                        {isSelected && <CheckCircleOutlined />}
                      </div>
                      <div className="member-name">{memberName}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 主内容区：左中右布局 */}
        <div className="main-content">
          {/* 左侧：成员列表 */}
          <div className="left-panel">
            <div className="panel-title">成员列表</div>
            {selectedMemberIds.length === 0 ? (
              <div className="empty-list">请先在上方选择成员</div>
            ) : (
              <div className="member-list">
                {selectedMemberIds.map(memberId => {
                  const member = teamMembers.find(m => m.user_id === memberId);
                  const memberName = member?.real_name || member?.username || `用户${memberId}`;
                  const assignedCount = (expertAssignments[memberId] || []).length;
                  const isActive = activeMemberId === memberId;
                  
                  return (
                    <div 
                      key={memberId}
                      className={`member-item ${isActive ? 'active' : ''}`}
                      onClick={() => setActiveMemberId(memberId)}
                    >
                      <div className="member-name">{memberName}</div>
                      <div className="member-count">
                        {assignedCount} 项
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 右侧：资源网格 */}
          <div className="right-panel">
            {activeMemberId ? (
              <>
                <div className="panel-header">
                  <span>为 </span>
                  <span className="active-name">{activeMemberName}</span>
                  <span> 分配任务</span>
                  <Tag color="blue">{activeAssignments.length} 项</Tag>
                </div>
                
                <div className="resource-grid">
                  {mode === 'by_criteria' ? (
                    criteriaList.map(criteria => {
                      const isAssignedToOther = isResourceAssignedToOther(criteria.id, activeMemberId);
                      const isAssignedToActive = isResourceAssignedToActive(criteria.id);
                      
                      return (
                        <div 
                          key={criteria.id}
                          className={`resource-card ${isAssignedToOther ? 'disabled' : ''} ${isAssignedToActive ? 'assigned' : ''}`}
                          onClick={() => {
                            if (isAssignedToOther) return;
                            
                            if (isAssignedToActive) {
                              const newAssignments = { ...expertAssignments };
                              newAssignments[activeMemberId] = activeAssignments.filter(id => id !== criteria.id);
                              setExpertAssignments(newAssignments);
                            } else {
                              const newAssignments = { ...expertAssignments };
                              newAssignments[activeMemberId] = [...activeAssignments, criteria.id];
                              setExpertAssignments(newAssignments);
                            }
                          }}
                        >
                          <div className="resource-title">{criteria.item_name || criteria.rule_name || criteria.criteria_name}</div>
                          <div className="resource-type">
                            <Tag size="small">{criteria.rule_type || criteria.criteria_type || '评审项'}</Tag>
                          </div>
                          {isAssignedToActive && (
                            <div className="resource-status">
                              <CheckCircleOutlined /> 已分配
                            </div>
                          )}
                          {isAssignedToOther && (
                            <div className="resource-status other">
                              <Tag size="small">已分配</Tag>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    companyList.map(company => {
                      const isAssignedToOther = isResourceAssignedToOther(company.id, activeMemberId);
                      const isAssignedToActive = isResourceAssignedToActive(company.id);
                      
                      return (
                        <div 
                          key={company.id}
                          className={`resource-card ${isAssignedToOther ? 'disabled' : ''} ${isAssignedToActive ? 'assigned' : ''}`}
                          onClick={() => {
                            if (isAssignedToOther) return;
                            
                            if (isAssignedToActive) {
                              const newAssignments = { ...expertAssignments };
                              newAssignments[activeMemberId] = activeAssignments.filter(id => id !== company.id);
                              setExpertAssignments(newAssignments);
                            } else {
                              const newAssignments = { ...expertAssignments };
                              newAssignments[activeMemberId] = [...activeAssignments, company.id];
                              setExpertAssignments(newAssignments);
                            }
                          }}
                        >
                          <div className="resource-title">{company.company_name}</div>
                          {isAssignedToActive && (
                            <div className="resource-status">
                              <CheckCircleOutlined /> 已分配
                            </div>
                          )}
                          {isAssignedToOther && (
                            <div className="resource-status other">
                              <Tag size="small">已分配</Tag>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              <div className="empty-panel">
                <UserOutlined className="empty-icon" />
                <div>请从左侧选择一个成员</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderStep3 = () => (
    <div className="step-content">
      <h3>确认分配</h3>
      <div className="assignment-summary">
        <h4>分配总结</h4>
        <div className="summary-item">
          <span>项目:</span>
          <strong>{projectName}</strong>
        </div>
        <div className="summary-item">
          <span>分配模式:</span>
          <strong>{mode === 'by_criteria' ? '按评审项分配' : '按公司分配'}</strong>
        </div>
        <div className="summary-item">
          <span>成员数量:</span>
          <strong>{selectedMemberIds.length} 人</strong>
        </div>
        
        <div className="expert-summary">
          <h5>专家任务分配</h5>
          {Object.entries(expertAssignments)
            .filter(([_, ids]) => ids.length > 0)
            .map(([memberId, ids]) => {
              const member = teamMembers.find(m => m.user_id === parseInt(memberId));
              const memberName = member?.real_name || member?.username || `用户${memberId}`;
              return (
                <div key={memberId} className="expert-task-item">
                  <span className="expert-name">{memberName}</span>
                  <span className="task-count">{ids.length} 项</span>
                  <div className="task-details">
                    {ids.map((id, idx) => {
                      const resource = mode === 'by_criteria'
                        ? criteriaList.find(c => c.id === id)
                        : companyList.find(c => c.id === id);
                      return (
                        <Tag key={idx} size="small">
                          {mode === 'by_criteria' ? (resource?.item_name || resource?.rule_name) : resource?.company_name}
                        </Tag>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );

  const handleNext = () => {
    if (currentStep < 2) {
      if (currentStep === 0 && !mode) {
        message.warning('请选择分配模式');
        return;
      }
      if (currentStep === 1 && selectedMemberIds.length === 0) {
        message.warning('请至少选择一名成员');
        return;
      }
      if (currentStep === 1) {
        const allAssigned = selectedMemberIds.every(mid => 
          (expertAssignments[mid] || []).length > 0
        );
        if (!allAssigned) {
          // 找出未分配任务的成员名称
          const unassignedMembers = selectedMemberIds
            .filter(mid => (expertAssignments[mid] || []).length === 0)
            .map(mid => {
              const member = teamMembers.find(m => m.user_id === parseInt(mid));
              return member?.real_name || member?.username || `用户${mid}`;
            });
          
          Modal.confirm({
            title: '部分成员未分配任务',
            content: `以下成员尚未分配任务：${unassignedMembers.join('、')}，确定继续吗？`,
            onOk: () => setCurrentStep(currentStep + 1),
          });
          return;
        }
      }
      setCurrentStep(currentStep + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    if (Object.values(expertAssignments).every(ids => ids.length === 0)) {
      message.warning('请至少分配一个任务给成员');
      return;
    }

    setLoading(true);
    try {
      if (externalOnSubmit) {
        await externalOnSubmit(mode!, expertAssignments);
      } else {
        const teamMembersData = Object.entries(expertAssignments)
          .filter(([_, ids]) => ids.length > 0)
          .map(([memberId, resourceIds]) => ({
            evaluator_id: parseInt(memberId),
            task_type: 'technical',
            ...(mode === 'by_criteria' 
              ? { criteria: resourceIds }
              : { documents: resourceIds }
            )
          }));
        
        await apiClient.post(`/api/projects/${projectId}/refine`, {
          mode: mode,
          team_members: teamMembersData
        });
      }

      message.success('分配成功！');
      onSuccess();
    } catch (error: any) {
      message.error(error?.response?.data?.detail || '分配失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    resetState();
    onCancel();
  };

  return (
    <Modal
      open={open}
      title={
        <Space>
          <TeamOutlined />
          <span>细化任务分配</span>
        </Space>
      }
      footer={null}
      width={1100}
      onCancel={handleCancel}
      className="task-refinement-modal"
    >
      {/* Modal Body 内容 - 外层 div 包裹 */}
      <div className="modal-body-wrapper">
        <div className="modal-content">
          <Steps current={currentStep} items={[
          { title: '选择模式', icon: <FileTextOutlined /> },
          { title: '分配任务', icon: <TeamOutlined /> },
          { title: '确认', icon: <CheckCircleOutlined /> }
        ]} />

        {loadingData && currentStep === 0 ? (
          <div className="loading-container">
            <Spin size="large" tip="加载中..." />
          </div>
        ) : (
          <>
            {currentStep === 0 && (
              <div className="step-content">
                <h3>选择分配模式</h3>
                <div className="mode-selection">
                  <div 
                    className={`mode-card ${mode === 'by_criteria' ? 'selected' : ''}`}
                    onClick={() => setMode('by_criteria')}
                  >
                    <FileTextOutlined className="mode-icon" />
                    <h4>按评审项分配</h4>
                    <p>为每位专家分配若干评审项</p>
                    <small>专家将负责：选中的评审项 + 所有公司</small>
                  </div>
                  
                  <div 
                    className={`mode-card ${mode === 'by_company' ? 'selected' : ''}`}
                    onClick={() => setMode('by_company')}
                  >
                    <ShopOutlined className="mode-icon" />
                    <h4>按公司分配</h4>
                    <p>为每位专家分配若干家公司</p>
                    <small>专家将负责：所有评审项 + 选中的公司</small>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 1 && (
              <>
                {/* 顶部：选择团队成员 */}
                <div className="top-member-selection">
                  <div className="section-title">选择团队成员</div>
                  <div className="member-cards-scroll">
                    <div className="member-cards">
                      {teamMembers.length === 0 ? (
                        <div className="empty-text">暂无团队成员</div>
                      ) : (
                        teamMembers.map(member => {
                          const memberName = member.real_name || member.username || `用户${member.user_id}`;
                          const isSelected = selectedMemberIds.includes(member.user_id);
                          
                          return (
                            <div 
                              key={member.user_id}
                              className={`member-card ${isSelected ? 'selected' : ''}`}
                              onClick={() => {
                                if (isSelected) {
                                  const newAssignments = { ...expertAssignments };
                                  delete newAssignments[member.user_id];
                                  setExpertAssignments(newAssignments);
                                  if (activeMemberId === member.user_id) {
                                    setActiveMemberId(null);
                                  }
                                  setSelectedMemberIds(prev => 
                                    prev.filter(id => id !== member.user_id)
                                  );
                                } else {
                                  setSelectedMemberIds(prev => [...prev, member.user_id]);
                                }
                              }}
                            >
                              <div className="member-card-inner">
                                <div className="member-checkbox">
                                  {isSelected && <CheckCircleOutlined />}
                                </div>
                                <div className="member-name">{memberName}</div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* 主内容区 - 可滚动 */}
                <div className="main-content-scroll">
                  <div className="main-content">
                    {/* 左侧：成员列表 */}
                    <div className="left-panel">
                      <div className="panel-title">成员列表</div>
                      {selectedMemberIds.length === 0 ? (
                        <div className="empty-list">请先在上方选择成员</div>
                      ) : (
                        <div className="member-list">
                          {selectedMemberIds.map(memberId => {
                            const member = teamMembers.find(m => m.user_id === memberId);
                            const memberName = member?.real_name || member?.username || `用户${memberId}`;
                            const assignedCount = (expertAssignments[memberId] || []).length;
                            const isActive = activeMemberId === memberId;
                            
                            return (
                              <div 
                                key={memberId}
                                className={`member-item ${isActive ? 'active' : ''}`}
                                onClick={() => setActiveMemberId(memberId)}
                              >
                                <div className="member-name">{memberName}</div>
                                <div className="member-count">
                                  {assignedCount} 项
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* 右侧：资源网格 */}
                    <div className="right-panel">
                      {activeMemberId ? (
                        <>
                          {(() => {
                            const activeMember = teamMembers.find(m => m.user_id === activeMemberId);
                            const activeMemberName = activeMember?.real_name || activeMember?.username || `用户${activeMemberId}`;
                            const activeAssignments = expertAssignments[activeMemberId] || [];
                            
                            return (
                              <>
                                <div className="panel-header">
                                  <span>为 </span>
                                  <span className="active-name">{activeMemberName}</span>
                                  <span> 分配任务</span>
                                  <Tag color="blue">{activeAssignments.length} 项</Tag>
                                </div>
                                
                                <div className="resource-grid">
                                  {mode === 'by_criteria' ? (
                                    (Array.isArray(criteriaList) ? criteriaList : []).map(criteria => {
                                      const isAssignedToOther = isResourceAssignedToOther(criteria.id, activeMemberId);
                                      const isAssignedToActive = isResourceAssignedToActive(criteria.id);
                                      
                                      return (
                                        <div 
                                          key={criteria.id}
                                          className={`resource-card ${isAssignedToOther ? 'disabled' : ''} ${isAssignedToActive ? 'assigned' : ''}`}
                                          onClick={() => {
                                            if (isAssignedToOther) return;
                                            
                                            if (isAssignedToActive) {
                                              const newAssignments = { ...expertAssignments };
                                              newAssignments[activeMemberId] = activeAssignments.filter(id => id !== criteria.id);
                                              setExpertAssignments(newAssignments);
                                            } else {
                                              const newAssignments = { ...expertAssignments };
                                              newAssignments[activeMemberId] = [...activeAssignments, criteria.id];
                                              setExpertAssignments(newAssignments);
                                            }
                                          }}
                                        >
                                          <div className="resource-title">{criteria.item_name || criteria.rule_name || criteria.criteria_name}</div>
                                          <div className="resource-type">
                                            <Tag size="small">{criteria.rule_type || criteria.criteria_type || '评审项'}</Tag>
                                          </div>
                                          {isAssignedToActive && (
                                            <div className="resource-status">
                                              <CheckCircleOutlined /> 已分配
                                            </div>
                                          )}
                                          {isAssignedToOther && (
                                            <div className="resource-status other">
                                              <Tag size="small">已分配</Tag>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })
                                  ) : (
                                    (Array.isArray(companyList) ? companyList : []).map(company => {
                                      const isAssignedToOther = isResourceAssignedToOther(company.id, activeMemberId);
                                      const isAssignedToActive = isResourceAssignedToActive(company.id);
                                      
                                      return (
                                        <div 
                                          key={company.id}
                                          className={`resource-card ${isAssignedToOther ? 'disabled' : ''} ${isAssignedToActive ? 'assigned' : ''}`}
                                          onClick={() => {
                                            if (isAssignedToOther) return;
                                            
                                            if (isAssignedToActive) {
                                              const newAssignments = { ...expertAssignments };
                                              newAssignments[activeMemberId] = activeAssignments.filter(id => id !== company.id);
                                              setExpertAssignments(newAssignments);
                                            } else {
                                              const newAssignments = { ...expertAssignments };
                                              newAssignments[activeMemberId] = [...activeAssignments, company.id];
                                              setExpertAssignments(newAssignments);
                                            }
                                          }}
                                        >
                                          <div className="resource-title">{company.company_name}</div>
                                          {isAssignedToActive && (
                                            <div className="resource-status">
                                              <CheckCircleOutlined /> 已分配
                                            </div>
                                          )}
                                          {isAssignedToOther && (
                                            <div className="resource-status other">
                                              <Tag size="small">已分配</Tag>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              </>
                            );
                          })()}
                        </>
                      ) : (
                        <div className="empty-panel">
                          <UserOutlined className="empty-icon" />
                          <div>请从左侧选择一个成员</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {currentStep === 2 && (
              <div className="step-content">
                <div className="assignment-summary">
                  <div className="summary-header">
                    <div className="summary-title">
                      <CheckCircleOutlined className="summary-icon" />
                      <span>分配总结</span>
                    </div>
                    <div className="summary-mode-tag">
                      {mode === 'by_criteria' ? '按评审项分配' : '按公司分配'}
                    </div>
                  </div>
                  
                  <div className="summary-cards">
                    <div className="summary-card">
                      <div className="summary-card-icon project-icon">
                        <FileTextOutlined />
                      </div>
                      <div className="summary-card-content">
                        <div className="summary-card-label">项目名称</div>
                        <div className="summary-card-value">{projectName}</div>
                      </div>
                    </div>
                    
                    <div className="summary-card">
                      <div className="summary-card-icon mode-icon">
                        {mode === 'by_criteria' ? <FileTextOutlined /> : <ShopOutlined />}
                      </div>
                      <div className="summary-card-content">
                        <div className="summary-card-label">分配模式</div>
                        <div className="summary-card-value">
                          {mode === 'by_criteria' ? '按评审项分配' : '按公司分配'}
                        </div>
                      </div>
                    </div>
                    
                    <div className="summary-card">
                      <div className="summary-card-icon member-icon">
                        <TeamOutlined />
                      </div>
                      <div className="summary-card-content">
                        <div className="summary-card-label">参与成员</div>
                        <div className="summary-card-value">{selectedMemberIds.length} 人</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="expert-section">
                    <div className="expert-section-header">
                      <UserOutlined className="expert-section-icon" />
                      <span className="expert-section-title">专家任务分配</span>
                      <span className="expert-section-subtitle">共 {Object.keys(expertAssignments).filter(id => expertAssignments[id].length > 0).length} 位专家</span>
                    </div>
                    <div className="expert-list">
                      {Object.entries(expertAssignments)
                        .filter(([_, ids]) => ids.length > 0)
                        .map(([memberId, ids]) => {
                          const member = teamMembers.find(m => m.user_id === parseInt(memberId));
                          const memberName = member?.real_name || member?.username || `用户${memberId}`;
                          return (
                            <div key={memberId} className="expert-task-item">
                              <div className="expert-task-header">
                                <div className="expert-info">
                                  <div className="expert-avatar">
                                    {memberName.charAt(0)}
                                  </div>
                                  <span className="expert-name">{memberName}</span>
                                </div>
                                <div className="task-badge">
                                  {ids.length} 项任务
                                </div>
                              </div>
                              <div className="task-details">
                                {ids.map((id, idx) => {
                                  const resource = mode === 'by_criteria'
                                    ? (Array.isArray(criteriaList) ? criteriaList.find(c => c.id === id) : undefined)
                                    : (Array.isArray(companyList) ? companyList.find(c => c.id === id) : undefined);
                                  return (
                                    <Tag key={idx} size="small" color="blue">
                                      {mode === 'by_criteria' ? (resource?.item_name || resource?.rule_name) : resource?.company_name}
                                    </Tag>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        </div>
        
        {/* 底部按钮栏 */}
        <div className="modal-footer-fixed">
          <div className="modal-footer-inner">
            {currentStep > 0 && (
              <Button className="btn-prev" onClick={handleBack}>上一步</Button>
            )}
            <Button 
              className="btn-next"
              type="primary" 
              onClick={handleNext}
              loading={loading}
            >
              {currentStep === 2 ? '确认分配' : '下一步'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default TaskRefinementModal;
