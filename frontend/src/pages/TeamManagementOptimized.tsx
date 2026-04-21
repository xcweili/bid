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
  Steps,
  Switch,
  Collapse,
  Alert
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
  DesktopOutlined
} from '@ant-design/icons';
import { teamApi } from '../services/projectApi.ts';
import AppSidebar from '../components/AppSidebar';
import { ManagerSelection } from '../components/ManagerSelection';
import './TeamManagementOptimized.css';

const { Title, Text, Link } = Typography;
const { TextArea } = Input;
const { Option } = Select;
const { Panel } = Collapse;

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

// 改进的成员卡片 - 更好的视觉层次和触摸目标
const MemberCard: React.FC<MemberCardProps> = memo(({ member, isManager, onRemove, removing }) => {
  return (
    <div className="member-card-optimized">
      <div className="member-card-header-optimized">
        <div className="member-avatar-wrapper-optimized">
          <Avatar 
            size={56}
            icon={<UserOutlined />}
            className={isManager ? 'avatar-manager-optimized' : 'avatar-member-optimized'}
          />
          {isManager && (
            <span className="manager-badge-optimized">
              <TeamOutlined /> 负责人
            </span>
          )}
        </div>
        <div className="member-info-optimized">
          <div className="member-name-optimized">
            {member.user?.real_name || '未知用户'}
          </div>
          <Tag className="role-tag-optimized" color={getRoleColor(member.user?.role || '')}>
            {getRoleName(member.user?.role || '')}
          </Tag>
          <Text type="secondary" className="member-id-optimized">
            ID: {member.user_id}
          </Text>
        </div>
      </div>
      <div className="member-card-footer-optimized">
        <Button
          className="remove-btn-optimized"
          danger
          size="middle"
          icon={removing ? <LoadingOutlined /> : <MinusCircleOutlined />}
          onClick={() => onRemove(member.user_id)}
          disabled={removing}
        >
          移除成员
        </Button>
      </div>
    </div>
  );
});

MemberCard.displayName = 'MemberCard';

