# 招标评审平台

## 项目简介

招标评审平台是一个基于AI的智能招标评审系统，旨在提高招标评审的效率和准确性。系统支持项目/标段/包的分层管理、投标人文件上传、基于规则的AI评审，并生成详细的评审报告。

## 目录结构

```
bid/
├── .venv/             # 虚拟环境
├── frontend/          # 前端代码
│   ├── dist/          # 构建输出
│   ├── src/           # 源代码
│   │   ├── components/ # 组件
│   │   ├── pages/     # 页面
│   │   ├── services/  # 服务
│   │   └── types/     # 类型定义
│   ├── package.json   # 前端依赖
│   └── vite.config.ts # Vite配置
├── src/               # 后端代码
│   ├── api/           # API路由
│   ├── data/          # 数据存储
│   │   ├── tasks/     # 任务数据
│   │   ├── uploads/   # 上传文件
│   │   └── package_files/ # 包文件
│   ├── logs/          # 日志文件
│   ├── models/        # 数据库模型
│   ├── services/      # 服务层
│   ├── main.py        # 应用入口
│   └── config.py      # 配置文件
├── scripts/           # 脚本文件
├── .env               # 环境变量
└── README.md          # 项目文档
```

## 技术栈

### 后端
- **Python 3.11+**
- **FastAPI**: 高性能Web框架
- **SQLAlchemy**: ORM数据库工具
- **SQLite**: 轻量级数据库
- **Loguru**: 日志管理
- **PyPDF2**: PDF文件处理
- **python-docx**: Word文件处理

### 前端
- **React 18+**
- **TypeScript**
- **Ant Design**: UI组件库
- **React Router**: 路由管理
- **Vite**: 构建工具

### AI集成
- **Dify**: AI工作流引擎，支持文件上传和智能评审

## 环境配置与启动

### 1. Python虚拟环境配置

#### 创建虚拟环境
```bash
# 使用 venv 创建虚拟环境
python -m venv .venv

# 激活虚拟环境（Windows PowerShell）
.\.venv\Scripts\Activate.ps1

# 激活虚拟环境（Windows Command Prompt）
.\.venv\Scripts\activate.bat

# 激活虚拟环境（Linux/macOS）
source .venv/bin/activate
```

#### 安装依赖
```bash
# 安装所有依赖包
pip install -r requirements.txt

# 或使用国内镜像加速（推荐）
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

#### 依赖包说明

| 包名 | 版本 | 用途 |
|------|------|------|
| fastapi | 0.109.0 | Web框架 |
| uvicorn | 0.27.0 | ASGI服务器 |
| sqlalchemy | 2.0.25 | ORM数据库 |
| pydantic | 2.5.3 | 数据验证 |
| openai | 1.12.0 | OpenAI API |
| loguru | 0.7.2 | 日志管理 |
| pypdf2 | 3.0.1 | PDF处理 |
| pymupdf | 1.23.26 | PDF解析 |
| python-docx | 1.1.0 | Word处理 |
| httpx | 0.26.0 | HTTP客户端 |
| pytest | 7.4.4 | 测试框架 |

### 2. 后端服务启动

#### 开发模式（推荐）
```bash
# 确保已激活虚拟环境
uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 生产模式
```bash
uvicorn src.main:app --host 0.0.0.0 --port 8000
```

#### 启动参数说明
| 参数 | 说明 |
|------|------|
| `--host 0.0.0.0` | 允许局域网访问 |
| `--port 8000` | 服务端口 |
| `--reload` | 代码热重载（开发模式） |

### 3. 前端服务启动

#### 安装依赖（首次运行）
```bash
cd frontend
npm install
```

#### 开发模式
```bash
cd frontend
npm run dev
```

#### 生产构建
```bash
cd frontend
npm run build
```

### 4. 服务访问

| 服务 | 地址 |
|------|------|
| 前端页面 | http://localhost:3000 |
| 后端API | http://localhost:8000 |
| API文档 | http://localhost:8000/docs |
| 健康检查 | http://localhost:8000/health |

### 5. 启动顺序建议
1. 启动后端服务（确保后端就绪）
2. 启动前端服务
3. 访问前端页面进行操作

## 数据库表结构

### 表关系图

```
projects (项目)
    │
    └── sections (标段)
            │
            └── packages (包)
                    │
                    ├── bidders (投标人)
                    │       │
                    │       └── bidder_files (投标人文件)
                    │
                    ├── package_items (包-评审项关联)
                    │       │
                    │       └── evaluation_items (评审项)
                    │               │
                    │               └── files (绑定文件)
                    │
                    └── evaluation_results (评审结果)
```

