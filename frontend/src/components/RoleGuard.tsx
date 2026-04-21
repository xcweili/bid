import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { message } from 'antd';

interface RoleGuardProps {
  allowedRoles: string[];
  children: React.ReactNode;
}

const RoleGuard: React.FC<RoleGuardProps> = ({ allowedRoles, children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAuthorized, setIsAuthorized] = React.useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      navigate('/login', { replace: true });
      return;
    }

    const user = JSON.parse(userData);
    if (!allowedRoles.includes(user.role)) {
      message.error('您没有权限访问此页面');
      // team_manager 角色重定向到仪表盘或我的任务
      if (user.role === 'team_manager') {
        // 检查当前路径，如果是团队管理则重定向到仪表盘
        if (location.pathname === '/teams') {
          navigate('/dashboard', { replace: true });
        } else {
          navigate('/my-tasks', { replace: true });
        }
      } else {
        navigate('/dashboard', { replace: true });
      }
      return;
    }

    setIsAuthorized(true);
  }, [allowedRoles, navigate, location.pathname]);

  if (!isAuthorized) {
    return null;
  }

  return <>{children}</>;
};

export default RoleGuard;
