import React from 'react';
import { Card, Table, Button, Tag, Typography, Space, Alert } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  UserOutlined,
  TeamOutlined,
  FileTextOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;

interface PreviewItem {
  evaluator_id: number;
  evaluator_name: string;
  company_id?: number;
  company_name?: string;
  criteria_ids?: number[];
  assignment_type: string;
}

interface AssignmentPreviewProps {
  previewData: PreviewItem[];
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

const AssignmentPreview: React.FC<AssignmentPreviewProps> = ({
  previewData,
  onConfirm,
  onCancel,
  loading = false
}) => {
  const columns = [
    {
      title: '分配类型',
      dataIndex: 'assignment_type',
      key: 'assignment_type',
      width: 120,
      render: (type: string) => {
        const typeConfig: Record<string, [string, string]> = {
          by_package: ['blue', '按包分配'],
          by_company: ['green', '按公司分配'],
          by_criteria: ['orange', '按评审项分配']
        };
        const [color, text] = typeConfig[type] || ['default', type];
        return <Tag color={color}>{text}</Tag>;
      }
    },
    {
      title: '专家',
      dataIndex: 'evaluator_name',
      key: 'evaluator_name',
      width: 150,
      render: (name: string) => (
        <Space>
          <UserOutlined />
          <span>{name}</span>
        </Space>
      )
    },
    {
      title: '公司',
      dataIndex: 'company_name',
      key: 'company_name',
      width: 150,
      render: (name: string | undefined) => {
        if (!name) return <Text type="secondary">-</Text>;
        return (
          <Space>
            <TeamOutlined />
            <span>{name}</span>
          </Space>
        );
      }
    },
    {
      title: '评审项',
      dataIndex: 'criteria_ids',
      key: 'criteria_ids',
      width: 150,
      render: (ids: number[] | undefined) => {
        if (!ids || ids.length === 0) return <Text type="secondary">-</Text>;
        return <Tag color="orange">{ids.length} 项</Tag>;
      }
    }
  ];

  return (
    <Card>
      <Title level={5}>分配预览</Title>
      
      <Alert
        message={`即将创建 ${previewData.length} 个任务分配，请确认信息无误后再提交`}
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Table
        columns={columns}
        dataSource={previewData}
        rowKey={(record, index) => `${record.evaluator_id}-${record.company_id}-${index}`}
        pagination={false}
        size="small"
        locale={{ emptyText: '暂无分配数据' }}
      />

      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Space>
          <Button onClick={onCancel} disabled={loading}>
            取消
          </Button>
          <Button
            type="primary"
            onClick={onConfirm}
            loading={loading}
            disabled={previewData.length === 0}
            icon={<CheckCircleOutlined />}
          >
            确认分配
          </Button>
        </Space>
      </div>
    </Card>
  );
};

export default AssignmentPreview;
