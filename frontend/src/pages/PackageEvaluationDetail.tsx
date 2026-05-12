import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Typography, Tag, Button, Space, message,
  Table, Empty, Divider, Breadcrumb
} from 'antd';
import {
  ArrowLeftOutlined, InboxOutlined, SaveOutlined, PercentageOutlined
} from '@ant-design/icons';
import { evaluationItemService, PackageItemWithDetails } from '../services/evaluationItemService';

const { Title, Text } = Typography;

interface Package {
  id: number;
  package_no: string;
  status: string;
}

interface Section {
  id: number;
  section_code: string;
  section_name: string;
}

interface Project {
  id: number;
  project_code: string;
  project_name: string;
}

const PackageEvaluationDetail: React.FC = () => {
  const { projectId, packageId } = useParams<{ projectId: string; packageId: string }>();
  const navigate = useNavigate();
  const [packageInfo, setPackageInfo] = useState<Package | null>(null);
  const [section, setSection] = useState<Section | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [packageItems, setPackageItems] = useState<PackageItemWithDetails[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (projectId && packageId) {
      fetchData();
    }
  }, [projectId, packageId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 获取项目信息
      const projectRes = await fetch(`/api/projects/${projectId}`);
      const projectData = await projectRes.json();
      setProject(projectData);

      // 查找标段和包信息
      let foundPackage: Package | null = null;
      let foundSection: Section | null = null;
      
      for (const sec of projectData.sections || []) {
        for (const pkg of sec.packages || []) {
          if (pkg.id === parseInt(packageId || '0')) {
            foundPackage = pkg;
            foundSection = sec;
            break;
          }
        }
        if (foundPackage) break;
      }

      setPackageInfo(foundPackage);
      setSection(foundSection);

      // 获取包的评审项配置
      const items = await evaluationItemService.getPackageItems(parseInt(packageId || '0'));
      setPackageItems(items);
    } catch (error) {
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; text: string }> = {
      pending: { color: 'default', text: '待处理' },
      processing: { color: 'orange', text: '处理中' },
      completed: { color: 'success', text: '已完成' },
    };
    return configs[status] || configs.pending;
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div className="loading" />
      </div>
    );
  }

  if (!project || !packageInfo || !section) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Empty description="数据不存在" />
      </div>
    );
  }

  return (
    <div>
      {/* 面包屑导航 */}
      <Breadcrumb style={{ marginBottom: 24 }}>
        <Breadcrumb.Item onClick={() => navigate('/projects')}>项目管理</Breadcrumb.Item>
        <Breadcrumb.Item onClick={() => navigate(`/projects/${projectId}`)}>{project.project_name}</Breadcrumb.Item>
        <Breadcrumb.Item>{section.section_name}</Breadcrumb.Item>
        <Breadcrumb.Item>{packageInfo.package_no} - 评审项配置</Breadcrumb.Item>
      </Breadcrumb>

      {/* 头部 */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>{packageInfo.package_no}</Title>
          <Text type="secondary">
            所属项目：{project.project_name} | 所属标段：{section.section_name} ({section.section_code})
          </Text>
        </div>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(`/projects/${projectId}?tab=evaluation`)}
        >
          返回
        </Button>
      </div>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <InboxOutlined style={{ fontSize: 20, color: '#52c41a' }} />
          <Title level={4} style={{ margin: 0 }}>已配置的评审项</Title>
        </div>

        {packageItems.length > 0 ? (
          <Table
            columns={[
              {
                title: '序号',
                key: 'index',
                width: 80,
                render: (_: any, __: any, index: number) => index + 1
              },
              {
                title: '评审项编号',
                dataIndex: 'item_code',
                key: 'item_code',
                width: 150,
                render: (code: string) => <Tag color="blue">{code}</Tag>
              },
              {
                title: '评审项名称',
                dataIndex: 'item_name',
                key: 'item_name',
                width: 200
              },
              {
                title: '物资品类',
                dataIndex: 'material_category',
                key: 'material_category',
                width: 120,
                render: (category: string) => category || '-'
              },
              {
                title: '评分范围',
                key: 'score_range',
                width: 150,
                render: (_: any, record: PackageItemWithDetails) => (
                  <Space>
                    <SaveOutlined style={{ color: '#1890ff' }} />
                    <span>{record.min_score} - {record.max_score} 分</span>
                  </Space>
                )
              },
              {
                title: '权重',
                key: 'weight',
                width: 100,
                render: (_: any, record: PackageItemWithDetails) => (
                  <Space>
                    <PercentageOutlined style={{ color: '#52c41a' }} />
                    <span>{record.custom_weight || record.weight}</span>
                  </Space>
                )
              },
              {
                title: '状态',
                dataIndex: 'is_required',
                key: 'is_required',
                width: 100,
                render: (is_required: boolean) => (
                  is_required ? (
                    <Tag color="green">必填</Tag>
                  ) : (
                    <Tag color="default">可选</Tag>
                  )
                )
              },
              {
                title: '描述',
                dataIndex: 'item_description',
                key: 'item_description',
                render: (desc: string) => (
                  <span style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block' }}>
                    {desc || '-'}
                  </span>
                )
              }
            ]}
            dataSource={packageItems}
            rowKey="package_item_id"
            pagination={{
              defaultPageSize: 25,
              pageSizeOptions: ['25', '50', '100'],
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`
            }}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Empty description="该包尚未配置评审项" />
          </div>
        )}
      </Card>
    </div>
  );
};

export default PackageEvaluationDetail;