// 改进的添加成员区域 - 更好的引导和交互
const AddMemberSection: React.FC<{
  availableUsers: User[];
  onAddMultiple: (userIds: number[], roles: string[]) => void;
  selectedUserIds: number[];
  showQuickMode?: boolean;
}> = memo(({ availableUsers, onAddMultiple, selectedUserIds, showQuickMode = false }) => {
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [showTips, setShowTips] = useState(true);

  const filteredUsers = useMemo(() => {
    return availableUsers.filter(user => {
      const matchesSearch = 
        user.real_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.username.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = filterRole === 'all' || user.role === filterRole;
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
    }
  }, [selectedUsers, onAddMultiple]);

  const handleQuickAdd = useCallback((userId: number) => {
    if (!selectedUsers.includes(userId)) {
      setSelectedUsers(prev => [...prev, userId]);
    }
  }, [selectedUsers]);

  const handleQuickRemove = useCallback((userId: number) => {
    setSelectedUsers(prev => prev.filter(id => id !== userId));
  }, []);

  const handleAddAll = useCallback(() => {
    const allIds = filteredUsers.map(u => u.id);
    if (allIds.length > 0) {
      setSelectedUsers(prev => [...prev, ...allIds]);
    }
  }, [filteredUsers]);

  const handleClearAll = useCallback(() => {
    setSelectedUsers([]);
  }, []);

  return (
    <div className="add-member-section-optimized">
      {/* 引导提示 */}
      {showTips && (
        <Alert
          message="快速添加成员"
          description="点击用户卡片进行选择，选择完成后点击确认添加即可。支持批量选择！"
          type="info"
          showIcon
          icon={<BookOutlined />}
          closable
          onClose={() => setShowTips(false)}
          className="guide-alert"
        />
      )}

      <div className="add-member-header-optimized">
        <div className="header-title-optimized">
          <div className="header-icon-wrapper">
            <UsergroupAddOutlined />
          </div>
          <div>
            <div className="header-title-text">添加成员</div>
            <div className="header-subtitle-text">选择要添加到团队的用户</div>
          </div>
        </div>
        <div className="header-stats">
          <Tag color="blue" className="stats-tag">
            可用：{availableUsers.length}
          </Tag>
          {selectedUsers.length > 0 && (
            <Tag color="green" className="stats-tag">
              已选：{selectedUsers.length}
            </Tag>
          )}
        </div>
      </div>

      {/* 搜索和过滤 */}
      <div className="search-bar-optimized">
        <Input.Search
          placeholder="搜索成员姓名或用户名..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          prefix={<SearchOutlined />}
          allowClear
          className="search-input-optimized"
          size="large"
        />
        <Select
          value={filterRole}
          onChange={setFilterRole}
          className="role-filter-optimized"
          dropdownMatchSelectWidth={false}
          size="large"
        >
          <Option value="all">全部角色</Option>
          <Option value="technical_evaluator">
            <Space>
              <Tag color="purple" style={{ margin: 0 }}>技术专家</Tag>
            </Space>
          </Option>
          <Option value="business_evaluator">
            <Space>
              <Tag color="volcano" style={{ margin: 0 }}>商务专家</Tag>
            </Space>
          </Option>
        </Select>
      </div>

      {/* 快捷操作 */}
      {filteredUsers.length > 0 && (
        <div className="quick-actions-optimized">
          <Button size="middle" onClick={handleAddAll} icon={<PlusCircleOutlined />}>
            全选当前 ({filteredUsers.length})
          </Button>
          {selectedUsers.length > 0 && (
            <Button 
              size="middle" 
              danger 
              onClick={handleClearAll}
              icon={<CloseCircleOutlined />}
            >
              取消选择
            </Button>
          )}
        </div>
      )}

      {/* 用户网格 */}
      <div className="user-grid-optimized">
        {filteredUsers.length > 0 ? (
          filteredUsers.map(user => {
            const isSelected = selectedUsers.includes(user.id);
            return (
              <div 
                key={user.id} 
                className={`user-card-optimized ${isSelected ? 'selected' : ''}`}
                onClick={() => isSelected ? handleQuickRemove(user.id) : handleQuickAdd(user.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    isSelected ? handleQuickRemove(user.id) : handleQuickAdd(user.id);
                  }
                }}
              >
                <div className="user-checkbox-optimized">
                  {isSelected && <CheckCircleOutlined className="check-icon-optimized" />}
                </div>
                <Avatar 
                  size={48} 
                  icon={<UserOutlined />} 
                  className="user-avatar-optimized"
                />
                <div className="user-info-optimized">
                  <div className="user-name-optimized">{user.real_name}</div>
                  <div className="user-handle-optimized">@{user.username}</div>
                  <Tag size="small" color={getRoleColor(user.role)}>
                    {getRoleName(user.role)}
                  </Tag>
                </div>
              </div>
            );
          })
        ) : (
          <Empty 
            image={<UserOutlined />} 
            description={searchTerm ? '没有找到匹配的用户' : '暂无可用成员'} 
            className="empty-users-optimized" 
          />
        )}
      </div>

      {/* 已选人员底部 */}
      {selectedUsers.length > 0 && (
        <div className="selected-footer-optimized">
          <div className="selected-info-optimized">
            <div className="success-icon-wrapper">
              <CheckCircleOutlined className="success-icon-optimized" />
            </div>
            <div className="selected-text">
              <div className="selected-count">已选择 {selectedUsers.length} 人</div>
              <div className="selected-hint">点击确认添加将他们加入团队</div>
            </div>
          </div>
          <div className="selected-tags-optimized">
            {selectedUsers.slice(0, 5).map(userId => {
              const user = availableUsers.find(u => u.id === userId);
              return user ? (
                <Tag 
                  key={userId} 
                  closable 
                  onClose={() => handleQuickRemove(userId)}
                  className="selected-user-tag"
                >
                  {user.real_name}
                </Tag>
              ) : null;
            })}
            {selectedUsers.length > 5 && (
              <Tag className="more-tag">+{selectedUsers.length - 5} 人</Tag>
            )}
          </div>
          <Button 
            type="primary" 
            onClick={handleAddMultiple}
            size="large"
            icon={<RocketOutlined />}
            className="confirm-add-btn"
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

const TeamManagementOptimized: React.FC = () => {
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

  const handleCreate = useCallback(() => {
    setEditingTeam(null);
    form.resetFields();
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
      const values = await form.validateFields();
      
      if (editingTeam) {
        const updateData: any = {};
        if (values.team_name) updateData.team_name = values.team_name;
        if (values.description !== undefined) updateData.description = values.description;
        if (values.team_manager_id !== undefined) updateData.team_manager_id = values.team_manager_id;
        
        await teamApi.updateTeam(editingTeam.id, updateData);
        message.success('团队信息更新成功');
      } else {
        const createData: any = {
          team_name: values.team_name,
          description: values.description,
        };
        
        if (values.team_manager_id) {
          createData.team_manager_id = values.team_manager_id;
        }
        
        if (selectedNewMembers.length > 0) {
          createData.members = selectedNewMembers;
        }
        
        await teamApi.createTeam(createData);
        message.success('团队创建成功！');
      }
      
      setIsModalVisible(false);
      fetchData();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '操作失败');
    } finally {
      setSubmitting(false);
    }
  }, [form, editingTeam, selectedNewMembers, fetchData]);

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

  // 步骤内容渲染
  const renderStepContent = () => {
    if (editingTeam) {
      // 编辑模式：只显示成员管理
      return (
        <div className="step-content">
          <div className="members-section-optimized">
            <div className="section-header">
              <div className="section-title">
                <TeamOutlined className="section-icon" />
                <span>团队成员</span>
              </div>
              <Tag color="blue">{currentMembers.length} 人</Tag>
            </div>
            <div className="members-grid-optimized">
              {currentMembers.length > 0 ? (
                currentMembers.map((member) => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    isManager={editingTeam.team_manager_id === member.user_id}
                    onRemove={handleRemoveMember}
                    removing={removingMemberId === member.user_id}
                  />
                ))
              ) : (
                <Empty 
                  image={<UserOutlined />} 
                  description="暂无团队成员，请添加成员" 
                  className="empty-members"
                />
              )}
            </div>
          </div>
          <Divider />
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
          <div className="step-content">
            <Form form={form} layout="vertical">
              <div className="form-section">
                <div className="form-section-header">
                  <InfoCircleOutlined className="section-icon" />
                  <span>基本信息</span>
                </div>
                <div className="form-items">
                  <Form.Item
                    name="team_name"
                    label="团队名称"
                    rules={[
                      { required: true, message: '请输入团队名称' },
                      { max: 50, message: '团队名称不能超过 50 个字符' }
                    ]}
                    required
                  >
                    <Input 
                      placeholder="例如：技术评审团队 1" 
                      prefix={<TeamOutlined />}
                      autoComplete="off"
                    />
                  </Form.Item>

                  <Form.Item
                    name="team_manager_id"
                    label={
                      <>
                        团队负责人
                        <span className="optional-mark">(可选)</span>
                      </>
                    }
                  >
                    <ManagerSelection
                      availableManagers={users.filter(u => u.role === 'team_manager')}
                      selectedManagerId={form.getFieldValue('team_manager_id')}
                      onSelectManager={(managerId) => {
                        form.setFieldsValue({ team_manager_id: managerId });
                      }}
                    />
                  </Form.Item>

                  <Form.Item 
                    name="description" 
                    label="团队描述"
                  >
                    <TextArea 
                      rows={3} 
                      placeholder="简要描述团队的职责和目标（选填）" 
                      showCount
                      maxLength={200}
                      style={{ resize: 'none' }}
                    />
                  </Form.Item>
                </div>
              </div>
            </Form>
          </div>
        );

      case 1: // 成员管理
        return (
          <div className="step-content">
            {/* 已选成员预览 */}
            {!quickCreateMode && selectedNewMembers.length > 0 && (
              <div className="selected-members-preview">
                <div className="preview-header">
                  <span>已选成员</span>
                  <Tag color="green">{selectedNewMembers.length}</Tag>
                </div>
                <div className="preview-grid">
                  {selectedNewMembers.map((member, index) => {
                    const user = users.find(u => u.id === member.user_id);
                    return (
                      <div key={index} className="preview-item">
                        <Avatar size={36} icon={<UserOutlined />} />
                        <div className="preview-info">
                          <div className="preview-name">{user?.real_name || '未知用户'}</div>
                          <Tag size="small" color={getRoleColor(member.role)}>
                            {getRoleName(member.role)}
                          </Tag>
                        </div>
                        <Button 
                          type="text" 
                          danger 
                          size="small"
                          icon={<MinusCircleOutlined />}
                          onClick={() => setSelectedNewMembers(prev => prev.filter((_, i) => i !== index))}
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

  const columns = useMemo(() => [
    {
      title: '团队名称',
      dataIndex: 'team_name',
      key: 'team_name',
      width: 200,
      render: (name: string) => <Text strong>{name}</Text>
    },
    {
      title: '团队负责人',
      dataIndex: 'manager_name',
      key: 'manager_name',
      width: 150,
      render: (name: string | null) => (
        <Space>
          <Avatar icon={<UserOutlined />} style={{ background: '#1890ff' }} />
          <span>{name || <Text type="secondary">未设置</Text>}</span>
        </Space>
      )
    },
    {
      title: '成员数',
      dataIndex: 'member_count',
      key: 'member_count',
      width: 100,
      align: 'center' as const,
      render: (count: number) => (
        <Badge count={count} style={{ backgroundColor: '#1890ff' }} />
      )
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      width: 300,
      render: (desc: string) => (
        <Text ellipsis style={{ maxWidth: 250 }}>
          {desc || <Text type="secondary">暂无描述</Text>}
        </Text>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: Team) => (
        <Space>
          <Button size="small" onClick={() => handleEdit(record)}>编辑</Button>
          <Button size="small" danger onClick={() => handleDelete(record.id)}>删除</Button>
        </Space>
      )
    }
  ], [handleEdit, handleDelete]);

  return (
    <AppSidebar pageTitle="团队管理" userRole={user?.role} userId={user?.id}>
      <Card className="team-card-optimized">
        <div className="page-header-optimized">
          <div className="header-info-optimized">
            <Title level={3} className="page-title-optimized">团队管理</Title>
            <Text className="page-subtitle-optimized">创建和管理您的团队</Text>
          </div>
          <Button type="primary" onClick={handleCreate} size="large" icon={<PlusOutlined />}>
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
        />
      </Card>

      {/* 优化后的弹窗 */}
      <Modal
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
        width={850}
        className="optimized-modal"
        destroyOnClose
      >
        <div className="modal-wrapper-optimized">
          {/* 弹窗头部 */}
          <div className="modal-header-optimized">
            <div className="modal-title-optimized">
              <div className="title-icon-optimized">
                <TeamOutlined />
              </div>
              <div className="title-text-optimized">
                <h2>{editingTeam ? '编辑团队' : '新建团队'}</h2>
                <p>{editingTeam ? '修改团队信息' : '创建新的团队，可一步完成'}</p>
              </div>
            </div>
            <Button 
              type="text" 
              icon={<CloseCircleOutlined />} 
              onClick={() => setIsModalVisible(false)}
              className="close-btn-optimized"
              size="large"
            />
          </div>

          {/* 步骤指示器（仅创建模式） */}
          {!editingTeam && (
            <div className="modal-steps">
              <Steps
                current={currentStep}
                items={[
                  {
                    title: '团队信息',
                    icon: <InfoCircleOutlined />,
                  },
                  {
                    title: '成员管理',
                    icon: <UserOutlined />,
                  },
                ]}
                size="small"
              />
            </div>
          )}

          {/* 快速创建切换（仅新建模式） */}
          {!editingTeam && (
            <div className="quick-create-toggle">
              <MobileOutlined />
              <span>快速创建模式</span>
              <Switch
                checked={quickCreateMode}
                onChange={setQuickCreateMode}
                checkedChildren="开"
                unCheckedChildren="关"
              />
              <Tooltip title="开启后跳过成员选择，创建后再添加">
                <InfoCircleOutlined className="toggle-hint" />
              </Tooltip>
            </div>
          )}

          {/* 弹窗内容 */}
          <div className="modal-content-optimized">
            {renderStepContent()}
          </div>

          {/* 弹窗底部 */}
          <div className="modal-footer-optimized">
            {!editingTeam && currentStep > 0 && (
              <Button 
                onClick={() => setCurrentStep(currentStep - 1)}
                icon={<CloseCircleOutlined />}
              >
                上一步
              </Button>
            )}
            <Button onClick={() => setIsModalVisible(false)}>
              {editingTeam ? '取消' : '取消'}
            </Button>
            {!editingTeam && currentStep === 0 && (
              <Button 
                type="primary" 
                onClick={() => {
                  form.validateFields().then(() => {
                    setCurrentStep(1);
                  });
                }}
                icon={<PlusCircleOutlined />}
                disabled={!form.getFieldValue('team_name')}
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

export default TeamManagementOptimized;
