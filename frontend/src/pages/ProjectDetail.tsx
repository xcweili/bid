import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Typography, Tag, Button, Space, message,
  Descriptions, Tabs, Table, Statistic, Empty, Badge,
  Modal, Checkbox, InputNumber, Tooltip, Divider, Select, Input, Progress, Drawer
} from 'antd';
import {
  ArrowLeftOutlined, FolderOpenOutlined, InboxOutlined,
  BankOutlined, ReloadOutlined, EyeOutlined, PlusOutlined,
  SaveOutlined, SettingOutlined, PlayCircleOutlined,
  BarChartOutlined, EditOutlined, DeleteOutlined
} from '@ant-design/icons';
import { evaluationItemService, EvaluationItem, PackageItemWithDetails } from '../services/evaluationItemService';

const { Title, Text } = Typography;
const { TabPane } = Tabs;
const { Option } = Select;

interface Bidder {
  id: number;
  package_id: number;
  company_name: string;
  social_credit_code: string;
}

interface Package {
  id: number;
  section_id: number;
  package_no: string;
  bidder_count: number;
  item_count: number;
  bidders: Bidder[];
  evaluation_status?: string;
  max_concurrency?: number;
  total_bidders?: number;
  bidder_progress?: Array<{
    bidder_id: number;
    company_name: string;
    completed_items: number;
    total_items: number;
    progress_pct: number;
  }>;
}

interface Section {
  id: number;
  project_id: number;
  section_code: string;
  section_name: string;
  package_count: number;
  packages: Package[];
}

interface Project {
  id: number;
  project_code: string;
  project_name: string;
  created_at: string;
  updated_at: string;
  section_count: number;
  sections: Section[];
}

