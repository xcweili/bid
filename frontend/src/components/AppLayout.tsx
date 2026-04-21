import React from 'react';
import { Layout, Menu, Button, Badge, theme } from 'antd';
import {
  HomeOutlined,
  FileTextOutlined,
  SettingOutlined,
  DashboardOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import './Layout.css';

const { Header, Sider, Content } = Layout;

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = React.useState(false);
  const [user, setUser] = React.useState<any>(null);
  const {
    token: { colorBgContainer, colorBgElevated },
  } = theme.useToken();

  React.useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  // 统一菜单项 - 根据角色权限控制显示
  const allMenuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '仪表盘',
      roles: ['admin', 'team_leader', 'team_manager', 'technical_evaluator', 'business_evaluator'],
    },
    {
      key: '/projects',
      icon: <FileTextOutlined />,
      label: '项目管理',
      roles: ['admin'],
    },
    {
      key: '/teams',
      icon: <UserOutlined />,
      label: '团队管理',
      roles: ['admin', 'team_leader'],
    },
    {
      key: '/users',
      icon: <UserOutlined />,
      label: '人员管理',
      roles: ['admin'],
    },
    {
      key: '/my-tasks',
      icon: <FileTextOutlined />,
      label: '我的任务',
      roles: ['admin', 'team_leader', 'team_manager', 'technical_evaluator', 'business_evaluator'],
    },
    {
      key: '/rule-templates',
      icon: <SettingOutlined />,
      label: '规则模板',
      roles: ['admin', 'team_leader', 'team_manager', 'technical_evaluator', 'business_evaluator'],
    },
  ];

  // 根据用户角色过滤菜单项
  const menuItems = allMenuItems.filter(item =>
    !user || item.roles.includes(user.role)
  );

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  return (
    <Layout>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        className="app-sider"
        width={220}
        collapsedWidth={80}
      >
        <div className="logo">
          <div className="logo-icon">📋</div>
          {!collapsed && <span className="logo-text">投标评审平台</span>}
        </div>
        
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          className="app-menu"
        />
        
        <div className="sider-footer">
          <Button
            type="text"
            icon={<UserOutlined />}
            className="sider-btn"
            title="用户中心"
          >
            {!collapsed && '用户中心'}
          </Button>
          <Button
            type="text"
            icon={<LogoutOutlined />}
            className="sider-btn"
            title="退出登录"
          >
            {!collapsed && '退出'}
          </Button>
        </div>
      </Sider>
      
      <Layout>
        <Header
          style={{
            padding: '0 24px',
            background: colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{
              fontSize: '16px',
              width: 64,
              height: 64,
            }}
          />
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Badge count={3} size="small">
              <Button type="text" icon={<DashboardOutlined />}>
                通知
              </Button>
            </Badge>
            <div className="user-info">
              <UserOutlined />
              {!collapsed && <span style={{ marginLeft: 8 }}>管理员</span>}
            </div>
          </div>
        </Header>
        
        <Content
          className="app-content-scroll"
          style={{
            margin: '24px 16px',
            padding: 24,
            background: colorBgElevated,
            borderRadius: 8,
            overflowY: 'auto',
            overflowX: 'auto',
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
