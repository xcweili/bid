import React, { useState, useEffect } from 'react';
import {
  Card, Typography, Tag, Button, Space, message,
  Table, Empty, Progress, Spin, Divider, Select, Input, Pagination,
  Popconfirm, Tooltip
} from 'antd';
import {
  RestOutlined,
  CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined,
  FolderOpenOutlined, InboxOutlined, RightOutlined,
  ClockCircleOutlined, ArrowUpOutlined, FilterOutlined, BarChartOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import PageHeader from '../components/PageHeader';

const { Title, Text } = Typography;
const { Option } = Select;

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
  total_score: number;
}

interface BidderItemDetail {
  id: number;
  item_code: string;
  item_name: string;
  bidder_id: number;
  item_id: number;
  score: number;
  score_reason: string;
  evaluation_basis: string;
  evaluation_status: string;
  source_filename: string;
  source_page: string;
  source_quote: string;
}

interface BidderDetail {
  bidder_id: number;
  company_name: string;
  items: BidderItemDetail[];
}

const getEvalStatusConfig = (status: string) => {
  const map: Record<string, { color: string; text: string; icon: React.ReactNode }> = {
    pending: { color: 'default', text: '待评审', icon: <ClockCircleOutlined /> },
    evaluating: { color: 'processing', text: '评审中', icon: <LoadingOutlined spin /> },
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
  
  // 搜索筛选状态
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>();
  const [selectedSectionId, setSelectedSectionId] = useState<number | undefined>();
  const [selectedPackageId, setSelectedPackageId] = useState<number | undefined>();
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPackages, setTotalPackages] = useState(0);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [projectsRes, progressRes] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/packages/evaluation-progress-summary')
      ]);

      const data: Project[] = await projectsRes.json();
      setProjects(data);

      let totalCount = 0;
      data.forEach(proj => proj.sections.forEach(sec => sec.packages.forEach(() => totalCount++)));
      setTotalPackages(totalCount);

      if (progressRes.ok) {
        const allProgress: EvaluationProgress[] = await progressRes.json();
        const newProgressMap: Record<number, EvaluationProgress> = {};
        allProgress.forEach(p => { newProgressMap[p.package_id] = p; });
        setProgressMap(newProgressMap);
      }
    } catch {
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  const getPackageStatusTag = (pkgId: number) => {
    const prog = progressMap[pkgId];
    if (!prog) return <Tag color="default" icon={<ClockCircleOutlined />}>未开始</Tag>;
    const cfg = getEvalStatusConfig(prog.evaluation_status);
    return <Tag color={cfg.color} icon={cfg.icon as any}>{cfg.text}</Tag>;
  };

  const [refreshingPkgId, setRefreshingPkgId] = useState<number | null>(null);

  const refreshPackageProgress = async (pkgId: number) => {
    setRefreshingPkgId(pkgId);
    try {
      const pr = await fetch(`/api/packages/${pkgId}/evaluation-progress`);
      if (pr.ok) {
        const progress = await pr.json();
        setProgressMap(prev => ({ ...prev, [pkgId]: progress }));
      }
    } catch {
      message.error('刷新状态失败');
    } finally {
      setRefreshingPkgId(null);
    }
  };

  const hasProgressData = (pkgId: number) => {
    const prog = progressMap[pkgId];
    return prog && prog.bidder_progress && prog.bidder_progress.length > 0;
  };

  const handleTogglePackage = (pkgId: number) => {
    if (!hasProgressData(pkgId)) {
      message.info('暂无评审数据');
      return;
    }
    setExpandedPkgId(expandedPkgId === pkgId ? null : pkgId);
  };

  // 筛选项目列表
  const getFilteredProjects = (): Project[] => {
    let filtered = projects;
    
    if (selectedProjectId !== undefined) {
      filtered = filtered.filter(p => p.id === selectedProjectId);
    }
    
    if (selectedSectionId !== undefined) {
      filtered = filtered.map(p => ({
        ...p,
        sections: p.sections.filter(s => s.id === selectedSectionId)
      })).filter(p => p.sections.length > 0);
    }
    
    if (selectedPackageId !== undefined) {
      filtered = filtered.map(p => ({
        ...p,
        sections: p.sections.map(s => ({
          ...s,
          packages: s.packages.filter(pa => pa.id === selectedPackageId)
        })).filter(s => s.packages.length > 0)
      })).filter(p => p.sections.length > 0);
    }
    
    return filtered;
  };

  // 获取当前页的包数据
  const getPagedPackages = () => {
    const allPackages: { project: Project; section: Section; pkg: PackageSummary }[] = [];
    
    getFilteredProjects().forEach(project => {
      project.sections.forEach(section => {
        section.packages.forEach(pkg => {
          allPackages.push({ project, section, pkg });
        });
      });
    });
    
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return allPackages.slice(start, end);
  };

  const pagedPackages = getPagedPackages();

  // 处理项目选择变化
  const handleProjectChange = (value: number | undefined) => {
    setSelectedProjectId(value);
    setSelectedSectionId(undefined);
    setSelectedPackageId(undefined);
    setCurrentPage(1);
  };

  // 处理标段选择变化
  const handleSectionChange = (value: number | undefined) => {
    setSelectedSectionId(value);
    setSelectedPackageId(undefined);
    setCurrentPage(1);
  };

  // 处理包选择变化
  const handlePackageChange = (value: number | undefined) => {
    setSelectedPackageId(value);
    setCurrentPage(1);
  };

  // 获取当前选中项目的标段列表
  const getCurrentSections = (): Section[] => {
    if (!selectedProjectId) return [];
    const project = projects.find(p => p.id === selectedProjectId);
    return project?.sections || [];
  };

  // 获取当前选中标段的包列表
  const getCurrentPackages = (): PackageSummary[] => {
    if (!selectedSectionId) return [];
    const project = projects.find(p => p.id === selectedProjectId);
    const section = project?.sections.find(s => s.id === selectedSectionId);
    return section?.packages || [];
  };

  return (
    <div>
      {/* 页面标题区域 */}
      <PageHeader
        title="评审详情"
        description="按项目-标段-包维度查看评审进度和结果"
        icon={<BarChartOutlined />}
      />

      {/* 搜索筛选区域 */}
      <Card 
        size="small" 
        style={{ marginBottom: 20, border: '1px solid #e8e8e8', borderRadius: 8 }}
        title={<Space><FilterOutlined style={{ color: '#1890ff' }} /><span style={{ fontSize: 14, fontWeight: 500 }}>筛选条件</span></Space>}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
          <Space direction="vertical" style={{ width: 200 }}>
            <Text style={{ fontSize: 13, color: '#595959' }}>项目</Text>
            <Select
              placeholder="请选择项目"
              value={selectedProjectId}
              onChange={handleProjectChange}
              style={{ width: '100%' }}
              allowClear
            >
              {projects.map(project => (
                <Option key={project.id} value={project.id}>
                  {project.project_name} ({project.project_code})
                </Option>
              ))}
            </Select>
          </Space>

          <Space direction="vertical" style={{ width: 200 }}>
            <Text style={{ fontSize: 13, color: '#595959' }}>标段</Text>
            <Select
              placeholder="请先选择项目"
              value={selectedSectionId}
              onChange={handleSectionChange}
              style={{ width: '100%' }}
              disabled={!selectedProjectId}
              allowClear
            >
              {getCurrentSections().map(section => (
                <Option key={section.id} value={section.id}>
                  {section.section_name} ({section.section_code})
                </Option>
              ))}
            </Select>
          </Space>

          <Space direction="vertical" style={{ width: 200 }}>
            <Text style={{ fontSize: 13, color: '#595959' }}>包号</Text>
            <Select
              placeholder="请先选择标段"
              value={selectedPackageId}
              onChange={handlePackageChange}
              style={{ width: '100%' }}
              disabled={!selectedSectionId}
              allowClear
            >
              {getCurrentPackages().map(pkg => (
                <Option key={pkg.id} value={pkg.id}>
                  {pkg.package_no}
                </Option>
              ))}
            </Select>
          </Space>

          <div style={{ alignSelf: 'flex-end' }}>
            <Button
              icon={<RestOutlined />}
              onClick={() => {
                setSelectedProjectId(undefined);
                setSelectedSectionId(undefined);
                setSelectedPackageId(undefined);
                setCurrentPage(1);
              }}
            >
              重置
            </Button>
          </div>
        </div>
      </Card>

      <Spin spinning={loading}>
        {projects.length === 0 && <Empty description="暂无项目数据" />}

        {/* 按项目分组显示 */}
        {pagedPackages.length === 0 ? (
          <Empty description="暂无符合条件的数据" />
        ) : (
          <div>
            {pagedPackages.reduce((acc, { project, section, pkg }, index) => {
              // 检查是否是新项目
              if (index === 0 || acc[acc.length - 1].project.id !== project.id) {
                acc.push({
                  project,
                  sections: [{
                    section,
                    packages: [pkg]
                  }]
                });
              } else {
                // 检查是否是新标段
                const lastProject = acc[acc.length - 1];
                const lastSection = lastProject.sections[lastProject.sections.length - 1];
                if (lastSection.section.id !== section.id) {
                  lastProject.sections.push({
                    section,
                    packages: [pkg]
                  });
                } else {
                  lastSection.packages.push(pkg);
                }
              }
              return acc;
            }, [] as { project: Project; sections: { section: Section; packages: PackageSummary[] }[] }[]).map(groupedProject => (
              <Card
                key={groupedProject.project.id}
                style={{ marginBottom: 16, borderRadius: 8, border: '1px solid #e8e8e8', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                title={
                  <Space style={{ alignItems: 'center' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#1890ff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <FolderOpenOutlined style={{ color: '#fff', fontSize: 20 }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <Title level={4} style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>{groupedProject.project.project_name}</Title>
                      <Text type="secondary" style={{ fontSize: 13, color: '#8c8c8c', marginLeft: 8 }}>{groupedProject.project.project_code}</Text>
                    </div>
                  </Space>
                }
              >
                {groupedProject.sections.map(groupedSection => (
                  <div key={groupedSection.section.id} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, padding: '10px 14px', backgroundColor: '#fafafa', borderRadius: 6 }}>
                      <InboxOutlined style={{ color: '#8c8c8c', marginRight: 10, fontSize: 16 }} />
                      <Text strong style={{ fontSize: 14, color: '#595959' }}>{groupedSection.section.section_name}</Text>
                      <Tag color="gray" style={{ marginLeft: 10, fontSize: 12 }}>{groupedSection.section.section_code}</Tag>
                    </div>

                    <div style={{ paddingLeft: 8 }}>
                      <Table
                        dataSource={groupedSection.packages}
                        rowKey={(record: any) => record.id}
                        pagination={false}
                        size="small"
                        bordered={false}
                        style={{ backgroundColor: '#fff', borderRadius: 6, border: '1px solid #f0f0f0' }}
                        columns={[
                          {
                            title: '包号', dataIndex: 'package_no', key: 'package_no', width: 120,
                            render: (no: string) => (
                              <Text strong style={{ fontSize: 14, color: '#1a1a1a' }}>{no}</Text>
                            )
                          },
                          {
                            title: '评审状态', key: 'status', width: 150,
                            render: (_: any, record: PackageSummary) => {
                              const tag = getPackageStatusTag(record.id);
                              const prog = progressMap[record.id];
                              const isRefreshing = refreshingPkgId === record.id;
                              return (
                                <Space size={4}>
                                  <div style={{ padding: '4px 0' }}>{tag}</div>
                                  {prog && (
                                    <Button
                                      type="text"
                                      size="small"
                                      icon={<ReloadOutlined spin={isRefreshing} />}
                                      loading={isRefreshing}
                                      onClick={() => refreshPackageProgress(record.id)}
                                    />
                                  )}
                                </Space>
                              );
                            }
                          },
                          {
                            title: '公司进度', key: 'company_progress', width: 180,
                            render: (_: any, record: PackageSummary) => {
                              const prog = progressMap[record.id];
                              if (!prog) {
                                return <Text type="secondary">-</Text>;
                              }
                              const done = prog.bidder_progress.filter(b => b.progress_pct >= 100).length;
                              const percent = prog.total_bidders > 0 ? Math.round(done / prog.total_bidders * 100) : 0;
                              return (
                                <Space>
                                  <Progress
                                    percent={percent}
                                    size="small"
                                    style={{ width: 100 }}
                                    status={percent === 100 ? 'success' : 'active'}
                                  />
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    {done}/{prog.total_bidders} 家
                                  </Text>
                                </Space>
                              );
                            }
                          },
                          {
                            title: '评审项数', key: 'item_count', width: 100,
                            render: (_: any, record: PackageSummary) => {
                              const prog = progressMap[record.id];
                              return <Text type="secondary">{prog?.total_items || 0} 项</Text>;
                            }
                          },
                          {
                            title: '操作', key: 'action', width: 120,
                            render: (_: any, record: PackageSummary) => {
                              const hasData = hasProgressData(record.id);
                              return (
                                <Button
                                  size="small"
                                  type={hasData ? 'primary' : 'default'}
                                  ghost={!hasData}
                                  icon={<RightOutlined />}
                                  onClick={() => handleTogglePackage(record.id)}
                                  disabled={!hasData}
                                >
                                  {expandedPkgId === record.id ? '收起' : '查看详情'}
                                </Button>
                              );
                            }
                          }
                        ]}
                      />

                      {expandedPkgId === groupedSection.section.packages.find(p => p.id === expandedPkgId)?.id && (
                        <Card
                          size="small"
                          style={{
                            marginTop: 12,
                            marginLeft: 12,
                            backgroundColor: '#fafafa',
                            border: '1px solid #e8e8e8',
                            borderRadius: 6
                          }}
                        >
                          <EvalPackageDetail
                            pkg={groupedSection.section.packages.find(p => p.id === expandedPkgId)!}
                            progress={progressMap[expandedPkgId]}
                            pkgId={expandedPkgId!}
                            refreshProgress={refreshPackageProgress}
                          />
                        </Card>
                      )}
                    </div>
                  </div>
                ))}
              </Card>
            ))}

            {/* 分页组件 */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
              <Pagination
                current={currentPage}
                pageSize={pageSize}
                total={totalPackages}
                onChange={(page: number, size: number) => {
                  setCurrentPage(page);
                  setPageSize(size);
                }}
                showSizeChanger
                pageSizeOptions={['10', '20', '50', '100']}
                showTotal={(total: number, range: number[]) => `显示 ${range[0]}-${range[1]} 条，共 ${total} 条`}
              />
            </div>
          </div>
        )}
      </Spin>


    </div>
  );
};

const EvalPackageDetail: React.FC<{
  pkg: PackageSummary;
  progress?: EvaluationProgress;
  pkgId: number;
  refreshProgress: (pkgId: number) => Promise<void>;
}> = ({ pkg, progress, pkgId, refreshProgress }) => {
  const [expandedBidderId, setExpandedBidderId] = useState<number | null>(null);
  const [bidderDetailMap, setBidderDetailMap] = useState<Record<number, BidderItemDetail[]>>({});
  const [detailLoadingMap, setDetailLoadingMap] = useState<Record<number, boolean>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [rerunning, setRerunning] = useState(false);

  // 用 ref 追踪当前展开的投标人，避免 setTimeout 中的闭包过期问题
  const expandedBidderRef = React.useRef<number | null>(null);
  React.useEffect(() => { expandedBidderRef.current = expandedBidderId; }, [expandedBidderId]);

  if (!progress) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0' }}>
        <Empty description="暂无评审数据" />
      </div>
    );
  }

  if (!progress.bidder_progress || progress.bidder_progress.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0' }}>
        <Empty description="暂无评审数据" />
      </div>
    );
  }

  const loadBidderDetail = async (bidderId: number, forceRefresh: boolean = false) => {
    if (!forceRefresh && bidderDetailMap[bidderId]) return;
    setDetailLoadingMap(prev => ({ ...prev, [bidderId]: true }));
    try {
      const res = await fetch(`/api/packages/${pkgId}/evaluation-detail/${bidderId}`);
      if (res.ok) {
        const data: BidderDetail = await res.json();
        setBidderDetailMap(prev => ({ ...prev, [bidderId]: data.items }));
      }
    } catch {
      message.error('获取评审详情失败');
    } finally {
      setDetailLoadingMap(prev => ({ ...prev, [bidderId]: false }));
    }
  };

  // 当 progress 数据变化时，自动清除详情缓存并重新拉取当前展开的投标人数据
  const prevProgressFingerprint = React.useRef<string>('');
  React.useEffect(() => {
    const fingerprint = JSON.stringify(progress?.bidder_progress?.map(b =>
      `${b.bidder_id}:${b.completed_items}:${b.failed_items}:${b.total_score}`
    ) || []);
    if (prevProgressFingerprint.current && prevProgressFingerprint.current !== fingerprint) {
      setBidderDetailMap({});
      if (expandedBidderRef.current) {
        loadBidderDetail(expandedBidderRef.current, true);
      }
    }
    prevProgressFingerprint.current = fingerprint;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  const handleExpand = (expanded: boolean, record: BidderProgress) => {
    setExpandedBidderId(expanded ? record.bidder_id : null);
    if (expanded) {
      loadBidderDetail(record.bidder_id);
    }
  };

  const handleRerunFailed = async () => {
    setRerunning(true);
    try {
      const res = await fetch(`/api/packages/${pkgId}/rerun-failed`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok) {
        message.success(data.message || '已开始重跑失败项');
        setTimeout(async () => {
          setRerunning(false);
          await refreshProgress(pkgId);
        }, 1500);
      } else {
        message.error(data.detail || '重跑失败');
        setRerunning(false);
      }
    } catch {
      message.error('重跑请求失败');
      setRerunning(false);
    }
  };

  // 计算是否有失败项
  const hasFailedItems = progress.bidder_progress.some(b => b.failed_items > 0);
  const totalFailedItems = progress.bidder_progress.reduce((sum, b) => sum + b.failed_items, 0);

  const [singleRerunningMap, setSingleRerunningMap] = useState<Record<number, boolean>>({});

  const handleRerunSingleItem = async (bidderId: number, itemId: number, resultId: number) => {
    setSingleRerunningMap(prev => ({ ...prev, [resultId]: true }));
    try {
      const res = await fetch(`/api/packages/${pkgId}/rerun-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bidder_id: bidderId, item_id: itemId })
      });
      const data = await res.json();
      if (res.ok) {
        message.success(data.message || '已开始重跑');
        setTimeout(async () => {
          setSingleRerunningMap(prev => ({ ...prev, [resultId]: false }));
          await refreshProgress(pkgId);
        }, 1500);
      } else {
        message.error(data.detail || '重跑失败');
        setSingleRerunningMap(prev => ({ ...prev, [resultId]: false }));
      }
    } catch {
      message.error('重跑请求失败');
      setSingleRerunningMap(prev => ({ ...prev, [resultId]: false }));
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '1px dashed #d9d9d9' }}>
        <Space size="large">
          <span style={{ color: '#595959' }}>评审项总数：</span>
          <Tag color="blue" style={{ fontSize: 13, padding: '4px 12px' }}>{progress.total_items} 项</Tag>
          <span style={{ color: '#595959' }}>投标人总数：</span>
          <Tag color="green" style={{ fontSize: 13, padding: '4px 12px' }}>{progress.total_bidders} 家</Tag>
          {hasFailedItems && (
            <>
              <span style={{ color: '#ff4d4f' }}>失败项：</span>
              <Tag color="red" style={{ fontSize: 13, padding: '4px 12px' }}>{totalFailedItems} 项</Tag>
              <Popconfirm
                title="重跑失败项"
                description={`确定要重跑 ${totalFailedItems} 个失败的评审项吗？将带上基本信息重新调用 Dify 工作流。`}
                onConfirm={handleRerunFailed}
                okText="确定"
                cancelText="取消"
              >
                <Button
                  type="primary"
                  danger
                  size="small"
                  icon={<ReloadOutlined spin={rerunning} />}
                  loading={rerunning}
                  disabled={rerunning}
                >
                  {rerunning ? '重跑中...' : `重跑全部失败项 (${totalFailedItems})`}
                </Button>
              </Popconfirm>
            </>
          )}
        </Space>
      </div>

      <Table
        dataSource={progress.bidder_progress}
        rowKey={(record: any) => record.bidder_id}
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          onChange: (page, size) => {
            setCurrentPage(page);
            setPageSize(size);
          }
        }}
        size="small"
        bordered={false}
        style={{ backgroundColor: '#fff', borderRadius: 6 }}
        expandable={{
          expandedRowRender: (record: BidderProgress) => {
            const items = bidderDetailMap[record.bidder_id];
            const loading = detailLoadingMap[record.bidder_id];

            if (loading) {
              return <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>;
            }
            if (!items || items.length === 0) {
              return <Empty description="暂无评审结果" />;
            }

            return (
              <div style={{ padding: '8px 0' }}>
                <div style={{ marginBottom: 12, padding: '8px 12px', backgroundColor: '#f5f5f5', borderRadius: 6 }}>
                  <Space>
                    <ArrowUpOutlined style={{ color: '#1890ff' }} />
                    <Text type="secondary">共 {items.length} 个评审项</Text>
                    <Divider type="vertical" />
                    <Text type="secondary">
                      已完成: {items.filter(i => i.evaluation_status === 'completed').length}
                    </Text>
                    <Divider type="vertical" />
                    <Text type="secondary">
                      失败: {items.filter(i => i.evaluation_status === 'failed').length}
                    </Text>
                  </Space>
                </div>
                <Table
                  dataSource={items}
                  rowKey={(r: any) => r.id}
                  pagination={false}
                  bordered={false}
                  size="small"
                  style={{ backgroundColor: '#fff', borderRadius: 6 }}
                  columns={[
                    {
                      title: '评审项编号', dataIndex: 'item_code', key: 'item_code', width: 120,
                      render: (code: string) => <Tag color="cyan">{code}</Tag>
                    },
                    {
                      title: '评审项名称', dataIndex: 'item_name', key: 'item_name', width: 200
                    },
                    {
                      title: '得分', dataIndex: 'score', key: 'score', width: 100,
                      render: (score: number) => (
                        <Tag color={score && score >= 60 ? 'green' : score && score > 0 ? 'orange' : 'red'}
                             style={{ fontSize: 14, fontWeight: 600, padding: '4px 12px' }}>
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
                      title: '评分理由', dataIndex: 'score_reason', key: 'reason', width: 280,
                      render: (t: string) => (
                        <Text ellipsis={{ tooltip: t }} style={{ maxWidth: 270, display: 'inline-block' }}>
                          {t || '-'}
                        </Text>
                      )
                    },
                    {
                      title: '来源文件', dataIndex: 'source_filename', key: 'source_filename', width: 180,
                      render: (t: string) => (
                        <Text ellipsis={{ tooltip: t }} style={{ maxWidth: 170, display: 'inline-block' }}>
                          {t || '-'}
                        </Text>
                      )
                    },
                    {
                      title: '页码', dataIndex: 'source_page', key: 'source_page', width: 80,
                      render: (t: string) => <Text type="secondary">{t || '-'}</Text>
                    },
                    {
                      title: '原文引用', dataIndex: 'source_quote', key: 'source_quote', width: 300,
                      render: (t: string) => (
                        <Text ellipsis={{ tooltip: t }} style={{ maxWidth: 290, display: 'inline-block' }}>
                          {t || '-'}
                        </Text>
                      )
                    },
                    {
                      title: '操作', key: 'action', width: 100, fixed: 'right',
                      render: (_: any, record: BidderItemDetail) => {
                        const isRerunning = singleRerunningMap[record.id];
                        return (
                          <Popconfirm
                            title="重跑该项"
                            description="确定要重新评审该项吗？将删除旧结果并重新调用 Dify 工作流。"
                            onConfirm={() => handleRerunSingleItem(record.bidder_id, record.item_id, record.id)}
                            okText="确定"
                            cancelText="取消"
                          >
                          <Tooltip title="重跑该项">
                            <Button
                              size="small"
                              type="text"
                              danger
                              icon={<ReloadOutlined spin={isRerunning} />}
                              loading={isRerunning}
                              disabled={isRerunning}
                            />
                          </Tooltip>
                          </Popconfirm>
                        );
                      }
                    }
                  ]}
                />
              </div>
            );
          },
          expandedRowKeys: expandedBidderId !== null ? [expandedBidderId] : [],
          onExpand: handleExpand,
          rowExpandable: () => true,
        }}
        columns={[
          {
            title: '公司名称', dataIndex: 'company_name', key: 'company_name', width: 220,
            render: (name: string) => <Text strong>{name}</Text>
          },
          {
            title: '评审进度', key: 'progress', width: 220,
            render: (_: any, record: BidderProgress) => {
              const executed = record.completed_items + record.failed_items;
              return (
                <Space>
                  <Progress
                    percent={record.progress_pct}
                    size="small"
                    style={{ width: 120, margin: 0 }}
                    status={record.progress_pct >= 100 ? 'success' : 'active'}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {executed}/{record.total_items}
                  </Text>
                </Space>
              );
            }
          },
          {
            title: '成功', dataIndex: 'completed_items', key: 'completed', width: 80,
            render: (v: number) => <Tag color="green">{v}</Tag>
          },
          {
            title: '失败', dataIndex: 'failed_items', key: 'failed', width: 80,
            render: (v: number) => v > 0 ? <Tag color="red">{v}</Tag> : <Tag color="default">-</Tag>
          },
          {
            title: '总分', dataIndex: 'total_score', key: 'total_score', width: 100,
            render: (score: number) => {
              const isValid = score !== undefined && score !== null;
              return (
                <Tag color={isValid ? (score >= 60 ? 'gold' : 'red') : 'default'}
                     style={{ fontSize: 14, fontWeight: 600, padding: '4px 12px' }}>
                  {isValid ? Number(score).toFixed(2) : '-'}
                </Tag>
              );
            }
          },
        ]}
      />
    </div>
  );
};

export default EvaluationResults;
