import React from 'react';
import { Card, Button, Tag, Typography, Space, Empty, Avatar, Tooltip } from 'antd';
import { UserOutlined, CloseOutlined, CheckCircleOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface Resource {
  id: number;
  name: string;
  type: 'company' | 'criteria';
  code?: string;
  status?: string;
  assignedCount?: number;
}

interface TeamMember {
  id: number;
  real_name: string;
  role: string;
  avatar?: string;
  current_workload: number;
}

interface TempAssignment {
  evaluatorId: number;
  evaluatorName: string;
  resourceIds: number[];
}

interface AssignmentOperationPanelProps {
  mode: 'by_company' | 'by_criteria';
  teamMembers: TeamMember[];
  resources: Resource[];
  assignments: TempAssignment[];
  onAssign: (evaluatorId: number, resourceIds: number[]) => void;
  onRemove: (evaluatorId: number, resourceId: number) => void;
  onClear: (evaluatorId: number) => void;
}

const AssignmentOperationPanel: React.FC<AssignmentOperationPanelProps> = ({
  mode,
  teamMembers,
  resources,
  assignments,
  onAssign,
  onRemove,
  onClear
}) => {
  // 获取资源名称
  const getResourceName = (id: number): string => {
    const resource = resources.find(r => r.id === id);
    return resource?.name || `ID:${id}`;
  };

  return (
    <div className="operation-panel">
      <Title level={5} className="operation-panel-title">
        团队成员分配
      </Title>

      {teamMembers.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无团队成员，请先添加团队成员"
        />
      ) : (
        <div className="team-member-list">
          {teamMembers.map(member => {
            const memberAssignment = assignments.find(a => a.evaluatorId === member.id);
            const assignedResourceIds = memberAssignment?.resourceIds || [];
            const assignedCount = assignedResourceIds.length;

            return (
              <Card
                key={member.id}
                className="team-member-card"
                size="small"
              >
                <div className="team-member-header">
                  <div className="team-member-info">
                    <Avatar
                      size={40}
                      icon={<UserOutlined />}
                      src={member.avatar}
                      style={{ backgroundColor: '#1890ff' }}
                    />
                    <div className="team-member-details">
                      <Title level={5} style={{ margin: 0 }}>
                        {member.real_name}
                      </Title>
                      <Text type="secondary" className="team-member-role">
                        {member.role === 'technical_evaluator' ? '技术专家' : 
                         member.role === 'business_evaluator' ? '商务专家' : member.role}
                      </Text>
                    </div>
                  </div>

                  <div className="team-member-stats">
                    <Space size="small">
                      <Tag
                        color={assignedCount > 0 ? 'blue' : 'default'}
                        icon={assignedCount > 0 ? <CheckCircleOutlined /> : undefined}
                      >
                        已分配 {assignedCount}
                      </Tag>
                      {assignedCount > 0 && (
                        <Tooltip title="清空该成员的所有分配">
                          <Button
                            type="text"
                            size="small"
                            icon={<CloseOutlined />}
                            onClick={() => onClear(member.id)}
                          />
                        </Tooltip>
                      )}
                    </Space>
                  </div>
                </div>

                <div className="team-member-assignments">
                  {assignedResourceIds.length === 0 ? (
                    <div className="team-member-empty">
                      <Text type="secondary">
                        暂无分配，请从左侧选择资源后点击下方分配按钮
                      </Text>
                    </div>
                  ) : (
                    <div className="team-member-resources-list">
                      {assignedResourceIds.map(resourceId => (
                        <Tag
                          key={resourceId}
                          closable
                          onClose={() => onRemove(member.id, resourceId)}
                          color="blue"
                          style={{ marginBottom: 8 }}
                        >
                          {getResourceName(resourceId)}
                        </Tag>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AssignmentOperationPanel;
