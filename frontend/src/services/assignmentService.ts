/**
 * 任务分配 API 服务
 */

import apiClient from './api';

// ==================== 类型定义 ====================

export interface PackageDispatchInfo {
  package: {
    id: number;
    package_name: string;
    project_id: number;
    status: string;
    dispatch_mode?: string;
  };
  criteria_list: Array<{
    id: number;
    criteria_name: string;
    criteria_type: string;
    max_score: number;
    weight: number;
  }>;
  company_list: Array<{
    id: number;
    company_name: string;
    status: string;
    assigned_count: number;
  }>;
  team_members: Array<{
    id: number;
    real_name: string;
    role: string;
    avatar?: string;
    current_workload: number;
  }>;
  current_assignments: any[];
  stats: any;
}

export interface BatchAssignCriteriaRequest {
  package_id: number;
  team_assignments: Array<{
    evaluator_id: number;
    criteria_ids: number[];
  }>;
}

export interface BatchAssignCompaniesRequest {
  package_id: number;
  team_assignments: Array<{
    evaluator_id: number;
    company_ids: number[];
  }>;
}

export interface AssignmentStats {
  package_id: number;
  package_name: string;
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  unassigned_resources: number;
  evaluator_workloads: Array<{
    evaluator_id: number;
    evaluator_name: string;
    assigned_count: number;
  }>;
}

// ==================== API 方法 ====================

/**
 * 获取包的分配信息
 */
export const getPackageDispatchInfo = async (packageId: number): Promise<PackageDispatchInfo> => {
  const response = await apiClient.get(`/api/assignments/package/${packageId}/dispatch-info`);
  return response.data;
};

/**
 * 批量分配评审项
 */
export const batchAssignCriteria = async (
  request: BatchAssignCriteriaRequest
): Promise<{
  message: string;
  created_count: number;
  error_count: number;
  assignments: any[];
  errors: any[];
}> => {
  const response = await apiClient.post('/api/assignments/batch-assign-criteria', request);
  return response.data;
};

/**
 * 批量分配公司
 */
export const batchAssignCompanies = async (
  request: BatchAssignCompaniesRequest
): Promise<{
  message: string;
  created_count: number;
  error_count: number;
  assignments: any[];
  errors: any[];
}> => {
  const response = await apiClient.post('/api/assignments/batch-assign-companies', request);
  return response.data;
};

/**
 * 清空包的分配
 */
export const clearPackageAssignments = async (packageId: number): Promise<{
  message: string;
  deleted_count: number;
}> => {
  const response = await apiClient.post(`/api/assignments/clear/${packageId}`);
  return response.data;
};

/**
 * 获取分配统计
 */
export const getAssignmentStats = async (packageId: number): Promise<AssignmentStats> => {
  const response = await apiClient.get(`/api/assignments/stats/package/${packageId}`);
  return response.data;
};

/**
 * 删除分配记录
 */
export const deleteAssignment = async (assignmentId: number): Promise<{
  message: string;
}> => {
  const response = await apiClient.delete(`/api/assignments/${assignmentId}`);
  return response.data;
};

/**
 * 批量撤销分配
 */
export const batchCancelAssignments = async (assignmentIds: number[]): Promise<{
  message: string;
  deleted_count: number;
  error_count: number;
  errors: any[];
}> => {
  const response = await apiClient.post(`/api/assignments/batch-cancel`, assignmentIds);
  return response.data;
};

/**
 * 获取分配历史
 */
export const getAssignmentHistory = async (packageId: number): Promise<{
  package_id: number;
  total_count: number;
  history: any[];
}> => {
  const response = await apiClient.get(`/api/assignments/history/${packageId}`);
  return response.data;
};

/**
 * 智能推荐分配
 */
export const recommendAssignments = async (
  packageId: number,
  mode: 'by_criteria' | 'by_company' = 'by_criteria'
): Promise<{
  package_id: number;
  mode: string;
  total_resources: number;
  recommendations: any[];
  algorithm: string;
}> => {
  const response = await apiClient.post(`/api/assignments/recommend?package_id=${packageId}&mode=${mode}`);
  return response.data;
};

/**
 * 导出分配结果
 */
export const exportAssignments = async (
  packageId: number,
  format: 'excel' | 'csv' = 'excel'
): Promise<Blob> => {
  const response = await apiClient.get(`/api/assignments/${packageId}/export?format=${format}`, {
    responseType: 'blob'
  });
  return response.data;
};

// ==================== 导出 ====================

export default {
  getPackageDispatchInfo,
  batchAssignCriteria,
  batchAssignCompanies,
  clearPackageAssignments,
  getAssignmentStats,
  deleteAssignment,
  batchCancelAssignments,
  getAssignmentHistory,
  recommendAssignments,
  exportAssignments
};
