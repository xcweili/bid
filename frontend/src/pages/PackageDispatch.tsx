import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Table,
  Tag,
  Space,
  Typography,
  Select,
  message,
  Modal,
  InputNumber,
  Divider
} from 'antd';
import {
  SplitCellsOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import { projectApi, teamApi } from '../services/projectApi';
import './PackageDispatch.css';

// 注意：此页面已弃用，请使用 ProjectList 中的分包弹窗
// 此页面保留仅用于向后兼容

const { Title, Text } = Typography;
const { Option } = Select;

interface Project {
  id: number;
  project_name: string;
  project_type: string;
  status: string;
  total_packages: number;
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

const PackageDispatch: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projectId = parseInt(id || '0');

  const [project, setProject] = useState<Project | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);

  const [splitModalVisible, setSplitModalVisible] = useState(false);
  const [packageCount, setPackageCount] = useState(9);
  const [packageNames, setPackageNames] = useState<string[]>([]);

  const [dispatchPlan, setDispatchPlan] = useState<any>(null);

  useEffect(() => {
    if (projectId) {
      fetchProject();
      fetchTeams();
    }
  }, [projectId]);

  const fetchProject = async () => {
    try {
      const response = await projectApi.getProject(projectId);
      setProject(response.data);
      fetchPackages();
    } catch (error) {
      message.error('获取项目详情失败');
    }
  };

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

  const handleSplitPackages = async () => {
    if (packageCount < 1) {
      message.error('包数量必须大于 0');
      return;
    }

    try {
      const names = Array.from({ length: packageCount }, (_, i) => 
        `包${i + 1}`
      );
      await projectApi.splitPackages(projectId, { package_count: packageCount, package_names: names });
      message.success('分包成功');
      setSplitModalVisible(false);
      fetchPackages();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '分包失败');
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
    <div className="dispatch-container">
      <div className="dispatch-header" style={{ background: '#fff', padding: '16px 24px', marginBottom: 16 }}>
        <div className="header-content">
          <Title level={4} style={{ margin: 0 }}>分包与分派</Title>
          <Tag color="orange" style={{ marginLeft: 12 }}>此页面已弃用，请使用项目管理页面中的分包弹窗</Tag>
        </div>
      </div>

      <div className="dispatch-content">
        {/* 操作栏 */}
        <Card className="action-card">
          <Space wrap size="large">
            <div>
              <Text>分包数量：</Text>
              <InputNumber
                min={1}
                max={50}
                value={packageCount}
                onChange={(value) => setPackageCount(value || 1)}
                style={{ width: 100 }}
              />
            </div>
            <Button
              type="primary"
              icon={<SplitCellsOutlined />}
              onClick={() => setSplitModalVisible(true)}
              disabled={packages.length > 0}
            >
              执行分包
            </Button>
            <Button
              icon={<TeamOutlined />}
              onClick={handleGetDispatchPlan}
              disabled={packages.length === 0 || teams.length === 0}
            >
              生成分派建议
            </Button>
            <Button
              type="primary"
              danger
              icon={<CheckCircleOutlined />}
              onClick={handleBatchDispatch}
              disabled={!dispatchPlan}
            >
              应用分派方案
            </Button>
          </Space>
        </Card>

        {/* 分派建议 */}
        {dispatchPlan && (
          <Card className="plan-card" style={{ marginTop: 16 }}>
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
        <Card className="packages-card" style={{ marginTop: 16 }}>
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

      {/* 分包弹窗 */}
      <Modal
        title="执行分包"
        open={splitModalVisible}
        onOk={handleSplitPackages}
        onCancel={() => setSplitModalVisible(false)}
        okText="确认分包"
        cancelText="取消"
      >
        <div style={{ padding: '16px 0' }}>
          <Text type="secondary">
            确认将项目分为 {packageCount} 个包？此操作不可撤销。
          </Text>
        </div>
      </Modal>
    </div>
  );
};

export default PackageDispatch;
