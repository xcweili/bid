import api from './api';

export interface EvaluationItem {
  id: number;
  item_code: string;
  item_name: string;
  item_content?: string;
  material_category?: string;
  is_active: boolean;
  workflow_id?: string;
  api_key?: string;
  base_url?: string;
  created_at?: string;
  updated_at?: string;
  files?: FileInfo[];
}

export interface FileInfo {
  id: number;
  file_name: string;
  file_path: string;
  file_type?: string;
  file_size?: number;
  description?: string;
  created_at?: string;
}

export interface PackageItemConfig {
  id: number;
  package_id: number;
  item_id: number;
  is_required: boolean;
  evaluation_type?: string;
  evaluation_stage?: string;
  rule_category?: string;
  rule_content?: string;
  bound_filenames?: string[];
}

export interface PackageItemWithDetails {
  id: number;
  package_id: number;
  item_id: number;
  is_required: boolean;
  package_item_id?: number;
  item_code: string;
  item_name: string;
  evaluation_type?: string;
  evaluation_stage?: string;
  rule_category?: string;
  rule_content?: string;
  bound_filenames?: string[];
  workflow_id?: string;
  api_key?: string;
  base_url?: string;
  evaluation_item?: EvaluationItem;
}

export interface FileCreateRequest {
  file_name: string;
  file_path: string;
  file_type?: string;
  file_size?: number;
  description?: string;
}

export const evaluationItemService = {
  // 获取所有评审项
  getAllItems: async (): Promise<EvaluationItem[]> => {
    const response = await api.get('/evaluation-items');
    return response.data;
  },

  // 获取单个评审项（包含文件列表）
  getItem: async (itemId: number): Promise<EvaluationItem> => {
    const response = await api.get(`/evaluation-items/${itemId}`);
    return response.data;
  },

  // 创建评审项
  createItem: async (item: Omit<EvaluationItem, 'id' | 'created_at' | 'updated_at' | 'files'>): Promise<EvaluationItem> => {
    const response = await api.post('/evaluation-items', item);
    return response.data;
  },

  // 更新评审项
  updateItem: async (itemId: number, item: Partial<Omit<EvaluationItem, 'id' | 'created_at' | 'updated_at' | 'files'>>): Promise<EvaluationItem> => {
    const response = await api.put(`/evaluation-items/${itemId}`, item);
    return response.data;
  },

  // 删除评审项
  deleteItem: async (itemId: number): Promise<void> => {
    await api.delete(`/evaluation-items/${itemId}`);
  },

  // 获取包已配置的评审项（支持分页和搜索）
  getPackageItems: async (packageId: number, page: number = 1, pageSize: number = 15, keyword: string = ""): Promise<{ items: PackageItemWithDetails[], total: number, page: number, page_size: number }> => {
    const response = await api.get(`/packages/${packageId}/items`, {
      params: { page, page_size: pageSize, keyword }
    });
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

  // 从模板添加评审项到包配置
  addPackageItemFromTemplate: async (packageId: number, itemId: number): Promise<PackageItemWithDetails> => {
    const response = await api.post(`/packages/${packageId}/items/from-template`, { item_id: itemId });
    return response.data;
  },

  // 移除包的评审项配置
  removePackageItem: async (packageId: number, itemId: number): Promise<void> => {
    await api.delete(`/packages/${packageId}/items/${itemId}`);
  },

  // 为评审项添加文件
  addFile: async (itemId: number, file: FileCreateRequest): Promise<EvaluationItem> => {
    const response = await api.post(`/evaluation-items/${itemId}/files`, file);
    return response.data;
  },

  // 从评审项移除文件
  removeFile: async (itemId: number, fileId: number): Promise<EvaluationItem> => {
    const response = await api.delete(`/evaluation-items/${itemId}/files/${fileId}`);
    return response.data;
  },

  // 获取评审项绑定的文件列表
  getFiles: async (itemId: number): Promise<FileInfo[]> => {
    const response = await api.get(`/evaluation-items/${itemId}/files`);
    return response.data;
  }
};
