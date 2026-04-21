import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Typography,
  message,
  Space,
  Alert,
  Modal,
  Steps,
  Divider,
  Tag,
  Row,
  Col,
  Statistic,
  Select,
  Skeleton
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  TeamOutlined,
  UserOutlined,
  FileTextOutlined,
  SettingOutlined,
  InboxOutlined
} from '@ant-design/icons';
import apiClient from '../services/api.js';
import AppSidebar from '../components/AppSidebar';
import TaskRefinementModal from './TaskRefinementModal';
import './TaskAssignment.css';

const { Title, Text, Paragraph } = Typography;

// Helper class names for text types (AntD v5 doesn't have type prop)
const textSecondary = "text-secondary";
const textMuted = "text-muted";

// Tag color helper classes for gradient tags
const tagBlue = "tag-blue";
const tagGreen = "tag-green";
const tagPurple = "tag-purple";
const tagOrange = "tag-orange";
const tagCyan = "tag-cyan";

const { Option } = Select;

interface ProjectInfo {
  project_name: string;
  total_companies: number;
  total_rules: number;
  assigned_team_id?: number;
  assigned_team_name?: string;
  status: string;
}

interface Team {
  id: number;
  team_name: string;
  member_count: number;
}

const TaskAssignment: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projectId = parseInt(id || '0');

  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | undefined>(undefined);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showRefinementModal, setShowRefinementModal] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const teamListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [projectRes, teamsRes] = await Promise.all([
        apiClient.get(`/api/projects/${projectId}`),
        apiClient.get('/api/teams')
      ]);
      setProject(projectRes.data);
      setTeams(teamsRes.data || []);
      
      // 如果项目已分派，自动选中当前团队
      if (projectRes.data.assigned_team_id) {
        setSelectedTeamId(projectRes.data.assigned_team_id);
      }
    } catch (error) {
      console.error('获取数据失败:', error);
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = () => {
    if (!selectedTeamId) {
      message.warning('请先选择团队');
      return;
    }
    setShowConfirmModal(true);
  };

  const handleConfirmAssign = async () => {
    if (!selectedTeamId) {
      message.warning('请先选择团队');
      return;
    }

    setConfirmLoading(true);
    try {
      await apiClient.post(`/api/projects/${projectId}/assign-to-team`, {
        team_id: selectedTeamId
      });

      message.success('分派成功！团队组长将可以看到该项目');
      setShowConfirmModal(false);
      fetchData();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '分派失败');
    } finally {
      setConfirmLoading(false);
    }
  };

  const selectedTeam = teams.find(t => t.id === selectedTeamId);

  // 加载状态 - 项目信息骨架屏
  const renderProjectSkeleton = () => (
    <div className="project-details">
      <div className="detail-item">
        <div className="detail-label">
          <FileTextOutlined />
          <span>项目名称</span>
        </div>
        <Skeleton active style={{ width: '200px' }} />
      </div>
      <div className="detail-item">
        <div className="detail-label">
          <TeamOutlined />
          <span>公司数量</span>
        </div>
        <Skeleton active style={{ width: '80px' }} />
      </div>
      <div className="detail-item">
        <div className="detail-label">
          <SettingOutlined />
          <span>评审规则</span>
        </div>
        <Skeleton active style={{ width: '80px' }} />
      </div>
      <div className="detail-item">
        <div className="detail-label">
          <TeamOutlined />
          <span>当前分派</span>
        </div>
        <Skeleton active style={{ width: '120px' }} />
      </div>
    </div>
  );

  // 加载状态 - 团队列表骨架屏
  const renderTeamSkeleton = () => (
    <div className="team-list">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="team-item skeleton">
          <div className="team-info">
            <Skeleton active title={{ width: '150px' }} paragraph={{ rows: 1, width: '100px' }} />
          </div>
          <div className="team-radio" />
        </div>
      ))}
    </div>
  );

  // 空状态组件
  const renderEmptyState = () => (
    <div className="empty-state">
      <div className="empty-icon">
        <InboxOutlined />
      </div>
      <Title level={5} className="empty-title">暂无可用团队</Title>
      <Paragraph className="empty-description">
        请先创建团队后再进行分派操作
      </Paragraph>
    </div>
  );

  return (
    <AppSidebar pageTitle="任务分派">
      <div className="task-assignment-container">
        {/* 返回按钮 */}
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(`/projects/${id}`)}
          className="back-button"
          size="large"
        >
          返回项目详情
        </Button>

        <div className="assignment-content">
          {/* 左侧：项目信息 */}
          <Card className="project-info-card">
            <div className="card-header">
              <div className="header-icon-wrapper">
                <FileTextOutlined className="header-icon" />
              </div>
              <div className="header-content">
                <Title level={4} className="card-title">项目信息</Title>
                <Text className="card-subtitle">
                  查看项目基本资料
                </Text>
              </div>
            </div>

            <Divider className="card-divider" />

            {loading ? (
              renderProjectSkeleton()
            ) : project ? (
              <div className="project-details">
                <div className="detail-item">
                  <div className="detail-label">
                    <FileTextOutlined className="detail-icon" />
                    <span>项目名称</span>
                  </div>
                  <div className="detail-value">
                    <Text strong>{project.project_name}</Text>
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-label">
                    <TeamOutlined className="detail-icon" />
                    <span>公司数量</span>
                  </div>
                  <div className="detail-value">
                    <Tag className={`detail-tag ${tagBlue}`}>
                      {project.total_companies ?? 0} 家
                    </Tag>
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-label">
                    <SettingOutlined className="detail-icon" />
                    <span>评审规则</span>
                  </div>
                  <div className="detail-value">
                    {project.total_rules && project.total_rules > 0 ? (
                      <Tag className={`detail-tag ${tagGreen}`}>
                        {project.total_rules} 条
                      </Tag>
                    ) : (
                      <Tag className={`detail-tag ${tagOrange}`}>
                        未配置
                      </Tag>
                    )}
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-label">
                    <TeamOutlined className="detail-icon" />
                    <span>当前分派</span>
                  </div>
                  <div className="detail-value">
                    {project.assigned_team_name ? (
                      <Tag className={`detail-tag ${tagPurple}`}>
                        {project.assigned_team_name}
                      </Tag>
                    ) : (
                      <Text className="unassigned-text">
                        未分派
                      </Text>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <Title level={5} className="empty-title">无项目信息</Title>
              </div>
            )}
          </Card>

          {/* 右侧：团队选择 */}
          <Card className="team-select-card">
            <div className="card-header">
              <div className="header-icon-wrapper">
                <TeamOutlined className="header-icon" />
              </div>
              <div className="header-content">
                <Title level={4} className="card-title">选择团队</Title>
                <Text className="card-subtitle">
                  为项目分派评审团队
                </Text>
              </div>
            </div>

            <Divider className="card-divider" />

            <div className="team-selection">
              <div 
                className="team-list" 
                ref={teamListRef}
              >
                {loading ? (
                  renderTeamSkeleton()
                ) : teams.length > 0 ? (
                  teams.map(team => (
                    <div
                      key={team.id}
                      className={`team-item ${selectedTeamId === team.id ? 'selected' : ''}`}
                      onClick={() => setSelectedTeamId(team.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setSelectedTeamId(team.id);
                        }
                      }}
                      aria-selected={selectedTeamId === team.id}
                    >
                      <div className="team-item-content">
                        <div className="team-info">
                          <div className="team-name">{team.team_name}</div>
                          <div className="team-meta">
                            <Tag className={`member-tag ${tagCyan}`} icon={<UserOutlined />}>
                              {team.member_count} 名成员
                            </Tag>
                          </div>
                        </div>
                      </div>
                      <div className={`team-radio ${selectedTeamId === team.id ? 'checked' : ''}`}>
                        {selectedTeamId === team.id && (
                          <span className="team-radio-inner" />
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  renderEmptyState()
                )}
              </div>

              {selectedTeam && (
                <div className="selected-team-info">
                  <Alert
                    message={
                      <Space>
                        <CheckCircleOutlined className="alert-icon" />
                        <span>已选择：{selectedTeam.team_name}</span>
                      </Space>
                    }
                    description={
                      <Paragraph className="text-secondary" style={{ marginBottom: 0, marginTop: '4px' }}>
                        该团队共有 {selectedTeam.member_count} 名成员，分派后团队成员将可以看到该项目并细化任务。
                      </Paragraph>
                    }
                    type="success"
                    showIcon
                    className="selection-alert"
                  />
                </div>
              )}
            </div>

            <div className="action-buttons">
              <Button
                onClick={() => navigate(`/projects/${id}`)}
                size="large"
                variant="outlined"
              >
                取消
              </Button>
              <Button
                type="primary"
                size="large"
                icon={<TeamOutlined />}
                onClick={handleAssign}
                disabled={!selectedTeamId || teams.length === 0}
                className="assign-button"
              >
                确认分派
              </Button>
              {project?.assigned_team_id && (
                <Button
                  type="dashed"
                  size="large"
                  icon={<FileTextOutlined />}
                  onClick={() => setShowRefinementModal(true)}
                  className="refine-button"
                >
                  细化任务
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* 确认分派弹窗 */}
      <Modal
        title={
          <Space className="modal-title">
            <TeamOutlined className="modal-title-icon" />
            <span>确认团队分派</span>
          </Space>
        }
        open={showConfirmModal}
        onOk={handleConfirmAssign}
        onCancel={() => setShowConfirmModal(false)}
        confirmLoading={confirmLoading}
        okText="确认分派"
        cancelText="取消"
        width={680}
        okButtonProps={{ icon: <CheckCircleOutlined /> }}
        className="assign-modal"
      >
        <div className="confirm-content">
          <Alert
            message={
              <Space>
                <TeamOutlined className="alert-icon" />
                <span>分派说明</span>
              </Space>
            }
            description={
              <Paragraph className="text-secondary" style={{ marginBottom: 0 }}>
                分派后，团队组长将可以看到该项目，并可以选择模式（按文档/按评审项）细化任务到团队成员。
              </Paragraph>
            }
            type="info"
            showIcon
            className="confirm-alert"
          />

          {project && (
            <div className="project-summary">
              <Title level={5} className="summary-title">分派详情</Title>
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12}>
                  <Card size="small" className="summary-card">
                    <Statistic
                      title="项目名称"
                      value={project.project_name}
                      valueStyle={{ fontSize: 14, fontWeight: 'normal', color: 'var(--text-primary)' }}
                    />
                  </Card>
                </Col>
                <Col xs={24} sm={12}>
                  <Card size="small" className="summary-card">
                    <Statistic
                      title="公司数量"
                      value={project.total_companies || 0}
                      suffix="家"
                      valueStyle={{ fontSize: 14, fontWeight: 'normal', color: 'var(--text-primary)' }}
                    />
                  </Card>
                </Col>
                <Col xs={24} sm={12}>
                  <Card size="small" className="summary-card">
                    <Statistic
                      title="评审规则"
                      value="已配置"
                      valueStyle={{ fontSize: 14, fontWeight: 'normal', color: 'var(--text-primary)' }}
                    />
                  </Card>
                </Col>
                <Col xs={24} sm={12}>
                  <Card size="small" className="summary-card summary-card-accent">
                    <Statistic
                      title="分派团队"
                      value={selectedTeam?.team_name || '-'}
                      valueStyle={{ fontSize: 16, fontWeight: 600, color: 'var(--primary-accent)' }}
                    />
                  </Card>
                </Col>
              </Row>
            </div>
          )}
        </div>
      </Modal>

      {/* 细化任务弹窗 */}
      <TaskRefinementModal
        open={showRefinementModal}
        packageId={projectId}
        projectName={project?.project_name || ''}
        onCancel={() => setShowRefinementModal(false)}
        onSuccess={() => {
          setShowRefinementModal(false);
          fetchData();
        }}
      />
    </AppSidebar>
  );
};

export default TaskAssignment;
