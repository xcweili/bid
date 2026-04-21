import React from 'react';
import { Card, Tag, Typography, Space, Button, Empty } from 'antd';
import { ExportOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface Resource {
  id: number;
  name: string;
  type: 'company' | 'criteria';
  code?: string;
  status?: string;
  assignedCount?: number;
}

interface TempAssignment {
  evaluatorId: number;
  evaluatorName: string;
  resourceIds: number[];
}

interface AssignmentPreviewProps {
  assignments: TempAssignment[];
  mode: 'by_company' | 'by_criteria';
  resources: Resource[];
  onExport?: () => void;
}

const AssignmentPreview: React.FC<AssignmentPreviewProps> = ({
  assignments,
  mode,
  resources,
  onExport
}) => {
  // 获取资源名称
  const getResourceName = (id: number): string => {
    const resource = resources.find(r => r.id === id);
    return resource?.name || `ID:${id}`;
  };

  // 计算统计信息
  const getStats = () => {
    const totalResources = resources.length;
    const assignedIds = new Set<number>();
    assignments.forEach(a => a.resourceIds.forEach(id => assignedIds.add(id)));
    
    return {
      total: totalResources,
      assigned: assignedIds.size,
      unassigned: totalResources - assignedIds.size
    };
  };

  const stats = getStats();

  return (
    <div className="preview-panel">
      <div className="preview-panel-header">
        <div className="preview-panel-title-section">
          <Title level={5} className="preview-panel-title" style={{ margin: 0 }}>
            分配预览
          </Title>
          <Tag color="blue" className="preview-panel-count">
            {assignments.filter(a => a.resourceIds.length > 0).length} 人
          </Tag>
        </div>
        {onExport && (
          <Button
            type="text"
            size="small"
            icon={<ExportOutlined />}
            onClick={onExport}
          >
            导出
          </Button>
        )}
      </div>

      <div className="preview-panel-content">
        {assignments.filter(a => a.resourceIds.length > 0).length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无分配，请开始分配资源"
          />
        ) : (
          <div className="preview-member-list">
            {assignments
              .filter(a => a.resourceIds.length > 0)
              .map(memberAssignment => (
                <Card
                  key={memberAssignment.evaluatorId}
                  className="preview-member-card"
                  size="small"
                >
                  <div className="preview-member-header">
                    <Text strong className="preview-member-name">
                      {memberAssignment.evaluatorName}
                    </Text>
                    <Tag color="blue" style={{ marginLeft: 8 }}>
                      {memberAssignment.resourceIds.length} 项
                    </Tag>
                  </div>

                  <div className="preview-member-resources">
                    {memberAssignment.resourceIds.map(resourceId => (
                      <Tag
                        key={resourceId}
                        color={mode === 'by_company' ? 'green' : 'purple'}
                        style={{ marginBottom: 6 }}
                      >
                        {getResourceName(resourceId)}
                      </Tag>
                    ))}
                  </div>
                </Card>
              ))}
          </div>
        )}

        <div className="preview-summary">
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <div className="preview-stat-row">
              <Text type="secondary">总计资源:</Text>
              <Text strong style={{ marginLeft: 8 }}>{stats.total}</Text>
            </div>
            <div className="preview-stat-row">
              <Text type="secondary">已分配:</Text>
              <Text strong style={{ marginLeft: 8, color: '#52c41a' }}>{stats.assigned}</Text>
            </div>
            <div className="preview-stat-row">
              <Text type="secondary">未分配:</Text>
              <Text strong style={{ marginLeft: 8, color: '#faad14' }}>{stats.unassigned}</Text>
            </div>
          </Space>
        </div>
      </div>
    </div>
  );
};

export default AssignmentPreview;
