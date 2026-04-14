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
    
    @classmethod
    def init_app(cls):
        """初始化应用目录"""
        os.makedirs(cls.UPLOAD_DIR, exist_ok=True)
        os.makedirs(cls.TASKS_DIR, exist_ok=True)
        os.makedirs(cls.RULES_DIR, exist_ok=True)


# 创建配置实例
config = Config()
