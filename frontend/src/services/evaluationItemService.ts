import api from './api';

export interface EvaluationItem {
  id: number;
  item_code: string;
  item_name: string;
  item_description?: string;
  max_score: number;
  min_score: number;
  weight: number;
  material_category?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PackageItemConfig {
  id: number;
  package_id: number;
  item_id: number;
  is_required: boolean;
  custom_weight?: number;
}

export interface PackageItemWithDetails extends EvaluationItem {
  is_required: boolean;
  custom_weight?: number;
  package_item_id: number;
}

export const evaluationItemService = {
  // 获取所有评审项
  getAllItems: async (): Promise<EvaluationItem[]> => {
    const response = await api.get('/evaluation-items');
    return response.data;
  },

  // 获取单个评审项
  getItem: async (itemId: number): Promise<EvaluationItem> => {
    const response = await api.get(`/evaluation-items/${itemId}`);
    return response.data;
  },

  // 创建评审项
  createItem: async (item: Omit<EvaluationItem, 'id' | 'created_at' | 'updated_at'>): Promise<EvaluationItem> => {
    const response = await api.post('/evaluation-items', item);
    return response.data;
  },

  // 更新评审项
  updateItem: async (itemId: number, item: Partial<EvaluationItem>): Promise<EvaluationItem> => {
    const response = await api.put(`/evaluation-items/${itemId}`, item);
    return response.data;
  },

  // 删除评审项
  deleteItem: async (itemId: number): Promise<void> => {
    await api.delete(`/evaluation-items/${itemId}`);
  },

  // 获取包已配置的评审项
  getPackageItems: async (packageId: number): Promise<PackageItemWithDetails[]> => {
    const response = await api.get(`/packages/${packageId}/items`);
    return response.data;
  },

  // 配置包的评审项
  setPackageItems: async (packageId: number, itemIds: number[]): Promise<void> => {
    await api.post(`/packages/${packageId}/items`, { item_ids: itemIds });
  },

  // 更新包的评审项配置
  updatePackageItem: async (packageId: number, itemId: number, config: Partial<PackageItemConfig>): Promise<PackageItemConfig> => {
    const response = await api.put(`/packages/${packageId}/items/${itemId}`, config);
    return response.data;
  },

  // 移除包的评审项配置
  removePackageItem: async (packageId: number, itemId: number): Promise<void> => {
    await api.delete(`/packages/${packageId}/items/${itemId}`);
  }
};