# 招标评审平台

基于 AI 的多角色招标评审平台，支持任务分发、团队协作、AI 评审等功能。

**版本**: 2.0.0 (角色协作版)  
**技术栈**: FastAPI + React + SQLAlchemy + SQLite

---

## 📁 项目结构

```
bid/
├── src/                          # 后端源代码
│   ├── api/                      # API 路由层
│   │   ├── auth.py              # 认证接口 (登录/登出/token 验证)
│   │   ├── users.py             # 用户管理 (CRUD)
│   │   ├── teams.py             # 团队管理 (CRUD/成员管理)
│   │   ├── projects.py          # 项目管理 (创建/分包/分派/重置)
│   │   ├── rule_templates.py    # 规则模板管理
│   │   ├── project_types.py     # 项目类型管理
│   │   ├── criteria.py          # 评审项管理
│   │   ├── assignments.py       # 任务分配 (批量分配)
│   │   ├── assignment_center.py # 任务分配中心辅助 API
│   │   ├── evaluation_execute.py# 评审执行 (提交/获取结果)
│   │   ├── subtasks.py          # 子任务管理 (兼容)
│   │   ├── evaluation.py        # 评审执行 (旧版兼容)
│   │   ├── tasks.py             # 任务管理 (旧版兼容)
│   │   ├── rules.py             # 规则管理 (旧版兼容)
│   │   ├── results.py           # 结果查询 (旧版兼容)
│   │   ├── companies.py         # 公司管理 (旧版兼容)
│   │   ├── logs.py              # 日志管理
│   │   └── middleware.py        # 认证中间件
│   ├── services/                 # 业务逻辑层
│   │   ├── auth_service.py      # 认证服务 (登录/注册/token 管理)
│   │   ├── task_dispatch_service.py # 任务分派服务
│   │   ├── rule_template_service.py # 规则模板服务
│   │   ├── evaluation_service.py    # 评审服务
│   │   ├── ocr_service.py       # OCR 服务 (文档解析)
│   │   ├── file_processor.py    # 文件处理 (ZIP 解压/文件收集)
│   │   ├── ai_evaluator.py      # AI 评审器
│   │   ├── llm_service.py       # LLM 服务
│   │   ├── summary_service.py   # 汇总服务
│   │   └── task_executor.py     # 任务执行器
│   ├── models/                   # 数据模型层
│   │   ├── database.py          # 数据库配置和连接
│   │   ├── extended_models.py   # 扩展模型 (用户/团队/项目/分配等)
│   │   ├── evaluation_tasks.py  # 原任务模型
│   │   ├── evaluation_rules.py  # 原规则模型
│   │   ├── company_bids.py      # 原公司模型
│   │   └── evaluation_results.py# 原结果模型
│   ├── data/                     # 数据目录
│   │   ├── uploads/             # 上传的 ZIP 文件
│   │   ├── tasks/               # 任务数据 (公司标书/解析文件)
│   │   └── rules/               # 规则文件
│   ├── logs/                     # 日志目录
│   ├── migrations/               # 数据库迁移脚本
│   ├── temp/                     # 临时文件
│   ├── config.py                # 配置文件
│   └── main.py                  # 应用入口
├── frontend/                     # 前端源代码 (React + Ant Design)
│   ├── src/
│   │   ├── pages/               # 页面组件
│   │   │   ├── Login.tsx        # 登录页
│   │   │   ├── Dashboard.tsx    # 仪表盘
│   │   │   ├── ProjectList.tsx  # 项目列表
│   │   │   ├── ProjectCreate.tsx# 项目创建
│   │   │   ├── ProjectDetail.tsx# 项目详情
│   │   │   ├── PackageDispatch.tsx # 包分派
│   │   │   ├── ProjectCriteriaManagement.tsx # 项目评审项管理
│   │   │   ├── ProjectRuleConfig.tsx # 项目规则配置
│   │   │   ├── AssignmentCenter.tsx # 任务分配中心
│   │   │   ├── TaskAssignment.tsx # 任务分配
│   │   │   ├── TaskOverview.tsx # 任务总览
│   │   │   ├── TeamTaskRefine.tsx # 团队任务细化
│   │   │   ├── MyTasks.tsx      # 我的任务
│   │   │   ├── EvaluationForm.tsx # 评审表单
│   │   │   ├── TeamManagement.tsx # 团队管理
│   │   │   ├── UserManagement.tsx # 用户管理
│   │   │   ├── ProjectTypeList.tsx # 项目类型列表
│   │   │   ├── RuleTemplateList.tsx # 规则模板列表
│   │   │   ├── ResultSummary.tsx # 结果汇总
│   │   │   └── ... (旧版兼容页面)
│   │   ├── components/          # 通用组件
│   │   │   ├── AppLayout.tsx    # 应用布局
│   │   │   ├── AppSidebar.tsx   # 侧边栏
│   │   │   ├── RoleGuard.tsx    # 角色守卫
│   │   │   └── ... (其他组件)
│   │   ├── services/            # 服务层
│   │   │   └── api.ts           # API 客户端
│   │   ├── styles/              # 样式文件
│   │   └── main.tsx             # 应用入口 (路由配置)
│   └── logs/                     # 前端日志
├── bid_evaluation.db             # 数据库文件 (位于 src/ 目录)
├── requirements.txt              # Python 依赖
├── .env                          # 环境变量
├── start.sh                      # 启动脚本
└── README.md                     # 本文档
```

