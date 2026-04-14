#!/bin/bash

# 投标评审平台启动脚本

echo "=== 投标评审平台 ==="

# 安装 Python 依赖
echo "安装 Python 依赖..."
pip install -r requirements.txt

# 初始化数据库
echo "初始化数据库..."
cd src
python -c "from models.database import init_db; init_db()"
cd ..

# 启动后端
echo "启动后端服务 (http://localhost:8000)..."
cd src
python main.py &
BACKEND_PID=$!
cd ..

# 等待后端启动
sleep 3

# 启动前端
echo "启动前端服务 (http://localhost:3000)..."
cd frontend
npm install
npm run dev &
FRONTEND_PID=$!
cd ..

echo "服务已启动!"
echo "后端：http://localhost:8000"
echo "前端：http://localhost:3000"
echo "API 文档：http://localhost:8000/docs"

# 清理
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
