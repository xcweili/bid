import React, { useState, useCallback, useEffect } from 'react';
import { Tree, Spin, message, Card, Button, Space, Typography, Modal } from 'antd';
import type { TreeProps } from 'antd';
import {
  FolderOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileTextOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  FileOutlined,
  CheckOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

export interface FileNode {
  key: string;
  title: string;
  type: 'folder' | 'pdf' | 'doc' | 'docx' | 'txt' | 'xls' | 'xlsx' | 'image' | 'other';
  size?: number;
  children?: FileNode[];
  isLeaf?: boolean;
  path?: string;
}

interface FileSelectorProps {
  taskId: number;
  onSelect: (files: string[]) => void;
  visible: boolean;
  onCancel: () => void;
}

const FileSelector: React.FC<FileSelectorProps> = ({ taskId, onSelect, visible, onCancel }) => {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [allSelected, setAllSelected] = useState(false);

  const loadFileTree = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}/files`);
      const data = await response.json();
      setFileTree(data.files || []);
      // 自动展开所有文件夹
      const expandAll = (nodes: FileNode[], keys: string[]) => {
        nodes.forEach(node => {
          if (node.children && node.children.length > 0) {
            keys.push(node.key);
            expandAll(node.children, keys);
          }
        });
        return keys;
      };
      setExpandedKeys(expandAll(data.files || [], []));
    } catch (error) {
      console.error('加载文件树失败:', error);
      message.error('加载文件树失败');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (visible) {
      loadFileTree();
      setSelectedKeys([]);
      setAllSelected(false);
    }
  }, [visible, loadFileTree]);

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
    return nodes.map(node => {
      return {
        title: (
          <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            {getFileIcon(node.type)}
            <span style={{ marginLeft: 8, flex: 1 }}>{node.title}</span>
            {node.type !== 'folder' && node.size && (
              <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>
                {formatFileSize(node.size)}
              </span>
            )}
          </div>
        ),
        key: node.key,
        selectable: node.type !== 'folder',
        path: node.path,
        type: node.type,
        children: node.children ? buildTreeNodes(node.children) : undefined,
      };
    });
  };

  const handleCheck: TreeProps['onCheck'] = (checkedKeys, info) => {
    setSelectedKeys(checkedKeys as string[]);
  };

  const handleExpand: TreeProps['onExpand'] = (keys) => {
    setExpandedKeys(keys as string[]);
  };

  const handleSelectAll = () => {
    if (allSelected) {
      // 取消全选
      setSelectedKeys([]);
      setAllSelected(false);
    } else {
      // 全选所有文件
      const allFileKeys: string[] = [];
      const collectFileKeys = (nodes: FileNode[]) => {
        nodes.forEach(node => {
          if (node.type !== 'folder') {
            allFileKeys.push(node.key);
          }
          if (node.children) {
            collectFileKeys(node.children);
          }
        });
      };
      collectFileKeys(fileTree);
      setSelectedKeys(allFileKeys);
      setAllSelected(true);
    }
  };

  const handleConfirm = () => {
    if (selectedKeys.length === 0) {
      message.warning('请至少选择一个文件');
      return;
    }
    
    // 收集选中文件的路径
    const selectedFiles: string[] = [];
    const collectFilePaths = (nodes: FileNode[]) => {
      nodes.forEach(node => {
        if (node.type !== 'folder' && selectedKeys.includes(node.key)) {
          if (node.path) {
            selectedFiles.push(node.path);
          }
        }
        if (node.children) {
          collectFilePaths(node.children);
        }
      });
    };
    collectFilePaths(fileTree);
    
    onSelect(selectedFiles);
    onCancel();
  };

  const getSelectableFilesCount = () => {
    let count = 0;
    const countFiles = (nodes: FileNode[]) => {
      nodes.forEach(node => {
        if (node.type !== 'folder') {
          count++;
        }
        if (node.children) {
          countFiles(node.children);
        }
      });
    };
    countFiles(fileTree);
    return count;
  };

  return (
    <Modal
      title="选择文件进行解析"
      open={visible}
      onCancel={onCancel}
      width={800}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          取消
        </Button>,
        <Button
          key="confirm"
          type="primary"
          onClick={handleConfirm}
          disabled={selectedKeys.length === 0}
        >
          确认解析 ({selectedKeys.length})
        </Button>,
      ]}
    >
      <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text>文件数: {getSelectableFilesCount()}</Text>
          <Button onClick={handleSelectAll}>
            {allSelected ? '取消全选' : '全选'}
          </Button>
        </div>
        
        <Card size="small" title="文件树" style={{ marginBottom: 16 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin size="small" />
            </div>
          ) : (
            <Tree
              treeData={buildTreeNodes(fileTree)}
              expandedKeys={expandedKeys}
              checkedKeys={selectedKeys}
              onCheck={handleCheck}
              onExpand={handleExpand}
              blockNode
              showLine={{ showLeafIcon: false }}
              checkable
              multiple
            />
          )}
        </Card>
        
        <Text type="secondary" style={{ fontSize: 12 }}>
          💡 支持多选文件进行批量解析，可选择不同公司的文件
        </Text>
      </Space>
    </Modal>
  );
};

export default FileSelector;