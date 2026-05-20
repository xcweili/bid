import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Typography, Tag, Button, Space, message,
  Descriptions, Tabs, Table, Statistic, Empty, Badge,
  Modal, Checkbox, InputNumber, Tooltip, Divider, Select, Input
} from 'antd';
import {
  ArrowLeftOutlined, FolderOpenOutlined, InboxOutlined,
  BankOutlined, ReloadOutlined, EyeOutlined, PlusOutlined,
  SaveOutlined, SettingOutlined, PlayCircleOutlined,
  BarChartOutlined
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
  status: string;
  bidder_count: number;
  item_count: number;
  bidders: Bidder[];
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
  status: string;
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
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [bidderDetailVisible, setBidderDetailVisible] = useState(false);
  const [selectedBidder, setSelectedBidder] = useState<Bidder | null>(null);

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
      fetchPackageItems(selectedPackage.id);
    }
  }, [selectedPackage]);

  const fetchProject = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${id}`);
      const data = await response.json();
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

  const fetchPackageItems = async (packageId: number) => {
    try {
      const items = await evaluationItemService.getPackageItems(packageId);
      setPackageItems(items);
      setSelectedItemIds(items.map(item => item.id));
    } catch (error) {
      console.error('获取包评审项失败:', error);
    }
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; text: string }> = {
      pending: { color: 'default', text: '待处理' },
      processing: { color: 'processing', text: '评审中' },
      completed: { color: 'success', text: '已完成' },
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

  const handleSaveConfig = async () => {
    if (!selectedPackage) return;
    
    try {
      await evaluationItemService.setPackageItems(selectedPackage.id, selectedItemIds);
      message.success('评审项配置成功');
      setShowConfigModal(false);
      fetchPackageItems(selectedPackage.id);
    } catch (error) {
      message.error('配置失败');
    }
  };

  const handleStartEvaluation = async () => {
    if (!selectedPackage) return;
    
    Modal.confirm({
      title: '启动评审',
      content: `确定要对 "${selectedPackage.package_no}" 启动 AI 评审吗？将通过 Dify 工作流进行评审。`,
      okText: '启动',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await fetch(`/api/packages/${selectedPackage.id}/start-evaluation`, {
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

  // 过滤后的评审项
  const filteredItems = allItems.filter(item => {
    const matchSearch = !searchText || 
      item.item_name.toLowerCase().includes(searchText.toLowerCase()) ||
      item.item_code.toLowerCase().includes(searchText.toLowerCase());
    
    const matchCategory = !categoryFilter || item.material_category === categoryFilter;
    
    return matchSearch && matchCategory;
  });

  if (!project) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        {loading ? '加载中...' : '项目不存在'}
      </div>
    );
  }

  const status = getStatusConfig(project.status);

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
              <Tag color={status.color}>{status.text}</Tag>
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
                          title: '状态',
                          dataIndex: 'status',
                          key: 'status',
                          width: 100,
                          render: (status: string) => {
                            const config = getStatusConfig(status);
                            return <Tag color={config.color}>{config.text}</Tag>;
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
                                  fetchPackageItems(record.id);
                                  setShowConfigModal(true);
                                }}
                              >
                                配置评审项
                              </Button>
                              <Button
                                size="small"
                                type="primary"
                                icon={<PlayCircleOutlined />}
                                onClick={() => {
                                  setSelectedPackage(record);
                                  fetchPackageItems(record.id);
                                  handleStartEvaluation();
                                }}
                              >
                                启动评审
                              </Button>
                            </Space>
                          )
                        }
                      ]}
                      dataSource={section.packages}
                      rowKey="id"
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

      {/* 评审项配置模态框 */}
      <Modal
        title={`配置 "${selectedPackage?.package_no}" 的评审项`}
        visible={showConfigModal}
        width={800}
        footer={null}
        onCancel={() => setShowConfigModal(false)}
      >
        <div style={{ padding: 16 }}>
          <Title level={5} style={{ marginBottom: 16 }}>选择评审项</Title>
          
          {/* 筛选区域 */}
          <div style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
            <Input.Search
              placeholder="搜索评审项名称或编号"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 250 }}
              allowClear
            />
            <Select
              placeholder="筛选物资品类"
              value={categoryFilter || undefined}
              onChange={setCategoryFilter}
              style={{ width: 180 }}
              allowClear
            >
              {categories.map(category => (
                <Option key={category} value={category}>{category}</Option>
              ))}
            </Select>
            <Button onClick={() => { setSearchText(''); setCategoryFilter(''); }}>
              重置筛选
            </Button>
          </div>

          <div style={{ maxHeight: 450, overflowY: 'auto' }}>
            {filteredItems.length > 0 ? (
              <Table
                columns={[
                  {
                    title: (
                      <Checkbox
                        checked={selectedItemIds.length === filteredItems.length && filteredItems.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedItemIds(filteredItems.map(item => item.id));
                          } else {
                            setSelectedItemIds([]);
                          }
                        }}
                      />
                    ),
                    dataIndex: 'selected',
                    width: 60,
                    render: (_: any, record: EvaluationItem) => (
                      <Checkbox
                        checked={selectedItemIds.includes(record.id)}
                        onChange={(e) => handleItemSelect(record.id, e.target.checked)}
                      />
                    )
                  },
                  {
                    title: '评审项编号',
                    dataIndex: 'item_code',
                    width: 120
                  },
                  {
                    title: '评审项名称',
                    dataIndex: 'item_name'
                  },
                  {
                    title: '物资品类',
                    dataIndex: 'material_category',
                    width: 120,
                    render: (category: string) => category || '-'
                  },
                  {
                    title: '绑定文件',
                    dataIndex: 'files',
                    width: 200,
                    render: (files: any[]) => {
                      if (!files || files.length === 0) {
                        return <Text type="secondary">-</Text>;
                      }
                      const fileNames = files.map(f => f.file_name).slice(0, 2);
                      const moreCount = files.length > 2 ? ` +${files.length - 2}` : '';
                      return (
                        <Tooltip title={files.map(f => f.file_name).join('\n')}>
                          <Tag color="blue" style={{ fontSize: 12 }}>
                            {fileNames.join(', ')}{moreCount}
                          </Tag>
                        </Tooltip>
                      );
                    }
                  }
                ]}
                dataSource={filteredItems}
                rowKey="id"
                pagination={{
                  defaultPageSize: 25,
                  pageSizeOptions: ['25', '50', '100'],
                  showSizeChanger: true,
                  showTotal: (total) => `共 ${total} 条`,
                  showQuickJumper: true
                }}
                onRow={(record) => ({
                  onClick: () => {
                    const isSelected = selectedItemIds.includes(record.id);
                    handleItemSelect(record.id, !isSelected);
                  }
                })}
              />
            ) : (
              <Empty description="暂无匹配的评审项" />
            )}
          </div>
          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary">
              已选择 {selectedItemIds.length} 个评审项
            </Text>
            <Space>
              <Button onClick={() => setShowConfigModal(false)}>取消</Button>
              <Button type="primary" onClick={handleSaveConfig} icon={<SaveOutlined />}>
                保存配置
              </Button>
            </Space>
          </div>
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