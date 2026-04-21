import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Table, Button, Tag, Space, Card, Typography, message, 
  Modal, Input, Statistic, Row, Col, Progress, Select, Alert
} from 'antd';
import { 
  PlusOutlined, 
  EyeOutlined, 
  PlayCircleOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  DeleteOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import { taskService } from '../services/taskService';
import { ruleService } from '../services/ruleService';
import { colors } from '../styles/designTokens';
import AppSidebar from '../components/AppSidebar';

const { Title, Text } = Typography;

interface Task {
  id: number;
  task_name: string;
  status: string;
  created_at: string;
  total_companies: number;
  total_score_avg: number | null;
  rule_count: number;
}

const TaskList: React.FC = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [selectedRuleTemplate, setSelectedRuleTemplate] = useState<number | null>(null);
  const [ruleTemplates, setRuleTemplates] = useState<any[]>([]);

  useEffect(() => {
    fetchTasks();
    fetchRuleTemplates();
  }, []);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const data = await taskService.getTasks();
      setTasks(data);
    } catch (error) {
      message.error('获取任务列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchRuleTemplates = async () => {
    try {
      const data = await ruleService.getRules();
      setRuleTemplates(data);
    } catch (error) {
      console.error('获取规则模板失败:', error);
    }
  };

  const handleCreateTask = async () => {
    if (!taskName.trim()) {
      message.warning('请输入任务名称');
      return;
    }
    try {
      await taskService.createTask({ task_name: taskName });
      message.success('任务创建成功');
      setCreateModalVisible(false);
      setTaskName('');
      setSelectedRuleTemplate(null);
      fetchTasks();
    } catch (error) {
      message.error('创建任务失败');
    }
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; icon: React.ReactNode; text: string }> = {
      pending: { 
        color: 'default', 
        icon: <ClockCircleOutlined />, 
        text: '待处理' 
      },
      processing: { 
        color: 'processing', 
        icon: <ClockCircleOutlined />, 
        text: '评审中' 
      },
      completed: { 
        color: 'success', 
        icon: <CheckCircleOutlined />, 
        text: '已完成' 
      },
      failed: { 
        color: 'error', 
        icon: <ExclamationCircleOutlined />, 
        text: '失败' 
      },
    };
    return configs[status] || configs.pending;
  };

  const columns = [
    {
      title: '任务名称',
      dataIndex: 'task_name',
      key: 'task_name',
      width: 300,
      render: (text: string) => (
        <Text strong style={{ fontSize: 15 }}>{text}</Text>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => {
        const config = getStatusConfig(status);
        return (
          <Tag icon={config.icon} color={config.color} style={{ fontSize: 13 }}>
            {config.text}
          </Tag>
        );
      }
    },
    {
      title: '公司数',
      dataIndex: 'total_companies',
      key: 'total_companies',
      width: 100,
      render: (count: number) => (
        <Text style={{ fontSize: 14, lineHeight: '1.5' }}>{count} 家</Text>
      )
    },
    {
      title: '评审项数量',
      dataIndex: 'rule_count',
      key: 'rule_count',
      width: 120,
      render: (count: number) => (
        <Text style={{ fontSize: 14, lineHeight: '1.5' }}>{count} 项</Text>
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
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: Task) => (
        <Space>
            <Button 
              type="primary"
              ghost
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/tasks/${record.id}`)}
            >
              查看
            </Button>
            {record.status === 'pending' && (
              <Button 
                type="primary"
                size="small"
                danger
                icon={<PlayCircleOutlined />}
                onClick={() => handleStartTask(record.id)}
                disabled={record.rule_count === 0}
              >
                启动
              </Button>
            )}
            <Button 
              size="small" 
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDeleteTask(record.id)}
            >
              删除
            </Button>
          </Space>
      )
    }
  ];

  const handleStartTask = async (taskId: number) => {
    Modal.confirm({
      title: '确认启动评审',
      content: '确定要启动该任务的 AI 评审吗？',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          await taskService.startTask(taskId);
          message.success('任务已启动');
          fetchTasks();
        } catch (error) {
          message.error('启动任务失败');
        }
      }
    });
  };

  const handleDeleteTask = async (taskId: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该任务吗？相关记录将被删除，此操作不可恢复！',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await taskService.deleteTask(taskId);
          message.success('任务已删除');
          fetchTasks();
        } catch (error) {
          message.error('删除失败');
        }
      }
    });
  };

  const stats = [
    { title: '总任务数', value: tasks.length, icon: <FileTextOutlined />, color: colors.primary },
    { title: '进行中', value: tasks.filter(t => t.status === 'processing').length, icon: <ClockCircleOutlined />, color: colors.warning },
    { title: '已完成', value: tasks.filter(t => t.status === 'completed').length, icon: <CheckCircleOutlined />, color: colors.success },
  ];

  return (
    <AppSidebar 
      pageTitle="评审任务管理" 
      userRole="team_leader"
    >
      <Card
        extra={
          <Button 
            type="primary" 
            size="large"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalVisible(true)}
          >
            新建任务
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={tasks}
          loading={loading}
          rowKey="id"
          pagination={{ 
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`
          }}
          scroll={{ x: 1000 }}
        />
      </Card>

      <Modal
        title={<span><PlusOutlined /> 新建评审任务</span>}
        open={createModalVisible}
        onOk={handleCreateTask}
        onCancel={() => {
          setCreateModalVisible(false);
          setTaskName('');
          setSelectedRuleTemplate(null);
        }}
        okText="创建"
        cancelText="取消"
        width={600}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Input
            placeholder="请输入任务名称"
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            onPressEnter={handleCreateTask}
            autoFocus
            size="large"
          />
        </Space>
      </Modal>
    </AppSidebar>
  );
};

export default TaskList;
