import React, { useState, useMemo } from 'react';
import {
  Button,
  Tag,
  Empty,
  Avatar,
  Input,
  Typography,
  Space,
  Tooltip,
} from 'antd';
import {
  UserOutlined,
  SearchOutlined,
  MinusCircleOutlined,
  CheckCircleOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import './ManagerSelection.css';

const { Title, Text } = Typography;

interface User {
  id: number;
  username: string;
  real_name: string;
  role: string;
}

interface ManagerSelectionProps {
  availableManagers: User[];
  selectedManagerId: number | null;
  onSelectManager: (managerId: number | null) => void;
  searchPlaceholder?: string;
}

const roleNames: Record<string, string> = {
  team_manager: '团队负责人',
};

const roleColors: Record<string, string> = {
  team_manager: 'blue',
};

export const ManagerSelection: React.FC<ManagerSelectionProps> = ({
  availableManagers,
  selectedManagerId,
  onSelectManager,
  searchPlaceholder = '搜索负责人姓名或用户名...',
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // 过滤负责人：搜索
  const filteredManagers = useMemo(() => {
    if (!searchTerm) return availableManagers;
    return availableManagers.filter(manager => {
      const matchesSearch =
        manager.real_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        manager.username.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });
  }, [availableManagers, searchTerm]);

  const handleSelectManager = (managerId: number) => {
    // 如果点击已选中的负责人，则取消选择
    if (selectedManagerId === managerId) {
      onSelectManager(null);
    } else {
      onSelectManager(managerId);
    }
  };

  const handleClearSearch = () => {
    setSearchTerm('');
  };

  const isSelected = (managerId: number) => selectedManagerId === managerId;

  const selectedManager = useMemo(() => {
    return availableManagers.find(m => m.id === selectedManagerId);
  }, [availableManagers, selectedManagerId]);

  return (
    <div className="add-member-section">
      {/* 头部：标题和统计 */}
      <div className="add-member-header">
        <div className="header-title">
          <div className="title-icon-wrapper">
            <UserOutlined />
          </div>
          <div className="title-text">
            <Title level={5} style={{ margin: 0 }}>选择团队负责人</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              从可用负责人中选择（可选，最多 1 人）
            </Text>
          </div>
        </div>
        <div className="header-stats">
          <Tag icon={<TeamOutlined />} color="blue">
            共 {availableManagers.length} 人可用
          </Tag>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="search-filter-bar">
        <div className="search-wrapper">
          <Input.Search
            placeholder={searchPlaceholder}
            size="large"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onClear={handleClearSearch}
            prefix={<SearchOutlined />}
            allowClear
          />
        </div>
      </div>

      {/* 负责人卡片网格 */}
      <div className="member-cards-grid">
        {filteredManagers.length > 0 ? (
          filteredManagers.map(manager => {
            const isSel = isSelected(manager.id);
            return (
              <div
                key={manager.id}
                className={`member-select-card ${isSel ? 'selected' : ''}`}
                onClick={() => handleSelectManager(manager.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleSelectManager(manager.id);
                  }
                }}
              >
                <div className="card-checkbox">
                  <div className={`checkbox-indicator ${isSel ? 'checked' : ''}`}>
                    {isSel && <CheckCircleOutlined />}
                  </div>
                </div>
                <div className="card-content">
                  <div className="card-avatar">
                    <Avatar
                      size={48}
                      icon={<UserOutlined />}
                      style={{
                        background: isSel
                          ? 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)'
                          : 'linear-gradient(135deg, #f0f0f0 0%, #d9d9d9 100%)',
                        color: '#fff',
                      }}
                    />
                  </div>
                  <div className="card-info">
                    <div className="card-name">{manager.real_name}</div>
                    <div className="card-username">@{manager.username}</div>
                    <div className="card-role">
                      <Tag
                        color={roleColors[manager.role]}
                      >
                        {roleNames[manager.role] || manager.role}
                      </Tag>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="no-users-placeholder">
            <Empty
              image={<UserOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />}
              description={
                searchTerm
                  ? `未找到 "${searchTerm}" 匹配的负责人`
                  : '暂无可用负责人'
              }
            />
          </div>
        )}
      </div>

      {/* 已选负责人展示区 */}
      {selectedManagerId && selectedManager && (
        <div className="selected-users-footer">
          <div className="selected-summary">
            <div className="summary-icon">
              <CheckCircleOutlined />
            </div>
            <div className="summary-text">
              <div className="summary-title">已选择负责人</div>
              <div className="summary-users">
                <Tag
                  closable
                  onClose={() => onSelectManager(null)}
                  color="blue"
                >
                  {selectedManager.real_name}
                </Tag>
              </div>
            </div>
          </div>
          <Tooltip title="取消选择负责人">
            <Button
              type="link"
              danger
              icon={<MinusCircleOutlined />}
              onClick={() => onSelectManager(null)}
            >
              取消选择
            </Button>
          </Tooltip>
        </div>
      )}
    </div>
  );
};
