import apiClient from './api';

// 项目 API
export const projectApi = {
  // 获取项目列表
  getProjects: () => apiClient.get('/api/projects'),
  
  // 获取项目详情
  getProject: (id: number) => apiClient.get(`/api/projects/${id}`),
  
  // 创建项目
  createProject: (data: { project_name: string; project_type: string; template_id?: number }) =>
    apiClient.post('/api/projects', data),
  
  // 删除项目
  deleteProject: (id: number) => apiClient.delete(`/api/projects/${id}`),
  
  // 上传标书
  uploadBid: (id: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post(`/api/projects/${id}/upload-bid`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  
  // 分包
  splitPackages: (id: number, data: { package_count: number; package_names?: string[] }) =>
    apiClient.post(`/api/projects/${id}/split-packages`, data),
  
  // 获取分包建议
  getDispatchPlan: (id: number, teamCount: number) =>
    apiClient.get(`/api/projects/${id}/dispatch-plan?team_count=${teamCount}`),
  
  // 分派包给团队
  assignPackage: (packageId: number, data: { team_id: number }) =>
    apiClient.post(`/api/projects/packages/${packageId}/assign-team`, data),
  
  // 批量分派
  batchAssign: (projectId: number, mapping: Record<string, number>) =>
    apiClient.post(`/api/projects/packages/batch-assign?project_id=${projectId}`, mapping),
  
  // 获取项目类型列表
  getProjectTypes: () => apiClient.get('/api/project-types'),
  
  // 创建项目类型
  createProjectType: (data: { type_code: string; type_name: string; description?: string; review_focus?: string; sort_order?: number; status?: string }) =>
    apiClient.post('/api/project-types', data),
  
  // 更新项目类型
  updateProjectType: (id: number, data: { type_code?: string; type_name?: string; description?: string; review_focus?: string; sort_order?: number; status?: string }) =>
    apiClient.put(`/api/project-types/${id}`, data),
  
  // 删除项目类型
  deleteProjectType: (id: number) => apiClient.delete(`/api/project-types/${id}`),
  
  // 检查项目是否可以派发
  canDispatch: (id: number) => apiClient.get(`/api/projects/${id}/can-dispatch`),
  
  // 分派项目到团队
  assignProjectToTeam: (id: number, data: { team_id: number }) =>
    apiClient.post(`/api/projects/${id}/assign-to-team`, data),
  
  // 更新项目团队分派
  updateProjectTeamAssignment: (id: number, data: { team_id: number }) =>
    apiClient.put(`/api/projects/${id}/assign-to-team`, data),
  
  // 获取项目团队分派情况
  getProjectTeamAssignment: (id: number) =>
    apiClient.get(`/api/projects/${id}/team-assignment`)
};

// 团队 API
export const teamApi = {
  // 获取团队列表
  getTeams: () => apiClient.get('/api/teams').then(res => res.data),
  
  // 创建团队
  createTeam: (data: { team_name: string; team_manager_id?: number; description?: string; members?: Array<{ user_id: number; role: string }> }) =>
    apiClient.post('/api/teams', data),
  
  // 更新团队
  updateTeam: (id: number, data: { team_name?: string; team_manager_id?: number; description?: string }) =>
    apiClient.put(`/api/teams/${id}`, data),
  
  // 删除团队
  deleteTeam: (id: number) => apiClient.delete(`/api/teams/${id}`),
  
  // 获取团队详情（包含成员信息）
  getTeamDetail: (id: number) => apiClient.get(`/api/teams/${id}`),
  
  // 获取团队成员（通过 getTeamDetail 获取）
  getTeamMembers: (id: number) => apiClient.get(`/api/teams/${id}`),
  
  // 添加成员
  addMember: (teamId: number, userId: number) =>
    apiClient.post(`/api/teams/${teamId}/members`, { user_id: userId, role: 'technical_evaluator' }),
  
  // 移除成员
  removeMember: (teamId: number, userId: number) =>
    apiClient.delete(`/api/teams/${teamId}/members/${userId}`),
  
  // 获取用户列表
  getUsers: () => apiClient.get('/api/users').then(res => res.data)
};

// 规则模板 API
export const ruleTemplateApi = {
  // 获取模板列表
  getTemplates: (projectType?: string) =>
    apiClient.get('/api/rule-templates', { params: { project_type: projectType } }),
  
  // 获取模板详情
  getTemplate: (id: number) => apiClient.get(`/api/rule-templates/${id}`),
  
  // 创建模板
  createTemplate: (data: { template_name: string; project_type: string; config: any; description?: string }) =>
    apiClient.post('/api/rule-templates', data),
  
  // 更新模板
  updateTemplate: (id: number, data: any) =>
    apiClient.put(`/api/rule-templates/${id}`, data),
  
  // 删除模板
  deleteTemplate: (id: number) => apiClient.delete(`/api/rule-templates/${id}`),
  
  // 应用模板到项目
  applyToProject: (templateId: number, projectId: number) =>
    apiClient.post(`/api/rule-templates/${templateId}/apply-to-project/${projectId}`)
};

// 子任务 API
export const subtaskApi = {
  // 获取我的任务
  getMyTasks: () => apiClient.get('/api/subtasks/my'),
  
  // 获取包的子任务
  getPackageSubtasks: (packageId: number) =>
    apiClient.get(`/api/subtasks/package/${packageId}`),
  
  // 创建子任务
  createSubtask: (data: { package_id: number; evaluator_id?: number; task_type: string; mode: string; assigned_documents?: string[]; assigned_criteria?: string[] }) =>
    apiClient.post('/api/subtasks', data),
  
  // 批量创建子任务
  batchCreateSubtasks: (data: { package_id: number; mode: string; evaluator_list: any[] }) =>
    apiClient.post('/api/subtasks/batch-create', data),
  
  // 更新子任务
  updateSubtask: (id: number, data: { status?: string; progress_percent?: number }) =>
    apiClient.put(`/api/subtasks/${id}`, data),
  
  // 获取子任务详情
  getSubtask: (id: number) => apiClient.get(`/api/subtasks/${id}`)
};

// 评审 API
export const evaluationApi = {
  // 获取我的评审任务
  getMyEvaluationTasks: () => apiClient.get('/api/evaluation/my-tasks'),
  
  // 获取包下的公司
  getPackageCompanies: (packageId: number) =>
    apiClient.get(`/api/evaluation/package/${packageId}/companies`),
  
  // 获取包的评审项
  getPackageCriteria: (packageId: number) =>
    apiClient.get(`/api/evaluation/package/${packageId}/criteria`),
  
  // 提交评审结果
  submitEvaluation: (data: { subtask_id?: number; package_id: number; company_id: number; criteria_id?: number; score: number; max_score?: number; reason: string; evidence?: string; evidence_details?: any }) =>
    apiClient.post('/api/evaluation/submit', data),
  
  // 获取包的评审结果
  getPackageResults: (packageId: number) =>
    apiClient.get(`/api/evaluation/package/${packageId}/results`),
  
  // 获取项目汇总
  getProjectSummary: (projectId: number) =>
    apiClient.get(`/api/evaluation/project/${projectId}/summary`)
};
