import React from 'react';
import { Button, Space, Typography, Tooltip } from 'antd';
import {
  SwapOutlined,
  ClearOutlined,
  ReloadOutlined,
  SendOutlined,
  UndoOutlined,
  RedoOutlined,
  BulbOutlined,
  DownloadOutlined
} from '@ant-design/icons';

const { Text } = Typography;

interface FooterStats {
  pendingCount: number;
  assignedCount: number;
  totalResources: number;
}

interface AssignmentFooterProps {
  stats: FooterStats;
  onAverage: () => void;
  onClearAll: () => void;
  onReset: () => void;
  onSubmit: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSmartRecommend?: () => void;
  onExport?: () => void;
  disabled?: {
    average?: boolean;
    clear?: boolean;
    reset?: boolean;
    submit?: boolean;
    undo?: boolean;
    redo?: boolean;
  };
  isSubmitting?: boolean;
}

const AssignmentFooter: React.FC<AssignmentFooterProps> = ({
  stats,
  onAverage,
  onClearAll,
  onReset,
  onSubmit,
  onUndo,
  onRedo,
  onSmartRecommend,
  onExport,
  disabled = {},
  isSubmitting = false
}) => {
  return (
    <div className="assignment-footer">
      <div className="footer-stats">
        <Space size="large">
          <div className="footer-stat-item">
            <Text type="secondary">待分配:</Text>
            <Text strong style={{ marginLeft: 4, color: '#faad14' }}>
              {stats.pendingCount}
            </Text>
          </div>
          <div className="footer-stat-item">
            <Text type="secondary">已分配:</Text>
            <Text strong style={{ marginLeft: 4, color: '#52c41a' }}>
              {stats.assignedCount}
            </Text>
          </div>
          <div className="footer-stat-item">
            <Text type="secondary">总计:</Text>
            <Text strong style={{ marginLeft: 4 }}>{stats.totalResources}</Text>
          </div>
        </Space>
      </div>

      <div className="footer-actions">
        <Space size="middle">
          {/* 智能操作组 */}
          <Tooltip title="智能推荐分配方案">
            <Button
              icon={<BulbOutlined />}
              onClick={onSmartRecommend}
              disabled={disabled.average}
              type="default"
            >
              智能推荐
            </Button>
          </Tooltip>
          
          {/* 撤销/重做组 */}
          <Tooltip title="撤销 (Ctrl+Z)">
            <Button
              icon={<UndoOutlined />}
              onClick={onUndo}
              disabled={disabled.undo}
              type="default"
            >
              撤销
            </Button>
          </Tooltip>
          
          <Tooltip title="重做 (Ctrl+Y)">
            <Button
              icon={<RedoOutlined />}
              onClick={onRedo}
              disabled={disabled.redo}
              type="default"
            >
              重做
            </Button>
          </Tooltip>
          
          <Tooltip title="平均分配所有资源">
            <Button
              icon={<SwapOutlined />}
              onClick={onAverage}
              disabled={disabled.average}
            >
              平均分配
            </Button>
          </Tooltip>
          
          <Tooltip title="清空所有已分配的资源">
            <Button
              icon={<ClearOutlined />}
              onClick={onClearAll}
              disabled={disabled.clear}
            >
              清空已选
            </Button>
          </Tooltip>
          
          <Tooltip title="重置到初始状态">
            <Button
              icon={<ReloadOutlined />}
              onClick={onReset}
              disabled={disabled.reset}
            >
              重置
            </Button>
          </Tooltip>
          
          {/* 导出按钮 */}
          {onExport && (
            <Tooltip title="导出分配结果">
              <Button
                icon={<DownloadOutlined />}
                onClick={onExport}
                type="default"
              >
                导出
              </Button>
            </Tooltip>
          )}
        </Space>

        <Space>
          <Button
            type="primary"
            size="large"
            icon={<SendOutlined />}
            onClick={onSubmit}
            disabled={disabled.submit}
            loading={isSubmitting}
          >
            确定下发 ({stats.assignedCount})
          </Button>
        </Space>
      </div>
    </div>
  );
};

export default AssignmentFooter;
