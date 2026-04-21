import React, { useState, useEffect } from 'react';
import { Card, Checkbox, Typography, Switch, Space, Tag } from 'antd';
import { FileTextOutlined, CheckCircleOutlined } from '@ant-design/icons';
import apiClient from '../services/api';

const { Title, Text } = Typography;

interface Criteria {
  id: number;
  criteria_name: string;
  criteria_type: string;
  max_score: number;
}

interface CriteriaSelectorProps {
  packageId: number;
  value?: number[];
  onChange: (value: number[]) => void;
}

const CriteriaSelector: React.FC<CriteriaSelectorProps> = ({ packageId, value = [], onChange }) => {
  const [criteriaList, setCriteriaList] = useState<Criteria[]>([]);
  const [loading, setLoading] = useState(false);
  const [grouped, setGrouped] = useState(true);

  useEffect(() => {
    fetchCriteria();
  }, [packageId]);

  const fetchCriteria = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/api/criteria/package/${packageId}`);
      setCriteriaList(response.data || []);
    } catch (error) {
      console.error('获取评审项列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckboxChange = (checked: boolean, criteriaId: number) => {
    if (checked) {
      onChange([...value, criteriaId]);
    } else {
      onChange(value.filter(id => id !== criteriaId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onChange(criteriaList.map(c => c.id));
    } else {
      onChange([]);
    }
  };

  const getCriteriaByType = () => {
    const technical = criteriaList.filter(c => c.criteria_type === 'technical');
    const business = criteriaList.filter(c => c.criteria_type === 'business');
    return { technical, business };
  };

  const renderCriteriaGroup = (title: string, list: Criteria[]) => (
    <div style={{ marginBottom: 16 }}>
      <Title level={5}>{title} ({list.length})</Title>
      {list.map(criteria => (
        <div key={criteria.id} style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
          <Checkbox
            checked={value.includes(criteria.id)}
            onChange={(e) => handleCheckboxChange(e.target.checked, criteria.id)}
          >
            <Space style={{ width: '100%' }}>
              <div style={{ flex: 1 }}>
                <Space>
                  <FileTextOutlined />
                  <span>{criteria.criteria_name}</span>
                </Space>
              </div>
              <Tag color="orange">满分：{criteria.max_score}</Tag>
            </Space>
          </Checkbox>
        </div>
      ))}
    </div>
  );

  const { technical, business } = getCriteriaByType();

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={5}>选择评审项</Title>
        <Space>
          <Switch
            checked={grouped}
            onChange={setGrouped}
            checkedChildren="分组"
            unCheckedChildren="平铺"
          />
          <Checkbox
            checked={value.length === criteriaList.length && criteriaList.length > 0}
            onChange={(e) => handleSelectAll(e.target.checked)}
          >
            全选 ({criteriaList.length})
          </Checkbox>
        </Space>
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center' }}>加载中...</div>
      ) : grouped ? (
        <div>
          {renderCriteriaGroup('技术评审项', technical)}
          {renderCriteriaGroup('商务评审项', business)}
        </div>
      ) : (
        <div>
          {criteriaList.map(criteria => (
            <div key={criteria.id} style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
              <Checkbox
                checked={value.includes(criteria.id)}
                onChange={(e) => handleCheckboxChange(e.target.checked, criteria.id)}
              >
                <Space style={{ width: '100%' }}>
                  <div style={{ flex: 1 }}>
                    <Space>
                      <FileTextOutlined />
                      <span>{criteria.criteria_name}</span>
                      <Tag color={criteria.criteria_type === 'technical' ? 'blue' : 'green'}>
                        {criteria.criteria_type === 'technical' ? '技术' : '商务'}
                      </Tag>
                    </Space>
                  </div>
                  <Tag color="orange">满分：{criteria.max_score}</Tag>
                </Space>
              </Checkbox>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export default CriteriaSelector;
