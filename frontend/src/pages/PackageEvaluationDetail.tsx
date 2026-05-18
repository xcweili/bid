import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Typography, Tag, Button, Space, message,
  Table, Empty, Divider, Breadcrumb, Upload, Modal,
  Tree, Progress, Statistic, Badge, Tooltip, Spin, Popconfirm,
  Drawer
} from 'antd';
import {
  ArrowLeftOutlined, InboxOutlined, SaveOutlined, PercentageOutlined,
  UploadOutlined, FolderOpenOutlined, FileTextOutlined, FileImageOutlined,
  FileExcelOutlined, FilePdfOutlined, FileWordOutlined, AlertOutlined,
  CheckCircleOutlined, ReloadOutlined, EyeOutlined, DeleteOutlined, DownloadOutlined,
  LoadingOutlined, FileSearchOutlined
} from '@ant-design/icons';
import { evaluationItemService, PackageItemWithDetails } from '../services/evaluationItemService';
const AlertCircleOutlined = AlertOutlined;

const { Title, Text } = Typography;
const { Dragger } = Upload;

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

interface Bidder {
  id: number;
  company_name: string;
  social_credit_code: string;
}

interface FileNode {
  key: string;
  title: string;
  type: 'folder' | 'file';
  children?: FileNode[];
  file_id?: number;
  file_type?: string;
  file_size?: number;
  parse_status?: string;
}

