import React from 'react';
import { Card, Radio, Typography, Space } from 'antd';
import {
  FileTextOutlined,
  TeamOutlined,
  BarcodeOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;

interface DispatchModeSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const DispatchModeSelector: React.FC<DispatchModeSelectorProps> = ({ value, onChange }) => {
  return (
    <Card>
      <Title level={5}>选择分配模式</Title>
      <Radio.Group value={value} onChange={(e) => onChange(e.target.value)} size="large">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Radio value="by_package">
            <Card style={{ width: '100%' }}>
              <Space>
                <FileTextOutlined style={{ fontSize: 18 }} />
                <div>
                  <Text strong>按包分配</Text>
                  <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                    将整包分配给专家，专家评审该包的所有公司和所有评审项
                  </Text>
                </div>
              </Space>
            </Card>
          </Radio>
          
          <Radio value="by_company">
            <Card style={{ width: '100%' }}>
              <Space>
                <TeamOutlined style={{ fontSize: 18 }} />
                <div>
                  <Text strong>按公司分配</Text>
                  <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                    将特定公司的所有评审项分配给专家
                  </Text>
                </div>
              </Space>
            </Card>
          </Radio>
          
          <Radio value="by_criteria">
            <Card style={{ width: '100%' }}>
              <Space>
                <BarcodeOutlined style={{ fontSize: 18 }} />
                <div>
                  <Text strong>按评审项分配</Text>
                  <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                    将特定评审项分配给专家，专家评审所有公司的该评审项
                  </Text>
                </div>
              </Space>
            </Card>
          </Radio>
        </Space>
      </Radio.Group>
    </Card>
  );
};

export default DispatchModeSelector;
