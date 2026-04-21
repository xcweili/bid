import React, { useState, useEffect } from 'react';
import { Card, Checkbox, Typography, Input, Space } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import apiClient from '../services/api';

const { Title, Text } = Typography;
const { Search } = Input;

interface Company {
  id: number;
  company_name: string;
  file_count?: number;
}

interface CompanySelectorProps {
  projectId: number;
  value?: number[];
  onChange: (value: number[], names?: string[]) => void;  // 新增 names 参数
}

const CompanySelector: React.FC<CompanySelectorProps> = ({ projectId, value = [], onChange }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    fetchCompanies();
  }, [projectId]);

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      // 获取项目下的所有公司
      const response = await apiClient.get(`/api/projects/${projectId}/companies`);
      setCompanies(response.data || []);
    } catch (error) {
      console.error('获取公司列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckboxChange = (checked: boolean, companyId: number, companyName: string) => {
    if (checked) {
      const newValues = [...value, companyId];
      const newNames = [...(value.map(id => companies.find(c => c.id === id)?.company_name || '')), companyName];
      onChange(newValues, newNames);
    } else {
      const newValues = value.filter(id => id !== companyId);
      const newNames = newValues.map(id => companies.find(c => c.id === id)?.company_name || '');
      onChange(newValues, newNames);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allNames = companies.map(c => c.company_name);
      onChange(companies.map(c => c.id), allNames);
    } else {
      onChange([], []);
    }
  };

  const filteredCompanies = companies.filter(company =>
    company.company_name.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <Card>
      <Title level={5}>选择公司</Title>
      
      <Space style={{ width: '100%', marginBottom: 16 }}>
        <Search
          placeholder="搜索公司名称"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ flex: 1 }}
        />
        <Checkbox
          checked={value.length === companies.length && companies.length > 0}
          onChange={(e) => handleSelectAll(e.target.checked)}
        >
          全选 ({companies.length})
        </Checkbox>
      </Space>

      <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 4 }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center' }}>加载中...</div>
        ) : (
          <div style={{ padding: 8 }}>
            {filteredCompanies.map(company => (
              <div key={company.id} style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                <Checkbox
                  checked={value.includes(company.id)}
                  onChange={(e) => handleCheckboxChange(e.target.checked, company.id, company.company_name)}
                >
                  <Space>
                    <TeamOutlined />
                    <span>{company.company_name}</span>
                    {company.file_count && (
                      <Text type="secondary">({company.file_count} 个文件)</Text>
                    )}
                  </Space>
                </Checkbox>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};

export default CompanySelector;
