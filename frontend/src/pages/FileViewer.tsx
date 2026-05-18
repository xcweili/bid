import React, { useState, useEffect } from 'react';
import {
  Card, Typography, Tag, Button, Space, message,
  Table, Select, Input, Empty, Tooltip, Modal, Tree
} from 'antd';
import {
  FolderOpenOutlined, FileTextOutlined, RestOutlined,
  EyeOutlined, CheckCircleOutlined, ClockCircleOutlined,
  WarningOutlined, SearchOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;

interface Bidder {
  id: number;
  company_name: string;
  social_credit_code: string;
  parse_status: string;
  package_id: number;
  package_no?: string;
  section_id?: number;
  section_name?: string;
  project_id?: number;
  project_name?: string;
  project_code?: string;
}

interface Package {
  id: number;
  package_no: string;
  bidders: Bidder[];
}

interface Section {
  id: number;
  section_code: string;
  section_name: string;
  packages: Package[];
}

interface Project {
  id: number;
  project_code: string;
  project_name: string;
  sections: Section[];
}

interface FileNode {
  title: string;
  key: string;
  isLeaf?: boolean;
  children?: FileNode[];
}

const FileViewer: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [allBidders, setAllBidders] = useState<Bidder[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [selectedSection, setSelectedSection] = useState<number | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [currentSections, setCurrentSections] = useState<Section[]>([]);
  const [currentPackages, setCurrentPackages] = useState<Package[]>([]);
  const [searchText, setSearchText] = useState('');
  const [fileTreeVisible, setFileTreeVisible] = useState(false);
  const [fileTreeData, setFileTreeData] = useState<FileNode[]>([]);
  const [selectedBidderInfo, setSelectedBidderInfo] = useState<Bidder | null>(null);

  // 获取所有项目数据
  const fetchProjects = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/projects');
      const data = await response.json();
      setProjects(data);
      return data;
    } catch (error) {
      message.error('获取项目列表失败');
      return [];
    } finally {
      setLoading(false);
    }
  };

  // 扁平化所有投标人数据
  const flattenBidders = (projectsData: Project[]): Bidder[] => {
    const bidders: Bidder[] = [];
    projectsData.forEach(project => {
      project.sections.forEach(section => {
        section.packages.forEach(pkg => {
          pkg.bidders.forEach(bidder => {
            bidders.push({
              ...bidder,
              package_no: pkg.package_no,
              section_name: section.section_name,
              project_id: project.id,
              project_name: project.project_name,
              project_code: project.project_code
            });
          });
        });
      });
    });
    return bidders;
  };

  useEffect(() => {
    fetchProjects().then(data => {
      const flattened = flattenBidders(data);
      setAllBidders(flattened);
      // 不默认选中任何筛选条件，显示所有数据
    });
  }, []);

  const handleProjectChange = (value: number | null) => {
    setSelectedProject(value);
    setSelectedSection(null);
    setSelectedPackage(null);
    if (value) {
      const project = projects.find(p => p.id === value);
      setCurrentSections(project?.sections || []);
      // 不默认选中标段
    } else {
      setCurrentSections([]);
      setCurrentPackages([]);
    }
  };

  const handleSectionChange = (value: number | null) => {
    setSelectedSection(value);
    setSelectedPackage(null);
    if (value) {
      const section = currentSections.find(s => s.id === value);
      setCurrentPackages(section?.packages || []);
      // 不默认选中包
    } else {
      setCurrentPackages([]);
    }
  };

  const handlePackageChange = (value: number | null) => {
    setSelectedPackage(value);
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; text: string; icon: React.ReactNode }> = {
      completed: { color: 'success', text: '已完成', icon: <CheckCircleOutlined /> },
      processing: { color: 'orange', text: '解析中', icon: <ClockCircleOutlined /> },
      pending: { color: 'default', text: '未解析', icon: <WarningOutlined /> },
      failed: { color: 'error', text: '解析失败', icon: <WarningOutlined /> },
    };
    return configs[status] || configs.pending;
  };

  const handleReParse = async (bidderId: number) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/bidders/${bidderId}/reparse`, {
        method: 'POST'
      });
      if (response.ok) {
        message.success('重新解析任务已下发');
        fetchProjects().then(data => {
          setAllBidders(flattenBidders(data));
        });
      } else {
        message.error('重新解析失败');
      }
    } catch (error) {
      message.error('重新解析失败');
    } finally {
      setLoading(false);
    }
  };

  const handleViewFiles = async (bidder: Bidder) => {
    setLoading(true);
    setSelectedBidderInfo(bidder);
    try {
      let fileTree: any[] = [];
      if (bidder.package_id) {
        const response = await fetch(`/api/packages/${bidder.package_id}/bidders/${bidder.id}/file-tree`);
        if (response.ok) {
          const data = await response.json();
          // API返回的是 {bidder_id, company_name, file_tree}，需要提取file_tree字段
          fileTree = data.file_tree || [];
        }
      }
      setFileTreeData(fileTree);
      setFileTreeVisible(true);
    } catch (error) {
      message.error('获取文件列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 筛选投标人数据
  const getFilteredBidders = () => {
    let filtered = [...allBidders];

    if (selectedProject) {
      // 只按项目筛选
      filtered = filtered.filter(b => b.project_id === selectedProject);
      
      if (selectedSection) {
        // 按标段筛选
        const packageIds = currentPackages.map(p => p.id);
        filtered = filtered.filter(b => packageIds.includes(b.package_id));
        
        if (selectedPackage) {
          // 按包筛选
          filtered = filtered.filter(b => b.package_id === selectedPackage);
        }
      }
    }

    if (searchText) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(bidder =>
        bidder.company_name.toLowerCase().includes(searchLower) ||
        (bidder.social_credit_code && bidder.social_credit_code.toLowerCase().includes(searchLower))
      );
    }

    return filtered;
  };

  const filteredBidders = getFilteredBidders();

  return (
    <div>
      {/* 头部 */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>文件查看</Title>
          <Text type="secondary">查看和管理投标人的文件解析状态</Text>
        </div>
        <Button
          icon={<RestOutlined />}
          onClick={() => fetchProjects().then(data => setAllBidders(flattenBidders(data)))}
        >
          刷新
        </Button>
      </div>

      {/* 筛选区域 */}
      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input.Search
            placeholder="搜索公司名称或信用代码"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 300 }}
            allowClear
            prefix={<SearchOutlined />}
          />

          <Select
            placeholder="筛选项目"
            value={selectedProject || undefined}
            onChange={(value) => handleProjectChange(value || null)}
            style={{ width: 250 }}
            allowClear
          >
            {projects.map(project => (
              <Option key={project.id} value={project.id}>
                {project.project_name} ({project.project_code})
              </Option>
            ))}
          </Select>

          {currentSections.length > 0 && (
            <Select
              placeholder="筛选标段"
              value={selectedSection || undefined}
              onChange={(value) => handleSectionChange(value || null)}
              style={{ width: 200 }}
              allowClear
            >
              {currentSections.map(section => (
                <Option key={section.id} value={section.id}>
                  {section.section_name} ({section.section_code})
                </Option>
              ))}
            </Select>
          )}

          {currentPackages.length > 0 && (
            <Select
              placeholder="筛选包"
              value={selectedPackage || undefined}
              onChange={(value) => setSelectedPackage(value || null)}
              style={{ width: 150 }}
              allowClear
            >
              {currentPackages.map(pkg => (
                <Option key={pkg.id} value={pkg.id}>
                  {pkg.package_no}
                </Option>
              ))}
            </Select>
          )}
        </div>
      </Card>

      {/* 文件解析状态列表 */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <FolderOpenOutlined style={{ fontSize: 20, color: '#1890ff' }} />
          <Title level={4} style={{ margin: 0 }}>投标人文件解析状态</Title>
        </div>

        {allBidders.length > 0 ? (
          <Table
            columns={[
              {
                title: '项目',
                key: 'project',
                width: 180,
                render: (_: any, record: Bidder) => (
                  <Tag color="blue">{record.project_name || '-'}</Tag>
                )
              },
              {
                title: '标段',
                key: 'section',
                width: 150,
                render: (_: any, record: Bidder) => (
                  <Tag color="purple">{record.section_name || '-'}</Tag>
                )
              },
              {
                title: '包',
                key: 'package',
                width: 100,
                render: (_: any, record: Bidder) => (
                  <Tag color="green">{record.package_no || '-'}</Tag>
                )
              },
              {
                title: '投标公司',
                dataIndex: 'company_name',
                key: 'company_name',
                width: 220
              },
              {
                title: '统一社会信用代码',
                dataIndex: 'social_credit_code',
                key: 'social_credit_code',
                width: 180,
                render: (code: string) => code || '-'
              },
              {
                title: '解析状态',
                key: 'parse_status',
                width: 130,
                render: (_: any, record: Bidder) => {
                  const status = record.parse_status || 'pending';
                  const config = getStatusConfig(status);
                  const colorMap: Record<string, string> = {
                    success: '#52c41a',
                    orange: '#fa8c16',
                    default: '#d9d9d9',
                    error: '#f5222d'
                  };
                  return (
                    <Space>
                      <span style={{ color: colorMap[config.color] || '#d9d9d9' }}>{config.icon}</span>
                      <Tag color={config.color}>{config.text}</Tag>
                    </Space>
                  );
                }
              },
              {
                title: '解析进度',
                key: 'progress',
                width: 150,
                render: (_: any, record: Bidder) => (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span>{record.converted_count || 0}/{record.total_pdf_count || 0}</span>
                      <span>{record.total_pdf_count > 0 ? Math.round(((record.converted_count || 0) / record.total_pdf_count) * 100) : 0}%</span>
                    </div>
                    <div style={{ width: '100%', height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${record.total_pdf_count > 0 ? ((record.converted_count || 0) / record.total_pdf_count) * 100 : 0}%`,
                          height: '100%',
                          backgroundColor: record.converted_count === record.total_pdf_count && record.total_pdf_count > 0 ? '#52c41a' : '#1890ff',
                          borderRadius: 3
                        }}
                      />
                    </div>
                  </div>
                )
              },
            ]}
            dataSource={filteredBidders}
            rowKey="id"
            loading={loading}
            pagination={{
              defaultPageSize: 25,
              pageSizeOptions: ['25', '50', '100'],
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              showQuickJumper: true
            }}
            locale={{ emptyText: <Empty description="暂无投标人" /> }}
          />
        ) : (
          <Empty description="暂无投标人数据" />
        )}
      </Card>

      {/* 文件树弹窗 */}
      <Modal
        title="文件树"
        open={fileTreeVisible}
        onCancel={() => setFileTreeVisible(false)}
        footer={[
          <Button key="close" onClick={() => setFileTreeVisible(false)}>
            关闭
          </Button>
        ]}
        width={800}
        bodyStyle={{ height: 500, overflow: 'auto' }}
      >
        {selectedBidderInfo && (
          <div style={{ marginBottom: 16 }}>
            <Title level={5} style={{ margin: 0 }}>
              {selectedBidderInfo.company_name} - 文件列表
            </Title>
          </div>
        )}
        {fileTreeData && fileTreeData.length > 0 ? (
          <Tree
            defaultExpandAll
            showLine
            treeData={fileTreeData.map(node => ({
              title: (
                <Space>
                  {node.isLeaf || node.type === 'file' ? <FileTextOutlined style={{ color: '#1890ff' }} /> : <FolderOpenOutlined style={{ color: '#faad14' }} />}
                  <span>{node.title}</span>
                </Space>
              ),
              key: node.key,
              children: node.children
            }))}
            onSelect={(selectedKeys) => {
              message.info(`选中文件: ${selectedKeys[0]}`);
            }}
          />
        ) : (
          <Empty description="暂无文件" />
        )}
      </Modal>
    </div>
  );
};

export default FileViewer;
