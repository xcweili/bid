import React from 'react';
import { Typography, Space, Card } from 'antd';
import { ShopOutlined, FileTextOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface DispatchModeSelectorProps {
  mode: 'by_company' | 'by_criteria';
  onChange: (mode: 'by_company' | 'by_criteria') => void;
  disabled?: boolean;
}

const DispatchModeSelector: React.FC<DispatchModeSelectorProps> = ({
  mode,
  onChange,
  disabled = false
}) => {
  return (
    <div className="mode-selector">
      <Title level={5} className="mode-selector-title">
        分配模式
      </Title>
      
      <Space size="large" className="mode-options">
        {/* 按公司分配 */}
        <Card
          className={`mode-card ${mode === 'by_company' ? 'selected' : ''}`}
          onClick={() => !disabled && onChange('by_company')}
          hoverable={!disabled}
          style={{ 
            cursor: disabled ? 'not-allowed' : 'pointer',
            width: 220,
            height: 120
          }}
        >
          <div className="mode-card-content">
            <div className={`mode-card-icon ${mode === 'by_company' ? 'icon-primary' : ''}`}>
              <ShopOutlined style={{ fontSize: 32 }} />
            </div>
            <Title level={5} className="mode-card-title" style={{ margin: '8px 0 4px' }}>
              按公司分配
            </Title>
            <Text type="secondary" className="mode-card-desc">
              为每位专家分配若干家公司
            </Text>
          </div>
        </Card>

        {/* 按评审项分配 */}
        <Card
          className={`mode-card ${mode === 'by_criteria' ? 'selected' : ''}`}
          onClick={() => !disabled && onChange('by_criteria')}
          hoverable={!disabled}
          style={{ 
            cursor: disabled ? 'not-allowed' : 'pointer',
            width: 220,
            height: 120
          }}
        >
          <div className="mode-card-content">
            <div className={`mode-card-icon ${mode === 'by_criteria' ? 'icon-primary' : ''}`}>
              <FileTextOutlined style={{ fontSize: 32 }} />
            </div>
            <Title level={5} className="mode-card-title" style={{ margin: '8px 0 4px' }}>
              按评审项分配
            </Title>
            <Text type="secondary" className="mode-card-desc">
              为每位专家分配若干评审项
            </Text>
          </div>
        </Card>
      </Space>

      <div className="mode-selector-hint">
        <Text type="secondary">
          {mode === 'by_company' 
            ? '提示：按公司分配模式下，每位专家将负责指定公司的所有评审项'
            : '提示：按评审项分配模式下，每位专家将负责所有公司的指定评审项'}
        </Text>
      </div>
    </div>
  );
};

export default DispatchModeSelector;
