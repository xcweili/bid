import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Typography, Progress, Table, Tag, Space, Button, Timeline, Alert, Divider } from 'antd';
import { 
  ReloadOutlined, EyeOutlined, ClockCircleOutlined, 
  CheckCircleOutlined, RobotOutlined, ThunderboltOutlined,
  ArrowLeftOutlined
} from '@ant-design/icons';
import { taskService } from '../services/taskService';

const { Title, Text } = Typography;

interface CompanyProgress {
  id: number;
  company_name: string;
  status: string;
  completed_items: number;
  total_items: number;
  progress_percent: number;
  score: number | null;
}

interface TaskProgress {
  task_id: number;
  task_name: string;
  status: string;
  overall_progress: number;
  total_companies: number;
  completed_companies: number;
  processing_companies: number;
  pending_companies: number;
  total_rules: number;
  completed_items: number;
  total_items: number;
  avg_score: number | null;
  company_progress: CompanyProgress[];
  created_at: string | null;
  completed_at: string | null;
}

const TaskProgressView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [progress, setProgress] = useState<TaskProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchProgress = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/tasks/${id}/progress`);
      const data = await response.json();
      setProgress(data);
    } catch (error) {
      console.error('获取进度失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProgress();
  }, [id]);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh || !id) return;
    
    const interval = setInterval(() => {
      fetchProgress();
    }, 60000); // 每 1 分钟刷新一次

    return () => clearInterval(interval);
  }, [autoRefresh, id]);

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; icon: React.ReactNode; text: string }> = {
      pending: { color: 'default', icon: <ClockCircleOutlined />, text: '待处理' },
      processing: { color: 'processing', icon: <ThunderboltOutlined />, text: '评审中' },
      completed: { color: 'success', icon: <CheckCircleOutlined />, text: '已完成' },
      failed: { color: 'error', icon: <RobotOutlined />, text: '失败' },
    };
    return configs[status] || configs.pending;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: '#8c8c8c',
      processing: '#1890ff',
      completed: '#52c41a',
      failed: '#ff4d4f',
    };
    return colors[status] || '#8c8c8c';
  };

  if (!progress) return <div style={{ padding: 40, textAlign: 'center' }}>加载中...</div>;

  const statusConfig = getStatusConfig(progress.status);

  return (
    <div style={{ padding: 24 }}>
      {/* 头部 */}
      <div style={{ marginBottom: 24 }}>
        <Space align="center" style={{ marginBottom: 16 }}>
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={() => window.history.back()}
            style={{ marginRight: 16 }}
          >
            返回上一页
          </Button>
          <Title level={3} style={{ margin: 0 }}>
            {progress.task_name} - 任务进度
          </Title>
          <Tag 
            icon={statusConfig.icon} 
            color={statusConfig.color}
            style={{ fontSize: 14 }}
          >
            {statusConfig.text}
          </Tag>
        </Space>
        
        <Button 
          type={autoRefresh ? 'primary' : 'default'}
          icon={<ClockCircleOutlined />}
          onClick={() => setAutoRefresh(!autoRefresh)}
          style={{ marginRight: 0 }}
        >
          {autoRefresh ? '自动刷新：开' : '自动刷新：关'}
        </Button>
      </div>

      {/* 总体进度 */}
      <Card style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <Text strong>总体进度</Text>
        </div>
        <Progress 
          percent={progress.overall_progress}
          strokeColor={
            progress.status === 'completed' ? '#52c41a' : 
            progress.status === 'processing' ? '#1890ff' : '#8c8c8c'
          }
          format={() => `${progress.completed_items}/${progress.total_items} 评审项`}
        />
        
        <Divider />
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 'bold', color: '#1890ff' }}>
              {progress.total_companies}
            </div>
            <Text type="secondary">总公司数</Text>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 'bold', color: '#52c41a' }}>
              {progress.completed_companies}
            </div>
            <Text type="secondary">已完成</Text>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 'bold', color: '#faad14' }}>
              {progress.processing_companies}
            </div>
            <Text type="secondary">评审中</Text>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 'bold', color: '#8c8c8c' }}>
              {progress.pending_companies}
            </div>
            <Text type="secondary">待处理</Text>
          </div>
        </div>


      </Card>

      {/* 公司进度列表 */}
      <Card title="公司评审进度" style={{ marginBottom: 24 }}>
        <Table
          dataSource={progress.company_progress}
          rowKey="id"
          pagination={false}
          loading={loading}
          columns={[
            {
              title: '公司名称',
              dataIndex: 'company_name',
              key: 'company_name',
              width: 250,
              render: (text: string) => <Text strong>{text}</Text>
            },
            {
              title: '状态',
              dataIndex: 'status',
              key: 'status',
              width: 120,
              render: (status: string) => (
                <Tag color={getStatusColor(status)}>
                  {getStatusConfig(status).text}
                </Tag>
              )
            },
            {
              title: '评审进度',
              key: 'progress',
              width: 250,
              render: (_: any, record: CompanyProgress) => (
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Progress 
                    percent={record.progress_percent}
                    size="small"
                    format={() => `${record.completed_items}/${record.total_items}`}
                    strokeColor={getStatusColor(record.status)}
                  />
                </Space>
              )
            },
            {
              title: '得分',
              dataIndex: 'score',
              key: 'score',
              width: 120,
              render: (score: number | null) => score !== null ? (
                <Tag color={score >= 80 ? 'green' : score >= 60 ? 'orange' : 'red'}>
                  {score.toFixed(1)} 分
                </Tag>
              ) : <Text type="secondary">-</Text>
            }
          ]}
        />
      </Card>

      {/* 实时日志 */}
      <RealTimeLog taskId={parseInt(id!)} />
    </div>
  );
};

// 实时日志组件
const RealTimeLog: React.FC<{ taskId: number }> = ({ taskId }) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/logs?lines=100&task_id=${taskId}`);
      const data = await response.json();
      // 只更新日志，不替换所有日志
      // 检查是否有新的日志
      if (data.logs && data.logs.length > 0) {
        // 合并日志，去重
        const logSet = new Set([...data.logs, ...logs].map(log => JSON.stringify(log)));
        const newLogs = Array.from(logSet).map(str => JSON.parse(str));
        // 按时间排序
        newLogs.sort((a, b) => {
          if (a.time && b.time) {
            return new Date(a.time).getTime() - new Date(b.time).getTime();
          }
          return 0;
        });
        setLogs(newLogs);
      }
    } catch (error) {
      console.error('获取日志失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [taskId]);

  return (
    <Card 
      title={
        <Space>
          <EyeOutlined />
          <span>实时日志</span>
          <Button 
            size="small" 
            icon={<ReloadOutlined />} 
            onClick={fetchLogs}
            loading={loading}
            style={{ marginLeft: 'auto' }}
          >
            刷新
          </Button>
        </Space>
      }
    >
      <div style={{ 
        background: '#1e1e1e', 
        color: '#d4d4d4', 
        padding: 16, 
        borderRadius: 8,
        maxHeight: 1000,
        overflowY: 'auto',
        fontFamily: 'monospace',
        fontSize: 12
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20 }}>加载中...</div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#8c8c8c' }}>
            暂无日志
          </div>
        ) : (
          <div>
            {logs.map((log, index) => (
              <div key={index} style={{ marginBottom: 4 }}>
                <span style={{ color: '#8c8c8c' }}>{log.time}</span>
                <span style={{ 
                  color: log.level === 'ERROR' ? '#ff4d4f' : 
                         log.level === 'WARNING' ? '#faad14' : 
                         log.level === 'SUCCESS' ? '#52c41a' : '#1890ff',
                  marginLeft: 8,
                  marginRight: 8
                }}>
                  [{log.level}]
                </span>
                <span>{log.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};

export default TaskProgressView;
