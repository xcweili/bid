import React from 'react';
import { Button, Space, Typography, Tag } from 'antd';
import { ArrowLeftOutlined, TeamOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface Package {
  id: number;
  package_name: string;
  project_id: number;
  status: string;
  dispatch_mode?: string;
}

interface Stats {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  unassigned_resources: number;
  evaluator_workloads: Array<{
    evaluator_id: number;
    evaluator_name: string;
    assigned_count: number;
  }>;
}

interface AssignmentHeaderProps {
  package: Package | null;
  stats: Stats | null;
  onBack: () => void;
}

const AssignmentHeader: React.FC<AssignmentHeaderProps> = ({
  package: packageInfo,
  stats,
  onBack
}) => {
  const completedCount = stats?.completed || 0;
  const totalCount = stats?.total || 0;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="assignment-header">
      <div className="header-left">
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={onBack}
          size="large"
          className="header-back-btn"
        >
          返回
        </Button>
        
        <div className="header-title-section">
          <Title level={4} className="header-title" style={{ margin: 0 }}>
            {packageInfo?.package_name || '任务分配'}
          </Title>
          <Text type="secondary" className="header-subtitle">
            任务分配中心
          </Text>
        </div>
      </div>

      <div className="header-right">
        {stats && (
          <div className="header-stats">
            <Space size="middle">
              <div className="stat-item">
                <Text type="secondary">总计</Text>
                <Tag color="blue" className="stat-tag">
                  {stats.total}
                </Tag>
              </div>
              <div className="stat-item">
                <Text type="secondary">待处理</Text>
                <Tag color="orange" className="stat-tag">
                  {stats.pending}
                </Tag>
              </div>
              <div className="stat-item">
                <Text type="secondary">进行中</Text>
                <Tag color="cyan" className="stat-tag">
                  {stats.in_progress}
                </Tag>
              </div>
              <div className="stat-item">
                <Text type="secondary">已完成</Text>
                <Tag color="green" className="stat-tag">
                  {stats.completed}
                </Tag>
              </div>
            </Space>
          </div>
        )}
      </div>
    </div>
  );
};

export default AssignmentHeader;
