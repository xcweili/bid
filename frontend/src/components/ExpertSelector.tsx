import React, { useState, useEffect } from 'react';
import { Card, Select, Typography, Space, Tag, Input } from 'antd';
import { UserOutlined, BarChartOutlined } from '@ant-design/icons';
import apiClient from '../services/api';

const { Title, Text } = Typography;
const { Option } = Select;
const { Search } = Input;

interface Expert {
  id: number;
  real_name: string;
  role: string;
  current_task_count: number;
}

interface ExpertSelectorProps {
  teamId: number;
  value?: number | number[];
  onChange: (value: number | number[], name?: string | string[]) => void;  // 支持单选和多选
  multiple?: boolean;
}

const ExpertSelector: React.FC<ExpertSelectorProps> = ({ teamId, value, onChange, multiple = false }) => {
  const [experts, setExperts] = useState<Expert[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    fetchExperts();
  }, [teamId]);

  const fetchExperts = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/api/assignments/teams/${teamId}/available-experts`);
      setExperts(response.data || []);
    } catch (error) {
      console.error('获取专家列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRoleText = (role: string) => {
    const roleMap: Record<string, string> = {
      technical_evaluator: '技术评审员',
      business_evaluator: '商务评审员'
    };
    return roleMap[role] || role;
  };

  const getRoleColor = (role: string) => {
    return role === 'technical_evaluator' ? 'blue' : 'green';
  };

  const filteredExperts = experts.filter(expert =>
    expert.real_name.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <Card>
      <Title level={5}>选择专家</Title>
      
      <Search
        placeholder="搜索专家姓名"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        style={{ marginBottom: 16 }}
      />

      <Select
        mode={multiple ? 'multiple' : undefined}
        value={value}
        onChange={(newValue, option) => {
          // 获取专家姓名
          if (multiple) {
            const names = (option as any[]).map((opt: any) => opt.label);
            onChange(newValue, names);
          } else {
            const expert = experts.find(e => e.id === newValue);
            onChange(newValue, expert?.real_name || '');
          }
        }}
        placeholder="请选择专家"
        style={{ width: '100%' }}
        loading={loading}
        showSearch
        filterOption={false}
      >
        {filteredExperts.map(expert => (
          <Option key={expert.id} value={expert.id} label={expert.real_name}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Space>
                <UserOutlined />
                <span>{expert.real_name}</span>
                <Tag color={getRoleColor(expert.role)}>{getRoleText(expert.role)}</Tag>
              </Space>
              <Space>
                <BarChartOutlined />
                <Text type="secondary">当前任务：{expert.current_task_count}</Text>
              </Space>
            </Space>
          </Option>
        ))}
      </Select>
    </Card>
  );
};

export default ExpertSelector;
