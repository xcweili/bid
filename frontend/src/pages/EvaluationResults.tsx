import React, { useState, useEffect } from 'react';
import {
  Card, Typography, Tag, Button, Space, message,
  Table, Empty, Input, Select, Progress, Collapse, Spin, Descriptions
} from 'antd';
import {
  SearchOutlined, RestOutlined, RightOutlined,
  CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined,
  FolderOpenOutlined, InboxOutlined, FileTextOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;
const { Panel } = Collapse;

interface Project {
  id: number;
  project_code: string;
  project_name: string;
  sections: Section[];
}

interface Section {
  id: number;
  section_code: string;
  section_name: string;
  packages: PackageSummary[];
}

interface PackageSummary {
  id: number;
  package_no: string;
  bidders: { id: number; company_name: string }[];
}

interface EvaluationProgress {
  package_id: number;
  package_no: string;
  evaluation_status: string;
  total_bidders: number;
  total_items: number;
  bidder_progress: BidderProgress[];
}

interface BidderProgress {
  bidder_id: number;
  company_name: string;
  completed_items: number;
  failed_items: number;
  total_items: number;
  progress_pct: number;
}

interface BidderItemDetail {
  id: number;
  item_code: string;
  item_name: string;
  score: number;
  score_reason: string;
  evaluation_basis: string;
  evaluation_status: string;
}

interface BidderDetail {
  bidder_id: number;
  company_name: string;
  items: BidderItemDetail[];
}

const getEvalStatusConfig = (status: string) => {
  const map: Record<string, { color: string; text: string; icon: React.ReactNode }> = {
    pending: { color: 'default', text: '待评审', icon: null },
    evaluating: { color: 'processing', text: '评审中', icon: <LoadingOutlined /> },
    completed: { color: 'success', text: '已完成', icon: <CheckCircleOutlined /> },
    failed: { color: 'error', text: '失败', icon: <CloseCircleOutlined /> },
  };
  return map[status] || map.pending;
};

const EvaluationResults: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [progressMap, setProgressMap] = useState<Record<number, EvaluationProgress>>({});
  const [loading, setLoading] = useState(false);
  const [expandedPkgId, setExpandedPkgId] = useState<number | null>(null);
  const [selectedBidderDetail, setSelectedBidderDetail] = useState<BidderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/projects');
      const data: Project[] = await res.json();
      setProjects(data);

      const pkgIds: number[] = [];
      data.forEach(proj => proj.sections.forEach(sec => sec.packages.forEach(pkg => pkgIds.push(pkg.id))));

      const newProgressMap: Record<number, EvaluationProgress> = {};
      await Promise.all(pkgIds.map(async (pid) => {
        try {
          const pr = await fetch(`/api/packages/${pid}/evaluation-progress`);
          if (pr.ok) newProgressMap[pid] = await pr.json();
        } catch { /* ignore */ }
      }));
      setProgressMap(newProgressMap);
    } catch {
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadBidderDetail = async (packageId: number, bidderId: number) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/packages/${packageId}/evaluation-detail/${bidderId}`);
      if (res.ok) {
        setSelectedBidderDetail(await res.json());
      }
    } catch {
      message.error('获取评审详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const getPackageStatusTag = (pkgId: number) => {
    const prog = progressMap[pkgId];
    if (!prog) return <Tag>未开始</Tag>;
    const cfg = getEvalStatusConfig(prog.evaluation_status);
    return <Tag color={cfg.color} icon={cfg.icon as any}>{cfg.text}</Tag>;
  };

  const getPackageCompaniesStatus = (pkgId: number) => {
    const prog = progressMap[pkgId];
    if (!prog) return '0/0';
    const done = prog.bidder_progress.filter(b => b.progress_pct >= 100).length;
    return `${done}/${prog.total_bidders}`;
  };

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>评审详情</Title>
          <Text type="secondary">按项目-标段-包维度查看评审进度和结果</Text>
        </div>
        <Button icon={<RestOutlined />} onClick={fetchAll} loading={loading}>刷新</Button>
      </div>

      <Spin spinning={loading}>
        {projects.length === 0 && <Empty description="暂无项目数据" />}

        {projects.map(project => (
          <Card key={project.id} style={{ marginBottom: 16 }} title={
            <Space>
              <FolderOpenOutlined />
              <span>{project.project_name} ({project.project_code})</span>
            </Space>
          }>
            {project.sections.map(section => (
              <div key={section.id} style={{ marginBottom: 16, marginLeft: 24 }}>
                <Title level={5} style={{ color: '#666', marginBottom: 8 }}>
                  {section.section_name} ({section.section_code})
                </Title>

                <Table
                  dataSource={section.packages}
                  rowKey="id"
                  pagination={false}
                  size="small"
                  columns={[
                    {
                      title: '包号', dataIndex: 'package_no', key: 'package_no', width: 120,
                      render: (no: string) => <Text strong>{no}</Text>
                    },
                    {
                      title: '评审状态', key: 'status', width: 120,
                      render: (_: any, record: PackageSummary) => getPackageStatusTag(record.id)
                    },
                    {
                      title: '公司进度', key: 'company_progress', width: 160,
                      render: (_: any, record: PackageSummary) => {
                        const prog = progressMap[record.id];
                        return prog ? (
                          <Tag color="blue">{getPackageCompaniesStatus(record.id)} 家公司</Tag>
                        ) : <Tag>-</Tag>;
                      }
                    },
                    {
                      title: '操作', key: 'action', width: 120,
                      render: (_: any, record: PackageSummary) => (
                        <Button
                          size="small"
                          type="link"
                          icon={<RightOutlined />}
                          onClick={() => setExpandedPkgId(expandedPkgId === record.id ? null : record.id)}
                        >
                          {expandedPkgId === record.id ? '收起' : '查看详情'}
                        </Button>
                      )
                    }
                  ]}
                />

                {expandedPkgId === section.packages.find(p => p.id === expandedPkgId)?.id && (
                  <Card size="small" style={{ marginTop: 8, marginLeft: 40, backgroundColor: '#fafafa' }}>
                    <EvalPackageDetail
                      pkg={section.packages.find(p => p.id === expandedPkgId)!}
                      progress={progressMap[expandedPkgId]}
                      onSelectBidder={loadBidderDetail}
                    />
                  </Card>
                )}
              </div>
            ))}
          </Card>
        ))}
      </Spin>

      {selectedBidderDetail && (
        <Card
          title={
            <Space>
              <FileTextOutlined />
              <span>{selectedBidderDetail.company_name} - 评审详情</span>
            </Space>
          }
          extra={<Button size="small" onClick={() => setSelectedBidderDetail(null)}>关闭</Button>}
          style={{ marginTop: 16 }}
        >
          <Spin spinning={detailLoading}>
            {selectedBidderDetail.items.length === 0 ? (
              <Empty description="暂无评审结果" />
            ) : (
              <Table
                dataSource={selectedBidderDetail.items}
                rowKey="id"
                pagination={false}
                columns={[
                  {
                    title: '评审项编号', dataIndex: 'item_code', key: 'item_code', width: 120,
                    render: (code: string) => <Tag color="cyan">{code}</Tag>
                  },
                  {
                    title: '评审项名称', dataIndex: 'item_name', key: 'item_name', width: 180
                  },
                  {
                    title: '得分', dataIndex: 'score', key: 'score', width: 100,
                    render: (score: number) => (
                      <Tag color={score && score >= 60 ? 'green' : score && score > 0 ? 'orange' : 'red'}>
                        {score !== undefined && score !== null ? score.toFixed(2) : '-'}
                      </Tag>
                    )
                  },
                  {
                    title: '评审状态', dataIndex: 'evaluation_status', key: 'status', width: 100,
                    render: (s: string) => {
                      const cfg = getEvalStatusConfig(s);
                      return <Tag color={cfg.color}>{cfg.text}</Tag>;
                    }
                  },
                  {
                    title: '评分理由', dataIndex: 'score_reason', key: 'reason', width: 250,
                    render: (t: string) => (
                      <Text ellipsis={{ tooltip: t }} style={{ maxWidth: 240, display: 'inline-block' }}>
                        {t || '-'}
                      </Text>
                    )
                  },
                  {
                    title: '评审依据', dataIndex: 'evaluation_basis', key: 'basis', width: 250,
                    render: (t: string) => (
                      <Text ellipsis={{ tooltip: t }} style={{ maxWidth: 240, display: 'inline-block' }}>
                        {t || '-'}
                      </Text>
                    )
                  }
                ]}
              />
            )}
          </Spin>
        </Card>
      )}
    </div>
  );
};

const EvalPackageDetail: React.FC<{
  pkg: PackageSummary;
  progress?: EvaluationProgress;
  onSelectBidder: (pkgId: number, bidderId: number) => void;
}> = ({ pkg, progress, onSelectBidder }) => {
  if (!progress) return <Spin />;

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <span>评审项：{progress.total_items} 个</span>
        <span>投标人：{progress.total_bidders} 家</span>
      </Space>

      <Table
        dataSource={progress.bidder_progress}
        rowKey="bidder_id"
        pagination={false}
        size="small"
        columns={[
          {
            title: '公司名称', dataIndex: 'company_name', key: 'company_name', width: 200
          },
          {
            title: '评审进度', key: 'progress', width: 200,
            render: (_: any, record: BidderProgress) => (
              <Space>
                <Progress
                  percent={record.progress_pct}
                  size="small"
                  style={{ width: 120, margin: 0 }}
                  status={record.progress_pct >= 100 ? 'success' : 'active'}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {record.completed_items}/{record.total_items}
                </Text>
              </Space>
            )
          },
          {
            title: '完成', dataIndex: 'completed_items', key: 'completed', width: 60,
            render: (v: number) => <Tag color="green">{v}</Tag>
          },
          {
            title: '失败', dataIndex: 'failed_items', key: 'failed', width: 60,
            render: (v: number) => v > 0 ? <Tag color="red">{v}</Tag> : <Tag>-</Tag>
          },
          {
            title: '操作', key: 'action', width: 100,
            render: (_: any, record: BidderProgress) => (
              <Button
                size="small"
                type="link"
                onClick={() => onSelectBidder(pkg.id, record.bidder_id)}
              >
                查看得分
              </Button>
            )
          }
        ]}
      />
    </div>
  );
};

export default EvaluationResults;