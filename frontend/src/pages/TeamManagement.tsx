import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Table,
  Tag,
  Space,
  Typography,
  message,
  Modal,
  Form,
  Input,
  Select,
  Divider,
  Avatar,
  Row,
  Col,
  Empty,
  Tooltip,
  Badge,
  Switch,
  Alert,
  Radio,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  TeamOutlined,
  UserOutlined,
  PlusCircleOutlined,
  MinusCircleOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  UsergroupAddOutlined,
  InfoCircleOutlined,
  RocketOutlined,
  BookOutlined,
  MobileOutlined,
  DesktopOutlined,
  StarOutlined,
  FireOutlined
} from '@ant-design/icons';
import { teamApi } from '../services/projectApi.ts';
import AppSidebar from '../components/AppSidebar';
import { ManagerSelection } from '../components/ManagerSelection';
import './TeamManagement.css';

const { Title, Text, Link } = Typography;
const { TextArea } = Input;
const { Option } = Select;

// ==================== 类型定义 ====================

interface Team {
  id: number;
  team_name: string;
  team_manager_id: number | null;
  manager_name: string | null;
  description: string;
  member_count: number;
  created_at: string;
}

interface NewMember {
  user_id: number;
  role: string;
}

interface User {
  id: number;
  username: string;
  real_name: string;
  role: string;
}

interface TeamMember {
  id: number;
  user_id: number;
  team_id: number;
  user?: User;
}

interface MemberCardProps {
  member: TeamMember;
  isManager: boolean;
  onRemove: (userId: number) => void;
  removing: boolean;
  showRemoveButton?: boolean;
}

// ==================== 常量定义 ====================

const ROLE_NAMES: Record<string, string> = {
  admin: '系统管理员',
  team_leader: '评标组长',
  team_manager: '团队负责人',
  technical_evaluator: '技术专家',
  business_evaluator: '商务专家'
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'red',
  team_leader: 'orange',
  team_manager: 'blue',
  technical_evaluator: 'purple',
  business_evaluator: 'volcano'
};

// ==================== 辅助函数 ====================

const getRoleName = (role: string): string => ROLE_NAMES[role] || role || '成员';
const getRoleColor = (role: string): string => ROLE_COLORS[role] || 'default';

// ==================== 子组件 ====================

// 成员卡片 - 现代化玻璃态设计
const MemberCard: React.FC<MemberCardProps> = memo(({ member, isManager, onRemove, removing, showRemoveButton = true }) => {
  return (
    <div className={`member-card-modern ${isManager ? 'member-card-manager' : ''}`}>
      <div className="member-card-glow"></div>
      <div className="member-card-header-modern">
        <div className="member-avatar-wrapper-modern">
          <Avatar 
            size={64}
            icon={<UserOutlined />}
            className="avatar-modern"
          />
          {isManager && (
            <div className="manager-badge-modern">
              <StarOutlined />
              <span>负责人</span>
            </div>
          )}
          <div className="avatar-border"></div>
        </div>
        <div className="member-info-modern">
          <div className="member-name-modern">
            {member.user?.real_name || '未知用户'}
            {isManager && <StarOutlined className="name-sparkle" />}
          </div>
          <Tag className="role-tag-modern" color={getRoleColor(member.user?.role || '')}>
            {getRoleName(member.user?.role || '')}
          </Tag>
          <div className="member-id-modern">
            <DesktopOutlined className="id-icon" />
            ID: {member.user_id}
          </div>
        </div>
      </div>
      {showRemoveButton && (
        <div className="member-card-footer-modern">
          <Button
            className="remove-btn-modern"
            type="default"
            danger={false}
            color="default"
            variant="outlined"
            size="large"
            icon={removing ? <LoadingOutlined /> : <MinusCircleOutlined />}
            onClick={() => onRemove(member.user_id)}
            disabled={removing}
            style={{ borderColor: '#d9d9d9', color: '#666' }}
          >
            {removing ? '移除中...' : '移除成员'}
          </Button>
        </div>
      )}
    </div>
  );
});

MemberCard.displayName = 'MemberCard';

