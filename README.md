# 招标评审平台

## 项目简介

招标评审平台是一个基于AI的智能招标评审系统，旨在提高招标评审的效率和准确性。系统支持上传标书文件、智能识别公司信息、基于规则进行AI评审，并生成详细的评审报告。

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
│   │   └── uploads/   # 上传文件
│   ├── logs/          # 日志文件
│   ├── models/        # 数据库模型
│   ├── services/      # 服务层
│   ├── main.py        # 应用入口
│   └── config.py      # 配置文件
├── scripts/           # 脚本文件
├── .env               # 环境变量
└── README.md          # 项目文档
```

## 目录说明

### 1. .venv/
虚拟环境目录，包含项目所需的Python依赖包。

### 2. frontend/
前端代码目录，使用React + TypeScript开发。
- **dist/**: 构建输出目录，包含编译后的前端文件
- **src/components/**: 通用组件
- **src/pages/**: 页面组件
- **src/services/**: API服务
- **src/types/**: TypeScript类型定义

### 3. src/
后端代码目录，使用FastAPI开发。
- **api/**: API路由定义，处理HTTP请求
- **data/**: 数据存储目录
  - **tasks/**: 任务相关数据，包括解析后的标书文件
  - **uploads/**: 上传的原始标书文件
- **logs/**: 日志文件目录，存储应用运行日志
- **models/**: 数据库模型定义，使用SQLAlchemy ORM
- **services/**: 业务逻辑服务层
- **main.py**: 应用入口，配置FastAPI应用
- **config.py**: 应用配置文件

### 4. scripts/
辅助脚本目录，包含调度器等工具脚本。

## 主要功能

### 1. 任务管理
- 创建评审任务
- 上传标书文件（ZIP格式）
- 智能识别公司文件夹
- 管理任务状态

### 2. 规则管理
- 配置评审规则
- 规则模板管理
- 规则绑定文件

### 3. 公司管理
- 自动识别公司信息
- 管理公司投标文件
- 公司状态跟踪

### 4. AI评审
- 基于规则进行智能评审
- 自动生成评审报告
- 计算评分和排名

### 5. 结果查询
- 查看评审结果
- 导出评审报告
- 分析评审数据

### 6. 实时日志
- 查看任务执行日志
- 支持手动刷新
- 滚动显示日志内容

## 技术栈

### 后端
- **Python 3.11+**
- **FastAPI**: 高性能Web框架
- **SQLAlchemy**: ORM数据库工具
- **SQLite**: 轻量级数据库
- **Loguru**: 日志管理
- **PyPDF2**: PDF文件处理
- **python-docx**: Word文件处理
- **zipfile**: ZIP文件处理

### 前端
- **React 18+**
- **TypeScript**
- **Ant Design**: UI组件库
- **React Router**: 路由管理
- **Vite**: 构建工具

## 环境要求

- Python 3.11+
- Node.js 16+
- npm 7+

## 安装与启动

### 1. 后端安装

```bash
# 进入项目目录
cd bid

# 激活虚拟环境（如果已存在）
.venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt
```

### 2. 前端安装

```bash
# 进入前端目录
cd bid\frontend

# 安装依赖
npm install
```

### 3. 配置环境变量

复制 `.env.example` 文件为 `.env`，并根据实际情况修改配置：

```env
# 数据库配置
DATABASE_URL=sqlite:///./bid_evaluation.db

# LLM API 配置
LLM_API_KEY=your_api_key
LLM_BASE_URL=http://localhost:8080/v1
LLM_MODEL=qwen3.5-122b

# 文件存储
BASE_DIR=./data

# 任务配置
MAX_CONCURRENT_TASKS=3
LLM_TIMEOUT_SECONDS=120
```

### 4. 启动服务

#### 后端服务

```bash
# 进入项目目录
cd bid

# 激活虚拟环境
.venv\Scripts\activate

# 启动后端服务
python src\main.py
```

后端服务默认运行在 `http://localhost:8001`，API文档地址为 `http://localhost:8001/docs`。

#### 前端服务

```bash
# 进入前端目录
cd bid\frontend

# 启动开发服务器
npm run dev
```

前端服务默认运行在 `http://localhost:3000`。

### 5. 构建前端

```bash
# 进入前端目录
cd bid\frontend

# 构建生产版本
npm run build
```

构建产物将输出到 `frontend/dist` 目录。

## 使用指南

### 1. 创建任务

1. 访问前端页面 `http://localhost:3000`
2. 点击「创建任务」按钮
3. 输入任务名称，选择评审规则
4. 点击「创建」按钮

### 2. 上传标书

1. 进入任务详情页面
2. 点击「上传标书」按钮
3. 选择ZIP格式的标书文件
4. 等待文件上传和解析完成

### 3. 启动评审

1. 待文档解析完成后，点击「开始评审」按钮
2. 系统将自动进行AI评审
3. 可在「实时日志」中查看评审进度

### 4. 查看结果

1. 评审完成后，点击「查看结果」按钮
2. 查看各公司的评审得分和详细报告
3. 可导出评审报告

## 注意事项

1. **文件格式**：请确保上传的标书文件为ZIP格式，且内部包含公司文件夹
2. **文件大小**：建议单个ZIP文件不超过100MB
3. **LLM配置**：请确保正确配置LLM API，否则AI评审功能将无法使用
4. **日志管理**：系统会自动管理日志文件，定期清理过期日志
5. **数据安全**：敏感数据请妥善保管，建议定期备份数据库

## 故障排查

1. **后端服务启动失败**：检查Python版本和依赖安装情况
2. **前端页面无法访问**：检查前端服务是否启动，以及后端API是否正常
3. **文件上传失败**：检查文件格式和大小，确保网络连接正常
4. **AI评审失败**：检查LLM API配置和网络连接
5. **日志不显示**：检查日志目录权限，确保应用有写入权限

## 联系与支持

如有问题或建议，请联系项目维护人员。

---

**版本**: 1.0.0
**更新日期**: 2026-04-12