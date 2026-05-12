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
  MenuUnfoldOutlined,
  ProjectOutlined,
  BarChartOutlined
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
  const {
    token: { colorBgContainer, colorBgElevated },
  } = theme.useToken();

  const menuItems = [
    {
      key: '/projects',
      icon: <ProjectOutlined />,
      label: '项目管理',
    },
    {
      key: '/file-viewer',
      icon: <FileTextOutlined />,
      label: '文件查看',
    },
    {
      key: '/rules',
      icon: <SettingOutlined />,
      label: '规则配置',
    },
    {
      key: '/evaluation-results',
      icon: <BarChartOutlined />,
      label: '评审结果',
    },
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
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
          style={{
            margin: '24px 16px',
            padding: 24,
            background: colorBgElevated,
            borderRadius: 8,
            minHeight: 280,
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