const PackageEvaluationDetail: React.FC = () => {
  const { projectId, packageId } = useParams<{ projectId: string; packageId: string }>();
  const navigate = useNavigate();
  const [packageInfo, setPackageInfo] = useState<Package | null>(null);
  const [section, setSection] = useState<Section | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [packageItems, setPackageItems] = useState<PackageItemWithDetails[]>([]);
  const [bidders, setBidders] = useState<Bidder[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<{ status: string; progress: number; uploadId?: number } | null>(null);
  const [selectedBidder, setSelectedBidder] = useState<Bidder | null>(null);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [fileTreeLoading, setFileTreeLoading] = useState(false);
  
  // 抽屉预览状态
  const [previewDrawerVisible, setPreviewDrawerVisible] = useState(false);
  const [previewFileInfo, setPreviewFileInfo] = useState<{
    file_name: string;
    file_type: string;
    content?: string;
    preview_url?: string;
    file_size: number;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // PDF转换状态
  const [conversionStatus, setConversionStatus] = useState<{
    package_id: number;
    conversion_ready: boolean;
    total_pdf_count: number;
    converted_count: number;
    failed_count: number;
    processing_count: number;
    bidders: Array<{
      bidder_id: number;
      company_name: string;
      pdf_count: number;
      md_count: number;
      failed_count: number;
      processing_count: number;
      conversion_ready: boolean;
    }>;
  } | null>(null);
  const [conversionLoading, setConversionLoading] = useState(false);

  useEffect(() => {
    if (projectId && packageId) {
      fetchData();
    }
  }, [projectId, packageId]);
  
  // 轮询转换状态
  useEffect(() => {
    if (!conversionStatus) return;
    
    // 如果有文件正在处理中，每3秒轮询一次
    if (conversionStatus.processing_count > 0) {
      const interval = setInterval(() => {
        fetchConversionStatus();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [conversionStatus]);

  useEffect(() => {
    // 轮询上传状态
    if (uploadStatus && uploadStatus.status === 'processing') {
      const interval = setInterval(() => {
        fetchUploadStatus();
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [uploadStatus]);

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
      let foundBidders: Bidder[] = [];

      for (const sec of projectData.sections || []) {
        for (const pkg of sec.packages || []) {
          if (pkg.id === parseInt(packageId || '0')) {
            foundPackage = pkg;
            foundSection = sec;
            foundBidders = pkg.bidders || [];
            break;
          }
        }
        if (foundPackage) break;
      }

      setPackageInfo(foundPackage);
      setSection(foundSection);
      setBidders(foundBidders);

      // 获取包的评审项配置
      const items = await evaluationItemService.getPackageItems(parseInt(packageId || '0'));
      setPackageItems(items);
      
      // 获取转换状态
      fetchConversionStatus();
    } catch (error) {
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchUploadStatus = async () => {
    try {
      const res = await fetch(`/api/packages/${packageId}/upload-status/${uploadStatus?.uploadId}`);
      const data = await res.json();
      setUploadStatus({ status: data.status, progress: data.progress });
      
      if (data.status === 'completed' || data.status === 'failed') {
        message.success(data.status === 'completed' ? '文件解析完成' : '文件解析失败');
        fetchData();
      }
    } catch (error) {
      console.error('获取上传状态失败:', error);
    }
  };

  const fetchBidderFileTree = async (bidderId: number) => {
    setFileTreeLoading(true);
    try {
      const res = await fetch(`/api/packages/${packageId}/bidders/${bidderId}/file-tree`);
      const data = await res.json();
      // 处理文件树：移除公司名称前缀，提取正确的文件结构
      const processedTree = processFileTree(data.file_tree);
      setFileTree(processedTree);
    } catch (error) {
      message.error('获取文件树失败');
    } finally {
      setFileTreeLoading(false);
    }
  };
  
  const fetchConversionStatus = async () => {
    setConversionLoading(true);
    try {
      const res = await fetch(`/api/packages/${packageId}/conversion-status`);
      const data = await res.json();
      setConversionStatus(data);
    } catch (error) {
      console.error('获取转换状态失败:', error);
    } finally {
      setConversionLoading(false);
    }
  };
  
  const handleReconvert = async () => {
    try {
      const res = await fetch(`/api/packages/${packageId}/reconvert`, {
        method: 'POST'
      });
      const data = await res.json();
      message.success(data.message);
      // 刷新转换状态
      fetchConversionStatus();
    } catch (error) {
      message.error('重新转换失败');
    }
  };

  const processFileTree = (tree: FileNode[]): FileNode[] => {
    // 文件路径结构：投标文件/公司名/子文件夹/文件.pdf
    // 需要移除前两层（投标文件、公司名），只保留子文件夹和文件
    if (tree.length === 1 && tree[0].type === 'folder' && tree[0].children) {
      const firstLevel = tree[0].children;
      // 如果第一层只有一个文件夹（公司文件夹），继续深入
      if (firstLevel && firstLevel.length === 1 && firstLevel[0].type === 'folder' && firstLevel[0].children) {
        return firstLevel[0].children;
      }
      return firstLevel || [];
    }
    return tree;
  };

  const handleDeletePackageFiles = async () => {
    try {
      const res = await fetch(`/api/packages/${packageId}/files`, {
        method: 'DELETE'
      });
      if (res.ok) {
        message.success('文件删除成功');
        setFileTree([]);
        setSelectedBidder(null);
        fetchData();
      } else {
        message.error('删除失败');
      }
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleFilePreview = async (fileId: number) => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/packages/${packageId}/files/${fileId}/content`);
      const data = await res.json();
      
      if (data.success) {
        setPreviewFileInfo({
          file_name: data.file_name,
          file_type: data.file_type,
          content: data.content,
          preview_url: data.preview_url,
          file_size: data.file_size
        });
        setPreviewDrawerVisible(true);
      } else {
        message.error('获取文件内容失败');
      }
    } catch (error) {
      message.error('获取文件内容失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleUpload = async (file: any) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file.file);

    try {
      const res = await fetch(`/api/packages/${packageId}/upload-files`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      
      setUploadStatus({ status: 'processing', progress: 0, uploadId: data.upload_id });
      setUploadModalVisible(false);
      message.info('文件上传成功，开始解析');
    } catch (error) {
      message.error('上传失败');
    } finally {
      setUploading(false);
    }
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; text: string }> = {
      pending: { color: 'default', text: '待处理' },
      processing: { color: 'orange', text: '处理中' },
      completed: { color: 'success', text: '已完成' },
      failed: { color: 'error', text: '失败' },
    };
    return configs[status] || configs.pending;
  };

  const getFileIcon = (fileType?: string) => {
    const icons: Record<string, React.ReactNode> = {
      pdf: <FilePdfOutlined style={{ color: '#d93026' }} />,
      docx: <FileWordOutlined style={{ color: '#1890ff' }} />,
      doc: <FileWordOutlined style={{ color: '#1890ff' }} />,
      xlsx: <FileExcelOutlined style={{ color: '#52c41a' }} />,
      xls: <FileExcelOutlined style={{ color: '#52c41a' }} />,
      md: <FileTextOutlined style={{ color: '#666' }} />,
      txt: <FileTextOutlined style={{ color: '#666' }} />,
      jpg: <FileImageOutlined style={{ color: '#ff69b4' }} />,
      jpeg: <FileImageOutlined style={{ color: '#ff69b4' }} />,
      png: <FileImageOutlined style={{ color: '#ff69b4' }} />,
      gif: <FileImageOutlined style={{ color: '#ff69b4' }} />,
    };
    return icons[fileType || ''] || <FileTextOutlined style={{ color: '#999' }} />;
  };

  // 转换 FileNode 为 Tree 的 treeData 格式
  const convertToTreeData = (nodes: FileNode[]): any[] => {
    return nodes.map(node => {
      const isFolder = node.type === 'folder';
      const icon = isFolder ? (
        <FolderOpenOutlined style={{ color: '#1890ff', fontSize: 16 }} />
      ) : getFileIcon(node.file_type);
      const status = node.parse_status;
      
      let statusIcon = null;
      if (!isFolder && status) {
        if (status === 'completed') {
          statusIcon = <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 14 }} />;
        } else if (status === 'failed') {
          statusIcon = <AlertCircleOutlined style={{ color: '#ff4d4f', fontSize: 14 }} />;
        } else {
          statusIcon = <LoadingOutlined style={{ color: '#faad14', fontSize: 14 }} />;
        }
      }

      const title = (
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8,
            padding: '4px 6px',
            borderRadius: '4px',
            transition: 'background-color 0.2s',
            width: '100%',
            lineHeight: '1.5'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <span style={{ fontSize: 14, display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}>{icon}</span>
          <span 
            style={{ 
              flex: 1, 
              cursor: !isFolder ? 'pointer' : 'default',
              fontSize: 14,
              color: isFolder ? '#1f1f1f' : '#333',
              fontWeight: isFolder ? 500 : 'normal',
              display: 'inline-flex',
              alignItems: 'center',
              verticalAlign: 'middle'
            }} 
            onClick={() => !isFolder && node.file_id && handleFilePreview(node.file_id)}
          >
            {node.title}
          </span>
          {node.file_size && (
            <Text type="secondary" style={{ fontSize: 12, color: '#999' }}>
              {(node.file_size / 1024).toFixed(1)} KB
            </Text>
          )}
          {statusIcon && (
            <span style={{ marginLeft: 4 }}>{statusIcon}</span>
          )}
          {!isFolder && node.file_id && (
            <Tooltip title="预览文件">
              <EyeOutlined 
                style={{ color: '#1890ff', cursor: 'pointer', fontSize: 14 }} 
                onClick={(e) => {
                  e.stopPropagation();
                  handleFilePreview(node.file_id!);
                }} 
              />
            </Tooltip>
          )}
        </div>
      );

      return {
        key: node.key,
        title: title,
        children: node.children ? convertToTreeData(node.children) : undefined,
        isLeaf: !isFolder
      };
    });
  };

  const handleBidderClick = (bidder: Bidder) => {
    setSelectedBidder(bidder);
    fetchBidderFileTree(bidder.id);
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Spin size="large" />
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
        <Breadcrumb.Item>{packageInfo.package_no}</Breadcrumb.Item>
      </Breadcrumb>

      {/* 头部 */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>{packageInfo.package_no}</Title>
          <Text type="secondary">
            所属项目：{project.project_name} | 所属标段：{section.section_name} ({section.section_code})
          </Text>
        </div>
        <Space>
          <Button
            icon={<UploadOutlined />}
            onClick={() => setUploadModalVisible(true)}
          >
            上传文件
          </Button>
          <Popconfirm
            title="确认删除"
            description="确定要删除该包下的所有文件和ZIP包吗？此操作不可恢复。"
            onConfirm={handleDeletePackageFiles}
            okText="确定"
            cancelText="取消"
          >
            <Button
              icon={<DeleteOutlined />}
              danger
            >
              删除文件
            </Button>
          </Popconfirm>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/projects/${projectId}?tab=evaluation`)}
          >
            返回
          </Button>
        </Space>
      </div>

      {/* 上传状态提示 */}
      {uploadStatus && (
        <Card style={{ marginBottom: 24, borderColor: '#1890ff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {uploadStatus.status === 'processing' ? (
              <>
                <Spin size="small" />
                <Text>文件解析中...</Text>
                <Progress percent={Math.round(uploadStatus.progress)} size="small" />
              </>
            ) : uploadStatus.status === 'completed' ? (
              <>
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                <Text style={{ color: '#52c41a' }}>文件解析完成</Text>
              </>
            ) : (
              <>
                <AlertCircleOutlined style={{ color: '#ff4d4f' }} />
                <Text style={{ color: '#ff4d4f' }}>文件解析失败</Text>
              </>
            )}
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={fetchData}
            >
              刷新
            </Button>
          </div>
        </Card>
      )}

      <Card style={{ marginBottom: 24 }}>
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

      {/* 投标人文件管理 */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <FolderOpenOutlined style={{ fontSize: 20, color: '#1890ff' }} />
          <Title level={4} style={{ margin: 0 }}>投标人文件管理</Title>
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          {bidders.length > 0 ? (
            bidders.map((bidder) => (
              <div
                key={bidder.id}
                onClick={() => handleBidderClick(bidder)}
                style={{
                  cursor: 'pointer',
                  padding: '16px 20px',
                  border: `2px solid ${selectedBidder?.id === bidder.id ? '#1890ff' : '#e8e8e8'}`,
                  borderRadius: 8,
                  backgroundColor: selectedBidder?.id === bidder.id ? '#e6f7ff' : '#fff',
                  minWidth: 200,
                  transition: 'all 0.3s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileTextOutlined style={{ color: '#1890ff' }} />
                  <span style={{ fontWeight: 500 }}>{bidder.company_name}</span>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
                  点击查看文件
                </div>
              </div>
            ))
          ) : (
            <Empty description="暂无投标人" />
          )}
        </div>

        {/* 文件树展示 */}
        {selectedBidder && (
          <div style={{ border: '1px solid #e8e8e8', borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Title level={5} style={{ margin: 0 }}>
                {selectedBidder.company_name} 的文件列表
              </Title>
              <Button
                size="small"
                onClick={() => {
                  setSelectedBidder(null);
                  setFileTree([]);
                }}
              >
                关闭
              </Button>
            </div>

            {fileTreeLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Spin size="small" />
              </div>
            ) : fileTree.length > 0 ? (
              <Tree
                defaultExpandAll
                style={{ maxHeight: 400, overflowY: 'auto' }}
                treeData={convertToTreeData(fileTree)}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Empty description="暂无文件，请先上传" />
              </div>
            )}
          </div>
        )}
      </Card>

      {/* PDF转换状态展示 */}
      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <FileSearchOutlined style={{ fontSize: 20, color: '#1890ff' }} />
          <Title level={4} style={{ margin: 0 }}>PDF转换状态</Title>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={fetchConversionStatus}
            loading={conversionLoading}
          >
            刷新状态
          </Button>
        </div>

        {conversionStatus ? (
          <>
            {/* 整体状态概览 */}
            <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
              <div style={{ flex: 1, padding: 16, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 8 }}>总PDF文件数</div>
                <div style={{ fontSize: 24, fontWeight: 600, color: '#1f1f1f' }}>
                  {conversionStatus.total_pdf_count}
                </div>
              </div>
              <div style={{ flex: 1, padding: 16, backgroundColor: '#f6ffed', borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: '#52c41a', marginBottom: 8 }}>已转换</div>
                <div style={{ fontSize: 24, fontWeight: 600, color: '#52c41a' }}>
                  {conversionStatus.converted_count}
                </div>
              </div>
              <div style={{ flex: 1, padding: 16, backgroundColor: '#fff7e6', borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: '#fa8c16', marginBottom: 8 }}>处理中</div>
                <div style={{ fontSize: 24, fontWeight: 600, color: '#fa8c16' }}>
                  {conversionStatus.processing_count}
                </div>
              </div>
              <div style={{ flex: 1, padding: 16, backgroundColor: '#fff2f0', borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: '#ff4d4f', marginBottom: 8 }}>转换失败</div>
                <div style={{ fontSize: 24, fontWeight: 600, color: '#ff4d4f' }}>
                  {conversionStatus.failed_count}
                </div>
              </div>
            </div>

            {/* 进度条 */}
            {conversionStatus.total_pdf_count > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 14, color: '#666' }}>转换进度</span>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>
                    {conversionStatus.converted_count} / {conversionStatus.total_pdf_count}
                    ({Math.round((conversionStatus.converted_count / conversionStatus.total_pdf_count) * 100)}%)
                  </span>
                </div>
                <Progress
                  percent={Math.round((conversionStatus.converted_count / conversionStatus.total_pdf_count) * 100)}
                  status={conversionStatus.conversion_ready ? 'success' : conversionStatus.processing_count > 0 ? 'active' : 'exception'}
                />
              </div>
            )}

            {/* 转换状态标识 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              {conversionStatus.conversion_ready ? (
                <>
                  <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
                  <span style={{ color: '#52c41a', fontWeight: 500 }}>所有PDF文件已完成转换，可以启动评审</span>
                </>
              ) : conversionStatus.processing_count > 0 ? (
                <>
                  <LoadingOutlined style={{ color: '#faad14', fontSize: 20 }} />
                  <span style={{ color: '#faad14', fontWeight: 500 }}>正在转换中，请等待...</span>
                </>
              ) : (
                <>
                  <AlertCircleOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />
                  <span style={{ color: '#ff4d4f', fontWeight: 500 }}>存在未转换或转换失败的文件</span>
                </>
              )}
            </div>

            {/* 各公司转换状态列表 */}
            {conversionStatus && conversionStatus.bidders && conversionStatus.bidders.length > 0 && (
              <div>
                <Title level={5} style={{ margin: 0, marginBottom: 12 }}>各投标人转换状态</Title>
                <Table
                  dataSource={conversionStatus.bidders}
                  columns={[
                    {
                      title: '投标人',
                      dataIndex: 'company_name',
                      key: 'company_name',
                      width: 200
                    },
                    {
                      title: 'PDF数量',
                      dataIndex: 'pdf_count',
                      key: 'pdf_count',
                      width: 80,
                      align: 'center'
                    },
                    {
                      title: 'MD数量',
                      dataIndex: 'md_count',
                      key: 'md_count',
                      width: 80,
                      align: 'center'
                    },
                    {
                      title: '处理中',
                      dataIndex: 'processing_count',
                      key: 'processing_count',
                      width: 80,
                      align: 'center',
                      render: (count: number) => (
                        <Tag color="orange">{count}</Tag>
                      )
                    },
                    {
                      title: '失败',
                      dataIndex: 'failed_count',
                      key: 'failed_count',
                      width: 80,
                      align: 'center',
                      render: (count: number) => (
                        <Tag color="red">{count}</Tag>
                      )
                    },
                    {
                      title: '状态',
                      key: 'status',
                      width: 120,
                      align: 'center',
                      render: (_, record: any) => (
                        record.conversion_ready ? (
                          <Tag color="green">已完成</Tag>
                        ) : record.processing_count > 0 ? (
                          <Tag color="orange">处理中</Tag>
                        ) : (
                          <Tag color="red">未完成</Tag>
                        )
                      )
                    }
                  ]}
                  pagination={false}
                  size="small"
                />
              </div>
            )}

            {/* 操作按钮 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
              {conversionStatus && !conversionStatus.conversion_ready && (
                <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={handleReconvert}
              loading={conversionLoading}
            >
              重新转换所有PDF
            </Button>
              )}
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="small" />
            <div style={{ marginTop: 12 }}>加载转换状态...</div>
          </div>
        )}
      </Card>

      {/* 上传文件模态框 */}
      <Modal
        title="上传投标人文件"
        visible={uploadModalVisible}
        footer={null}
        onCancel={() => setUploadModalVisible(false)}
        width={600}
      >
        <div style={{ padding: 16 }}>
          <Text type="secondary" style={{ marginBottom: 16, display: 'block' }}>
            请上传包含投标人文件的 ZIP 压缩包，文件结构如下：
          </Text>
          <pre style={{ backgroundColor: '#f5f5f5', padding: 16, borderRadius: 8, fontSize: 12 }}>
{`投标文件/
├── 公司A/
│   ├── 业绩文件/
│   └── 资质文件/
└── 公司B/
    └── ...`}
          </pre>
          
          <Dragger
            accept=".zip"
            fileList={[]}
            beforeUpload={(file) => {
              handleUpload({ file });
              return false;
            }}
            disabled={uploading}
          >
            <p className="ant-upload-drag-icon">
              {uploading ? <Spin size="small" /> : <InboxOutlined />}
            </p>
            <p className="ant-upload-text">
              {uploading ? '上传中...' : '点击或拖拽文件到此处上传'}
            </p>
            <p className="ant-upload-hint">
              支持 ZIP 格式压缩包，大小不超过 500MB
            </p>
          </Dragger>
        </div>
      </Modal>

      {/* 文件预览抽屉 */}
      <Drawer
        title={previewFileInfo?.file_name || '文件预览'}
        placement="right"
        width={800}
        onClose={() => setPreviewDrawerVisible(false)}
        open={previewDrawerVisible}
        extra={
          <div style={{ color: '#999', fontSize: 12 }}>
            {(previewFileInfo?.file_size || 0) / 1024 > 1024 
              ? `${((previewFileInfo?.file_size || 0) / (1024 * 1024)).toFixed(2)} MB` 
              : `${((previewFileInfo?.file_size || 0) / 1024).toFixed(1)} KB`}
          </div>
        }
      >
        {previewLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
            <Spin size="large" />
          </div>
        ) : previewFileInfo ? (
          <div style={{ padding: '20px 0' }}>
            {previewFileInfo.content ? (
              // 文本类型文件直接显示内容
              <div style={{ 
                backgroundColor: '#fafafa', 
                padding: '16px', 
                borderRadius: '4px',
                maxHeight: '600px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 14,
                lineHeight: 1.6
              }}>
                {previewFileInfo.content}
              </div>
            ) : previewFileInfo.preview_url ? (
              // 其他类型文件使用 iframe 预览
              <div>
                {previewFileInfo.file_type === 'pdf' ? (
                  <iframe
                    src={previewFileInfo.preview_url}
                    style={{ width: '100%', height: '600px', border: '1px solid #e8e8e8', borderRadius: '4px' }}
                    title={previewFileInfo.file_name}
                  />
                ) : ['jpg', 'jpeg', 'png', 'gif'].includes(previewFileInfo.file_type) ? (
                  <img
                    src={previewFileInfo.preview_url}
                    alt={previewFileInfo.file_name}
                    style={{ maxWidth: '100%', maxHeight: '600px', objectFit: 'contain' }}
                  />
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px' }}>
                    <FileTextOutlined style={{ fontSize: 48, color: '#ccc' }} />
                    <p style={{ marginTop: 16, color: '#999' }}>
                      该文件类型不支持在线预览
                    </p>
                    <Button
                      type="primary"
                      onClick={() => window.open(previewFileInfo!.preview_url, '_blank')}
                      style={{ marginTop: 16 }}
                    >
                      在新窗口中打开
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <Empty description="无法预览该文件" />
            )}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
};

export default PackageEvaluationDetail;
