import api from './api';

export interface EvaluationResult {
  id: number;
  project_id: number;
  section_id: number;
  package_id: number;
  bidder_id: number;
  item_id: number;
  item_code: string;
  item_name: string;
  company_name: string;
  score?: number;
  score_reason?: string;
  evaluation_status: string;
  evaluation_basis?: string;
  created_at?: string;
  updated_at?: string;
}

export const evaluationResultService = {
  // 获取所有评审结果
  getAllResults: async (packageId?: number, bidderId?: number): Promise<EvaluationResult[]> => {
    const params: Record<string, number> = {};
    if (packageId) params.package_id = packageId;
    if (bidderId) params.bidder_id = bidderId;
    
    const response = await api.get('/evaluation-results', { params });
    return response.data;
  },

  // 获取单个评审结果
  getResult: async (resultId: number): Promise<EvaluationResult> => {
    const response = await api.get(`/evaluation-results/${resultId}`);
    return response.data;
  },

  // 创建评审结果
  createResult: async (result: Omit<EvaluationResult, 'id' | 'item_code' | 'item_name' | 'company_name' | 'created_at' | 'updated_at'>): Promise<EvaluationResult> => {
    const response = await api.post('/evaluation-results', result);
    return response.data;
  },

  // 更新评审结果
  updateResult: async (resultId: number, result: Partial<EvaluationResult>): Promise<EvaluationResult> => {
    const response = await api.put(`/evaluation-results/${resultId}`, result);
    return response.data;
  },

  // 删除评审结果
  deleteResult: async (resultId: number): Promise<void> => {
    await api.delete(`/evaluation-results/${resultId}`);
  },

  // 获取指定包的评审结果
  getPackageResults: async (packageId: number): Promise<EvaluationResult[]> => {
    const response = await api.get(`/packages/${packageId}/results`);
    return response.data;
  }
};