"""应用配置"""
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    """应用配置"""
    
    # 数据库
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./bid_evaluation.db")
    
    # LLM API 配置
    LLM_API_KEY = os.getenv("LLM_API_KEY", "")
    LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:8080/v1")
    LLM_MODEL = os.getenv("LLM_MODEL", "qwen3.5-122b")
    
    # 文件存储
    # 始终使用基于__file__的绝对路径，确保所有操作都在src/data目录下
    BASE_DIR = os.path.join(os.path.dirname(__file__), "data")
    UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
    TASKS_DIR = os.path.join(BASE_DIR, "tasks")
    RULES_DIR = os.path.join(BASE_DIR, "rules")
    
    # CORS
    CORS_ORIGINS = ["*"]
    
    # 任务配置
    MAX_CONCURRENT_TASKS = int(os.getenv("MAX_CONCURRENT_TASKS", "3"))
    LLM_TIMEOUT_SECONDS = int(os.getenv("LLM_TIMEOUT_SECONDS", "120"))
    
    # Dify API 配置
    DIFY_API_KEY = os.getenv("DIFY_API_KEY", "app-4pi8NqfyLf4VLJox29ZQ2AT2")
    DIFY_BASE_URL = os.getenv("DIFY_BASE_URL", "http://10.255.216.2:8083/v1")
    DIFY_WORKFLOW_ID = os.getenv("DIFY_WORKFLOW_ID", "866c5951-f8e6-4ce6-b1df-223952664773")
    
    # JWT 认证配置
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "bid-evaluation-secret-key-change-in-production")
    JWT_ALGORITHM = "HS256"
    JWT_EXPIRE_SECONDS = 1800  # 30 分钟无操作超时
    
    # FTP 配置（默认值用于本地测试）
    FTP_HOST = os.getenv("FTP_HOST", "127.0.0.1")
    FTP_PORT = int(os.getenv("FTP_PORT", "21"))
    FTP_USERNAME = os.getenv("FTP_USERNAME", "test")
    FTP_PASSWORD = os.getenv("FTP_PASSWORD", "test123")
    FTP_TIMEOUT = int(os.getenv("FTP_TIMEOUT", "30"))
    FTP_USE_PASSIVE = os.getenv("FTP_USE_PASSIVE", "true").lower() == "true"
    
    @classmethod
    def init_app(cls):
        """初始化应用目录"""
        # 不再自动创建 rules、tasks、uploads 目录
        # 这些目录由实际业务需求时按需创建


# 创建配置实例
config = Config()
