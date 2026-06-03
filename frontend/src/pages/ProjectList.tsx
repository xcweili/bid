import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Typography, Table, Tag, Button, Space, message,
  Modal, Input, Row, Col, Statistic, Empty, Tooltip, Divider,
  Collapse, Popconfirm
} from 'antd';
import {
  PlusOutlined, EyeOutlined, DeleteOutlined,
  FolderOpenOutlined, InboxOutlined, BankOutlined,
  CloseOutlined, RightOutlined, PlusCircleOutlined,
  MinusCircleOutlined
} from '@ant-design/icons';
import PageHeader from '../components/PageHeader';

const { Title, Text } = Typography;

interface Bidder {
  id: number;
  company_name: string;
  social_credit_code: string;
}

interface Package {
  id: number;
  section_id: number;
  package_no: string;
  bidder_count: number;
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
  created_at: string;
  updated_at: string;
  section_count: number;
  sections: Section[];
}

// 表单数据结构
interface BidderForm {
  company_name: string;
  social_credit_code: string;
}

interface PackageForm {
  package_no: string;
  bidders: BidderForm[];
}

interface SectionForm {
  section_code: string;
  section_name: string;
  packages: PackageForm[];
}

const ProjectList: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProject, setNewProject] = useState({ code: '', name: '' });
  const [sections, setSections] = useState<SectionForm[]>([]);

  useEffect(() => {
    fetchProjects();
  }, []);

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

  // --- 标段操作 ---
  const addSection = () => {
    setSections([...sections, { section_code: '', section_name: '', packages: [] }]);
  };

  const removeSection = (index: number) => {
    setSections(sections.filter((_, i) => i !== index));
  };

  const updateSection = (index: number, field: keyof SectionForm, value: string) => {
    const updated = [...sections];
    updated[index] = { ...updated[index], [field]: value };
    setSections(updated);
  };

  // --- 包操作 ---
  const addPackage = (sectionIndex: number) => {
    const updated = [...sections];
    updated[sectionIndex].packages.push({ package_no: '', bidders: [] });
    setSections(updated);
  };

  const removePackage = (sectionIndex: number, packageIndex: number) => {
    const updated = [...sections];
    updated[sectionIndex].packages = updated[sectionIndex].packages.filter((_, i) => i !== packageIndex);
    setSections(updated);
  };

  const updatePackage = (sectionIndex: number, packageIndex: number, value: string) => {
    const updated = [...sections];
    updated[sectionIndex].packages[packageIndex] = { ...updated[sectionIndex].packages[packageIndex], package_no: value };
    setSections(updated);
  };

  // --- 投标人操作 ---
  const addBidder = (sectionIndex: number, packageIndex: number) => {
    const updated = [...sections];
    updated[sectionIndex].packages[packageIndex].bidders.push({ company_name: '', social_credit_code: '' });
    setSections(updated);
  };

  const removeBidder = (sectionIndex: number, packageIndex: number, bidderIndex: number) => {
    const updated = [...sections];
    updated[sectionIndex].packages[packageIndex].bidders =
      updated[sectionIndex].packages[packageIndex].bidders.filter((_, i) => i !== bidderIndex);
    setSections(updated);
  };

  const updateBidder = (sectionIndex: number, packageIndex: number, bidderIndex: number, field: keyof BidderForm, value: string) => {
    const updated = [...sections];
    updated[sectionIndex].packages[packageIndex].bidders[bidderIndex] = {
      ...updated[sectionIndex].packages[packageIndex].bidders[bidderIndex],
      [field]: value
    };
    setSections(updated);
  };

  const handleCreateProject = async () => {
    if (!newProject.code.trim() || !newProject.name.trim()) {
      message.warning('请填写项目编号和名称');
      return;
    }
    // 构建完整的请求体
    const payload = {
      projects: [{
        project_code: newProject.code,
        project_name: newProject.name,
        sections: sections.map(section => ({
          section_code: section.section_code,
          section_name: section.section_name,
          packages: section.packages.map(pkg => ({
            package_no: pkg.package_no,
            bidders: pkg.bidders.map(bidder => ({
              company_name: bidder.company_name,
              social_credit_code: bidder.social_credit_code,
              rule_list: []  // 创建时无需规则，可在项目详情中配置
            }))
          }))
        }))
      }]
    };

    try {
      const response = await fetch('/api/import-project-bid-structure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (result.code === 0) {
        message.success('项目创建成功');
        setShowCreateModal(false);
        resetForm();
        fetchProjects();
      } else {
        message.error(result.msg || '创建失败');
      }
    } catch (error) {
      message.error('创建失败');
    }
  };

  const resetForm = () => {
    setNewProject({ code: '', name: '' });
    setSections([]);
  };

  const handleDeleteProject = async (projectId: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该项目吗？所有关联的标段、包和投标人信息都将被删除！',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await fetch(`/api/projects/${projectId}`, {
            method: 'DELETE'
          });
          message.success('项目已删除');
          fetchProjects();
        } catch (error) {
          message.error('删除失败');
        }
      }
    });
  };

  const filteredProjects = projects.filter(project =>
    project.project_name.toLowerCase().includes(searchText.toLowerCase()) ||
    project.project_code.toLowerCase().includes(searchText.toLowerCase())
  );

  const columns = [
    {
      title: '项目编号',
      dataIndex: 'project_code',
      key: 'project_code',
      width: 150,
      render: (code: string) => <Tag color="blue">{code}</Tag>
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 300,
      render: (name: string, record: Project) => (
        <a
          onClick={() => navigate(`/projects/${record.id}`)}
          style={{ cursor: 'pointer', color: '#1890ff' }}
        >
          {name}
        </a>
      )
    },
    {
      title: '标段数',
      dataIndex: 'section_count',
      key: 'section_count',
      width: 100,
      render: (count: number) => (
        <span style={{ fontSize: 14, color: '#1a1a1a' }}>{count}</span>
      )
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (time: string) => time ? new Date(time).toLocaleString('zh-CN') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right' as const,
      render: (_: any, record: Project) => (
        <Space>
          <Tooltip title="查看详情">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/projects/${record.id}`)}
            >
              查看
            </Button>
          </Tooltip>
          <Tooltip title="删除项目">
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDeleteProject(record.id)}
            >
              删除
            </Button>
          </Tooltip>
        </Space>
      )
    }
  ];

  const stats = [
    { title: '项目总数', value: projects.length, icon: <BankOutlined />, color: '#1890ff' },
    { title: '标段总数', value: projects.reduce((sum, p) => sum + p.section_count, 0), icon: <FolderOpenOutlined />, color: '#52c41a' },
    { title: '包总数', value: projects.reduce((sum, p) => sum + p.sections.reduce((s, sec) => s + sec.package_count, 0), 0), icon: <InboxOutlined />, color: '#faad14' },
  ];

  // 标签颜色
  const tagColors = ['blue', 'green', 'orange', 'purple', 'cyan', 'magenta'];
  const getTagColor = (index: number) => tagColors[index % tagColors.length];

  return (
    <div>
      <PageHeader
        title="项目管理"
        description="管理项目、标段和包的层级结构"
        icon={<BankOutlined />}
      />

      <Row gutter={16} style={{ marginBottom: 24 }}>
        {stats.map((stat, index) => (
          <Col span={8} key={index}>
            <Card>
              <Statistic
                title={stat.title}
                value={stat.value}
                prefix={<span style={{ color: stat.color }}>{stat.icon}</span>}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        extra={
          <Space>
            <Input.Search
              placeholder="搜索项目"
              allowClear
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 300 }}
            />
            <Button
              type="primary"
              size="large"
              icon={<PlusOutlined />}
              onClick={() => setShowCreateModal(true)}
            >
              新建项目
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={filteredProjects}
          loading={loading}
          rowKey={(record: Project) => record.id}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个项目`
          }}
          scroll={{ x: 1000 }}
          locale={{ emptyText: (
            <div style={{ padding: '40px 0' }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <div>
                    <Text type="secondary">暂无项目</Text>
                    <div style={{ marginTop: 12 }}>
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setShowCreateModal(true)}
                      >
                        创建第一个项目
                      </Button>
                    </div>
                  </div>
                }
              />
            </div>
          )}}
        />
      </Card>

      {/* 新建项目弹窗 */}
      <Modal
        title={<span><PlusOutlined /> 新建项目</span>}
        open={showCreateModal}
        onOk={handleCreateProject}
        onCancel={() => {
          setShowCreateModal(false);
          resetForm();
        }}
        okText="创建"
        cancelText="取消"
        width={800}
        style={{ top: 40 }}
      >
        <div style={{ maxHeight: 560, overflowY: 'auto', paddingRight: 8 }}>
          {/* 基本信息 */}
          <Card
            size="small"
            title={<Text strong>基本信息</Text>}
            style={{ marginBottom: 16, border: '1px solid #e8e8e8' }}
          >
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Input
                placeholder="项目编号（如：XM2026-001）"
                value={newProject.code}
                onChange={(e) => setNewProject({ ...newProject, code: e.target.value })}
                autoFocus
                size="large"
              />
              <Input
                placeholder="项目名称"
                value={newProject.name}
                onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                size="large"
              />
            </Space>
          </Card>

          {/* 标段信息 */}
          <Card
            size="small"
            title={
              <Space>
                <Text strong>标段信息</Text>
                <Tag style={{ marginLeft: 4 }}>{sections.length} 个标段</Tag>
              </Space>
            }
            extra={
              <Button
                type="dashed"
                size="small"
                icon={<PlusCircleOutlined />}
                onClick={addSection}
              >
                添加标段
              </Button>
            }
            style={{ border: '1px solid #e8e8e8' }}
          >
            {sections.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <Text type="secondary">暂无标段，点击上方"添加标段"按钮</Text>
              </div>
            ) : (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {sections.map((section, sIdx) => (
                  <Card
                    key={sIdx}
                    size="small"
                    type="inner"
                    title={
                      <Space>
                        <Tag color={getTagColor(sIdx)}>标段 {sIdx + 1}</Tag>
                        <Text type="secondary">{section.section_code || '(未填编码)'}</Text>
                      </Space>
                    }
                    extra={
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<MinusCircleOutlined />}
                        onClick={() => removeSection(sIdx)}
                      >
                        删除
                      </Button>
                    }
                    style={{ backgroundColor: '#fafafa' }}
                  >
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      {/* 标段编码和名称 */}
                      <Row gutter={12}>
                        <Col span={8}>
                          <Input
                            placeholder="标段编号（如：BD01）"
                            value={section.section_code}
                            onChange={(e) => updateSection(sIdx, 'section_code', e.target.value)}
                            size="small"
                          />
                        </Col>
                        <Col span={16}>
                          <Input
                            placeholder="标段名称（如：施工标段一）"
                            value={section.section_name}
                            onChange={(e) => updateSection(sIdx, 'section_name', e.target.value)}
                            size="small"
                          />
                        </Col>
                      </Row>

                      {/* 包列表 */}
                      <div>
                        <Space style={{ marginBottom: 8, justifyContent: 'space-between', width: '100%' }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>包列表：</Text>
                          <Button
                            type="dashed"
                            size="small"
                            icon={<PlusCircleOutlined />}
                            onClick={() => addPackage(sIdx)}
                          >
                            添加包
                          </Button>
                        </Space>
                        {section.packages.length === 0 ? (
                          <Text type="secondary" style={{ fontSize: 12 }}>暂无包</Text>
                        ) : (
                          <Space direction="vertical" size={8} style={{ width: '100%' }}>
                            {section.packages.map((pkg, pIdx) => (
                              <Card
                                key={pIdx}
                                size="small"
                                style={{ backgroundColor: '#fff', border: '1px dashed #d9d9d9' }}
                              >
                                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                                  <Row gutter={8} align="middle">
                                    <Col flex="auto">
                                      <Input
                                        placeholder="包号（如：PKG01）"
                                        value={pkg.package_no}
                                        onChange={(e) => updatePackage(sIdx, pIdx, e.target.value)}
                                        size="small"
                                        style={{ width: '100%' }}
                                      />
                                    </Col>
                                    <Col>
                                      <Button
                                        type="text"
                                        danger
                                        size="small"
                                        icon={<MinusCircleOutlined />}
                                        onClick={() => removePackage(sIdx, pIdx)}
                                      />
                                    </Col>
                                  </Row>

                                  {/* 投标人列表 */}
                                  <div>
                                    <Space style={{ marginBottom: 4, justifyContent: 'space-between', width: '100%' }}>
                                      <Text type="secondary" style={{ fontSize: 12 }}>投标公司：</Text>
                                      <Button
                                        type="link"
                                        size="small"
                                        icon={<PlusCircleOutlined />}
                                        onClick={() => addBidder(sIdx, pIdx)}
                                        style={{ fontSize: 12, padding: 0 }}
                                      >
                                        添加公司
                                      </Button>
                                    </Space>
                                    {pkg.bidders.map((bidder, bIdx) => (
                                      <Row key={bIdx} gutter={8} style={{ marginBottom: 4 }}>
                                        <Col span={10}>
                                          <Input
                                            placeholder="公司名称"
                                            value={bidder.company_name}
                                            onChange={(e) => updateBidder(sIdx, pIdx, bIdx, 'company_name', e.target.value)}
                                            size="small"
                                          />
                                        </Col>
                                        <Col span={12}>
                                          <Input
                                            placeholder="统一社会信用代码（选填）"
                                            value={bidder.social_credit_code}
                                            onChange={(e) => updateBidder(sIdx, pIdx, bIdx, 'social_credit_code', e.target.value)}
                                            size="small"
                                          />
                                        </Col>
                                        <Col span={2} style={{ textAlign: 'right' }}>
                                          <Button
                                            type="text"
                                            danger
                                            size="small"
                                            icon={<MinusCircleOutlined />}
                                            onClick={() => removeBidder(sIdx, pIdx, bIdx)}
                                          />
                                        </Col>
                                      </Row>
                                    ))}
                                  </div>
                                </Space>
                              </Card>
                            ))}
                          </Space>
                        )}
                      </div>
                    </Space>
                  </Card>
                ))}
              </Space>
            )}
          </Card>
        </div>
      </Modal>
    </div>
  );
};

export default ProjectList;