const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(window.location.search);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'evaluation');
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [allItems, setAllItems] = useState<EvaluationItem[]>([]);
  const [packageItems, setPackageItems] = useState<PackageItemWithDetails[]>([]);
  const [packageItemsTotal, setPackageItemsTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [searchText, setSearchText] = useState('');
  const [bidderDetailVisible, setBidderDetailVisible] = useState(false);
  const [selectedBidder, setSelectedBidder] = useState<Bidder | null>(null);
  const [concurrencyValue, setConcurrencyValue] = useState<number>(1);
  const [concurrencySaving, setConcurrencySaving] = useState(false);
  // 编辑抽屉
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [editingPackageItem, setEditingPackageItem] = useState<PackageItemWithDetails | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState<{
    evaluation_type: string;
    evaluation_stage: string;
    rule_category: string;
    rule_content: string;
    bound_filenames_text: string;
    workflow_id: string;
    api_key: string;
    base_url: string;
  }>({ evaluation_type: '', evaluation_stage: '', rule_category: '', rule_content: '', bound_filenames_text: '', workflow_id: '', api_key: '', base_url: '' });
  // 从模板添加
  const [showAddFromTemplate, setShowAddFromTemplate] = useState(false);
  const [templateSearchText, setTemplateSearchText] = useState('');
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>([]);

  useEffect(() => {
    if (id) {
      fetchProject();
    }
  }, [id]);

  useEffect(() => {
    fetchAllItems();
  }, []);

  useEffect(() => {
    if (selectedPackage) {
      fetchPackageItems(selectedPackage.id, 1, pageSize, searchText);
    }
  }, [selectedPackage]);

  const fetchProject = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${id}`);
      const data = await response.json();
      
      // 为每个包获取评审进度信息
      for (const section of data.sections || []) {
        for (const pkg of section.packages || []) {
          try {
            const progressRes = await fetch(`/api/packages/${pkg.id}/evaluation-progress`);
            const progressData = await progressRes.json();
            console.log(`包 ${pkg.id} 的评审状态:`, progressData.evaluation_status);
            pkg.evaluation_status = progressData.evaluation_status || 'pending';
            pkg.total_bidders = progressData.total_bidders || 0;
            pkg.bidder_progress = progressData.bidder_progress || [];
          } catch (error) {
            console.error(`获取包 ${pkg.id} 的评审进度失败:`, error);
            pkg.evaluation_status = 'pending';
            pkg.bidder_progress = [];
          }
        }
      }
      
      setProject(data);
      // 默认选中第一个标段
      if (data.sections && data.sections.length > 0) {
        setSelectedSection(data.sections[0]);
        // 默认选中第一个包
        if (data.sections[0].packages && data.sections[0].packages.length > 0) {
          setSelectedPackage(data.sections[0].packages[0]);
        }
      }
    } catch (error) {
      message.error('获取项目详情失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllItems = async () => {
    try {
      const items = await evaluationItemService.getAllItems();
      setAllItems(items.filter(i => i.is_active));
    } catch (error) {
      console.error('获取评审项失败:', error);
    }
  };

  const fetchPackageItems = async (packageId: number, page: number = 1, pageSize: number = 15, keyword: string = "") => {
    try {
      const result = await evaluationItemService.getPackageItems(packageId, page, pageSize, keyword);
      setPackageItems(result.items);
      setPackageItemsTotal(result.total);
      setCurrentPage(result.page);
      setSelectedItemIds([]);
    } catch (error) {
      console.error('获取包评审项失败:', error);
    }
  };

  const getEvaluationStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; text: string }> = {
      pending: { color: 'default', text: '待评审' },
      evaluating: { color: 'processing', text: '评审中' },
      completed: { color: 'success', text: '已完成' },
      failed: { color: 'error', text: '失败' },
    };
    return configs[status] || configs.pending;
  };

  const handleSectionChange = (section: Section) => {
    setSelectedSection(section);
    // 切换到该标段的第一个包
    if (section.packages && section.packages.length > 0) {
      setSelectedPackage(section.packages[0]);
    } else {
      setSelectedPackage(null);
    }
  };

  const handlePackageChange = (pkg: Package) => {
    setSelectedPackage(pkg);
  };

  const handleConfigItems = () => {
    setShowConfigModal(true);
  };

  const handleSaveConcurrency = async () => {
    if (!selectedPackage) return;
    setConcurrencySaving(true);
    try {
      await fetch(`/api/packages/${selectedPackage.id}/concurrency?concurrency=${concurrencyValue}`, {
        method: 'PUT'
      });
      message.success('并发设置已保存');
    } catch (e) {
      console.warn('保存并发数失败:', e);
      message.error('保存失败');
    }
    setConcurrencySaving(false);
  };

  const handleEditPackageItem = (item: PackageItemWithDetails) => {
    setEditingPackageItem(item);
    setEditForm({
      evaluation_type: item.evaluation_type || '',
      evaluation_stage: item.evaluation_stage || '',
      rule_category: item.rule_category || '',
      rule_content: item.rule_content || '',
      bound_filenames_text: (item.bound_filenames || []).join('\n'),
      workflow_id: item.workflow_id || '',
      api_key: item.api_key || '',
      base_url: item.base_url || ''
    });
    setShowEditDrawer(true);
  };

  const handleSaveEditPackageItem = async () => {
    if (!selectedPackage || !editingPackageItem) return;
    setEditSaving(true);
    try {
      const boundFilenames = editForm.bound_filenames_text
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
      
      await evaluationItemService.updatePackageItem(selectedPackage.id, editingPackageItem.item_id, {
        evaluation_type: editForm.evaluation_type || undefined,
        evaluation_stage: editForm.evaluation_stage || undefined,
        rule_category: editForm.rule_category || undefined,
        rule_content: editForm.rule_content || undefined,
        bound_filenames: boundFilenames.length > 0 ? boundFilenames : undefined,
        workflow_id: editForm.workflow_id || undefined,
        api_key: editForm.api_key || undefined,
        base_url: editForm.base_url || undefined
      });
      message.success('保存成功');
      setShowEditDrawer(false);
      // 刷新包配置
      fetchPackageItems(selectedPackage.id, currentPage, pageSize, searchText);
    } catch (error) {
      message.error('保存失败');
    }
    setEditSaving(false);
  };

  const handleRemovePackageItem = async (item: PackageItemWithDetails) => {
    if (!selectedPackage) return;
    Modal.confirm({
      title: '确认移除',
      content: `确定要从包中移除评审项"${item.item_name}"吗？`,
      okText: '移除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await evaluationItemService.removePackageItem(selectedPackage.id, item.id);
          message.success('已移除');
          fetchPackageItems(selectedPackage.id, currentPage, pageSize, searchText);
        } catch (error) {
          message.error('移除失败');
        }
      }
    });
  };

  const handleBatchRemove = () => {
    if (!selectedPackage || selectedItemIds.length === 0) return;
    Modal.confirm({
      title: '批量移除确认',
      content: `确定要从包中移除选中的 ${selectedItemIds.length} 个评审项吗？`,
      okText: '批量移除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          for (const itemId of selectedItemIds) {
            await evaluationItemService.removePackageItem(selectedPackage.id, itemId);
          }
          message.success(`已成功移除 ${selectedItemIds.length} 个评审项`);
          fetchPackageItems(selectedPackage.id, currentPage, pageSize, searchText);
          setSelectedItemIds([]);
        } catch (error) {
          message.error('批量移除失败');
        }
      }
    });
  };

  const handleAddFromTemplate = async (template: EvaluationItem) => {
    if (!selectedPackage) return;
    try {
      const result = await evaluationItemService.addPackageItemFromTemplate(selectedPackage.id, template.id);
      message.success(`已添加评审项"${template.item_name}"`);
      // 刷新包配置
      const items = await evaluationItemService.getPackageItems(selectedPackage.id);
      setPackageItems(items);
    } catch (error: any) {
      message.error(error.response?.data?.detail || '添加失败');
    }
  };

  const handleBatchAddFromTemplate = async () => {
    if (!selectedPackage || selectedTemplateIds.length === 0) return;
    try {
      for (const templateId of selectedTemplateIds) {
        await evaluationItemService.addPackageItemFromTemplate(selectedPackage.id, templateId);
      }
      message.success(`已成功添加 ${selectedTemplateIds.length} 个评审项`);
      setShowAddFromTemplate(false);
      setSelectedTemplateIds([]);
      // 刷新包配置
      fetchPackageItems(selectedPackage.id, currentPage, pageSize, searchText);
    } catch (error: any) {
      message.error(error.response?.data?.detail || '批量添加失败');
    }
  };

  const handleSaveConfig = async () => {
    if (!selectedPackage) return;
    
    try {
      await evaluationItemService.setPackageItems(selectedPackage.id, selectedItemIds);
      
      // 同时保存并发数设置
      setConcurrencySaving(true);
      try {
        await fetch(`/api/packages/${selectedPackage.id}/concurrency?concurrency=${concurrencyValue}`, {
          method: 'PUT'
        });
      } catch (e) {
        console.warn('保存并发数失败，但不影响评审项配置:', e);
      }
      setConcurrencySaving(false);
      
      message.success('评审配置保存成功');
      setShowConfigModal(false);
      fetchPackageItems(selectedPackage.id, currentPage, pageSize, searchText);
    } catch (error) {
      message.error('配置失败');
    }
  };

  const handleStartEvaluation = async (pkg?: Package) => {
    const targetPkg = pkg || selectedPackage;
    if (!targetPkg) return;

    Modal.confirm({
      title: '启动评审',
      content: `确定要对 "${targetPkg.package_no}" 启动 AI 评审吗？将通过 Dify 工作流进行评审。`,
      okText: '启动',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await fetch(`/api/packages/${targetPkg.id}/start-evaluation`, {
            method: 'POST'
          });
          const data = await res.json();
          if (res.ok) {
            message.success(data.message || '评审已启动');
            fetchProject();
          } else {
            message.error(data.detail || '启动失败');
          }
        } catch (error) {
          message.error('启动失败，请检查后端服务');
        }
      }
    });
  };

  const handleItemSelect = (itemId: number, checked?: boolean) => {
    setSelectedItemIds(prev => {
      const isSelected = prev.includes(itemId);
      const newChecked = checked !== undefined ? checked : !isSelected;
      
      if (newChecked) {
        return [...prev, itemId];
      } else {
        return prev.filter(id => id !== itemId);
      }
    });
  };

  // 提取所有物资品类
  const categories = Array.from(new Set(allItems.map(item => item.material_category).filter(Boolean) as string[]));

  // 计算筛选后的评审项（用于选择配置）
  const filteredItems = allItems.filter(item => {
    const matchSearch = !searchText || 
      item.item_name.toLowerCase().includes(searchText.toLowerCase()) ||
      item.item_code.toLowerCase().includes(searchText.toLowerCase());
    return matchSearch;
  });

  // 计算筛选后的模板（用于从模板添加）
  const filteredTemplateItems = allItems.filter(item => {
    const matchSearch = !templateSearchText || 
      item.item_name.toLowerCase().includes(templateSearchText.toLowerCase()) ||
      item.item_code.toLowerCase().includes(templateSearchText.toLowerCase());
    // 排除已在包中的
    const alreadyInPackage = packageItems && packageItems.length > 0 && packageItems.some(pi => pi.item_id === item.id);
    return matchSearch && !alreadyInPackage;
  });

  if (!project) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        {loading ? '加载中...' : '项目不存在'}
      </div>
    );
  }

  return (
    <div>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/projects')}
        style={{ marginBottom: 16 }}
      >
        返回项目列表
      </Button>

      {/* 项目基本信息 */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Title level={4} style={{ margin: '0 0 8px 0' }}>
              <Space>
                <BankOutlined />
                {project.project_name}
              </Space>
            </Title>
            <Space>
              <Tag color="blue">{project.project_code}</Tag>
              <Text type="secondary">项目 ID: #{project.id}</Text>
            </Space>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchProject}
              loading={loading}
            >
              刷新
            </Button>
          </div>
        </div>

        <Descriptions bordered column={2} size="small" style={{ marginTop: 16 }}>
          <Descriptions.Item label="创建时间">
            {project.created_at ? new Date(project.created_at).toLocaleString('zh-CN') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="更新时间">
            {project.updated_at ? new Date(project.updated_at).toLocaleString('zh-CN') : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Tabs activeKey={activeTab} onChange={setActiveTab} style={{ marginBottom: 16 }}>
        <TabPane tab={<Space><BarChartOutlined /> 评审管理</Space>} key="evaluation">
          <Card>
            <div style={{ marginBottom: 16 }}>
              <Title level={5} style={{ margin: 0 }}>包列表</Title>
              <Text type="secondary">选择包进行评审项配置和启动评审</Text>
            </div>

            {project.sections && project.sections.length > 0 ? (
              project.sections.map((section) => (
                <div key={section.id} style={{ marginBottom: 24 }}>
                  <Title level={5} style={{ margin: '0 0 12px 0', color: '#666' }}>
                      {section.section_name} ({section.section_code})
                    </Title>
                  {section.packages && section.packages.length > 0 ? (
                    <Table
                      columns={[
                        {
                          title: '包号',
                          dataIndex: 'package_no',
                          key: 'package_no',
                          width: 120,
                          render: (text: string, record: Package) => (
                            <Space>
                              <InboxOutlined style={{ color: '#52c41a' }} />
                              <Text strong>{text}</Text>
                            </Space>
                          )
                        },
                        {
                          title: '评审状态',
                          dataIndex: 'evaluation_status',
                          key: 'evaluation_status',
                          width: 120,
                          render: (status: string) => {
                            const config = getEvaluationStatusConfig(status || 'pending');
                            return <Tag color={config.color}>{config.text}</Tag>;
                          }
                        },
                        {
                          title: '公司进度',
                          key: 'company_progress',
                          width: 180,
                          render: (_: any, record: Package) => {
                            const progress = record.bidder_progress;
                            const totalBidders = record.total_bidders || 0;
                            if (!progress || progress.length === 0) {
                              return <Text type="secondary">-</Text>;
                            }
                            const done = progress.filter(b => b.progress_pct >= 100).length;
                            const percent = totalBidders > 0 ? Math.round((done / totalBidders) * 100) : 0;
                            return (
                              <Space>
                                <Progress
                                  percent={percent}
                                  size="small"
                                  style={{ width: 100 }}
                                  status={percent === 100 ? 'success' : 'active'}
                                />
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {done}/{totalBidders} 家
                                </Text>
                              </Space>
                            );
                          }
                        },
                        {
                          title: '投标人数量',
                          dataIndex: 'bidder_count',
                          key: 'bidder_count',
                          width: 120,
                          render: (count: number) => (
                            <Tag color="blue">{count} 家</Tag>
                          )
                        },
                        {
                          title: '评审项数量',
                          dataIndex: 'item_count',
                          key: 'item_count',
                          width: 120,
                          render: (count: number) => (
                            <Tag color={count > 0 ? 'green' : 'orange'}>{count} 个</Tag>
                          )
                        },
                        {
                          title: '操作',
                          key: 'action',
                          width: 280,
                          render: (_: any, record: Package) => (
                            <Space size="small">
                              <Button
                                size="small"
                                icon={<EyeOutlined />}
                                onClick={() => {
                                  window.location.href = `/projects/${project.id}/packages/${record.id}/evaluation`;
                                }}
                              >
                                查看详情
                              </Button>
                              <Button
                                size="small"
                                icon={<SettingOutlined />}
                                onClick={() => {
                                  setSelectedPackage(record);
                                  setConcurrencyValue(record.max_concurrency || 1);
                                  setCurrentPage(1);
                                  fetchPackageItems(record.id, 1, pageSize, searchText);
                                  setShowConfigModal(true);
                                }}
                              >
                                评审配置
                              </Button>
                              <Button
                                size="small"
                                type="primary"
                                icon={<PlayCircleOutlined />}
                                onClick={() => handleStartEvaluation(record)}
                              >
                                启动评审
                              </Button>
                            </Space>
                          )
                        }
                      ]}
                      dataSource={section.packages}
                      rowKey={(record: any) => record.id}
                      pagination={false}
                      locale={{ emptyText: <Empty description="暂无包" /> }}
                    />
                  ) : (
                    <Empty description="暂无包" />
                  )}
                </div>
              ))
            ) : (
              <Empty description="暂无标段" />
            )}

          </Card>
        </TabPane>

        <TabPane tab={<Space><FolderOpenOutlined /> 标段信息</Space>} key="section">
          <Card>
            <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
              {project.sections && project.sections.length > 0 ? (
                project.sections.map((section) => (
                  <div
                    key={section.id}
                    onClick={() => handleSectionChange(section)}
                    style={{
                      cursor: 'pointer',
                      padding: '16px 24px',
                      border: `2px solid ${selectedSection?.id === section.id ? '#1890ff' : '#e8e8e8'}`,
                      borderRadius: 8,
                      backgroundColor: selectedSection?.id === section.id ? '#e6f7ff' : '#fff',
                      transition: 'all 0.3s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FolderOpenOutlined style={{ color: '#1890ff' }} />
                      <span style={{ fontWeight: 500 }}>{section.section_name}</span>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
                      {section.section_code} · {section.package_count} 个包
                    </div>
                  </div>
                ))
              ) : (
                <Empty description="暂无标段" />
              )}
            </div>

            {/* 包列表 */}
            {selectedSection && (
              <div style={{ marginTop: 24 }}>
                <Title level={5} style={{ marginBottom: 16 }}>
                  {selectedSection.section_name} · 包列表
                </Title>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {selectedSection.packages && selectedSection.packages.length > 0 ? (
                    selectedSection.packages.map((pkg) => (
                      <div
                        key={pkg.id}
                        onClick={() => handlePackageChange(pkg)}
                        style={{
                          cursor: 'pointer',
                          padding: '12px 20px',
                          border: `2px solid ${selectedPackage?.id === pkg.id ? '#52c41a' : '#e8e8e8'}`,
                          borderRadius: 8,
                          backgroundColor: selectedPackage?.id === pkg.id ? '#f6ffed' : '#fff',
                          transition: 'all 0.3s'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <InboxOutlined style={{ color: '#52c41a' }} />
                          <span style={{ fontWeight: 500 }}>{pkg.package_no}</span>
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
                          {pkg.bidder_count} 家投标人 · {pkg.item_count} 个评审项
                        </div>
                      </div>
                    ))
                  ) : (
                    <Empty description="暂无包" />
                  )}
                </div>
              </div>
            )}

            {/* 投标人列表 */}
            {selectedPackage && (
              <div style={{ marginTop: 24 }}>
                <Title level={5} style={{ marginBottom: 16 }}>
                  {selectedPackage.package_no} · 投标人列表
                </Title>
                <Table
                  columns={[
                    {
                      title: '投标人名称',
                      dataIndex: 'company_name',
                      key: 'company_name',
                      render: (name: string) => <Text strong>{name}</Text>
                    },
                    {
                      title: '统一社会信用代码',
                      dataIndex: 'social_credit_code',
                      key: 'social_credit_code',
                      render: (code: string) => code || '-'
                    },
                    {
                      title: '操作',
                      key: 'action',
                      render: (_: any, record: Bidder) => (
                        <Button 
                          size="small" 
                          icon={<EyeOutlined />}
                          onClick={() => {
                            setSelectedBidder(record);
                            setBidderDetailVisible(true);
                          }}
                        >
                          详情
                        </Button>
                      )
                    }
                  ]}
                  dataSource={selectedPackage.bidders}
                  rowKey="id"
                  pagination={false}
                  locale={{ emptyText: <Empty description="暂无投标人" /> }}
                />
              </div>
            )}
          </Card>
        </TabPane>
      </Tabs>

      {/* 评审配置模态框 */}
      <Modal
        title={`评审配置 - "${selectedPackage?.package_no}"`}
        visible={showConfigModal}
        width={900}
        footer={null}
        onCancel={() => setShowConfigModal(false)}
      >
        <div style={{ padding: 16 }}>

          {/* 并发设置 */}
          <div style={{ marginBottom: 24, padding: '16px 20px', background: '#f6f8fa', borderRadius: 8, border: '1px solid #e8e8e8' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>最大并发数</div>
                <div style={{ fontSize: 13, color: '#8c8c8c', lineHeight: 1.6 }}>
                  控制 <strong>AI评审</strong> 的并发数。<br />
                  设为 <Tag style={{ fontSize: 12, lineHeight: '18px', margin: 0 }}>1</Tag> 表示串行（逐个处理），设为更大的值可加速处理过程。
                </div>
              </div>
              <Space>
                <InputNumber
                  min={1}
                  max={20}
                  value={concurrencyValue}
                  onChange={(val) => setConcurrencyValue(val || 1)}
                  style={{ width: 100 }}
                  size="large"
                />
                <span style={{ fontSize: 13, color: '#595959' }}>个并发</span>
              </Space>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Title level={5} style={{ margin: 0 }}>已配置的评审项</Title>
            <Space>
              <Input.Search
                placeholder="搜索编号或名称"
                allowClear
                enterButton
                style={{ width: 250 }}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onSearch={() => {
                  setCurrentPage(1);
                  fetchPackageItems(selectedPackage!.id, 1, pageSize, searchText);
                }}
              />
              {selectedItemIds.length > 0 && (
                <Button danger icon={<DeleteOutlined />} onClick={handleBatchRemove}>
                  批量移除 ({selectedItemIds.length})
                </Button>
              )}
              <Button icon={<PlusOutlined />} onClick={() => setShowAddFromTemplate(true)}>
                从模板添加
              </Button>
            </Space>
          </div>

          {packageItems && packageItems.length > 0 ? (
            <Table
              rowSelection={{
                type: 'checkbox',
                selectedRowKeys: selectedItemIds,
                onChange: (selectedRowKeys: number[]) => setSelectedItemIds(selectedRowKeys),
              }}
              columns={[
                {
                  title: '编号',
                  dataIndex: 'item_code',
                  width: 120
                },
                {
                  title: '名称',
                  dataIndex: 'item_name',
                  width: 180
                },
                {
                  title: '阶段',
                  dataIndex: 'evaluation_stage',
                  width: 90,
                  render: (val: string) => val ? <Tag>{val}</Tag> : <Text type="secondary">-</Text>
                },
                {
                  title: '分类',
                  dataIndex: 'rule_category',
                  width: 90,
                  render: (val: string) => val ? <Tag>{val}</Tag> : <Text type="secondary">-</Text>
                },
                {
                  title: '绑定文件',
                  dataIndex: 'bound_filenames',
                  width: 180,
                  render: (val: string[]) => {
                    if (!val || val.length === 0) return <Text type="secondary">-</Text>;
                    return val.map((name, i) => <Tag key={i} style={{ fontSize: 11, marginBottom: 2 }}>{name}</Tag>);
                  }
                },
                {
                  title: '操作',
                  width: 80,
                  render: (_: any, record: PackageItemWithDetails) => (
                    <Button size="small" icon={<EditOutlined />} onClick={() => handleEditPackageItem(record)}>
                      编辑
                    </Button>
                  )
                }
              ]}
              dataSource={packageItems}
              rowKey="id"
              pagination={{
                current: currentPage,
                pageSize: pageSize,
                total: packageItemsTotal,
                showSizeChanger: true,
                pageSizeOptions: ['10', '15', '20', '50'],
                onChange: (page, size) => {
                  setCurrentPage(page);
                  setPageSize(size);
                  fetchPackageItems(selectedPackage!.id, page, size, searchText);
                },
                onShowSizeChange: (current, size) => {
                  setPageSize(size);
                  setCurrentPage(1);
                  fetchPackageItems(selectedPackage!.id, 1, size, searchText);
                }
              }}
              size="small"
            />
          ) : (
            <Empty description="暂未配置评审项，请点击「从模板添加」或通过项目导入接口推送" />
          )}

          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
            <Space>
              <Button onClick={() => setShowConfigModal(false)}>关闭</Button>
              <Button type="primary" onClick={handleSaveConcurrency} icon={<SaveOutlined />}>
                保存并发设置
              </Button>
            </Space>
          </div>
        </div>
      </Modal>

      {/* 编辑评审项抽屉 */}
      <Drawer
        title={`编辑评审项 - ${editingPackageItem?.item_name || ''}`}
        placement="right"
        width={500}
        open={showEditDrawer}
        onClose={() => setShowEditDrawer(false)}
      >
        {editingPackageItem && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>评审项编号</label>
              <Input value={editingPackageItem.item_code} disabled />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>评审项名称</label>
              <Input value={editingPackageItem.item_name} disabled />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>评审类型</label>
              <Select
                value={editForm.evaluation_type}
                onChange={(val) => setEditForm({ ...editForm, evaluation_type: val })}
                style={{ width: '100%' }}
                placeholder="选择评审类型"
              >
                <Option value="技术">技术</Option>
                <Option value="商务">商务</Option>
                <Option value="综合">综合</Option>
              </Select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>评审阶段</label>
              <Select
                value={editForm.evaluation_stage}
                onChange={(val) => setEditForm({ ...editForm, evaluation_stage: val })}
                style={{ width: '100%' }}
                placeholder="选择评审阶段"
              >
                <Option value="初评">初评</Option>
                <Option value="详评">详评</Option>
              </Select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>规则分类</label>
              <Select
                value={editForm.rule_category}
                onChange={(val) => setEditForm({ ...editForm, rule_category: val })}
                style={{ width: '100%' }}
                placeholder="选择规则分类"
              >
                <Option value="价格">价格</Option>
                <Option value="技术">技术</Option>
                <Option value="商务">商务</Option>
                <Option value="资质">资质</Option>
                <Option value="服务">服务</Option>
                <Option value="其他">其他</Option>
              </Select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>评审内容</label>
              <Input.TextArea
                rows={6}
                value={editForm.rule_content}
                onChange={(e) => setEditForm({ ...editForm, rule_content: e.target.value })}
                placeholder="评审内容（可覆盖模板内容）"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>绑定文件名（每行一个）</label>
              <Input.TextArea
                rows={3}
                value={editForm.bound_filenames_text}
                onChange={(e) => setEditForm({ ...editForm, bound_filenames_text: e.target.value })}
                placeholder="售后 服务 支持"
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                评审时将根据文件名匹配投标人的文件，支持通配符 *
              </Text>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Dify 工作流 ID</label>
              <Input
                value={editForm.workflow_id}
                onChange={(e) => setEditForm({ ...editForm, workflow_id: e.target.value })}
                placeholder="Dify Workflow ID"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Dify API Key</label>
              <Input
                value={editForm.api_key}
                onChange={(e) => setEditForm({ ...editForm, api_key: e.target.value })}
                placeholder="Dify API Key"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Dify Base URL</label>
              <Input
                value={editForm.base_url}
                onChange={(e) => setEditForm({ ...editForm, base_url: e.target.value })}
                placeholder="https://api.dify.ai/v1"
              />
            </div>
            <div style={{ marginTop: 24, textAlign: 'right' }}>
              <Space>
                <Button onClick={() => setShowEditDrawer(false)}>取消</Button>
                <Button type="primary" onClick={handleSaveEditPackageItem} loading={editSaving}>
                  保存修改
                </Button>
              </Space>
            </div>
          </div>
        )}
      </Drawer>

      {/* 从模板添加评审项 */}
      <Modal
        title="从模板添加评审项"
        visible={showAddFromTemplate}
        width={900}
        footer={[
          <Button key="cancel" onClick={() => {
            setShowAddFromTemplate(false);
            setSelectedTemplateIds([]);
          }}>
            取消
          </Button>,
          <Button 
            key="add" 
            type="primary" 
            disabled={selectedTemplateIds.length === 0}
            onClick={handleBatchAddFromTemplate}
            icon={<PlusOutlined />}
          >
            批量添加 ({selectedTemplateIds.length})
          </Button>
        ]}
        onCancel={() => {
          setShowAddFromTemplate(false);
          setSelectedTemplateIds([]);
        }}
      >
        <div>
          <Input.Search
            placeholder="搜索评审项名称或编号"
            value={templateSearchText}
            onChange={(e) => setTemplateSearchText(e.target.value)}
            style={{ marginBottom: 16, width: 300 }}
            allowClear
          />
          {filteredTemplateItems.length > 0 ? (
            <Table
              rowSelection={{
                type: 'checkbox',
                selectedRowKeys: selectedTemplateIds,
                onChange: (selectedRowKeys: number[]) => setSelectedTemplateIds(selectedRowKeys),
              }}
              columns={[
                {
                  title: '编号',
                  dataIndex: 'item_code',
                  width: 100
                },
                {
                  title: '名称',
                  dataIndex: 'item_name',
                  width: 150
                },
                {
                  title: '物资品类',
                  dataIndex: 'material_category',
                  width: 120,
                  render: (val: string) => val || '-'
                },
                {
                  title: '内容',
                  dataIndex: 'item_content',
                  render: (val: string) => {
                    if (!val) return '-';
                    // 显示前100个字符
                    return val.length > 100 ? val.substring(0, 100) + '...' : val;
                  }
                }
              ]}
              dataSource={filteredTemplateItems}
              rowKey="id"
              pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'] }}
              size="small"
            />
          ) : (
            <Empty description="暂无匹配的评审项模板" />
          )}
        </div>
      </Modal>

      {/* 投标人详情弹窗 */}
      <Modal
        title="投标人详情"
        open={bidderDetailVisible}
        onCancel={() => setBidderDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setBidderDetailVisible(false)}>
            关闭
          </Button>
        ]}
        width={600}
      >
        {selectedBidder && (
          <Descriptions bordered column={1} style={{ marginTop: 16 }}>
            <Descriptions.Item label="投标人名称">
              {selectedBidder.company_name}
            </Descriptions.Item>
            <Descriptions.Item label="统一社会信用代码">
              {selectedBidder.social_credit_code || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="所属包">
              {selectedPackage?.package_no || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="所属标段">
              {selectedSection?.section_name || '-'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default ProjectDetail;