### 表结构详情

| 表名 | 说明 | 核心字段 |
|------|------|----------|
| `projects` | 项目表 | id, project_code, project_name, status |
| `sections` | 标段表 | id, project_id, section_code, section_name |
| `packages` | 包表 | id, section_id, package_no, status, evaluation_status |
| `bidders` | 投标人表 | id, package_id, company_name, social_credit_code, total_score |
| `bidder_files` | 投标人文件表 | id, bidder_id, file_name, file_path, file_type, parse_status |
| `evaluation_items` | 评审项表 | id, item_code, item_name, item_content, workflow_id, api_key, base_url |
| `package_items` | 包-评审项关联表 | id, package_id, item_id, is_required |
| `files` | 绑定文件表 | id, file_name, file_path, file_type, description |
| `evaluation_results` | 评审结果表 | id, package_id, bidder_id, item_id, score, score_reason |
| `evaluation_tasks` | 评审任务表 | id, task_name, status, package_id, total_companies |

### 表关系说明

1. **项目 → 标段 → 包**：一对多关系，形成三层结构
2. **包 → 投标人**：一个包可以有多个投标人
3. **投标人 → 文件**：一个投标人可以上传多个文件
4. **包 → 评审项**：通过package_items关联表实现多对多关系
5. **评审项 → 文件**：通过evaluation_item_files关联表实现多对多关系
6. **评审结果**：关联包、投标人、评审项，记录每个评审项的得分

## API接口示例

### 1. 创建项目

```bash
curl -X POST http://localhost:8000/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "project_code": "PRJ-2026-001",
    "project_name": "测试项目-绿色低碳生产"
  }'
```

### 2. 创建标段

```bash
curl -X POST http://localhost:8000/api/sections \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": 1,
    "section_code": "S001",
    "section_name": "第一标段"
  }'
```

### 3. 创建包

```bash
curl -X POST http://localhost:8000/api/packages \
  -H "Content-Type: application/json" \
  -d '{
    "section_id": 1,
    "package_no": "P001"
  }'
```

### 4. 创建投标人

```bash
# 创建第一个投标人
curl -X POST http://localhost:8000/api/bidders \
  -H "Content-Type: application/json" \
  -d '{
    "package_id": 1,
    "company_name": "河北国绿新能源科技有限公司",
    "social_credit_code": "91130000MA0F000000"
  }'

# 创建第二个投标人
curl -X POST http://localhost:8000/api/bidders \
  -H "Content-Type: application/json" \
  -d '{
    "package_id": 1,
    "company_name": "北京绿色能源科技股份有限公司",
    "social_credit_code": "91110000MA0F111111"
  }'
```

### 5. 创建评审项

```bash
curl -X POST http://localhost:8000/api/evaluation-items \
  -H "Content-Type: application/json" \
  -d '{
    "item_code": "ITEM-001",
    "item_name": "技术方案评审",
    "item_content": "## 评审标准\n\n### 一、技术可行性\n- 标准一\n- 标准二\n\n### 二、创新性\n- 标准三",
    "material_category": "设备",
    "is_active": true,
    "workflow_id": "workflow_xxx",
    "api_key": "your_api_key",
    "base_url": "http://10.255.216.2:8083/v1"
  }'
```

### 6. 配置包的评审项

```bash
curl -X POST http://localhost:8000/api/packages/1/items \
  -H "Content-Type: application/json" \
  -d '{
    "item_ids": [1, 2, 3],
    "is_required": true
  }'
```

### 7. 上传标书文件

```bash
curl -X POST http://localhost:8000/api/packages/1/upload \
  -F "file=@标书文件.zip"
```

### 8. 启动评审

```bash
curl -X POST http://localhost:8000/api/packages/1/start-evaluation
```

### 9. 查询评审结果

```bash
curl http://localhost:8000/api/packages/1/results
```

### 10. 批量导入项目结构（接收评标辅助系统推送）

此接口用于接收评标辅助系统推送的完整项目结构数据，包含项目-标段-包-投标人信息。

