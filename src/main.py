"""FastAPI 应用服务 - 角色与任务分发版"""
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
    title="招标评审平台 API (角色协作版)",
    description="基于 AI 的多角色招标评审平台",
    version="2.0.0"
)

# CORS 配置 - 确保所有本地开发来源都被允许
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 开发环境允许所有来源，避免 CORS 问题
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Length", "Content-Type"],
    max_age=3600,  # 预检请求缓存 1 小时
)

# 延迟初始化数据库（在应用启动时）
@app.on_event("startup")
async def startup_event():
    """应用启动时初始化数据库"""
    from models.database import engine, Base
    from models.extended_models import init_extended_db
    from services.auth_service import init_default_users
    from services.rule_template_service import rule_template_service
    
    # 创建所有表（包括扩展表）
    Base.metadata.create_all(bind=engine)
    init_extended_db()
    
    # 初始化默认用户和模板
    init_default_users()
    rule_template_service.init_default_templates()
    
    logger.info("=== 招标评审平台启动成功 ===")
    logger.info("版本：2.0.0 (角色协作版 - 按包/按评审项分配)")
    logger.info("默认用户:")
    logger.info("  admin / admin123 (系统管理员)")
    logger.info("  leader / leader123 (评标组长)")
    logger.info("  group1 / group123 (团队小组长)")
    logger.info("  tech1 / tech123 (技术专家)")
    logger.info("  biz1 / biz123 (商务专家)")

# 路由导入
from api import tasks, rules, results, companies, logs, auth, users, projects, rule_templates, subtasks, evaluation, criteria, assignments, assignment_center, evaluation_execute, teams, project_types

# 注册路由
app.include_router(auth.router)  # 认证路由
app.include_router(users.router)  # 用户管理
app.include_router(teams.router)  # 团队管理
app.include_router(projects.router)  # 项目管理
app.include_router(rule_templates.router, tags=["规则模板管理"])  # 规则模板管理
app.include_router(project_types.router)  # 项目类型管理
app.include_router(criteria.router)  # 评审项管理
app.include_router(assignments.router)  # 任务分配
app.include_router(assignment_center.router)  # 任务分配中心辅助 API
app.include_router(evaluation_execute.router)  # 评审执行
app.include_router(subtasks.router)  # 子任务管理（兼容）
app.include_router(evaluation.router)  # 评审执行（旧）
app.include_router(tasks.router, prefix="/api/tasks", tags=["任务管理"])
app.include_router(rules.router, prefix="/api/rules", tags=["规则管理"])
app.include_router(results.router, prefix="/api", tags=["结果查询"])
app.include_router(companies.router, prefix="/api/companies", tags=["公司管理"])
app.include_router(logs.router, prefix="/api/logs", tags=["日志管理"])


@app.get("/")
async def root():
    """首页"""
    return {
        "message": "招标评审平台 API",
        "version": "2.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
