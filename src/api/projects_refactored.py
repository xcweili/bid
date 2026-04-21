# 重构计划 - 移除虚拟包概念

## 核心变更

1. **不再创建虚拟包** - 直接使用 project_id
2. **SubTask 表** - package_id 字段改为 project_id（或保持兼容，但实际存储 project_id）
3. **所有查询** - 统一使用 project_id 查询

## 需要修改的文件

### 1. models/extended_models.py
- SubTask.package_id → 改为 project_id
- Assignment.package_id → 改为 project_id
- EvaluationCriteria.package_id → 改为 project_id
- CompanyBidNew.package_id → 改为 project_id（或删除，只用 project_id）
- EvaluationResultNew.package_id → 改为 project_id

### 2. api/projects.py
- 移除虚拟包创建逻辑
- 所有 Package 查询改为 Project 查询

### 3. api/evaluation.py  
- 所有 /package/{package_id} 路由改为 /project/{project_id}
- 所有 package_id 查询改为 project_id

### 4. api/assignments.py
- 同上

### 5. api/criteria.py
- 同上

## 数据库迁移

```sql
-- 删除虚拟包
DELETE FROM packages WHERE package_name = '__project_virtual__';

-- 更新 SubTask 的 package_id 为对应的 project_id
UPDATE subtasks 
SET package_id = (SELECT project_id FROM packages WHERE packages.id = subtasks.package_id)
WHERE package_id IN (SELECT id FROM packages);

-- 更新其他表的 package_id
UPDATE assignments SET package_id = (SELECT project_id FROM packages WHERE packages.id = assignments.package_id) WHERE package_id IN (SELECT id FROM packages);
UPDATE evaluation_criteria SET package_id = (SELECT project_id FROM packages WHERE packages.id = evaluation_criteria.package_id) WHERE package_id IN (SELECT id FROM packages);
UPDATE company_bids_new SET package_id = (SELECT project_id FROM packages WHERE packages.id = company_bids_new.package_id) WHERE package_id IN (SELECT id FROM packages);
UPDATE evaluation_results_new SET package_id = (SELECT project_id FROM packages WHERE packages.id = evaluation_results_new.package_id) WHERE package_id IN (SELECT id FROM packages);

-- 删除包表（如果不再使用）
-- DROP TABLE packages;
```

## API 变更

| 旧 API | 新 API |
|-------|-------|
| GET /api/evaluation/my-tasks | 不变（返回项目列表） |
| GET /api/evaluation/package/{id}/companies | GET /api/evaluation/project/{id}/companies |
| GET /api/evaluation/package/{id}/criteria | GET /api/evaluation/project/{id}/criteria |
| GET /api/assignments/package/{id} | GET /api/assignments/project/{id} |
| POST /api/assignments/create | POST /api/assignments/create (参数改为 project_id) |

让我开始实现重构...
