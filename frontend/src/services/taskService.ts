import api from './api';

export interface TaskCreate {
  task_name: string;
}

export const taskService = {
  // 获取任务列表
  getTasks: async () => {
    const response = await api.get('/tasks/');
    return response.data;
  },

  // 获取任务详情
  getTask: async (taskId: number) => {
    const response = await api.get(`/tasks/${taskId}`);
    return response.data;
  },

  // 创建任务
  createTask: async (data: TaskCreate) => {
    const response = await api.post('/tasks/', data);
    return response.data;
  },

  // 上传标书 ZIP
  uploadBidZip: async (taskId: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/tasks/${taskId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  // 启动任务
  startTask: async (taskId: number) => {
    const response = await api.post(`/tasks/${taskId}/start`);
    return response.data;
  },

  // 获取任务结果
  getTaskResults: async (taskId: number) => {
    const response = await api.get(`/tasks/${taskId}/results`);
    return response.data;
  },

  // 获取公司评审结果
  getCompanyResults: async (companyId: number) => {
    const response = await api.get(`/companies/${companyId}/evaluation`);
    return response.data;
  },

  // 关联规则到任务
  associateRule: async (taskId: number, ruleId: number) => {
    const response = await api.post(`/rules/${ruleId}/associate`, null, {
      params: { task_id: taskId }
    });
    return response.data;
  },

  // 删除任务
  deleteTask: async (taskId: number) => {
    const response = await api.delete(`/tasks/${taskId}`);
    return response.data;
  },

  // 更新任务规则
  updateTaskRules: async (taskId: number, ruleIds: number[]) => {
    const response = await api.put(`/tasks/${taskId}/rules`, ruleIds);
    return response.data;
  },

  // 删除 ZIP 文件
  deleteTaskZip: async (taskId: number) => {
    const response = await api.delete(`/tasks/${taskId}/zip`);
    return response.data;
  },

  // 触发文档 OCR 处理
  ocrDocuments: async (taskId: number) => {
    const response = await api.post(`/tasks/${taskId}/ocr-documents`);
    return response.data;
  },

  // 停止文档 OCR 处理
  stopOcrDocuments: async (taskId: number) => {
    const response = await api.post(`/tasks/${taskId}/stop-ocr`);
    return response.data;
  },

  // 批量解析指定文件
  ocrFiles: async (taskId: number, files: string[]) => {
    const response = await api.post(`/tasks/${taskId}/ocr-files`, files);
    return response.data;
  },

  // 停止评审任务
  stopTask: async (taskId: number) => {
    const response = await api.post(`/tasks/${taskId}/stop`);
    return response.data;
  }
};
