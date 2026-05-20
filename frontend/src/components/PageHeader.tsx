import React from 'react';
import { Typography, Space } from 'antd';

const { Title, Text } = Typography;

interface PageHeaderProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, description, icon }) => {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
        {icon && <span style={{ marginRight: 12, fontSize: 24, color: '#1890ff' }}>{icon}</span>}
        <Title level={2} style={{ margin: 0, fontSize: 22, fontWeight: 600, color: '#1a1a1a' }}>
          {title}
        </Title>
      </div>
      <Text type="secondary" style={{ fontSize: 14, color: '#666', lineHeight: '1.6' }}>
        {description}
      </Text>
    </div>
  );
};

export default PageHeader;