---

## 🗄️ 数据库设计

### 表关系图

```
┌─────────────┐       ┌──────────────┐       ┌─────────────┐
│    User     │───────│ TeamMember   │───────│    Team     │
│  (用户表)   │       │ (团队成员表)  │       │  (团队表)   │
└─────────────┘       └──────────────┘       └─────────────┘
      │
      │ created_by
      ▼
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   Project   │───────│   Package   │───────│SubTask/     │
│   (项目表)  │       │   (包表)    │       │Assignment   │
└─────────────┘       └─────────────┘       │(子任务/分配)│
      │                                     └─────────────┘
      │                                              │
      │                                              │ evaluator_id
      │                                              ▼
      │                                     ┌─────────────────┐
      │                                     │EvaluationResult │
      │                                     │  (评审结果表)   │
      │                                     └─────────────────┘
      │
      ▼
┌─────────────────┐
│CompanyBidNew    │
│ (公司投标表)    │
└─────────────────┘
```

### 表结构详情

#### 1. users (用户表)
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | Integer | PK, AI | 用户 ID |
| username | String(50) | UNIQUE, NOT NULL | 用户名 |
| password_hash | String(255) | NOT NULL | 密码哈希 |
| real_name | String(50) | NOT NULL | 真实姓名 |
| role | String(20) | NOT NULL | 角色 (admin/team_leader/team_manager/technical_evaluator/business_evaluator) |
| team_id | Integer | FK → teams.id | 所属团队 (已废弃，使用 TeamMember 表) |
| phone | String(20) | | 手机号 |
| email | String(100) | | 邮箱 |
| is_active | Boolean | | 是否激活 |
| created_at | DateTime | | 创建时间 |
| updated_at | DateTime | | 更新时间 |

#### 2. teams (团队表)
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | Integer | PK, AI | 团队 ID |
| team_name | String(100) | NOT NULL | 团队名称 |
| description | Text | | 描述 |
| created_at | DateTime | | 创建时间 |

#### 3. team_members (团队成员关联表)
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | Integer | PK, AI | ID |
| team_id | Integer | FK → teams.id, NOT NULL | 团队 ID |
| user_id | Integer | FK → users.id, NOT NULL | 用户 ID |
| role | String(20) | NOT NULL | 在团队中的角色 |
| is_active | Boolean | | 是否激活 |
| joined_at | DateTime | | 加入时间 |

