import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin } from 'antd';

/**
 * 评审规则配置页面 - 已废弃
 * 
 * 说明：此页面已被 rule-templates 系统替代
 * - 所有评审规则模板管理功能已迁移到 /rule-templates
 * - 此页面会自动重定向到模板列表页面
 * 
 * 历史功能（已废弃）：
 * - 上传 MD 文件创建评审规则
 * - 手动创建评审项
 * - 绑定源文件
 * 
 * 新系统优势：
 * - 支持模板化管理，可复用评审项
 * - 区分技术/商务评审项类型
 * - 支持从 Excel/MD 批量导入
 * - 支持模板间导入评审项
 */
const RuleConfig: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // 重定向到模板列表页面
    navigate('/rule-templates', { replace: true });
  }, [navigate]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <Spin size="large" tip="正在跳转到模板配置页面..." />
    </div>
  );
};

export default RuleConfig;
