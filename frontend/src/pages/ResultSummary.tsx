import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Table,
  Tag,
  Space,
  Typography,
  message,
  Statistic,
  Row,
  Col,
  Divider,
  Alert
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  BarChartOutlined,
  TeamOutlined
} from '@ant-design/icons';
import apiClient from '../services/api';
import './ResultSummary.css';

const { Title, Text } = Typography;

interface CompanyResult {
  company_id: number;
  company_name: string;
  total_score: number;
  ranking: number;
  details: Array<{
    criteria_id: number;
    criteria_name: string;
    criteria_type: string;
    score: number;
    max_score: number;
  }>;
}

interface Package {
  id: number;
  package_name: string;
  status: string;
}

const ResultSummary: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const packageId = parseInt(id || '0');

  const [packageInfo, setPackageInfo] = useState<Package | null>(null);
  const [rankings, setRankings] = useState<CompanyResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [summaryData, setSummaryData] = useState<any>(null);

  useEffect(() => {
    fetchSummary();
  }, [packageId]);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      // 获取包信息
      const projectRes = await apiClient.get(`/api/projects/${packageId}`);
      setPackageInfo(projectRes.data);

      // 获取汇总结果
      const summaryRes = await apiClient.get(`/api/evaluation/project/${packageId}/summary`);
      setSummaryData(summaryRes.data);
      
      if (summaryRes.data.rankings) {
        setRankings(summaryRes.data.rankings);
      }
    } catch (error) {
      message.error('获取汇总数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSummarize = async () => {
    try {
      await apiClient.post('/api/evaluate/summarize-package', {
        package_id: packageId
      });
      message.success('汇总成功');
      fetchSummary();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '汇总失败');
    }
  };

  const handleCheckReadiness = async () => {
    try {
      const res = await apiClient.get(`/api/evaluate/package/${packageId}/readiness`);
      const data = res.data;
      
      message.info(`总体完成度：${data.overall_progress}%`);
    } catch (error) {
      message.error('检查失败');
    }
  };

  const columns = [
    {
      title: '排名',
      dataIndex: 'ranking',
      key: 'ranking',
      width: 80,
      align: 'center' as const,
      render: (rank: number) => (
        <Tag color={rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? '#cd7f32' : 'default'}>
          No.{rank}
        </Tag>
      )
    },
    {
      title: '公司名称',
      dataIndex: 'company_name',
      key: 'company_name'
    },
    {
      title: '总分',
      dataIndex: 'total_score',
      key: 'total_score',
      align: 'center' as const,
      render: (score: number) => (
        <Text strong style={{ fontSize: 16, color: '#1890ff' }}>
          {score?.toFixed(1)}
        </Text>
      )
    },
    {
      title: '详情',
      key: 'details',
      render: (_: any, record: CompanyResult) => (
        <Button
          size="small"
          onClick={() => {
            // TODO: 展开详情
            message.info('详情功能待实现');
          }}
        >
          查看
        </Button>
      )
    }
  ];

  const technicalScore = rankings.length > 0 ? 
    rankings[0].details.filter(d => d.criteria_type === 'technical').reduce((sum, d) => sum + d.score, 0) : 0;
  const businessScore = rankings.length > 0 ?
    rankings[0].details.filter(d => d.criteria_type === 'business').reduce((sum, d) => sum + d.score, 0) : 0;

  return (
    <div className="result-summary">
      <div className="page-header">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/projects')}>
          返回
        </Button>
        <div className="header-content">
          <Title level={4} style={{ margin: 0 }}>结果汇总</Title>
          <Text type="secondary"> - {packageInfo?.package_name || `包 ${packageId}`}</Text>
        </div>
      </div>

      <div className="summary-content">
        {/* 操作栏 */}
        <Card className="action-card" style={{ marginBottom: 16 }}>
          <Space wrap>
            <Button
              icon={<CheckCircleOutlined />}
              onClick={handleSummarize}
            >
              执行汇总
            </Button>
            <Button
              icon={<BarChartOutlined />}
              onClick={handleCheckReadiness}
            >
              检查完成度
            </Button>
          </Space>
        </Card>

        {/* 统计卡片 */}
        {summaryData && (
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="平均得分"
                  value={summaryData.avg_score || 0}
                  precision={2}
                  prefix={<BarChartOutlined />}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="技术得分"
                  value={technicalScore}
                  precision={1}
                  prefix={<Tag color="blue">技术</Tag>}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="商务得分"
                  value={businessScore}
                  precision={1}
                  prefix={<Tag color="green">商务</Tag>}
                  valueStyle={{ color: '#faad14' }}
                />
              </Card>
            </Col>
          </Row>
        )}

        {/* 排名表格 */}
        <Card className="rankings-card">
          <div className="card-header">
            <Title level={5}>公司排名</Title>
            <Tag color={summaryData?.status === 'completed' ? 'success' : 'processing'}>
              {summaryData?.status === 'completed' ? '已完成' : '进行中'}
            </Tag>
          </div>

          <Divider />

          <Table
            columns={columns}
            dataSource={rankings}
            rowKey="company_id"
            loading={loading}
            pagination={{ pageSize: 10 }}
          />
        </Card>

        {/* 详细信息 */}
        {rankings.length > 0 && (
          <Card className="details-card" style={{ marginTop: 16 }}>
            <Title level={5}>第一名详情：{rankings[0]?.company_name}</Title>
            <Divider />
            
            <Row gutter={16}>
              <Col span={12}>
                <Title level={5}>技术评审项</Title>
                <Table
                  dataSource={rankings[0]?.details.filter(d => d.criteria_type === 'technical') || []}
                  size="small"
                  pagination={false}
                >
                  <Table.Column
                    title="评审项"
                    dataIndex="criteria_name"
                  />
                  <Table.Column
                    title="得分"
                    dataIndex="score"
                    render={(score: number, record: any) => (
                      <Tag color="blue">{score} / {record.max_score}</Tag>
                    )}
                  />
                </Table>
              </Col>
              <Col span={12}>
                <Title level={5}>商务评审项</Title>
                <Table
                  dataSource={rankings[0]?.details.filter(d => d.criteria_type === 'business') || []}
                  size="small"
                  pagination={false}
                >
                  <Table.Column
                    title="评审项"
                    dataIndex="criteria_name"
                  />
                  <Table.Column
                    title="得分"
                    dataIndex="score"
                    render={(score: number, record: any) => (
                      <Tag color="green">{score} / {record.max_score}</Tag>
                    )}
                  />
                </Table>
              </Col>
            </Row>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ResultSummary;