#### 4. projects (项目表)
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | Integer | PK | 项目 ID |
| project_name | String(200) | NOT NULL | 项目名称 |
| project_type | String(20) | NOT NULL | 项目类型 (service/material/engineering) |
| created_by | Integer | FK → users.id, NOT NULL | 创建人 |
| status | String(20) | | 状态 (draft/dispatching/assigned/processing/completed) |
| total_packages | Integer | | 总包数 |
| zip_file_path | String(500) | | ZIP 文件路径 |
| ocr_status | String(20) | | OCR 状态 (idle/processing/completed/failed) |
| total_score_avg | Float | | 平均总分 |
| processed_rules | Integer | | 已处理规则数 |
| total_rules | Integer | | 总规则数 |
| assigned_team_id | Integer | FK → teams.id | 分派团队 |
| assigned_by | Integer | FK → users.id | 分派人 |
| assigned_at | DateTime | | 分派时间 |
| created_at | DateTime | | 创建时间 |
| updated_at | DateTime | | 更新时间 |
| completed_at | DateTime | | 完成时间 |

#### 5. packages (包表)
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | Integer | PK, AI | 包 ID |
| project_id | Integer | FK → projects.id, NOT NULL | 项目 ID |
| package_name | String(100) | NOT NULL | 包名称 |
| package_order | Integer | | 包序号 |
| status | String(20) | | 状态 (pending/assigned/in_progress/completed) |
| assigned_team_id | Integer | FK → teams.id | 分派团队 |
| assigned_by | Integer | FK → users.id | 分派人 |
| assigned_at | DateTime | | 分派时间 |
| dispatch_mode | String(20) | | 分发模式 (by_package/by_criteria) |
| created_at | DateTime | | 创建时间 |

#### 6. evaluation_criteria (评审项表)
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | Integer | PK, AI | 评审项 ID |
| package_id | Integer | FK → packages.id, NOT NULL | 包 ID |
| criteria_name | String(100) | NOT NULL | 评审项名称 |
| criteria_type | String(20) | NOT NULL | 类型 (technical/business) |
| max_score | Float | | 最高分 |
| scoring_criteria | Text | | 评分标准 |
| config_json | Text | | 额外配置 (JSON) |
| is_active | Boolean | | 是否激活 |
| created_at | DateTime | | 创建时间 |
| updated_at | DateTime | | 更新时间 |

#### 7. assignments (任务分配表)
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | Integer | PK, AI | 分配 ID |
| package_id | Integer | FK → packages.id, NOT NULL | 包 ID |
| company_id | Integer | FK → company_bids_new.id | 公司 ID |
| evaluator_id | Integer | FK → users.id, NOT NULL | 评审员 ID |
| team_leader_id | Integer | FK → users.id | 团队组长 ID |
| assignment_type | String(20) | NOT NULL | 分配类型 (by_package/by_criteria/by_company) |
| assigned_criteria_ids | Text | | 分配的评审项 IDs (JSON) |
| status | String(20) | | 状态 (pending/in_progress/completed) |
| progress_percent | Integer | | 进度百分比 |
| dispatch_mode | String(20) | | 分发模式 |
| created_at | DateTime | | 创建时间 |
| started_at | DateTime | | 开始时间 |
| completed_at | DateTime | | 完成时间 |

#### 8. subtasks (子任务表 - 兼容)
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | Integer | PK, AI | 子任务 ID |
| package_id | Integer | FK → packages.id, NOT NULL | 包 ID (实际存储 project_id) |
| evaluator_id | Integer | FK → users.id | 评审员 ID |
| task_type | String(20) | NOT NULL | 任务类型 (technical/business) |
| mode | String(20) | NOT NULL | 模式 (by_document/by_criteria) |
| assigned_documents | Text | | 分配的文档 (JSON) |
| assigned_criteria | Text | | 分配的评审项 (JSON) |
| status | String(20) | | 状态 (pending/in_progress/completed) |
| progress_percent | Integer | | 进度百分比 |
| created_at | DateTime | | 创建时间 |
| started_at | DateTime | | 开始时间 |
| completed_at | DateTime | | 完成时间 |

#### 9. company_bids_new (公司投标表)
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | Integer | PK | 公司 ID |
| task_id | Integer | | 任务 ID (兼容) |
| project_id | Integer | NOT NULL, INDEX | 项目 ID |
| package_id | Integer | | 包 ID (已废弃) |
| company_name | String(100) | NOT NULL | 公司名称 |
| bid_folder_path | String(500) | | 标书文件夹路径 |
| total_score | Float | | 总分 |
| ranking | Integer | | 排名 |
| status | String(20) | | 状态 (pending/processing/completed/failed) |
| processed_rules | Integer | | 已处理规则数 |
| total_rules | Integer | | 总规则数 |
| ocr_status | String(20) | | OCR 状态 |
| created_at | DateTime | | 创建时间 |

