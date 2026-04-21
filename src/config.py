"""应用配置"""
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    """应用配置"""
    
    # 数据库
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./bid_evaluation.db")
    
    # GPUStack API 配置
    LLM_API_KEY = os.getenv("LLM_API_KEY", "gpustack_ddb0c780dd843b12_67fea5d3d141e2f75091b6ba6e495707")
    LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://10.255.216.2/v1")
    
    # 模型配置（仅保留两个模型）
    OCR_MODEL = os.getenv("OCR_MODEL", "ocr")
    QWEN_122B_MODEL = os.getenv("QWEN_122B_MODEL", "qwen3.5-122b")
    
    # 文件存储
    BASE_DIR = os.path.join(os.path.dirname(__file__), "data")
    UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
    TASKS_DIR = os.path.join(BASE_DIR, "tasks")
    RULES_DIR = os.path.join(BASE_DIR, "rules")
    
    # CORS
    CORS_ORIGINS = [
        "http://localhost:3000",
        "http://localhost:8001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8001",
        "http://0.0.0.0:3000",
        "http://0.0.0.0:8001"
    ]
    CORS_ALLOW_ALL = False
    
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
