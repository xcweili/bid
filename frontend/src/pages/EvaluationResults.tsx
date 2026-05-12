import React, { useState, useEffect } from 'react';
import {
  Card, Typography, Tag, Button, Space, message,
  Table, Empty, Input, Select
} from 'antd';
import {
  SearchOutlined, RestOutlined
} from '@ant-design/icons';
import { evaluationResultService, EvaluationResult } from '../services/evaluationResultService';

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
  packages: Package[];
}

interface Package {
  id: number;
  package_no: string;
  bidders: Bidder[];
}

interface Bidder {
  id: number;
  company_name: string;
}

const EvaluationResults: React.FC = () => {
  const [results, setResults] = useState<EvaluationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  
  // 级联筛选状态
  const [selectedProject, setSelectedProject] = useState<number | undefined>();
  const [selectedSection, setSelectedSection] = useState<number | undefined>();
  const [selectedPackage, setSelectedPackage] = useState<number | undefined>();
  const [selectedBidder, setSelectedBidder] = useState<number | undefined>();

  useEffect(() => {
    fetchResults();
    fetchProjects();
  }, []);

  const fetchResults = async () => {
    setLoading(true);
    try {
      const data = await evaluationResultService.getAllResults();
      setResults(data);
    } catch (error) {
      console.error('获取评审结果失败:', error);
      message.error('获取评审结果失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects');
      const data = await response.json();
      setProjects(data);
    } catch (error) {
      console.error('获取项目列表失败:', error);
    }
  };

  const handleRefresh = () => {
    fetchResults();
    fetchProjects();
  };

  // 项目变更时重置后续筛选
  const handleProjectChange = (value: number | undefined) => {
    setSelectedProject(value);
    setSelectedSection(undefined);
    setSelectedPackage(undefined);
    setSelectedBidder(undefined);
  };

  // 标段变更时重置后续筛选
  const handleSectionChange = (value: number | undefined) => {
    setSelectedSection(value);
    setSelectedPackage(undefined);
    setSelectedBidder(undefined);
  };

  // 包变更时重置公司筛选
  const handlePackageChange = (value: number | undefined) => {
    setSelectedPackage(value);
    setSelectedBidder(undefined);
  };

  // 获取当前选中项目的标段列表
  const currentSections = selectedProject 
    ? projects.find(p => p.id === selectedProject)?.sections || []
    : [];

  // 获取当前选中标段的包列表
  const currentPackages = selectedSection
    ? currentSections.find(s => s.id === selectedSection)?.packages || []
    : [];

  // 获取当前选中包的投标人列表
  const currentBidders = selectedPackage
    ? currentPackages.find(p => p.id === selectedPackage)?.bidders || []
    : [];

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; text: string }> = {
      pending: { color: 'default', text: '未评审' },
      processing: { color: 'orange', text: '评审中' },
      completed: { color: 'success', text: '已完成' },
    };
    return configs[status] || configs.pending;
  };

  const filteredResults = results.filter(result => {
    // 搜索过滤
    const matchSearch = searchText === '' || 
      result.company_name.toLowerCase().includes(searchText.toLowerCase()) ||
      result.item_code.toLowerCase().includes(searchText.toLowerCase()) ||
      result.item_name.toLowerCase().includes(searchText.toLowerCase());
    
    // 级联筛选
    const matchProject = !selectedProject || result.project_id === selectedProject;
    const matchSection = !selectedSection || result.section_id === selectedSection;
    const matchPackage = !selectedPackage || result.package_id === selectedPackage;
    const matchBidder = !selectedBidder || result.bidder_id === selectedBidder;
    
    return matchSearch && matchProject && matchSection && matchPackage && matchBidder;
  });

  return (
    <div>
      {/* 头部 */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>评审结果</Title>
          <Text type="secondary">查看所有评审结果</Text>
        </div>
        <Button
          icon={<RestOutlined />}
          onClick={handleRefresh}
        >
          刷新
        </Button>
      </div>

      {/* 筛选区域 */}
      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input.Search
            placeholder="搜索投标公司、评审项编号或名称"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 350 }}
            allowClear
            prefix={<SearchOutlined />}
          />
          
          {/* 项目筛选 */}
          <Select
            placeholder="筛选项目"
            value={selectedProject || undefined}
            onChange={handleProjectChange}
            style={{ width: 250 }}
            allowClear
          >
            {projects.map(project => (
              <Option key={project.id} value={project.id}>
                {project.project_name} ({project.project_code})
              </Option>
            ))}
          </Select>

          {/* 标段筛选 - 选择项目后显示 */}
          {selectedProject && (
            <Select
              placeholder="筛选标段"
              value={selectedSection || undefined}
              onChange={handleSectionChange}
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

          {/* 包筛选 - 选择标段后显示 */}
          {selectedSection && (
            <Select
              placeholder="筛选包"
              value={selectedPackage || undefined}
              onChange={handlePackageChange}
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

          {/* 公司筛选 - 选择包后显示 */}
          {selectedPackage && (
            <Select
              placeholder="筛选公司"
              value={selectedBidder || undefined}
              onChange={(value) => setSelectedBidder(value)}
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

      {/* 评审结果表格 */}
      <Card>
        {filteredResults.length > 0 ? (
          <Table
            columns={[
              {
                title: '项目',
                key: 'project',
                width: 120,
                render: () => <Tag color="blue">测试项目</Tag>
              },
              {
                title: '标段',
                key: 'section',
                width: 120,
                render: () => <Tag color="purple">信号系统标段</Tag>
              },
              {
                title: '包',
                key: 'package',
                width: 100,
                render: () => <Tag color="green">包1</Tag>
              },
              {
                title: '投标公司',
                dataIndex: 'company_name',
                key: 'company_name',
                width: 180
              },
              {
                title: '评审项编号',
                dataIndex: 'item_code',
                key: 'item_code',
                width: 120,
                render: (code: string) => <Tag color="cyan">{code}</Tag>
              },
              {
                title: '评审项名称',
                dataIndex: 'item_name',
                key: 'item_name',
                width: 200
              },
              {
                title: '评审阶段',
                key: 'stage',
                width: 100,
                render: () => <Tag color="orange">详评</Tag>
              },
              {
                title: '得分',
                dataIndex: 'score',
                key: 'score',
                width: 100,
                render: (score: number) => (
                  <Tag color={score >= 60 ? 'green' : 'red'}>
                    {score !== undefined ? score.toFixed(2) : '-'}
                  </Tag>
                )
              },
              {
                title: '评分理由',
                dataIndex: 'score_reason',
                key: 'score_reason',
                width: 250,
                render: (reason: string) => (
                  <span style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block' }}>
                    {reason || '-'}
                  </span>
                )
              },
              {
                title: '评审状态',
                dataIndex: 'evaluation_status',
                key: 'evaluation_status',
                width: 100,
                render: (status: string) => {
                  const config = getStatusConfig(status);
                  return <Tag color={config.color}>{config.text}</Tag>;
                }
              },
              {
                title: '评审依据',
                dataIndex: 'evaluation_basis',
                key: 'evaluation_basis',
                width: 200,
                render: (basis: string) => (
                  <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block' }}>
                    {basis || '-'}
                  </span>
                )
              }
            ]}
            dataSource={filteredResults}
            rowKey="id"
            loading={loading}
            pagination={{
              defaultPageSize: 25,
              pageSizeOptions: ['25', '50', '100'],
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              showQuickJumper: true
            }}
          />
        ) : (
          <Empty description="暂无评审结果" />
        )}
      </Card>
    </div>
  );
};

export default EvaluationResults;