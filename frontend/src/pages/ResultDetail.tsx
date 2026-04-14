import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Card, Typography, Table, Tag, Space, Button, Collapse, 
  Descriptions, message, Divider, Progress, Row, Col, Statistic,
  Modal, Alert
} from 'antd';
import { 
  ArrowLeftOutlined, FileTextOutlined, 
  CheckCircleOutlined, DashboardOutlined,
  EyeOutlined, ExportOutlined
} from '@ant-design/icons';
import { taskService } from '../services/taskService';
import { colors } from '../styles/designTokens';

const { Title, Text } = Typography;
const { Panel } = Collapse;

interface RuleScore {
  rule_name: string;
  item_name: string;
  score: number;
  max_score: number;
  reason: string;
  evidence: string;
  evidence_details: any[];
}

interface CompanyResult {
  id: number;
  company_name: string;
  total_score: number | null;
  rule_scores: RuleScore[];
}

interface TaskResults {
  task_id: number;
  task_name: string;
  status: string;
  total_score_avg: number | null;
  companies: CompanyResult[];
}

const ResultDetail: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [results, setResults] = useState<TaskResults | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (taskId) {
      fetchResults();
    }
  }, [taskId]);

  const fetchResults = async () => {
    setLoading(true);
    try {
      const data = await taskService.getTaskResults(parseInt(taskId!));
      setResults(data);
    } catch (error) {
      message.error('获取结果失败');
    } finally {
      setLoading(false);
    }
  };

  const handleViewEvidence = (result: RuleScore) => {
    Modal.info({
      title: `评审依据 - ${result.rule_name}`,
      width: 800,
      content: (
        <div>
          <Descriptions bordered column={1} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="得分">
              <Tag color={result.score / result.max_score >= 0.8 ? 'green' : 'orange'}>
                {result.score} / {result.max_score}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="评分理由">{result.reason}</Descriptions.Item>
            <Descriptions.Item label="依据说明">{result.evidence || '-'}</Descriptions.Item>
          </Descriptions>
          
          {result.evidence_details && result.evidence_details.length > 0 && (
            <div>
              <Text strong>原文引用：</Text>
              {result.evidence_details.map((d, i) => (
                <div key={i} style={{ 
                  background: '#f5f5f5', 
                  padding: 12, 
                  borderRadius: 6,
                  marginTop: 8,
                  borderLeft: `4px solid ${colors.primary}`
                }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    📄 {d.file} (第{d.page}页)
                  </Text>
                  <div style={{ marginTop: 4 }}>
                    <Text>{d.content}</Text>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ),
      okText: '关闭'
    });
  };

  if (!results) return <div>加载中...</div>;

  const companyColumns = [
    {
      title: '排名',
      key: 'rank',
      width: 60,
      render: (_: any, record: CompanyResult, index: number) => (
        <span style={{ 
          fontWeight: 'bold', 
          color: index === 0 ? '#faad14' : 'inherit',
          fontSize: 16
        }}>
          #{index + 1}
        </span>
      )
    },
    {
      title: '公司名称',
      dataIndex: 'company_name',
      key: 'company_name',
      width: 250,
      render: (text: string) => <Text strong>{text}</Text>
    },
    {
      title: '总分',
      dataIndex: 'total_score',
      key: 'total_score',
      width: 150,
      render: (score: number | null, record: CompanyResult) => (
        <Space direction="vertical" size={0}>
          <Statistic 
            value={score || 0} 
            precision={1}
            valueStyle={{ 
              fontSize: 20, 
              fontWeight: 'bold',
              color: score && score >= 80 ? colors.success : score && score >= 60 ? colors.warning : colors.error
            }}
          />
          <Progress 
            percent={(score || 0)} 
            size="small"
            strokeColor={score && score >= 80 ? colors.success : score && score >= 60 ? colors.warning : colors.error}
            showInfo={false}
          />
        </Space>
      )
    },
    {
      title: '详情',
      key: 'action',
      width: 120,
      render: (_: any, record: CompanyResult) => (
        <Button 
          size="small"
          icon={<FileTextOutlined />}
          onClick={() => navigate(`/companies/${record.id}`)}
        >
          查看详情
        </Button>
      )
    }
  ];

  const ruleColumns = [
    {
      title: '评审项',
      dataIndex: 'rule_name',
      key: 'rule_name',
      width: 200
    },
    {
      title: '得分',
      key: 'score',
      width: 120,
      render: (_: any, record: RuleScore) => (
        <Tag 
          color={record.score / record.max_score >= 0.8 ? 'green' : record.score / record.max_score >= 0.6 ? 'orange' : 'red'}
          icon={<CheckCircleOutlined />}
        >
          {record.score} / {record.max_score}
        </Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: RuleScore) => (
        <Button 
          size="small" 
          icon={<EyeOutlined />}
          onClick={() => handleViewEvidence(record)}
        >
          查看依据
        </Button>
      )
    }
  ];

  return (
    <div>
      <Button 
        icon={<ArrowLeftOutlined />} 
        onClick={() => navigate('/tasks')}
        style={{ marginBottom: 16 }}
      >
        返回任务列表
      </Button>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={24} align="middle">
          <Col flex="auto">
            <Title level={4} style={{ margin: '0 0 8px 0' }}>
              <DashboardOutlined /> {results.task_name}
            </Title>
            <Space>
              <Tag>{results.status}</Tag>
              <Text type="secondary">任务 ID: #{results.task_id}</Text>
            </Space>
          </Col>
          <Col>
            <Statistic 
              title="平均分" 
              value={results.total_score_avg || 0} 
              precision={1}
              suffix="分"
              valueStyle={{ fontSize: 28 }}
            />
          </Col>
        </Row>
      </Card>

      <Card title="公司排名" style={{ marginBottom: 16 }} extra={
        <Button icon={<ExportOutlined />}>导出 Excel</Button>
      }>
        <Table
          columns={companyColumns}
          dataSource={results.companies}
          rowKey="id"
          pagination={false}
          scroll={{ x: 600 }}
        />
      </Card>

      <Card title="详细评分">
        <Collapse defaultActiveKey={results.companies.map(c => c.id.toString())}>
          {results.companies.map((company, cIndex) => (
            <Panel 
              header={
                <Space>
                  <Text strong>{company.company_name}</Text>
                  <Tag color={company.total_score && company.total_score >= 80 ? 'green' : 'orange'}>
                    {(company.total_score || 0).toFixed(1)} 分
                  </Tag>
                </Space>
              } 
              key={company.id}
            >
              <Table
                columns={ruleColumns}
                dataSource={company.rule_scores}
                rowKey="rule_name"
                pagination={false}
                size="small"
                scroll={{ x: 500 }}
              />
              
              <Divider />
              
              <Alert
                message="评审说明"
                description="点击上方「查看依据」按钮，可以查看每个评审项的详细评分理由和原文引用。"
                type="info"
                showIcon
              />
            </Panel>
          ))}
        </Collapse>
      </Card>
    </div>
  );
};

export default ResultDetail;
