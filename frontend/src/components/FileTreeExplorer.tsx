import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Tree, Spin, message, Card, Statistic, Space, Button, Typography } from 'antd';
import type { TreeProps } from 'antd';
import {
  FolderOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileTextOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  FileOutlined,
  DownloadOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { saveAs } from 'file-saver';
import * as docx from 'docx-preview';
import apiClient from '../services/api';
import './FileTreeExplorer.css';

const { Title } = Typography;

export interface FileNode {
  key: string;
  title: string;
  type: 'folder' | 'pdf' | 'doc' | 'docx' | 'txt' | 'xls' | 'xlsx' | 'image' | 'other';
  size?: number;
  children?: FileNode[];
  isLeaf?: boolean;
  path?: string;
}

interface FileTreeExplorerProps {
  companyFolder: string;
  companyId: number;
}

const FileTreeExplorer: React.FC<FileTreeExplorerProps> = ({ companyFolder, companyId }) => {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [wordLoading, setWordLoading] = useState(false);
  const [wordError, setWordError] = useState<string | null>(null);
  const wordPreviewRef = React.useRef<HTMLDivElement>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(40); // 左侧面板宽度百分比
  const resizerRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);

  console.log('🔥🔥🔥 FileTreeExplorer 组件已加载 🔥🔥🔥');
  console.log('companyId:', companyId);
  console.log('companyFolder:', companyFolder);

  const loadFileTree = useCallback(async () => {
    console.log('FileTreeExplorer: loading files for company', companyId, 'folder:', companyFolder);
    if (!companyFolder) {
      console.warn('FileTreeExplorer: companyFolder is empty');
      setFileTree([]);
      message.warning('公司文件夹路径为空');
      return;
    }
    setLoading(true);
    try {
      const response = await apiClient.get(`/api/companies/${companyId}/files`);
      const data = response.data;
      console.log('FileTreeExplorer: loaded files', data);
      setFileTree(data.files || []);
      const firstLevelKeys = (data.files || []).filter((node: FileNode) => node.children).map((node: FileNode) => node.key);
      setExpandedKeys(firstLevelKeys);
    } catch (error: any) {
      console.error('FileTreeExplorer: load error', error);
      message.error('加载文件树失败：' + (error.response?.data?.detail || error.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  }, [companyId, companyFolder]);

  useEffect(() => {
    loadFileTree();
  }, [loadFileTree]);

  // 拖动分隔条逻辑
  useEffect(() => {
    const resizer = resizerRef.current;
    if (!resizer) return;

    const handleMouseDown = (e: MouseEvent) => {
      isResizing.current = true;
      resizer.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      
      const container = resizer.parentElement;
      if (!container) return;
      
      const containerRect = container.getBoundingClientRect();
      const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      
      // 限制宽度范围 30% - 70%
      if (newWidth >= 30 && newWidth <= 70) {
        setLeftPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      if (resizer) {
        resizer.classList.remove('active');
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    resizer.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      resizer.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const getFileIcon = (type: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      folder: <FolderOutlined style={{ color: '#FAAD14', fontSize: 16 }} />,
      pdf: <FilePdfOutlined style={{ color: '#FF4D4F', fontSize: 16 }} />,
      doc: <FileWordOutlined style={{ color: '#1890FF', fontSize: 16 }} />,
      docx: <FileWordOutlined style={{ color: '#1890FF', fontSize: 16 }} />,
      txt: <FileTextOutlined style={{ color: '#595959', fontSize: 16 }} />,
      xls: <FileExcelOutlined style={{ color: '#52C41A', fontSize: 16 }} />,
      xlsx: <FileExcelOutlined style={{ color: '#52C41A', fontSize: 16 }} />,
      image: <FileImageOutlined style={{ color: '#722ED1', fontSize: 16 }} />,
    };
    return iconMap[type] || <FileTextOutlined style={{ color: '#595959', fontSize: 16 }} />;
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const buildTreeNodes = (nodes: FileNode[]): TreeProps['treeData'] => {
    return nodes.map(node => ({
      title: (
        <div className="file-tree-node-title">
          {getFileIcon(node.type)}
          <span className="file-title">{node.title}</span>
          {node.type !== 'folder' && node.size && (
            <span className="file-size">{formatFileSize(node.size)}</span>
          )}
        </div>
      ),
      key: node.key,
      selectable: node.type !== 'folder',
      path: node.path,
      type: node.type,
      children: node.children ? buildTreeNodes(node.children) : undefined,
    }));
  };

  const loadWordPreview = async () => {
    if (!selectedFile?.path || !wordPreviewRef.current) return;
    
    setWordLoading(true);
    setWordError(null);
    
    try {
      const url = `/api/companies/files/download?path=${encodeURIComponent(selectedFile.path)}`;
      // 使用 axios 下载文件
      const response = await apiClient.get(url, { responseType: 'blob' });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const blob = await response.blob();
      
      await docx.renderAsync(blob, wordPreviewRef.current, undefined, {
        className: 'docx-container',
        inWrapper: false,
        ignoreWidth: false,
      });
      
      console.log('Word 文档渲染成功');
    } catch (error) {
      console.error('Word 预览失败:', error);
      setWordError(`预览失败：${(error as Error).message}`);
    } finally {
      setWordLoading(false);
    }
  };

  const handleSelect: TreeProps['onSelect'] = async (selectedKeys, info) => {
    const fileNode = info.node as any;
    console.log('=== 文件选择 ===');
    console.log('fileNode:', fileNode);
    console.log('fileNode.type:', fileNode.type);
    console.log('fileNode.path:', fileNode.path);
    
    if (fileNode.type === 'folder') {
      console.log('是文件夹，跳过');
      return;
    }
    
    const selectedFileNode: FileNode = {
      key: fileNode.key,
      title: fileNode.title || fileNode.key,
      type: fileNode.type || 'other',
      path: fileNode.path,
      children: fileNode.children,
      isLeaf: fileNode.isLeaf,
      size: fileNode.size
    };
    
    setSelectedFile(selectedFileNode);
    setFileContent(null);
    setLoading(true);
    
    if (!fileNode.path || fileNode.path.trim() === '') {
      console.error('文件路径为空:', fileNode);
      setFileContent('❌ 错误：文件路径为空');
      message.warning('文件路径为空，无法预览');
      setLoading(false);
      return;
    }
    
    if (fileNode.type === 'image' || fileNode.type === 'pdf' || fileNode.type === 'doc' || fileNode.type === 'docx') {
      console.log('图片/PDF/Word 文件，不需要获取内容');
      setLoading(false);
      
      // 对于Word文件，自动加载预览
      if (fileNode.type === 'doc' || fileNode.type === 'docx') {
        setTimeout(() => {
          loadWordPreview();
        }, 100);
      }
      return;
    }
    
    try {
      const filePath = encodeURIComponent(fileNode.path);
      const apiUrl = `/api/companies/files/content?path=${filePath}`;
      console.log('请求文件内容:', apiUrl);
      
      const response = await apiClient.get(apiUrl);
      console.log('响应状态:', response.status);
      
      // axios 自动解析 JSON，直接使用 response.data
      const data = response.data;
      console.log('响应数据:', data);
      
      if (data.content) {
        console.log('设置文件内容，长度:', data.content.length);
        setFileContent(data.content);
      } else {
        setFileContent('⚠️ 暂无内容预览');
      }
    } catch (error: any) {
      console.error('Load file content error:', error);
      const errorMsg = error?.message || error?.toString() || '未知错误';
      setFileContent(`❌ 无法预览此文件：${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExpand: TreeProps['onExpand'] = (keys) => {
    setExpandedKeys(keys as string[]);
  };

  const handleDownload = (node: FileNode) => {
    if (node.path) {
      apiClient.get(`/api/companies/files/download?path=${encodeURIComponent(node.path)}`, { responseType: 'blob' })
        .then(response => {
          const blob = new Blob([response.data]);
          saveAs(blob, node.title);
        })
        .catch(error => {
          console.error('FileTreeExplorer: failed to download file', error);
          message.error('下载文件失败');
        });
    }
  };

  const calculateStats = () => {
    let fileCount = 0;
    let folderCount = 0;
    let totalSize = 0;

    const traverse = (nodes: FileNode[]) => {
      nodes.forEach(node => {
        if (node.type === 'folder') {
          folderCount++;
          if (node.children) traverse(node.children);
        } else {
          fileCount++;
          totalSize += node.size || 0;
        }
      });
    };

    traverse(fileTree);

    return {
      fileCount,
      folderCount,
      totalSize: totalSize / (1024 * 1024),
    };
  };

  const stats = calculateStats();

  return (
    <div className="file-tree-explorer" style={{ '--left-panel-width': `${leftPanelWidth}%` } as React.CSSProperties}>
      <div className="file-tree-panel">
        <div className="file-tree-header">
          <Space size="small">
            <FolderOutlined />
            <span style={{ fontWeight: 600 }}>文件列表</span>
          </Space>
          <Button size="small" icon={<ReloadOutlined />} onClick={loadFileTree}>刷新</Button>
        </div>
        <div className="file-tree-content">
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin size="small" />
            </div>
          ) : (
            <Tree
              treeData={buildTreeNodes(fileTree)}
              expandedKeys={expandedKeys}
              selectedKeys={selectedFile ? [selectedFile.key] : []}
              onSelect={handleSelect}
              onExpand={handleExpand}
              blockNode
              showLine={{ showLeafIcon: false }}
            />
          )}
        </div>
        <div className="file-tree-stats">
          <Card size="small" title="文件统计">
            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
              <Statistic
                title="文件数"
                value={stats.fileCount}
                prefix={<FileOutlined />}
                valueStyle={{ fontSize: 20 }}
              />
              <Statistic
                title="文件夹"
                value={stats.folderCount}
                prefix={<FolderOutlined />}
                valueStyle={{ fontSize: 20 }}
              />
              <Statistic
                title="总大小"
                value={Number(stats.totalSize).toFixed(2)}
                suffix="MB"
                valueStyle={{ fontSize: 20 }}
              />
            </div>
          </Card>
        </div>
      </div>
      <div className="file-tree-resizer" ref={resizerRef} />

      <div className="file-preview-panel">
        {selectedFile ? (
          <>
            <div className="preview-header">
              <Space size="middle">
                <h3 className="preview-title">{selectedFile.title}</h3>
                <span className="preview-type">({(selectedFile.type || 'unknown').toUpperCase()})</span>
                <Space style={{ marginLeft: 'auto' }}>
                  <Button icon={<ReloadOutlined />} onClick={() => handleSelect([selectedFile.key], { node: selectedFile, selected: true } as any)}>
                    刷新
                  </Button>
                  <Button icon={<DownloadOutlined />} onClick={() => handleDownload(selectedFile)}>
                    下载
                  </Button>
                </Space>
              </Space>
            </div>
            <div className="preview-content">
              {loading ? (
                <div className="preview-loading"><Spin size="large" /></div>
              ) : selectedFile.type === 'image' ? (
                <div style={{ textAlign: 'center', padding: 20 }}>
                  <img 
                    src={apiClient.defaults.baseURL + `/api/companies/files/download?path=${encodeURIComponent(selectedFile.path!)}&attachment=false`} 
                    alt={selectedFile.title}
                    style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }}
                    onError={(e) => {
                      console.error('图片加载失败', selectedFile.path);
                      (e.target as HTMLImageElement).style.display = 'none';
                      message.error('图片加载失败，请下载查看');
                    }}
                  />
                  <div style={{ marginTop: 16 }}>
                    <span style={{ color: '#999', fontSize: 12 }}>文件大小：{formatFileSize(selectedFile.size!)}</span>
                  </div>
                </div>
              ) : selectedFile.type === 'pdf' ? (
                <iframe
                  src={apiClient.defaults.baseURL + `/api/companies/files/download?path=${encodeURIComponent(selectedFile.path!)}&attachment=false`}
                  title={selectedFile.title}
                  style={{ width: '100%', height: '80vh', border: 'none' }}
                  onError={() => {
                    console.error('PDF 加载失败', selectedFile.path);
                    message.error('PDF 加载失败，请下载查看');
                  }}
                />
              ) : selectedFile.type === 'doc' || selectedFile.type === 'docx' ? (
                <div ref={wordPreviewRef} style={{ width: '100%', minHeight: '600px', maxHeight: '80vh', overflow: 'auto', border: '1px solid #e8e8e8', padding: 16 }}>
                  {wordLoading ? (
                    <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
                  ) : wordError ? (
                    <div style={{ textAlign: 'center', padding: 40 }}>
                      <FileWordOutlined style={{ fontSize: 64, color: '#1890FF', marginBottom: 16 }} />
                      <Title level={4}>Word 文档</Title>
                      <span style={{ color: '#999', display: 'block', marginBottom: 16 }}>{wordError}</span>
                      <Button type="primary" icon={<DownloadOutlined />} onClick={() => handleDownload(selectedFile)}>
                        下载文件
                      </Button>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: 40 }}>
                      <FileWordOutlined style={{ fontSize: 64, color: '#1890FF', marginBottom: 16 }} />
                      <Title level={4}>Word 文档</Title>
                      <span style={{ color: '#999', display: 'block', marginBottom: 16 }}>
                        点击加载预览
                      </span>
                      <Button type="primary" icon={<ReloadOutlined />} onClick={loadWordPreview}>
                        加载预览
                      </Button>
                    </div>
                  )}
                </div>
              ) : fileContent ? (
                <pre className="file-content">{fileContent}</pre>
              ) : (
                <div className="preview-loading">暂无预览内容</div>
              )}
            </div>
          </>
        ) : (
          <div className="preview-empty">
            <FileOutlined style={{ fontSize: 64, marginBottom: 16, color: '#d9d9d9' }} />
            <p className="preview-empty-text">请选择一个文件进行预览</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileTreeExplorer;