#### 10. evaluation_results_new (评审结果表)
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | Integer | PK | 结果 ID |
| subtask_id | Integer | | 子任务 ID |
| assignment_id | Integer | | 分配 ID |
| company_bid_id | Integer | | 公司投标 ID |
| package_id | Integer | | 包 ID |
| company_id | Integer | | 公司 ID |
| rule_id | Integer | | 规则 ID |
| criteria_id | Integer | | 评审项 ID |
| criteria_type | String(20) | | 评审项类型 |
| rule_name | String(100) | | 规则名称 |
| score | Float | | 得分 |
| max_score | Float | | 最高分 |
| reason | Text | | 评分理由 |
| evidence | Text | | 依据 |
| evidence_details | Text | | 依据详情 (JSON) |
| llm_response | Text | | LLM 响应 |
| evaluator_id | Integer | | 评审员 ID |
| created_at | DateTime | | 创建时间 |
| updated_at | DateTime | | 更新时间 |

#### 11. rule_templates (规则模板表)
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | Integer | PK, AI | 模板 ID |
| template_name | String(100) | NOT NULL | 模板名称 |
| project_type | String(20) | NOT NULL | 项目类型 |
| config_json | Text | | 配置 (JSON) |
| description | Text | | 描述 |
| is_active | Boolean | | 是否激活 |
| created_by | Integer | FK → users.id | 创建人 |
| created_at | DateTime | | 创建时间 |
| updated_at | DateTime | | 更新时间 |

#### 12. evaluation_rules_new (扩展评审规则表)
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | Integer | PK | 规则 ID |
| rule_name | String(100) | NOT NULL | 规则名称 |
| rule_content | Text | | 规则内容 |
| config_json | Text | | 配置 (JSON) |
| template_id | Integer | | 模板 ID |
| project_type | String(20) | | 项目类型 |
| is_active | Boolean | | 是否激活 |
| created_at | DateTime | | 创建时间 |

#### 13. user_sessions_new (用户会话表)
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | Integer | PK, AI | 会话 ID |
| user_id | Integer | FK → users.id, NOT NULL | 用户 ID |
| token | String(255) | UNIQUE, NOT NULL, INDEX | Token |
| expires_at | DateTime | NOT NULL | 过期时间 |
| created_at | DateTime | | 创建时间 |

#### 14. project_types (项目类型表)
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | Integer | PK, AI | 类型 ID |
| type_code | String(50) | UNIQUE, NOT NULL | 类型代码 |
| type_name | String(100) | NOT NULL | 类型名称 |
| description | Text | | 描述 |
| review_focus | Text | | 评审重点 |
| status | String(20) | | 状态 |
| created_at | DateTime | | 创建时间 |
| updated_at | DateTime | | 更新时间 |

---

## 👥 角色与权限

### 角色定义

| 角色 | 代码 | 说明 |
|------|------|------|
| 系统管理员 | admin | 最高权限，可管理所有功能 |
| 评标组长 | team_leader | 创建项目、分派包、查看全局 |
| 团队负责人 | team_manager | 细化任务、管理团队成员 |
| 技术专家 | technical_evaluator | 执行技术评审 |
| 商务专家 | business_evaluator | 执行商务评审 |

### 权限分配

| 功能 | admin | team_leader | team_manager | technical_evaluator | business_evaluator |
|------|-------|-------------|--------------|---------------------|-------------------|
| 创建项目 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 项目管理 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 分包操作 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 分派包给团队 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 配置评审规则 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 细化任务 | ✅ | ❌ | ✅ | ❌ | ❌ |
| 查看我的任务 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 执行评审 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 查看评审结果 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 团队管理 | ✅ | ✅ | ✅ | ❌ | ❌ |
| 用户管理 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 规则模板管理 | ✅ | ✅ | ❌ | ❌ | ❌ |

