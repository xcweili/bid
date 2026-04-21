import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Dropdown, Avatar, Space, Typography, Tag } from 'antd';
import {
  ProjectOutlined,
  TeamOutlined,
  FileTextOutlined,
  UserOutlined,
  DashboardOutlined,
  SettingOutlined,
  LogoutOutlined
} from '@ant-design/icons';
import './AppSidebar.css';

const { Sider, Header, Content } = Layout;
const { Title, Text } = Typography;

interface UserInfo {
  id?: number;
  username?: string;
  real_name?: string;
  role: string;
}

interface MenuItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  roles: string[];
}

interface AppSidebarProps {
  pageTitle?: string;
  userRole?: string;
  userId?: number;
  extraActions?: React.ReactNode;
  onLogout?: () => void;
  children?: React.ReactNode;
}

const roleNames: Record<string, string> = {
  admin: '系统管理员',
  team_leader: '评标组长',
  team_manager: '团队负责人',
  technical_evaluator: '技术专家',
  business_evaluator: '商务专家'
};

const roleColors: Record<string, string> = {
  admin: 'red',
  team_leader: 'orange',
  team_manager: 'blue',
  technical_evaluator: 'green',
  business_evaluator: 'purple'
};

// 统一菜单项配置 - 根据角色权限控制显示
const allMenuItems: MenuItem[] = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘', roles: ['admin', 'team_leader', 'team_manager', 'technical_evaluator', 'business_evaluator'] },
  { key: '/projects', icon: <ProjectOutlined />, label: '项目管理', roles: ['admin', 'team_leader'] },
  { key: '/project-types', icon: <SettingOutlined />, label: '项目类型管理', roles: ['admin', 'team_leader'] },
  { key: '/teams', icon: <TeamOutlined />, label: '团队管理', roles: ['admin', 'team_leader', 'team_manager'] },
  { key: '/users', icon: <UserOutlined />, label: '人员管理', roles: ['admin', 'team_leader'] },
  { key: '/my-tasks', icon: <FileTextOutlined />, label: '我的任务', roles: ['admin', 'team_leader', 'team_manager', 'technical_evaluator', 'business_evaluator'] },
  { key: '/rule-templates', icon: <SettingOutlined />, label: '规则模板', roles: ['admin', 'team_leader', 'technical_evaluator', 'business_evaluator'] }
];

// team_manager 角色的菜单配置（3 个入口：仪表盘、团队管理、我的任务）
const teamManagerMenuItems: MenuItem[] = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘', roles: ['team_manager'] },
  { key: '/teams', icon: <TeamOutlined />, label: '团队管理', roles: ['team_manager'] },
  { key: '/my-tasks', icon: <FileTextOutlined />, label: '我的任务', roles: ['team_manager'] }
];

// team_leader 角色的菜单配置（7 个入口，跟 admin 一样，但数据权限不同）
const teamLeaderMenuItems: MenuItem[] = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘', roles: ['team_leader'] },
  { key: '/projects', icon: <ProjectOutlined />, label: '项目管理', roles: ['team_leader'] },
  { key: '/project-types', icon: <SettingOutlined />, label: '项目类型管理', roles: ['team_leader'] },
  { key: '/teams', icon: <TeamOutlined />, label: '团队管理', roles: ['team_leader'] },
  { key: '/users', icon: <UserOutlined />, label: '人员管理', roles: ['team_leader'] },
  { key: '/my-tasks', icon: <FileTextOutlined />, label: '我的任务', roles: ['team_leader'] },
  { key: '/rule-templates', icon: <SettingOutlined />, label: '规则模板', roles: ['team_leader'] }
];

// 专家角色（technical_evaluator, business_evaluator）的菜单配置（只保留两个入口）
const expertMenuItems: MenuItem[] = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘', roles: ['technical_evaluator', 'business_evaluator'] },
  { key: '/my-tasks', icon: <FileTextOutlined />, label: '我的任务', roles: ['technical_evaluator', 'business_evaluator'] }
];

const AppSidebar: React.FC<AppSidebarProps> = ({
  pageTitle = '仪表盘',
  userRole,
  userId,
  extraActions,
  onLogout,
  children
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    } else {
      navigate('/login');
    }
  }, [navigate]);

  const handleMenuClick = (e: { key: string }) => {
    console.log('Menu clicked:', e.key);
    if (e.key === 'logout') {
      handleLogout();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (onLogout) {
      onLogout();
    } else {
      window.location.href = '/login';
    }
  };

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人中心'
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '设置'
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录'
    }
  ];

  const currentRole = userRole || user?.role;

  // 根据角色选择菜单配置
  let menuItems: MenuItem[];
  if (currentRole === 'team_leader') {
    // team_leader: 7 个入口（跟 admin 一样）
    menuItems = teamLeaderMenuItems;
  } else if (currentRole === 'team_manager') {
    // team_manager: 3 个入口
    menuItems = teamManagerMenuItems;
  } else if (currentRole === 'technical_evaluator' || currentRole === 'business_evaluator') {
    // 专家角色：2 个入口
    menuItems = expertMenuItems;
  } else {
    // admin: 完整菜单
    menuItems = allMenuItems.filter(item =>
      !userRole || item.roles.includes(userRole)
    );
  }

  return (
    <Layout className="dashboard-layout">
      <Sider className="dashboard-sider" width={220}>
        <div className="sidebar-header">
          <ProjectOutlined className="sidebar-logo" />
          <Title level={4} className="sidebar-title">评审平台</Title>
        </div>

        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          className="sidebar-menu"
        />

        <div className="sidebar-footer">
          <Text type="secondary">v2.0.0</Text>
        </div>
      </Sider>

      <Layout>
        <Header className="dashboard-header">
          <div className="header-left">
            <Title level={4} className="header-title">{pageTitle}</Title>
            {extraActions && <div className="header-actions">{extraActions}</div>}
          </div>

          <div className="header-right">
            <Dropdown
              menu={{ items: userMenuItems, onClick: handleMenuClick }}
              placement="bottomRight"
              getPopupContainer={(trigger) => document.body}
              overlayStyle={{ zIndex: 1000 }}
            >
              <div className="user-profile">
                <Avatar icon={<UserOutlined />} />
                <Space>
                  <Text strong>{user?.real_name || user?.username || '用户'}</Text>
                  {currentRole && (
                    <Tag color={roleColors[currentRole] || 'default'}>
                      {roleNames[currentRole] || currentRole}
                    </Tag>
                  )}
                </Space>
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content className="dashboard-content">
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppSidebar;
