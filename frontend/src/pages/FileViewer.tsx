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
  const [loading, setLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [selectedSection, setSelectedSection] = useState<number | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [selectedBidder, setSelectedBidder] = useState<number | null>(null);
  const [currentSections, setCurrentSections] = useState<Section[]>([]);
  const [currentPackages, setCurrentPackages] = useState<Package[]>([]);
  const [currentBidders, setCurrentBidders] = useState<Bidder[]>([]);
  const [searchText, setSearchText] = useState('');
  const [fileTreeVisible, setFileTreeVisible] = useState(false);
  const [fileTreeData, setFileTreeData] = useState<FileNode[]>([]);
  const [selectedBidderInfo, setSelectedBidderInfo] = useState<Bidder | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (projects.length > 0 && !selectedProject) {
      handleProjectChange(projects[0].id);
    }
  }, [projects, selectedProject]);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/projects');
      const data = await response.json();
      setProjects(data);
    } catch (error) {
      message.error('获取项目列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleProjectChange = (value: number | null) => {
    setSelectedProject(value);
    setSelectedSection(null);
    setSelectedPackage(null);
    setSelectedBidder(null);
    if (value) {
      const project = projects.find(p => p.id === value);
      setCurrentSections(project?.sections || []);
    } else {
      setCurrentSections([]);
    }
  };

  const handleSectionChange = (value: number | null) => {
    setSelectedSection(value);
    setSelectedPackage(null);
    setSelectedBidder(null);
    if (value) {
      const section = currentSections.find(s => s.id === value);
      setCurrentPackages(section?.packages || []);
    } else {
      setCurrentPackages([]);
    }
  };

  const handlePackageChange = (value: number | null) => {
    setSelectedPackage(value);
    setSelectedBidder(null);
    if (value) {
      const pkg = currentPackages.find(p => p.id === value);
      setCurrentBidders(pkg?.bidders || []);
    } else {
      setCurrentBidders([]);
    }
  };

  const handleBidderChange = (value: number | null) => {
    setSelectedBidder(value);
    if (value) {
      const bidder = currentBidders.find(b => b.id === value);
      setSelectedBidderInfo(bidder || null);
    } else {
      setSelectedBidderInfo(null);
    }
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
      // 调用重新解析接口
      const response = await fetch(`/api/bidders/${bidderId}/reparse`, {
        method: 'POST'
      });
      if (response.ok) {
        message.success('重新解析任务已下发');
        // 刷新数据
        fetchProjects();
      } else {
        message.error('重新解析失败');
      }
    } catch (error) {
      message.error('重新解析失败');
    } finally {
      setLoading(false);
    }
  };

  const handleViewFiles = async (bidderId: number) => {
    setLoading(true);
    try {
      // 调用获取文件树接口
      const response = await fetch(`/api/bidders/${bidderId}/files`);
      const data = await response.json();
      setFileTreeData(data);
      setFileTreeVisible(true);
    } catch (error) {
      message.error('获取文件列表失败');
    } finally {
      setLoading(false);
    }
  };

  const filteredBidders = currentBidders.filter(bidder => {
    if (!searchText) return true;
    return bidder.company_name.toLowerCase().includes(searchText.toLowerCase()) ||
           bidder.social_credit_code.toLowerCase().includes(searchText.toLowerCase());
  });

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div className="loading" />
      </div>
    );
  }

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
          onClick={fetchProjects}
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

          {selectedProject && (
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

          {selectedSection && (
            <Select
              placeholder="筛选包"
              value={selectedPackage || undefined}
              onChange={(value) => handlePackageChange(value || null)}
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

          {selectedPackage && (
            <Select
              placeholder="筛选公司"
              value={selectedBidder || undefined}
              onChange={(value) => handleBidderChange(value || null)}
              style={{ width: 200 }}
              allowClear
            >
              {currentBidders.map(bidder => (
                <Option key={bidder.id} value={bidder.id}>
                  {bidder.company_name}
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

        {filteredBidders.length > 0 ? (
          <Table
            columns={[
              {
                title: '项目',
                key: 'project',
                width: 150,
                render: () => {
                  const project = projects.find(p => p.id === selectedProject);
                  return <Tag color="blue">{project?.project_name || '-'}</Tag>;
                }
              },
              {
                title: '标段',
                key: 'section',
                width: 150,
                render: () => {
                  const section = currentSections.find(s => s.id === selectedSection);
                  return <Tag color="purple">{section?.section_name || '-'}</Tag>;
                }
              },
              {
                title: '包',
                key: 'package',
                width: 100,
                render: () => {
                  const pkg = currentPackages.find(p => p.id === selectedPackage);
                  return <Tag color="green">{pkg?.package_no || '-'}</Tag>;
                }
              },
              {
                title: '投标公司',
                dataIndex: 'company_name',
                key: 'company_name',
                width: 200
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
                dataIndex: 'parse_status',
                key: 'parse_status',
                width: 120,
                render: (status: string) => {
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
                title: '操作',
                key: 'action',
                width: 200,
                render: (_: any, record: Bidder) => (
                  <Space size="small">
                    <Button
                      size="small"
                      icon={<RestOutlined />}
                      onClick={() => handleReParse(record.id)}
                    >
                      重新解析
                    </Button>
                    <Button
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={() => handleViewFiles(record.id)}
                    >
                      查看文件
                    </Button>
                  </Space>
                )
              }
            ]}
            dataSource={filteredBidders}
            rowKey="id"
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
          <Empty description="请选择项目、标段、包来查看投标人列表" />
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
        {fileTreeData.length > 0 ? (
          <Tree
            defaultExpandAll
            showLine
            treeData={fileTreeData.map(node => ({
              title: (
                <Space>
                  {node.isLeaf ? <FileTextOutlined style={{ color: '#1890ff' }} /> : <FolderOpenOutlined style={{ color: '#faad14' }} />}
                  <span>{node.title}</span>
                </Space>
              ),
              key: node.key,
              children: node.children
            }))}
            onSelect={(selectedKeys) => {
              // 可以在这里添加点击文件查看内容的逻辑
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