### 权限装饰器

后端使用装饰器进行权限控制:

```python
# 认证装饰器
@require_auth(required_roles=["admin", "team_leader"])  # 需要指定角色
@require_admin                                          # 仅管理员
@require_team_leader                                    # 仅评标组长
@require_team_manager                                   # 仅团队负责人
@require_evaluator                                      # 评审员及以上
```

---

## 🌐 前端页面

### 路由与权限

| 路径 | 页面 | 允许角色 |
|------|------|----------|
| `/login` | 登录页 | 公开 |
| `/dashboard` | 仪表盘 | 所有角色 |
| `/projects` | 项目列表 | admin, team_leader |
| `/projects/create` | 创建项目 | admin, team_leader |
| `/projects/:id` | 项目详情 | 所有角色 |
| `/projects/:id/dispatch` | 包分派 | admin, team_leader |
| `/projects/:id/criteria` | 评审项管理 | admin, team_leader |
| `/projects/:id/rules` | 规则配置 | 所有角色 |
| `/projects/:id/assign-center` | 任务分配中心 | admin, team_leader |
| `/projects/:id/overview` | 任务总览 | 所有角色 |
| `/projects/:id/summary` | 结果汇总 | admin, team_leader |
| `/teams/tasks` | 团队任务细化 | admin, team_leader, team_manager |
| `/my-tasks` | 我的任务 | 所有角色 |
| `/my-tasks/:id` | 评审表单 | 所有角色 |
| `/teams` | 团队管理 | admin, team_leader, team_manager |
| `/users` | 用户管理 | admin, team_leader |
| `/project-types` | 项目类型 | admin, team_leader |
| `/rule-templates` | 规则模板 | admin, team_leader |

---

## 🔌 主要 API 接口

### 认证接口 (`/api/auth`)
| 方法 | 路径 | 说明 | 所需角色 |
|------|------|------|----------|
| POST | `/login` | 登录 | 公开 |
| POST | `/logout` | 登出 | 已登录 |
| GET | `/me` | 获取当前用户 | 已登录 |

### 用户管理 (`/api/users`)
| 方法 | 路径 | 说明 | 所需角色 |
|------|------|------|----------|
| GET | `/` | 获取用户列表 | admin |
| POST | `/` | 创建用户 | admin |
| GET | `/:id` | 获取用户详情 | admin, team_leader |
| PUT | `/:id` | 更新用户 | admin |
| DELETE | `/:id` | 删除用户 | admin |

### 团队管理 (`/api/teams`)
| 方法 | 路径 | 说明 | 所需角色 |
|------|------|------|----------|
| GET | `/` | 获取团队列表 | 已登录 |
| POST | `/` | 创建团队 | admin, team_leader |
| GET | `/:id` | 获取团队详情 | 已登录 |
| PUT | `/:id` | 更新团队 | admin, team_leader |
| DELETE | `/:id` | 删除团队 | admin |
| POST | `/:id/members` | 添加成员 | admin, team_leader |
| DELETE | `/:id/members/:userId` | 移除成员 | admin, team_leader |

### 项目管理 (`/api/projects`)
| 方法 | 路径 | 说明 | 所需角色 |
|------|------|------|----------|
| GET | `/` | 获取项目列表 | 已登录 |
| POST | `/` | 创建项目 | admin, team_leader |
| GET | `/:id` | 获取项目详情 | 已登录 |
| POST | `/:id/upload-bid` | 上传标书 | admin, team_leader |
| POST | `/:id/split-packages` | 分包 | admin, team_leader |
| POST | `/:id/assign-to-team` | 分派给团队 | admin, team_leader |
| POST | `/:id/refine` | 细化任务 | team_manager |
| POST | `/:id/reset` | 重置项目 | admin, team_leader |
| DELETE | `/:id` | 删除项目 | admin, team_leader |

### 任务分配 (`/api/assignments`)
| 方法 | 路径 | 说明 | 所需角色 |
|------|------|------|----------|
| POST | `/batch-create` | 批量创建分配 | admin, team_leader |
| GET | `/package/:id` | 获取包的分配 | 已登录 |

