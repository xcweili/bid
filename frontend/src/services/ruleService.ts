import api from './api';

export interface ReviewItem {
  item_name: string;
  content: string;
  source_files: string[];
  max_score: number;
  is_active: boolean;
}

export interface RuleConfig {
  items: Array<{
    item_name: string;
    source_files: string[];
    max_score: number;
    scoring_criteria: string;
  }>;
}

export const ruleService = {
  // 获取规则列表
  getRules: async () => {
    const response = await api.get('/rules/');
    return response.data;
  },

  // 获取规则详情
  getRule: async (ruleId: number) => {
    const response = await api.get(`/rules/${ruleId}`);
    return response.data;
  },

  // 上传规则
  uploadRule: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/rules/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  // 创建评审项
  createReviewItem: async (item: ReviewItem) => {
    const response = await api.post('/rules/item/', item);
    return response.data;
  },

  // 更新规则配置
  updateRuleConfig: async (ruleId: number, config: RuleConfig) => {
    const response = await api.put(`/rules/${ruleId}/config`, config);
    return response.data;
  },

  // 绑定文件
  bindFiles: async (ruleId: number, source_files: string[]) => {
    const response = await api.post(`/rules/${ruleId}/bind-files`, { source_files });
    return response.data;
  },

  // 删除规则
  deleteRule: async (ruleId: number) => {
    const response = await api.delete(`/rules/${ruleId}`);
    return response.data;
  }
};