```bash
curl -X POST http://localhost:8000/api/import-project-bid-structure \
  -H "Content-Type: application/json" \
  -H "Authorization: bearer your_api_key" \
  -d '{
    "projects": [
      {
        "project_code": "PRJ-2026-HN-001",
        "project_name": "湖南省绿色低碳示范项目",
        "sections": [
          {
            "section_code": "S001",
            "section_name": "第一标段",
            "packages": [
              {
                "package_no": "P001",
                "bidders": [
                  {
                    "company_name": "河北国绿新能源科技有限公司",
                    "social_credit_code": "91130000MA0F000000",
                    "rule_list": []
                  },
                  {
                    "company_name": "北京绿色能源科技股份有限公司",
                    "social_credit_code": "91110000MA0F111111",
                    "rule_list": []
                  }
                ]
              },
              {
                "package_no": "P002",
                "bidders": [
                  {
                    "company_name": "河北国绿新能源科技有限公司",
                    "social_credit_code": "91130000MA0F000000",
                    "rule_list": []
                  },
                  {
                    "company_name": "北京绿色能源科技股份有限公司",
                    "social_credit_code": "91110000MA0F111111",
                    "rule_list": []
                  }
                ]
              }
            ]
          },
          {
            "section_code": "S002",
            "section_name": "第二标段",
            "packages": [
              {
                "package_no": "P003",
                "bidders": [
                  {
                    "company_name": "河北国绿新能源科技有限公司",
                    "social_credit_code": "91130000MA0F000000",
                    "rule_list": []
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }'
```

**响应示例：**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "imported_pairs": 0,
    "cleared_rows": 0,
    "created_rows": 6,
    "created_projects": 1,
    "created_sections": 2,
    "created_packages": 3,
    "created_bidders": 5,
    "created_rules": 0,
    "error_count": 0,
    "errors": []
  }
}
```

**请求结构说明：**

| 层级 | 字段 | 说明 | 必填 |
|------|------|------|------|
| projects[] | project_code | 项目编号（全局唯一） | ✅ |
| projects[] | project_name | 项目名称 | ✅ |
| sections[] | section_code | 标段编号 | ✅ |
| sections[] | section_name | 标段名称 | ✅ |
| packages[] | package_no | 包号 | ✅ |
| bidders[] | company_name | 公司名称 | ✅ |
| bidders[] | social_credit_code | 统一社会信用代码 | ✅ |
| bidders[] | rule_list | 评审规则列表（为空则默认评审项） | ❌ |

## 完整评审流程

### 流程概述

```
1. 创建项目 → 2. 创建标段 → 3. 创建包 → 4. 配置评审项 → 5. 上传标书 → 6. 启动评审 → 7. 查看结果
```

### 详细流程说明

#### 阶段一：项目创建

1. **创建项目**：定义项目基本信息（项目编号、项目名称）
2. **创建标段**：一个项目可以包含多个标段
3. **创建包**：一个标段可以包含多个包

#### 阶段二：评审项配置

1. **创建评审项**：定义评审标准、关联Dify工作流
   - 每个评审项可以配置：
     - `workflow_id`: Dify工作流ID（可选，启用workflow方式调用）
     - `api_key`: Dify API密钥
     - `base_url`: Dify API基础地址
2. **绑定文件**：为评审项配置需要的文件（1对多关系）
   - 评审时会自动从投标人文件夹下查找同名的.md文件
3. **配置包的评审项**：将评审项绑定到具体的包

#### 阶段三：文件上传与解析

1. **上传标书**：上传ZIP格式的标书文件
2. **文件解压**：系统自动解压到 `src/data/package_files/pkg_{package_id}/`
3. **公司识别**：根据文件夹名称自动识别投标人
4. **文件解析**：
   - PDF文件转换为MD格式
   - 图片OCR识别
   - 提取文本内容

#### 阶段四：AI评审

1. **启动评审**：调用 `/api/packages/{package_id}/start-evaluation`
2. **文件匹配**：根据评审项绑定的文件名，查找对应投标人的文件
3. **Dify调用**：
   - 方式一（带workflow_id）：调用Dify工作流API
   - 方式二（不带workflow_id）：直接上传文件并执行评审
4. **结果解析**：解析Dify返回的JSON结果，提取得分、理由、依据
5. **存储结果**：将评审结果存入数据库

#### 阶段五：结果查看

1. **查询评审结果**：按包、投标人、评审项维度查询
2. **生成报告**：汇总所有评审结果，生成完整报告
3. **导出报告**：支持Excel/Word格式导出

### Dify调用方式

系统支持两种Dify调用方式：

**方式一：带workflow_id（工作流方式）**
```python
# 使用工作流ID调用
response = await dify_client.run_workflow(
    workflow_id=item.workflow_id,
    api_key=item.api_key,
    base_url=item.base_url,
    inputs={"file": file_content, "question": item.item_content}
)
```

**方式二：不带workflow_id（直接调用方式）**
```python
# 先上传文件
file_id = await dify_client.upload_file(file_path)

