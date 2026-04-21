import React, { useState, useEffect } from 'react';
import {
  Button,
  Table,
  Tag,
  Space,
  Typography,
  Select,
  message,
  Modal as AntModal,
  Divider,
  Card
} from 'antd';
import {
  TeamOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { projectApi, teamApi } from '../services/projectApi';

const { Title, Text } = Typography;
const { Option } = Select;

interface PackageDispatchModalProps {
  projectId: number;
  visible: boolean;
  onClose: () => void;
}

interface Package {
  id: number;
  package_name: string;
  package_order: number;
  status: string;
  assigned_team_id?: number;
  assigned_team?: string;
}

interface Team {
  id: number;
  team_name: string;
  member_count: number;
}

const PackageDispatchModal: React.FC<PackageDispatchModalProps> = ({
  projectId,
  visible,
  onClose
}) => {
  const [packages, setPackages] = useState<Package[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);

  const [dispatchPlan, setDispatchPlan] = useState<any>(null);

  useEffect(() => {
    if (visible && projectId) {
      fetchPackages();
      fetchTeams();
    }
  }, [visible, projectId]);

  const fetchPackages = async () => {
    try {
      const response = await projectApi.getProject(projectId);
      const packagesData = response.data.packages || [];
      setPackages(packagesData);
    } catch (error) {
      console.error('获取包列表失败', error);
    }
  };

  const fetchTeams = async () => {
    try {
      const response = await teamApi.getTeams();
      setTeams(response.data);
    } catch (error) {
      message.error('获取团队列表失败');
    }
  };

  const handleGetDispatchPlan = async () => {
    if (teams.length === 0) {
      message.warning('请先创建团队');
      return;
    }

    try {
      const response = await projectApi.getDispatchPlan(projectId, teams.length);
      setDispatchPlan(response.data);
      message.success('已生成分包建议方案');
    } catch (error) {
      message.error('获取分派方案失败');
    }
  };

  const handleAssignPackage = async (packageId: number, teamId: number) => {
    try {
      await projectApi.assignPackage(packageId, { team_id: teamId });
      message.success('分派成功');
      fetchPackages();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '分派失败');
    }
  };

  const handleBatchDispatch = async () => {
    if (!dispatchPlan?.plan) {
      message.warning('请先生成分包建议方案');
      return;
    }

    try {
      const mapping: Record<string, number> = {};
      dispatchPlan.plan.forEach((teamPlan: any) => {
        teamPlan.package_ids.forEach((pkgId: number) => {
          mapping[pkgId.toString()] = teams[teamPlan.team_index - 1].id;
        });
      });

      await projectApi.batchAssign(projectId, mapping);
      message.success('批量分派成功');
      fetchPackages();
      setDispatchPlan(null);
    } catch (error: any) {
      message.error(error.response?.data?.detail || '批量分派失败');
    }
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, [string, string]> = {
      pending: ['default', '待分派'],
      assigned: ['blue', '已分派'],
      in_progress: ['processing', '评审中'],
      completed: ['success', '已完成']
    };
    const [color, name] = statusMap[status] || ['default', status];
    return <Tag color={color}>{name}</Tag>;
  };

  const packageColumns = [
    {
      title: '包序号',
      dataIndex: 'package_order',
      key: 'package_order',
      width: 80,
      align: 'center' as const
    },
    {
      title: '包名称',
      dataIndex: 'package_name',
      key: 'package_name'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status)
    },
    {
      title: '已分派团队',
      dataIndex: 'assigned_team',
      key: 'assigned_team',
      render: (team: string | null, record: Package) => team || '-'
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Package) => (
        <Space size="small">
          {record.status === 'pending' && (
            <Select
              placeholder="选择团队"
              size="small"
              style={{ width: 150 }}
              onChange={(teamId) => handleAssignPackage(record.id, teamId)}
            >
              {teams.map(team => (
                <Option key={team.id} value={team.id}>{team.team_name}</Option>
              ))}
            </Select>
          )}
        </Space>
      )
    }
  ];

  const planColumns = [
    {
      title: '团队',
      dataIndex: 'team_index',
      key: 'team_index',
      render: (index: number) => `团队 ${index}`
    },
    {
      title: '包范围',
      dataIndex: 'package_range',
      key: 'package_range'
    },
    {
      title: '包数量',
      dataIndex: 'package_count',
      key: 'package_count'
    },
    {
      title: '对应团队',
      key: 'team_name',
      render: (_: any, record: any) => {
        const team = teams[record.team_index - 1];
        return team ? team.team_name : '未选择';
      }
    }
  ];

  return (
    <AntModal
      title="分包与分派"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={1000}
      bodyStyle={{ maxHeight: '70vh', overflow: 'auto' }}
    >
      <div style={{ padding: '16px 0' }}>
        {/* 分派建议 */}
        {dispatchPlan && (
          <Card className="plan-card" style={{ marginBottom: 16 }}>
            <Title level={5}>分派建议方案</Title>
            <Text type="secondary">
              共 {dispatchPlan.total_packages} 个包，分给 {dispatchPlan.team_count} 个团队
            </Text>
            <Divider />
            <Table
              columns={planColumns}
              dataSource={dispatchPlan.plan}
              rowKey="team_index"
              pagination={false}
              size="small"
            />
          </Card>
        )}

        {/* 包列表 */}
        <Card className="packages-card">
          <Title level={5}>包列表</Title>
          <Table
            columns={packageColumns}
            dataSource={packages}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
          />
        </Card>
      </div>
    </AntModal>
  );
};

export default PackageDispatchModal;