// 添加成员区域 - 完全按照 ManagerSelection 样式重构
const AddMemberSection: React.FC<{
  availableUsers: User[];
  onAddMultiple: (userIds: number[], roles: string[]) => void;
  selectedUserIds: number[];
  showQuickMode?: boolean;
}> = memo(({ availableUsers, onAddMultiple, selectedUserIds, showQuickMode = false }) => {
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<string>('');
  const [showTips, setShowTips] = useState(true);

  const filteredUsers = useMemo(() => {
    return availableUsers.filter(user => {
      const matchesSearch = 
        user.real_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.username.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = !filterRole || user.role === filterRole;
      const notSelected = !selectedUsers.includes(user.id);
      return matchesSearch && matchesRole && notSelected;
    });
  }, [availableUsers, searchTerm, filterRole, selectedUsers]);

  const handleAddMultiple = useCallback(() => {
    if (selectedUsers.length > 0) {
      const roles = selectedUsers.map(() => 'technical_evaluator');
      onAddMultiple(selectedUsers, roles);
      setSelectedUsers([]);
      setSearchTerm('');
      setFilterRole('');
    }
  }, [selectedUsers, onAddMultiple]);

  const handleToggleUser = useCallback((userId: number) => {
    setSelectedUsers(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  }, []);

  const handleClearSearch = () => {
    setSearchTerm('');
    setFilterRole('');
  };

  const isSelected = (userId: number) => selectedUsers.includes(userId);

  const handleRemoveSelected = (userId: number) => {
    setSelectedUsers(prev => prev.filter(id => id !== userId));
  };

  return (
    <div className="add-member-section">
      {/* 头部：标题和统计 */}
      <div className="add-member-header">
        <div className="header-title">
          <div className="title-icon-wrapper">
            <UsergroupAddOutlined />
          </div>
          <div className="title-text">
            <Title level={5} style={{ margin: 0 }}>添加成员</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              点击卡片选择成员，支持多选
            </Text>
          </div>
        </div>
        <div className="header-stats">
          <Tag icon={<TeamOutlined />} color="blue">
            共 {availableUsers.length} 人可用
          </Tag>
          {selectedUsers.length > 0 && (
            <Tag color="green">已选：{selectedUsers.length}</Tag>
          )}
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="search-filter-bar">
        <div className="search-wrapper">
          <Input.Search
            placeholder="搜索成员姓名或用户名..."
            size="large"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onClear={handleClearSearch}
            prefix={<SearchOutlined />}
            allowClear
          />
        </div>
        <Radio.Group
          value={filterRole || undefined}
          onChange={(e) => setFilterRole(e.target.value || '')}
          className="role-filter-radio"
        >
          <Radio value="">全部</Radio>
          <Radio value="technical_evaluator">技术专家</Radio>
          <Radio value="business_evaluator">商务专家</Radio>
        </Radio.Group>
      </div>

      {/* 成员卡片网格 */}
      <div className="member-cards-grid">
        {filteredUsers.length > 0 ? (
          filteredUsers.map(user => {
            const isSel = isSelected(user.id);
            return (
              <div
                key={user.id}
                className={`member-select-card ${isSel ? 'selected' : ''}`}
                onClick={() => handleToggleUser(user.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleToggleUser(user.id);
                  }
                }}
              >
                <div className="card-checkbox">
                  <div className={`checkbox-indicator ${isSel ? 'checked' : ''}`}>
                    {isSel && <CheckCircleOutlined />}
                  </div>
                </div>
                <div className="card-content">
                  <div className="card-avatar">
                    <Avatar
                      size={48}
                      icon={<UserOutlined />}
                      style={{
                        background: isSel
                          ? 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)'
                          : 'linear-gradient(135deg, #f0f0f0 0%, #d9d9d9 100%)',
                        color: '#fff',
                      }}
                    />
                  </div>
                  <div className="card-info">
                    <div className="card-name">{user.real_name}</div>
                    <div className="card-username">@{user.username}</div>
                    <div className="card-role">
                      <Tag color={getRoleColor(user.role)}>
                        {getRoleName(user.role)}
                      </Tag>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="no-users-placeholder">
            <Empty
              image={<UserOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />}
              description={
                searchTerm || filterRole
                  ? '没有找到匹配的成员'
                  : '暂无可用成员'
              }
            />
          </div>
        )}
      </div>

      {/* 已选成员底部 */}
      {selectedUsers.length > 0 && (
        <div className="selected-users-footer">
          <div className="selected-summary">
            <div className="summary-icon">
              <CheckCircleOutlined />
            </div>
            <div className="summary-text">
              <div className="summary-title">已选择 {selectedUsers.length} 名成员</div>
              <div className="summary-users">
                {selectedUsers.slice(0, 5).map(userId => {
                  const user = availableUsers.find(u => u.id === userId);
                  return user ? (
                    <Tag
                      key={userId}
                      closable
                      onClose={() => handleRemoveSelected(userId)}
                      color="blue"
                    >
                      {user.real_name}
                    </Tag>
                  ) : null;
                })}
                {selectedUsers.length > 5 && (
                  <Tag>+{selectedUsers.length - 5} 人</Tag>
                )}
              </div>
            </div>
          </div>
          <Button
            type="primary"
            onClick={handleAddMultiple}
            icon={<UsergroupAddOutlined />}
          >
            确认添加 ({selectedUsers.length})
          </Button>
        </div>
      )}
    </div>
  );
});

AddMemberSection.displayName = 'AddMemberSection';

// ==================== 主组件 ====================

const TeamManagement: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [teamMembers, setTeamMembers] = useState<Record<number, TeamMember[]>>({});
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedNewMembers, setSelectedNewMembers] = useState<NewMember[]>([]);
  const [quickCreateMode, setQuickCreateMode] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    } else {
      navigate('/login');
    }
    fetchData();
  }, [navigate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [teamsRes, usersRes] = await Promise.all([
        teamApi.getTeams(),
        teamApi.getUsers?.() || []
      ]);
      setTeams(teamsRes);
      setUsers(usersRes || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      try {
        const teamsRes = await teamApi.getTeams();
        setTeams(teamsRes);
      } catch (e) {
        message.error('获取数据失败');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTeamMembers = useCallback(async (teamId: number) => {
    try {
      const response = await teamApi.getTeamMembers(teamId);
      const members = response.data?.members || [];
      
      const membersWithUserInfo = members.map((member: TeamMember) => {
        const userInfo = users.find(u => u.id === member.user_id);
        return {
          ...member,
          user: userInfo || {
            id: member.user_id,
            username: `user_${member.user_id}`,
            real_name: '未知用户',
            role: ''
          }
        };
      });
      
      setTeamMembers(prev => ({ ...prev, [teamId]: membersWithUserInfo }));
    } catch (error) {
      console.error('获取团队成员失败', error);
    }
  }, [users]);

  useEffect(() => {
    if (user && users.length > 0 && editingTeam) {
      fetchTeamMembers(editingTeam.id);
    }
  }, [users, editingTeam, fetchTeamMembers, user]);

  // 确保 Modal 打开时表单被正确初始化
  useEffect(() => {
    if (isModalVisible && !editingTeam) {
      // 创建模式：确保表单字段存在
      const currentValues = form.getFieldsValue();
      if (!currentValues.team_name) {
        form.setFields([{
          name: 'team_name',
          value: '',
        }]);
      }
      if (!currentValues.description) {
        form.setFields([{
          name: 'description',
          value: '',
        }]);
      }
      // team_manager_id 可以是 null，不需要初始化
    }
  }, [isModalVisible, editingTeam, form]);

  const handleCreate = useCallback(() => {
    setEditingTeam(null);
    form.resetFields();
    // 显式设置初始值
    form.setFields([
      { name: 'team_name', value: '' },
      { name: 'description', value: '' },
      { name: 'team_manager_id', value: null },
    ]);
    setCurrentStep(0);
    setSelectedNewMembers([]);
    setQuickCreateMode(false);
    setIsModalVisible(true);
  }, [form]);

  const handleEdit = useCallback(async (record: Team) => {
    setEditingTeam(record);
    form.setFieldsValue({
      team_name: record.team_name,
      team_manager_id: record.team_manager_id,
      description: record.description
    });
    await fetchTeamMembers(record.id);
    setCurrentStep(0);
    setIsModalVisible(true);
  }, [form, fetchTeamMembers]);

  const handleDelete = useCallback((id: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个团队吗？删除后不可恢复。',
      icon: <DeleteOutlined />,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await teamApi.deleteTeam(id);
          message.success('删除成功');
          fetchData();
        } catch (error) {
          message.error('删除失败');
        }
      }
    });
  }, [fetchData]);

  const handleAddMultipleMembers = useCallback((userIds: number[], roles: string[]) => {
    const newMembers = userIds.map((userId, index) => ({
      user_id: userId,
      role: roles[index] || 'technical_evaluator'
    }));
    setSelectedNewMembers(prev => [...prev, ...newMembers]);
    message.success(`已选择 ${userIds.length} 个成员`);
  }, []);

  const handleRemoveMember = useCallback(async (userId: number) => {
    if (!editingTeam) return;
    
    Modal.confirm({
      title: '确认移除',
      content: '确定要将此成员从团队中移除吗？',
      icon: <MinusCircleOutlined />,
      okText: '确认移除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setRemovingMemberId(userId);
        try {
          await teamApi.removeMember(editingTeam.id, userId);
          message.success('移除成功');
          await fetchTeamMembers(editingTeam.id);
        } catch (error) {
          message.error('移除失败');
        } finally {
          setRemovingMemberId(null);
        }
      }
    });
  }, [editingTeam, fetchTeamMembers]);

  const handleFormSubmit = useCallback(async () => {
    try {
      setSubmitting(true);
      
      // 关键修复：直接获取所有表单字段值，不依赖 validateFields
      const team_name = form.getFieldValue('team_name');
      const team_manager_id = form.getFieldValue('team_manager_id');
      const description = form.getFieldValue('description');
      
      // 调试日志：打印表单值和提交数据
      console.log('[TeamManagement] Form values (direct get):');
      console.log('  team_name:', team_name);
      console.log('  team_manager_id:', team_manager_id);
      console.log('  description:', description);
      console.log('[TeamManagement] selectedNewMembers:', selectedNewMembers);
      console.log('[TeamManagement] currentStep:', currentStep);
      console.log('[TeamManagement] editingTeam:', editingTeam);
      
      if (editingTeam) {
        const updateData: any = {};
        if (team_name) updateData.team_name = team_name;
        if (description !== undefined) updateData.description = description;
        if (team_manager_id !== undefined) updateData.team_manager_id = team_manager_id;
        
        console.log('[TeamManagement] Update data:', updateData);
        await teamApi.updateTeam(editingTeam.id, updateData);
        message.success('团队信息更新成功');
      } else {
        // 创建模式：确保必填字段存在
        if (!team_name || team_name.trim() === '') {
          message.error('请输入团队名称');
          setSubmitting(false);
          return;
        }
        
        const createData: any = {
          team_name: team_name.trim(),
          description: description || '',
        };
        
        // 如果设置了负责人，添加到请求中
        if (team_manager_id !== undefined && team_manager_id !== null) {
          createData.team_manager_id = team_manager_id;
        }
        
        // 添加成员列表
        if (selectedNewMembers.length > 0) {
          createData.members = selectedNewMembers;
        }
        
        console.log('[TeamManagement] Final Create data:', JSON.stringify(createData, null, 2));
        await teamApi.createTeam(createData);
        message.success('团队创建成功！');
      }
      
      setIsModalVisible(false);
      fetchData();
    } catch (error: any) {
      console.error('[TeamManagement] Submit error:', error);
      const errorMessage = error.response?.data?.detail;
      if (typeof errorMessage === 'string') {
        message.error(errorMessage);
      } else if (errorMessage && typeof errorMessage === 'object') {
        message.error('操作失败，请稍后重试');
      } else {
        message.error('操作失败');
      }
    } finally {
      setSubmitting(false);
    }
  }, [form, editingTeam, selectedNewMembers, fetchData, currentStep]);

  const getAvailableUsers = useMemo(() => {
    if (editingTeam) {
      const memberIds = (teamMembers[editingTeam.id] || []).map((m: any) => m.user_id);
      return users.filter((u: User) => 
        !memberIds.includes(u.id) && 
        ['technical_evaluator', 'business_evaluator'].includes(u.role)
      );
    } else {
      const managerId = form.getFieldValue('team_manager_id');
      const selectedIds = selectedNewMembers.map(m => m.user_id);
      return users.filter((u: User) => 
        ['technical_evaluator', 'business_evaluator'].includes(u.role) &&
        !selectedIds.includes(u.id) &&
        u.id !== managerId
      );
    }
  }, [editingTeam, teamMembers, users, selectedNewMembers, form]);

  const currentMembers = editingTeam ? (teamMembers[editingTeam.id] || []) : [];
  const availableUsers = getAvailableUsers;

  // 自定义步骤条渲染
  const renderCustomSteps = () => {
    const steps = [
      { title: '团队信息', icon: <InfoCircleOutlined />, key: 'info' },
      { title: '成员管理', icon: <UserOutlined />, key: 'members' }
    ];

    return (
      <div className="custom-steps-modern">
        {steps.map((step, index) => {
          const isCompleted = currentStep > index;
          const isCurrent = currentStep === index;
          const isLast = index === steps.length - 1;

          return (
            <React.Fragment key={step.key}>
              <div className={`step-item-modern ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}`}>
                <div className="step-indicator-modern">
                  <div className="step-icon-wrapper-modern">
                    {isCompleted ? <CheckCircleOutlined /> : step.icon}
                  </div>
                  {isCurrent && <div className="step-glow"></div>}
                </div>
                <span className={`step-title-modern ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}`}>
                  {step.title}
                </span>
              </div>
              {!isLast && <div className="step-connector-modern"></div>}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  // 步骤内容渲染
  const renderStepContent = () => {
    if (editingTeam) {
      // 编辑模式：支持修改基本信息和成员管理
      return (
        <div className="step-content-modern">
          {/* 第一步：基本信息 */}
          <div className="step-content-modern">
            <Form form={form} layout="vertical">
              <div className="form-section-modern">
                <div className="form-section-header-modern">
                  <InfoCircleOutlined className="section-icon-modern" />
                  <span>基本信息</span>
                  <div className="section-decoration"></div>
                </div>
                <div className="form-items-modern">
                  <Form.Item
                    name="team_name"
                    label={
                      <label className="form-label-modern">
                        <TeamOutlined className="label-icon" />
                        团队名称
                        <span className="required-mark">*</span>
                      </label>
                    }
                    rules={[
                      { required: true, message: '请输入团队名称' },
                      { max: 50, message: '团队名称不能超过 50 个字符' }
                    ]}
                  >
                    <Input 
                      placeholder="例如：技术评审团队 1" 
                      size="large"
                      autoComplete="off"
                      className="modern-input"
                    />
                  </Form.Item>

                  <Form.Item
                    name="team_manager_id"
                    label={
                      <label className="form-label-modern">
                        <UserOutlined className="label-icon" />
                        团队负责人
                        <span className="optional-mark">(可选)</span>
                      </label>
                    }
                  >
                    <ManagerSelection
                      availableManagers={users.filter(u => u.role === 'team_manager')}
                      selectedManagerId={form.getFieldValue('team_manager_id')}
                      onSelectManager={(managerId) => {
                        form.setFields([{
                          name: 'team_manager_id',
                          value: managerId,
                        }]);
                        form.setFieldsValue({ team_manager_id: managerId });
                      }}
                    />
                  </Form.Item>

                  <Form.Item 
                    name="description" 
                    label={
                      <label className="form-label-modern">
                        <BookOutlined className="label-icon" />
                        团队描述
                      </label>
                    }
                  >
                    <TextArea 
                      rows={3} 
                      placeholder="简要描述团队的职责和目标（选填）" 
                      showCount
                      maxLength={200}
                      size="large"
                      style={{ resize: 'none' }}
                      className="modern-textarea"
                    />
                  </Form.Item>
                </div>
              </div>
            </Form>
          </div>

          {/* 第二步：成员管理 */}
          <div className="modern-divider"></div>
          <div className="members-section-modern">
            <div className="section-header-modern">
              <div className="section-title-modern">
                <TeamOutlined className="section-icon-modern" />
                <span>团队成员</span>
              </div>
              <Tag color="blue" className="member-count-tag">{currentMembers.length} 人</Tag>
            </div>
            <div className="members-grid-modern">
              {currentMembers.length > 0 ? (
                currentMembers.map((member) => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    isManager={editingTeam.team_manager_id === member.user_id}
                    onRemove={handleRemoveMember}
                    removing={removingMemberId === member.user_id}
                    showRemoveButton={true}
                  />
                ))
              ) : (
                <Empty 
                  image={<UserOutlined />} 
                  description="暂无团队成员，请添加成员" 
                  className="empty-members-modern"
                />
              )}
            </div>
          </div>
          <Divider className="modern-divider" />
          <AddMemberSection
            availableUsers={availableUsers}
            onAddMultiple={handleAddMultipleMembers}
            selectedUserIds={[]}
          />
        </div>
      );
    }

    // 创建模式：根据步骤显示不同内容
    switch (currentStep) {
      case 0: // 团队信息
        return (
          <div className="step-content-modern">
            <Form form={form} layout="vertical">
              <div className="form-section-modern">
                <div className="form-section-header-modern">
                  <InfoCircleOutlined className="section-icon-modern" />
                  <span>基本信息</span>
                  <div className="section-decoration"></div>
                </div>
                <div className="form-items-modern">
                  <Form.Item
                    name="team_name"
                    label={
                      <label className="form-label-modern">
                        <TeamOutlined className="label-icon" />
                        团队名称
                        <span className="required-mark">*</span>
                      </label>
                    }
                    rules={[
                      { required: true, message: '请输入团队名称' },
                      { max: 50, message: '团队名称不能超过 50 个字符' }
                    ]}
                  >
                    <Input 
                      placeholder="例如：技术评审团队 1" 
                      size="large"
                      autoComplete="off"
                      className="modern-input"
                    />
                  </Form.Item>

                  <Form.Item
                    name="team_manager_id"
                    label={
                      <label className="form-label-modern">
                        <UserOutlined className="label-icon" />
                        团队负责人
                        <span className="optional-mark">(可选)</span>
                      </label>
                    }
                    rules={[
                      { 
                        validator: (_, value) => {
                          // 允许 null 值（可选）
                          return Promise.resolve();
                        }
                      }
                    ]}
                  >
                    <ManagerSelection
                      availableManagers={users.filter(u => u.role === 'team_manager')}
                      selectedManagerId={form.getFieldValue('team_manager_id')}
                      onSelectManager={(managerId) => {
                        // 使用 setFields 来设置值并触发表单变更
                        form.setFields([{
                          name: 'team_manager_id',
                          value: managerId,
                        }]);
                        // 同时更新表单值（双重保障）
                        form.setFieldsValue({ team_manager_id: managerId });
                        console.log('[TeamManagement] Manager selected:', managerId);
                        console.log('[TeamManagement] Form field value after set:', form.getFieldValue('team_manager_id'));
                      }}
                    />
                  </Form.Item>

                  <Form.Item 
                    name="description" 
                    label={
                      <label className="form-label-modern">
                        <BookOutlined className="label-icon" />
                        团队描述
                      </label>
                    }
                  >
                    <TextArea 
                      rows={3} 
                      placeholder="简要描述团队的职责和目标（选填）" 
                      showCount
                      maxLength={200}
                      size="large"
                      style={{ resize: 'none' }}
                      className="modern-textarea"
                    />
                  </Form.Item>
                </div>
              </div>
            </Form>
          </div>
        );

      case 1: // 成员管理
        return (
          <div className="step-content-modern">
            {/* 已选成员预览 */}
            {!quickCreateMode && selectedNewMembers.length > 0 && (
              <div className="selected-members-preview-modern">
                <div className="preview-header-modern">
                  <span>已选成员</span>
                  <Tag color="green" className="preview-count-tag">{selectedNewMembers.length}</Tag>
                </div>
                <div className="preview-grid-modern">
                  {selectedNewMembers.map((member, index) => {
                    const user = users.find(u => u.id === member.user_id);
                    return (
                      <div key={index} className="preview-item-modern">
                        <Avatar size={36} icon={<UserOutlined />} className="preview-avatar" />
                        <div className="preview-info-modern">
                          <div className="preview-name-modern">{user?.real_name || '未知用户'}</div>
                          <Tag size="small" color={getRoleColor(member.role)} className="preview-role-tag">
                            {getRoleName(member.role)}
                          </Tag>
                        </div>
                        <Button 
                          type="text" 
                          danger 
                          size="small"
                          icon={<MinusCircleOutlined />}
                          onClick={() => setSelectedNewMembers(prev => prev.filter((_, i) => i !== index))}
                          className="preview-remove-btn"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            <AddMemberSection
              availableUsers={availableUsers}
              onAddMultiple={handleAddMultipleMembers}
              selectedUserIds={selectedNewMembers.map(m => m.user_id)}
              showQuickMode={quickCreateMode}
            />
          </div>
        );

      default:
        return null;
    }
  };

  // 列表页表格列 - 简洁设计
  const columns = useMemo(() => [
    {
      title: '团队名称',
      dataIndex: 'team_name',
      key: 'team_name',
      width: 220,
      render: (name: string) => <span className="team-name-cell-modern">{name}</span>
    },
    {
      title: '负责人',
      dataIndex: 'manager_name',
      key: 'manager_name',
      width: 140,
      render: (name: string | null) => (
        <span className="manager-cell-modern">
          {name || <span className="text-muted">未设置</span>}
        </span>
      )
    },
    {
      title: '成员数',
      dataIndex: 'member_count',
      key: 'member_count',
      width: 100,
      align: 'center' as const,
      render: (count: number) => (
        <span className="member-count-cell-modern">{count} 人</span>
      )
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      width: 280,
      render: (desc: string) => (
        <span className="description-cell-modern">
          {desc || <span className="text-muted">暂无描述</span>}
        </span>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      fixed: 'right' as const,
      render: (_: any, record: Team) => (
        <Space size="middle">
          <Button size="small" onClick={() => handleEdit(record)} icon={<EditOutlined />}>编辑</Button>
          <Button size="small" danger onClick={() => handleDelete(record.id)} icon={<DeleteOutlined />}>删除</Button>
        </Space>
      )
    }
  ], [handleEdit, handleDelete]);

  return (
    <AppSidebar pageTitle="团队管理" userRole={user?.role} userId={user?.id}>
      {/* 列表页卡片 - 朴素简洁设计 */}
      <Card className="team-list-card-modern">
        <div className="list-page-header-modern">
          <div className="list-header-info-modern">
            <Title level={3} className="list-page-title-modern">
              <TeamOutlined className="page-title-icon" />
              团队管理
            </Title>
            <Text className="list-page-subtitle-modern">创建和管理您的团队</Text>
          </div>
          <Button type="primary" onClick={handleCreate} size="large" icon={<PlusOutlined />} className="create-btn-modern">
            新建团队
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={teams}
          rowKey="id"
          loading={loading}
          pagination={{ 
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`
          }}
          className="team-list-table-modern"
        />
      </Card>

      {/* 弹窗 - 现代化玻璃态设计 */}
      <Modal
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
        width={900}
        className="modern-modal"
        closeIcon={null}
      >
        <div className="modal-wrapper-modern">
          {/* 弹窗头部 */}
          <div className="modal-header-modern">
            <div className="header-background-glow"></div>
            <div className="modal-title-modern">
              <div className="title-icon-wrapper-modern">
                <TeamOutlined />
                <div className="icon-ring"></div>
              </div>
              <div className="title-text-modern">
                <h2>
                  <span className="gradient-text">
                    {editingTeam ? '编辑团队' : '新建团队'}
                  </span>
                </h2>
                <p>{editingTeam ? '修改团队信息' : '创建新的团队'}</p>
              </div>
            </div>
            <Button 
              type="text" 
              icon={<CloseCircleOutlined />} 
              onClick={() => setIsModalVisible(false)}
              className="close-btn-modern"
            />
          </div>

          {/* 自定义步骤指示器（仅创建模式） */}
          {!editingTeam && (
            <div className="modal-steps-modern">
              {renderCustomSteps()}
            </div>
          )}

          {/* 弹窗内容 */}
          <div className="modal-content-modern">
            {renderStepContent()}
          </div>

          {/* 弹窗底部 */}
          <div className="modal-footer-modern">
            <div className="footer-decoration"></div>
            {!editingTeam && currentStep > 0 && (
              <Button 
                onClick={() => setCurrentStep(currentStep - 1)}
                icon={<CloseCircleOutlined />}
                className="footer-btn-secondary"
              >
                上一步
              </Button>
            )}
            <Button onClick={() => setIsModalVisible(false)} className="footer-btn-cancel">
              取消
            </Button>
            {!editingTeam && currentStep === 0 && (
              <Button 
                type="primary" 
                onClick={async () => {
                  try {
                    await form.validateFields();
                    setCurrentStep(1);
                  } catch (error) {
                    // 验证失败，Ant Design 会自动显示错误提示
                    console.log('Form validation failed:', error);
                  }
                }}
                icon={<PlusCircleOutlined />}
                className="footer-btn-primary"
              >
                下一步
              </Button>
            )}
            {!editingTeam && currentStep === 1 && (
              <Button 
                type="primary" 
                onClick={handleFormSubmit}
                loading={submitting}
                icon={<RocketOutlined />}
                className="footer-btn-primary"
              >
                {submitting ? '创建中...' : '完成创建'}
              </Button>
            )}
            {editingTeam && (
              <Button 
                type="primary" 
                onClick={handleFormSubmit}
                loading={submitting}
                icon={<CheckCircleOutlined />}
                className="footer-btn-primary"
              >
                {submitting ? '保存中...' : '保存更改'}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </AppSidebar>
  );
};

export default TeamManagement;