# 再执行评审
response = await dify_client.chat_completion(
    api_key=item.api_key,
    base_url=item.base_url,
    message=f"根据以下评审标准评审文件：{item.item_content}",
    files=[file_id]
)
```

### 文件路径逻辑

- **存储方式**：数据库中存储相对于 `src/data/package_files/pkg_{package_id}/` 的相对路径
- **文件查找**：评审时按公司维度，从投标人文件夹下查找同名的.md文件
- **路径示例**：
  - 数据库存储：`投标文件/河北国绿新能源科技有限公司/产品碳足迹证书佐证材料/产品碳足迹证书佐证材料.md`
  - 完整路径：`src/data/package_files/pkg_1/投标文件/河北国绿新能源科技有限公司/产品碳足迹证书佐证材料/产品碳足迹证书佐证材料.md`

## 当前系统能力

### 已实现功能

| 功能模块 | 描述 | 状态 |
|----------|------|------|
| 项目管理 | 项目/标段/包三层结构管理 | ✅ |
| 投标人管理 | 自动识别公司、管理投标文件 | ✅ |
| 评审项配置 | 支持API Key、Base URL、Workflow ID配置 | ✅ |
| 文件绑定 | 评审项绑定多个文件名（1对多） | ✅ |
| 文件上传 | ZIP文件上传、解压、解析 | ✅ |
| PDF转换 | PDF转MD、图片OCR识别 | ✅ |
| Dify集成 | 支持带/不带workflow_id两种调用方式 | ✅ |
| AI评审 | 自动执行评审、解析结果 | ✅ |
| 结果存储 | 评审结果数据库存储 | ✅ |
| 结果查询 | 多维度结果查询 | ✅ |
| 实时日志 | 任务执行日志展示 | ✅ |

### 待开发功能

| 功能模块 | 描述 | 优先级 |
|----------|------|--------|
| 报告导出 | Excel/Word格式报告导出 | 高 |
| 批量操作 | 批量导入评审项、投标人 | 中 |
| 权限管理 | 用户角色、权限控制 | 中 |
| 数据统计 | 评审数据分析、可视化 | 低 |

## 安装与启动

### 1. 后端安装

```bash
# 进入项目目录
cd bid

# 激活虚拟环境
.venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt
```

### 2. 前端安装

```bash
cd bid\frontend
npm install
```

### 3. 配置环境变量

```env
# 数据库配置
DATABASE_URL=sqlite:///./bid_evaluation.db

# Dify配置（可选，使用默认值）
DIFY_API_KEY=your_api_key
DIFY_BASE_URL=http://10.255.216.2:8083/v1

# 文件存储
BASE_DIR=./data
```

### 4. 启动服务

#### 后端服务（端口8000）

```bash
cd bid
.venv\Scripts\activate
python src\main.py
```

#### 前端服务（端口3000）

```bash
cd bid\frontend
npm run dev
```

### 5. 访问地址

- **前端页面**: http://localhost:3000
- **API文档**: http://localhost:8000/docs
- **Swagger UI**: http://localhost:8000/redoc

## 使用指南

### 快速上手

1. **创建项目结构**
   - 创建项目 → 创建标段 → 创建包

2. **配置评审项**
   - 在「规则管理」页面创建评审项
   - 配置Dify API Key和Base URL
   - 绑定需要的文件名

3. **配置包的评审项**
   - 进入项目详情 → 配置评审项
   - 选择需要的评审项

4. **上传标书**
   - 进入包详情 → 上传标书（ZIP格式）
   - 等待文件解析完成

5. **启动评审**
   - 点击「启动评审」按钮
   - 在实时日志中查看进度

6. **查看结果**
   - 评审完成后查看各公司得分
   - 支持按评审项、公司维度筛选

## 注意事项

1. **文件格式**：标书文件需为ZIP格式，内部按公司名称组织文件夹
2. **文件路径**：数据库存储相对路径，评审时自动拼接完整路径
3. **Dify配置**：每个评审项可独立配置API Key和Base URL
4. **评审逻辑**：按公司维度执行，每个公司独立评审
5. **文件匹配**：根据评审项绑定的文件名查找对应公司的.md文件

## 故障排查

| 问题 | 排查方向 |
|------|----------|
| 文件找不到 | 检查文件路径是否正确，确保ZIP解压正常 |
| 评审失败 | 检查Dify API配置、网络连接、workflow_id是否正确 |
| 数据库连接失败 | 检查DATABASE_URL配置，确保SQLite文件可写入 |
| 前端无法访问 | 检查前后端服务是否都已启动，端口是否被占用 |

---

**版本**: 1.0.1
**更新日期**: 2026-05-20