"""FastAPI 应用服务"""
import sys
from pathlib import Path
# 添加 src 目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import config
from models.database import init_db, engine, Base
from loguru import logger
import os

# 初始化配置
config.init_app()

# 配置日志文件
log_dir = Path(__file__).parent / "logs"
log_dir.mkdir(exist_ok=True)
log_file = log_dir / "bid.log"

# 移除默认处理器
logger.remove()
# 添加文件处理器
logger.add(
    str(log_file),
    format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {module}:{function}:{line} - {message}",
    level="DEBUG",
    rotation="10 MB",
    retention="7 days",
    compression="zip"
)
# 添加控制台处理器
logger.add(sys.stderr, format="{time:HH:mm:ss} | {level} | {message}", level="DEBUG")

# 创建 FastAPI 应用
app = FastAPI(
    title="招标评审平台 API",
    description="基于 AI 的招标评审平台",
    version="1.0.0"
)

# 延迟初始化数据库（在应用启动时）
@app.on_event("startup")
async def startup_event():
    """应用启动时初始化数据库"""
    from models.database import engine, Base
    # 创建所有表
    Base.metadata.create_all(bind=engine)
    logger.info("应用启动成功")

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 路由导入
from api import tasks, rules, results, companies, logs, project_import, evaluation_items_api, evaluation_results_api, bidders_api

# 注册路由
app.include_router(tasks.router, prefix="/api/tasks", tags=["任务管理"])
app.include_router(rules.router, prefix="/api/rules", tags=["规则管理"])
app.include_router(results.router, prefix="/api", tags=["结果查询"])
app.include_router(companies.router, prefix="/api/companies", tags=["公司管理"])
app.include_router(logs.router, prefix="/api/logs", tags=["日志管理"])
app.include_router(project_import.router, prefix="/api", tags=["项目导入"])
app.include_router(evaluation_items_api.router)
app.include_router(evaluation_results_api.router, prefix="/api", tags=["评审结果"])
app.include_router(bidders_api.router, prefix="/api", tags=["投标人管理"])


@app.get("/")
async def root():
    """首页"""
    return {
        "message": "招标评审平台 API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
