import React, { useState, useMemo } from 'react';
import { Card, Checkbox, Button, Space, Tag, Typography, Empty, Input, Select } from 'antd';
import { CheckCircleOutlined, UserOutlined, SearchOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { Search } = Input;

interface Resource {
  id: number;
  name: string;
  type: 'company' | 'criteria';
  code?: string;
  status?: string;
  assignedCount?: number;
  isSelected?: boolean;
}

interface TempAssignment {
  evaluatorId: number;
  evaluatorName: string;
  resourceIds: number[];
}

interface ResourcePanelProps {
  mode: 'by_company' | 'by_criteria';
  resources: Resource[];
  assignments: TempAssignment[];
  onResourcesChange?: (filteredResources: Resource[]) => void;
}

const ResourcePanel: React.FC<ResourcePanelProps> = ({
  mode,
  resources,
  assignments,
  onResourcesChange
}) => {
  const [selectedResourceIds, setSelectedResourceIds] = useState<Set<number>>(new Set());
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // 获取已分配的资源 ID
  const getAssignedResourceIds = (): Set<number> => {
    const assignedIds = new Set<number>();
    assignments.forEach(a => a.resourceIds.forEach(id => assignedIds.add(id)));
    return assignedIds;
  };

  const assignedIds = getAssignedResourceIds();

  // 过滤资源
  const filteredResources = useMemo(() => {
    return resources.filter(resource => {
      // 关键词搜索
      const matchKeyword = !searchKeyword || 
        resource.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        (resource.code && resource.code.toLowerCase().includes(searchKeyword.toLowerCase()));
      
      // 状态筛选
      const matchStatus = statusFilter === 'all' || 
        (resource.status && resource.status === statusFilter) ||
        (statusFilter === 'unassigned' && !assignedIds.has(resource.id)) ||
        (statusFilter === 'assigned' && assignedIds.has(resource.id));
      
      return matchKeyword && matchStatus;
    });
  }, [resources, searchKeyword, statusFilter, assignedIds]);

  // 通知父组件资源变化
  React.useEffect(() => {
    if (onResourcesChange) {
      onResourcesChange(filteredResources);
    }
  }, [filteredResources, onResourcesChange]);

  // 处理资源选择
  const handleResourceSelect = (resourceId: number, checked: boolean) => {
    const newSelected = new Set(selectedResourceIds);
    if (checked) {
      newSelected.add(resourceId);
    } else {
      newSelected.delete(resourceId);
    }
    setSelectedResourceIds(newSelected);
  };

  // 全选/反选（仅针对过滤后的资源）
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const availableIds = filteredResources
        .filter(r => !assignedIds.has(r.id))
        .map(r => r.id);
      setSelectedResourceIds(new Set(availableIds));
    } else {
      setSelectedResourceIds(new Set());
    }
  };

  // 判断是否全选
  const isAllSelected = () => {
    const availableResources = filteredResources.filter(r => !assignedIds.has(r.id));
    return availableResources.length > 0 && 
           availableResources.every(r => selectedResourceIds.has(r.id));
  };

  // 获取唯一状态列表
  const statusOptions = useMemo(() => {
    const statuses = new Set<string>();
    resources.forEach(r => {
      if (r.status) statuses.add(r.status);
    });
    return Array.from(statuses).map(s => ({ label: s, value: s }));
  }, [resources]);

  return (
    <div className="resource-panel">
      <div className="resource-panel-header">
        <Title level={5} className="resource-panel-title" style={{ margin: 0 }}>
          {mode === 'by_company' ? '公司列表' : '评审项列表'}
        </Title>
        <Space size="small">
          <Checkbox
            checked={isAllSelected()}
            onChange={(e) => handleSelectAll(e.target.checked)}
          >
            全选
          </Checkbox>
        </Space>
      </div>

      {/* 搜索和筛选 */}
      <div className="resource-panel-filters" style={{ marginBottom: 12 }}>
        <Space size="small" style={{ width: '100%' }}>
          <Search
            placeholder="搜索名称或编码..."
            size="small"
            prefix={<SearchOutlined />}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            style={{ flex: 1 }}
            allowClear
          />
          <Select
            size="small"
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 120 }}
            dropdownMatchSelectWidth={false}
          >
            <Select.Option value="all">全部状态</Select.Option>
            <Select.Option value="unassigned">未分配</Select.Option>
            <Select.Option value="assigned">已分配</Select.Option>
            {statusOptions.map(opt => (
              <Select.Option key={opt.value} value={opt.value}>
                {opt.label}
              </Select.Option>
            ))}
          </Select>
        </Space>
      </div>

      {/* 统计信息 */}
      <div className="resource-panel-stats" style={{ marginBottom: 12, fontSize: 12, color: '#666' }}>
        共 {resources.length} 项，已过滤到 {filteredResources.length} 项，
        已分配 {assignedIds.size} 项，待分配 {resources.length - assignedIds.size} 项
      </div>

      <div className="resource-list" style={{ maxHeight: 'calc(100vh - 350px)', overflowY: 'auto' }}>
        {filteredResources.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              searchKeyword || statusFilter !== 'all'
                ? '暂无匹配的资源'
                : mode === 'by_company'
                ? '暂无公司数据'
                : '暂无评审项数据'
            }
          />
        ) : (
          filteredResources.map(resource => {
            const isAssigned = assignedIds.has(resource.id);
            const isSelected = selectedResourceIds.has(resource.id);

            return (
              <div
                key={resource.id}
                className={`resource-item ${isSelected ? 'selected' : ''} ${isAssigned ? 'assigned' : ''}`}
              >
                <Checkbox
                  checked={isSelected}
                  disabled={isAssigned}
                  onChange={(e) => handleResourceSelect(resource.id, e.target.checked)}
                  className="resource-item-checkbox"
                >
                  <div className="resource-item-content">
                    <div className="resource-item-info">
                      <Text className="resource-item-name">
                        {resource.name}
                      </Text>
                      {resource.code && (
                        <Tag size="small" color="blue" style={{ marginLeft: 8 }}>
                          {resource.code}
                        </Tag>
                      )}
                    </div>
                    {isAssigned ? (
                      <Tag color="green" icon={<CheckCircleOutlined />} size="small">
                        已分配
                      </Tag>
                    ) : (
                      <Tag color="default" size="small">
                        未分配
                      </Tag>
                    )}
                  </div>
                </Checkbox>
              </div>
            );
          })
        )}
      </div>

      {selectedResourceIds.size > 0 && (
        <div className="resource-selected-info" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
          <Space>
            <Text type="secondary">
              已选中 {selectedResourceIds.size} 项
            </Text>
            <Button
              size="small"
              type="link"
              danger
              onClick={() => setSelectedResourceIds(new Set())}
            >
              清空选择
            </Button>
          </Space>
        </div>
      )}
    </div>
  );
};

export default ResourcePanel;
