import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layout,
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
  Row,
  Col
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  UserOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  DollarOutlined,
  FilterOutlined,
  UserAddOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExportOutlined
} from '@ant-design/icons';
import apiClient from '../services/api';
import AppSidebar from '../components/AppSidebar';
import './UserManagement.css';

const { Content } = Layout;
const { Title, Text, Link } = Typography;
const { Option } = Select;
const { Search } = Input;

interface User {
  id: number;
  username: string;
  real_name: string;
  role: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
}

// 角色配置
const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  admin: { label: '系统管理员', color: 'red' },
  team_leader: { label: '评标组长', color: 'orange' },
  team_manager: { label: '团队小组长', color: 'blue' },
  technical_evaluator: { label: '技术专家', color: 'cyan' },
  business_evaluator: { label: '商务专家', color: 'green' }
};

const UserManagement: React.FC = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form] = Form.useForm();
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [searchText, setSearchText] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setCurrentUser(JSON.parse(userData));
    } else {
      navigate('/login');
    }
    fetchUsers();
  }, [navigate]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/users');
      setUsers(response.data);
    } catch (error) {
      message.error('获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter(u => u.is_active).length;
    const adminCount = users.filter(u => u.role === 'admin').length;
    return { total, active, adminCount };
  }, [users]);

  const handleCreate = () => {
    setEditingUser(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record: User) => {
    setEditingUser(record);
    form.setFieldsValue({
      real_name: record.real_name,
      role: record.role,
      phone: record.phone || '',
      email: record.email || ''
    });
    setIsModalVisible(true);
  };

  const handleDelete = (id: number, username: string) => {
    Modal.confirm({
      title: '确认禁用用户',
      content: `确定要禁用用户 "${username}" 吗？禁用后该用户将无法登录系统。`,
      okText: '确认禁用',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await apiClient.put(`/api/users/${id}`, { is_active: false });
          message.success('用户已禁用');
          fetchUsers();
        } catch (error) {
          message.error('操作失败');
        }
      }
    });
  };

  const handleBatchDisable = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要禁用的用户');
      return;
    }

    Modal.confirm({
      title: '确认批量禁用',
      content: `确定要禁用选中的 ${selectedRowKeys.length} 个用户吗？`,
      okText: '确认禁用',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await apiClient.post('/api/users/batch-disable', { user_ids: selectedRowKeys });
          message.success(`已禁用 ${selectedRowKeys.length} 个用户`);
          setSelectedRowKeys([]);
          fetchUsers();
        } catch (error) {
          message.error('操作失败');
        }
      }
    });
  };

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingUser) {
        await apiClient.put(`/api/users/${editingUser.id}`, values);
        message.success('更新成功');
      } else {
        const createValues = {
          ...values,
          username: form.getFieldValue('username'),
          password: form.getFieldValue('password')
        };
        await apiClient.post('/api/users', createValues);
        message.success('创建成功');
      }
      
      setIsModalVisible(false);
      form.resetFields();
      fetchUsers();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '操作失败');
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        !searchText ||
        user.username.toLowerCase().includes(searchText.toLowerCase()) ||
        user.real_name.toLowerCase().includes(searchText.toLowerCase()) ||
        (user.email && user.email.toLowerCase().includes(searchText.toLowerCase())) ||
        (user.phone && user.phone.includes(searchText));
      
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesStatus = statusFilter === 'all' || 
        (statusFilter === 'active' && user.is_active) ||
        (statusFilter === 'inactive' && !user.is_active);
      
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchText, roleFilter, statusFilter]);

  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 150,
      fixed: 'left' as const,
      render: (text: string) => <Text strong>{text}</Text>
    },
    {
      title: '姓名',
      dataIndex: 'real_name',
      key: 'real_name',
      width: 120,
      render: (text: string) => <Text>{text || '-'}</Text>
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 140,
      render: (role: string) => {
        const config = ROLE_CONFIG[role] || { label: role, color: 'default' };
        return <Tag color={config.color}>{config.label}</Tag>;
      }
    },
    {
      title: '电话',
      dataIndex: 'phone',
      key: 'phone',
      width: 140,
      render: (text: string | null) => <Text type="secondary">{text || '-'}</Text>
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 200,
      render: (text: string | null) => <Text type="secondary">{text || '-'}</Text>
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'success' : 'default'}>
          {isActive ? '启用' : '禁用'}
        </Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: User) => (
        <Space size="small">
          <Button 
            size="small" 
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Button 
            size="small" 
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id, record.username)}
            disabled={!record.is_active}
          >
            禁用
          </Button>
        </Space>
      )
    }
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: setSelectedRowKeys
  };

  const handleExport = () => {
    message.info('导出功能开发中...');
  };

  const clearFilters = () => {
    setSearchText('');
    setRoleFilter('all');
    setStatusFilter('all');
  };

  return (
    <AppSidebar pageTitle="人员管理">
      <div className="user-management-container">
        {/* 页面标题 */}
        <div className="page-header">
          <Title level={2} className="page-title">
            人员管理
          </Title>
          <Space>
            {currentUser?.role === 'admin' && (
              <Button 
                type="primary" 
                icon={<UserAddOutlined />}
                onClick={handleCreate}
              >
                新增用户
              </Button>
            )}
            <Button icon={<ExportOutlined />} onClick={handleExport}>
              导出
            </Button>
          </Space>
        </div>

        {/* 筛选栏 */}
        <Card className="filter-card" size="small">
          <Row gutter={16} align="middle">
            <Col xs={24} md={8}>
              <Search
                placeholder="搜索用户名、姓名、邮箱或电话"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onSearch={() => {}}
                allowClear
                enterButton={<SearchOutlined />}
              />
            </Col>
            <Col xs={12} md={4}>
              <Select
                value={roleFilter}
                onChange={setRoleFilter}
                placeholder="角色筛选"
                style={{ width: '100%' }}
              >
                <Option value="all">全部角色</Option>
                {Object.entries(ROLE_CONFIG).map(([value, config]) => (
                  <Option key={value} value={value}>{config.label}</Option>
                ))}
              </Select>
            </Col>
            <Col xs={12} md={4}>
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                placeholder="状态筛选"
                style={{ width: '100%' }}
              >
                <Option value="all">全部状态</Option>
                <Option value="active">启用</Option>
                <Option value="inactive">禁用</Option>
              </Select>
            </Col>
            <Col xs={24} md={8}>
              <Button
                type={selectedRowKeys.length > 0 ? 'primary' : 'default'}
                danger={selectedRowKeys.length > 0}
                icon={<DeleteOutlined />}
                onClick={handleBatchDisable}
                disabled={selectedRowKeys.length === 0}
              >
                {selectedRowKeys.length > 0 ? `批量禁用 (${selectedRowKeys.length})` : '批量禁用'}
              </Button>
            </Col>
          </Row>
        </Card>

        {/* 数据表格 */}
        <Card className="table-card" bordered={false}>
          <div className="table-toolbar">
            <Text type="secondary">
              共 {filteredUsers.length} 条记录
              {(searchText || roleFilter !== 'all' || statusFilter !== 'all') && (
                <Link onClick={clearFilters} style={{ marginLeft: 8 }}>
                  清除筛选
                </Link>
              )}
            </Text>
          </div>

          <Table
            rowSelection={rowSelection}
            columns={columns}
            dataSource={filteredUsers}
            rowKey="id"
            loading={loading}
            pagination={{ 
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} / ${total}`,
              pageSizeOptions: ['10', '20', '50']
            }}
            scroll={{ x: 1000 }}
            bordered
            size="middle"
            locale={{
              emptyText: (
                <div className="empty-state">
                  <UserOutlined className="empty-icon" />
                  <p>暂无用户数据</p>
                </div>
              )
            }}
          />
        </Card>

        {/* 用户表单模态框 */}
        <Modal
          title={editingUser ? '编辑用户' : '新增用户'}
          open={isModalVisible}
          onOk={handleFormSubmit}
          onCancel={() => {
            setIsModalVisible(false);
            form.resetFields();
          }}
          width={550}
          okText={editingUser ? '保存' : '创建'}
          cancelText="取消"
        >
          <Form form={form} layout="vertical">
            {!editingUser && (
              <Form.Item
                name="username"
                label="用户名"
                rules={[
                  { required: true, message: '请输入用户名' },
                  { min: 3, message: '用户名至少 3 个字符' }
                ]}
                extra="用户名用于登录，创建后不可修改"
              >
                <Input placeholder="请输入用户名" maxLength={20} />
              </Form.Item>
            )}
            
            {!editingUser && (
              <Form.Item
                name="password"
                label="密码"
                rules={[
                  { required: true, message: '请输入密码' },
                  { min: 6, message: '密码至少 6 位' }
                ]}
              >
                <Input.Password placeholder="请输入密码" />
              </Form.Item>
            )}
            
            <Form.Item
              name="real_name"
              label="姓名"
              rules={[{ required: true, message: '请输入姓名' }]}
            >
              <Input placeholder="请输入真实姓名" />
            </Form.Item>
            
            <Form.Item
              name="role"
              label="角色"
              rules={[{ required: true, message: '请选择角色' }]}
            >
              <Select placeholder="请选择角色">
                {Object.entries(ROLE_CONFIG).map(([value, config]) => (
                  <Option key={value} value={value}>{config.label}</Option>
                ))}
              </Select>
            </Form.Item>
            
            <Divider style={{ margin: '16px 0' }} />
            
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="phone"
                  label="电话"
                  rules={[{ pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' }]}
                >
                  <Input placeholder="手机号码" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="email"
                  label="邮箱"
                  rules={[{ type: 'email', message: '请输入正确的邮箱' }]}
                >
                  <Input placeholder="邮箱地址" />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Modal>
      </div>
    </AppSidebar>
  );
};

export default UserManagement;