### 评审执行 (`/api/evaluation_execute`)
| 方法 | 路径 | 说明 | 所需角色 |
|------|------|------|----------|
| POST | `/submit` | 提交评审结果 | 已登录 |
| GET | `/company/:id/results` | 获取公司评审结果 | 已登录 |

### 我的任务 (`/api/evaluation/my-tasks`)
| 方法 | 路径 | 说明 | 所需角色 |
|------|------|------|----------|
| GET | `/api/evaluation/my-tasks` | 获取我的任务 | 已登录 |

---

## 🚀 快速开始

### 环境要求
- Python 3.11+
- Node.js 18+
- SQLite (内置)

### 后端启动

```bash
cd /home/xcweili/.openclaw/workspace/bid

# 创建虚拟环境
python -m venv .venv
source .venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 启动服务
cd src
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 前端启动

```bash
cd /home/xcweili/.openclaw/workspace/bid/frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 默认账户

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | 系统管理员 |
| leader | leader123 | 评标组长 |
| group1 | group123 | 团队小组长 |
| tech1 | tech123 | 技术专家 |
| biz1 | biz123 | 商务专家 |

---

## 📝 工作流程

### 1. 项目创建流程
```
评标组长创建项目 
    → 上传标书 ZIP 
    → 系统解析文档识别公司 
    → 配置评审规则 
    → 分包 (可选)
    → 分派给团队
```

### 2. 任务分派流程
```
评标组长分派包给团队
    → 团队负责人接收
    → 细化任务 (分配给具体评审员)
    → 评审员执行评审
    → 提交评审结果
```

### 3. 评审执行流程
```
评审员登录
    → 查看我的任务
    → 进入评审表单
    → AI 辅助评分
    → 提交结果
    → 查看汇总
```

---

## 📊 数据流转

```
用户上传 ZIP
    ↓
FileProcessor 解压识别公司
    ↓
CompanyBidNew 记录公司信息
    ↓
OCRService 解析文档为 Markdown
    ↓
评审员分配任务 (SubTask/Assignment)
    ↓
评审员提交结果 (EvaluationResultNew)
    ↓
SummaryService 汇总统计
```

---

## 🔧 配置说明

### 环境变量 (.env)
```env
# 数据库
DATABASE_URL=sqlite:///./src/bid_evaluation.db

# LLM 服务
LLM_BASE_URL=http://10.255.216.2/v1/
LLM_MODEL=qwen3.5-122b

# OCR 服务
OCR_BASE_URL=http://10.255.216.2/v1/
OCR_MODEL=ocr

# 前端地址
FRONTEND_URL=http://localhost:5173
```

---

## 📌 注意事项

1. **数据库位置**: 数据库文件位于 `src/bid_evaluation.db`
2. **文件存储**: 标书和解析文件存储在 `src/data/` 目录下
3. **日志文件**: 后端日志在 `src/logs/bid.log`
4. **端口配置**: 后端默认 8000，前端默认 5173
5. **CORS**: 开发环境允许所有来源，生产环境需配置

---

## 📚 技术栈

### 后端
- **FastAPI**: Web 框架
- **SQLAlchemy**: ORM
- **SQLite**: 数据库
- **Loguru**: 日志
- **Pydantic**: 数据验证

### 前端
- **React 18**: UI 框架
- **TypeScript**: 类型安全
- **Ant Design**: UI 组件库
- **React Router**: 路由
- **Axios**: HTTP 客户端

---

## 👨‍💻 开发指南

### 添加新的 API 接口
1. 在 `src/api/` 下创建或修改路由文件
2. 在 `src/main.py` 中注册路由
3. 添加相应的权限装饰器

### 添加新的数据库表
1. 在 `src/models/extended_models.py` 中定义模型
2. 继承 `Base` 类
3. 重启应用自动创建表

### 添加新的前端页面
1. 在 `frontend/src/pages/` 创建页面组件
2. 在 `frontend/src/main.tsx` 中添加路由
3. 配置 `RoleGuard` 权限

---

## 📄 许可证

内部使用，禁止外传
