# =========================================================
# Stage 1: 构建前端静态文件
# =========================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# 先复制依赖描述文件，利用 Docker 缓存
COPY frontend/package*.json ./
RUN npm ci

# 复制前端源码并构建
COPY frontend/ ./
RUN npx vite build

# =========================================================
# Stage 2: Python 运行环境（含前端 + 后端）
# =========================================================
FROM python:3.11-slim

WORKDIR /app

# 安装系统级依赖（pymupdf 等需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0t64 \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir --timeout 120 -r requirements.txt

# 复制后端源码
COPY src/ ./src/

# 复制数据库文件（项目根目录下的 bid_evaluation.db）
COPY bid_evaluation.db ./bid_evaluation.db

# 从 Stage 1 复制构建好的前端静态文件
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# 确保 data 和 logs 目录存在（db 在启动时自动创建）
RUN mkdir -p /app/src/data /app/src/logs

EXPOSE 8888

# 启动服务
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8888"]
