import React, { useState } from 'react';
import { Form, Input, Button, Card, message, Typography } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Login.css';

const { Title } = Typography;

interface LoginResponse {
  token: string;
  user: {
    id: number;
    username: string;
    real_name: string;
    role: string;
  };
}

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const response = await axios.post<LoginResponse>('/api/auth/login', {
        username: values.username,
        password: values.password,
      });

      // 保存 token 和用户信息
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));

      message.success('登录成功！');

      // 根据角色跳转到不同页面
      const role = response.data.user.role;
      if (role === 'admin' || role === 'team_leader') {
        navigate('/dashboard');
      } else {
        navigate('/my-tasks');
      }
    } catch (error: any) {
      message.error(error.response?.data?.detail || '登录失败，请检查用户名和密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-background">
        <div className="circle circle-1"></div>
        <div className="circle circle-2"></div>
        <div className="circle circle-3"></div>
      </div>

      <Card className="login-card" bordered={false}>
        <div className="login-header">
          <Title level={2} className="login-title">招标评审平台</Title>
          <p className="login-subtitle">智能多角色协作评审系统</p>
        </div>

        <Form
          name="login"
          initialValues={{ remember: true }}
          onFinish={onFinish}
          className="login-form"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined className="site-form-item-icon" />}
              placeholder="用户名"
              size="large"
              disabled={loading}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined className="site-form-item-icon" />}
              placeholder="密码"
              size="large"
              disabled={loading}
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              className="login-form-button"
              size="large"
              loading={loading}
              block
            >
              登录
            </Button>
          </Form.Item>
        </Form>

        <div className="login-footer">
          <p className="version-info">版本 2.0.0 | 角色协作版</p>
          <p className="demo-info">演示账号：admin / admin123</p>
        </div>
      </Card>
    </div>
  );
};

export default Login;
