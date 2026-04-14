import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Card, Typography, Table, Tag, Space, Button, Collapse, 
  Descriptions, message, Divider, Progress, Row, Col, Statistic,
  Modal, Alert, Empty
} from 'antd';
import { 
  ArrowLeftOutlined, FileTextOutlined, 
  CheckCircleOutlined, DashboardOutlined,
  EyeOutlined, ExportOutlined, TeamOutlined
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
  status: string;
  bid_folder_path?: string;
}

const CompanyDetail: React.FC = () => {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const [company, setCompany] = useState<CompanyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [documentModalVisible, setDocumentModalVisible] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);

  useEffect(() => {
    if (companyId) {
      fetchCompanyDetails();
    }
  }, [companyId]);

  const fetchCompanyDetails = async () => {
    setLoading(true);
    try {
      const data = await taskService.getCompanyResults(parseInt(companyId!));
      setCompany(data);
    } catch (error) {
      console.error('获取公司详情失败:', error);
      message.error('获取公司详情失败');
    } finally {
      setLoading(false);
    }
  };

  const handleViewEvidence = (result: RuleScore) => {
    // 处理 evidence_details 可能是字符串的情况
    let evidenceDetails: any[] = [];
    if (result.evidence_details) {
      if (Array.isArray(result.evidence_details)) {
        evidenceDetails = result.evidence_details;
      } else if (typeof result.evidence_details === 'string') {
        try {
          evidenceDetails = JSON.parse(result.evidence_details);
        } catch (e) {
          evidenceDetails = [];
        }
      }
    }

    Modal.info({
      title: `评审依据 - ${result.rule_name}`,
      width: 800,
      content: (
        <div>
          <Descriptions bordered column={1} style={{ marginBottom: 16 }}>
                <Descriptions.Item label="得分">
                  <Tag color={result.score >= 80 ? 'green' : result.score >= 60 ? 'orange' : 'red'}>
                    {result.score}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="评分理由">{result.reason}</Descriptions.Item>
                <Descriptions.Item label="依据说明">{result.evidence || '-'}</Descriptions.Item>
              </Descriptions>
          
          {evidenceDetails && evidenceDetails.length > 0 && (
            <div>
              <Text strong>原文引用：</Text>
              {evidenceDetails.map((d, i) => (
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

  const handleViewDocument = (document: any) => {
    setSelectedDocument(document);
    setDocumentModalVisible(true);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>加载中...</div>;
  
  if (!company) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <Empty description="公司信息不存在" />
      <Button type="primary" onClick={() => navigate('/tasks')} style={{ marginTop: 16 }}>
        返回任务列表
      </Button>
    </div>
  );

  // 构建表格列 - 每个评审项作为一行
  const tableColumns = [
    {
      title: '评审项',
      dataIndex: 'rule_name',
      key: 'rule_name',
      width: 250,
      fixed: 'left' as const,
      render: (text: string) => <Text strong>{text}</Text>
    },
    {
      title: '分数',
      dataIndex: 'score',
      key: 'score',
      width: 120,
      render: (score: number) => (
        <Tag 
          color={score >= 80 ? 'green' : score >= 60 ? 'orange' : 'red'}
          icon={<CheckCircleOutlined />}
        >
          {score}
        </Tag>
      )
    },
    {
      title: '理由',
      dataIndex: 'reason',
      key: 'reason',
      width: 300,
      render: (text: string) => (
        <Text style={{ fontSize: 13 }}>{text || '-'}</Text>
      )
    },
    {
      title: '依据',
      dataIndex: 'evidence',
      key: 'evidence',
      width: 300,
      render: (evidence: string) => {
        if (!evidence) {
          return <Text type="secondary">-</Text>;
        }
        return <Text style={{ fontSize: 13 }}>{evidence}</Text>;
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Button 
          size="small" 
          icon={<EyeOutlined />}
          onClick={() => handleViewEvidence(record)}
        >
          查看原文信息
        </Button>
      )
    }
  ];

  // 构建表格数据源 - 每个评审项作为一行
  const tableDataSource = company.rule_scores && company.rule_scores.length > 0 ? 
    company.rule_scores.map(rule => ({
      key: rule.rule_name,
      ...rule
    })) : [];

  return (
    <div>
      <Button 
        icon={<ArrowLeftOutlined />} 
        onClick={() => window.history.back()}
        style={{ marginBottom: 16 }}
      >
        返回上一页
      </Button>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={24} align="middle">
          <Col flex="auto">
            <Title level={4} style={{ margin: '0 0 8px 0' }}>
              <TeamOutlined /> {company.company_name}
            </Title>
            <Space>
              <Tag>{company.status}</Tag>
              <Text type="secondary">公司 ID: #{company.id}</Text>
            </Space>
          </Col>
          <Col>
            <Statistic 
              title="总分" 
              value={company.total_score || 0} 
              precision={1}
              suffix="分"
              valueStyle={{ 
                fontSize: 28,
                color: company.total_score && company.total_score >= 80 ? colors.success : 
                       company.total_score && company.total_score >= 60 ? colors.warning : colors.error
              }}
            />
          </Col>
        </Row>
      </Card>

      <Card title="详细评分">
        {company.rule_scores && company.rule_scores.length > 0 ? (
          <Table
            columns={tableColumns}
            dataSource={tableDataSource}
            pagination={false}
            scroll={{ x: 'max-content' }}
          />
        ) : (
          <Alert
            message="暂无评审结果"
            description="该公司尚未完成 AI 评审，请先启动评审任务"
            type="info"
            showIcon
          />
        )}
      </Card>
      
      {/* 文档查看模态框 */}
      <Modal
        title={`文档查看 - ${selectedDocument?.file} (第${selectedDocument?.page}页)`}
        open={documentModalVisible}
        onCancel={() => setDocumentModalVisible(false)}
        width={900}
        footer={[
          <Button key="close" type="primary" onClick={() => setDocumentModalVisible(false)}>
            关闭
          </Button>
        ]}
      >
        <div style={{ padding: 20 }}>
          <Descriptions bordered column={1} style={{ marginBottom: 20 }}>
            <Descriptions.Item label="文件名">{selectedDocument?.file}</Descriptions.Item>
            <Descriptions.Item label="页码">第{selectedDocument?.page}页</Descriptions.Item>
          </Descriptions>
          
          <Card size="small" style={{ marginTop: 16 }}>
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>
              {selectedDocument?.content || '暂无内容'}
            </div>
          </Card>
        </div>
      </Modal>
    </div>
  );
};

export default CompanyDetail;
