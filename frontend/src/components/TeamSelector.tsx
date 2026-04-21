import React, { useState, useEffect } from 'react';
import { Card, Select, Typography, Spin, message, Tag, Space } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import { teamApi, projectApi } from '../services/projectApi';

const { Title, Text } = Typography;
const { Option } = Select;

interface Team {
  id: number;
  team_name: string;
  description?: string;
  member_count?: number;
}

interface TeamSelectorProps {
  value?: number;
  onChange: (value: number) => void;
  projectId?: number;
}

const TeamSelector: React.FC<TeamSelectorProps> = ({ value, onChange, projectId }) => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentAssignment, setCurrentAssignment] = useState<any>(null);

  useEffect(() => {
    fetchTeams();
    if (projectId) {
      fetchCurrentAssignment();
    }
  }, [projectId]);

  const fetchTeams = async () => {
    setLoading(true);
    try {
      const response = await teamApi.getTeams();
      setTeams(response.data || []);
    } catch (error) {
      console.error('获取团队列表失败:', error);
      message.error('获取团队列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentAssignment = async () => {
    if (!projectId) return;
    try {
      const response = await projectApi.getProjectTeamAssignment(projectId);
      setCurrentAssignment(response.data);
    } catch (error) {
      console.error('获取当前分派失败:', error);
    }
  };

  return (
    <Card>
      <Title level={5}>
        <TeamOutlined /> 选择团队
      </Title>
      
      {currentAssignment && (
        <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
          <Text strong>当前分派：</Text>
          {currentAssignment.packages && currentAssignment.packages.length > 0 ? (
            <Space direction="vertical" style={{ width: '100%', marginTop: 8 }}>
              {currentAssignment.packages.map((pkg: any, index: number) => (
                <div key={index} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text>{pkg.package_name}</Text>
                  <Tag color="blue">{pkg.assigned_team_name || '未分派'}</Tag>
                </div>
              ))}
            </Space>
          ) : (
            <Text type="secondary" style={{ marginTop: 8, display: 'block' }}>暂无分派</Text>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Spin tip="加载中..." />
        </div>
      ) : (
        <Select
          value={value}
          onChange={onChange}
          placeholder="请选择要分派的团队"
          style={{ width: '100%' }}
          size="large"
        >
          {teams.map(team => (
            <Option key={team.id} value={team.id}>
              {team.team_name} {team.member_count ? `(${team.member_count}人)` : ''}
            </Option>
          ))}
        </Select>
      )}
    </Card>
  );
};

export default TeamSelector;
