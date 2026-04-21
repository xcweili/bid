"""数据库配置和连接"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session
from sqlalchemy.ext.declarative import declarative_base
import os

# 数据库 URL
# 数据库文件位于 src/bid_evaluation.db (与 src 目录同级)
# __file__ = /home/xcweili/.openclaw/workspace/bid/src/models/database.py
# dirname(__file__) = /home/xcweili/.openclaw/workspace/bid/src/models
# dirname(dirname(__file__)) = /home/xcweili/.openclaw/workspace/bid/src
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATABASE_PATH = os.path.join(BASE_DIR, "bid_evaluation.db")

# 验证数据库路径
if not os.path.exists(DATABASE_PATH):
    logger.warning(f"Database not found at {DATABASE_PATH}, searching...")
    # 搜索可能的数据库位置（向后兼容）
    for search_path in [
        os.path.join(os.path.dirname(BASE_DIR), "bid_evaluation.db"),  # bid/bid_evaluation.db (旧位置)
    ]:
        if os.path.exists(search_path):
            DATABASE_PATH = search_path
            logger.info(f"Found database at {DATABASE_PATH} (fallback location)")
            break

DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

# 创建引擎
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)

# 创建会话工厂
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 创建 scoped_session
db_session = scoped_session(SessionLocal)

# 创建 Base
Base = declarative_base()


def get_db():
    """获取数据库会话"""
    db = db_session()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """初始化数据库表"""
    from models.evaluation_tasks import EvaluationTask
    from models.evaluation_rules import EvaluationRule, TaskRule
    from models.company_bids import CompanyBid
    from models.evaluation_results import EvaluationResult
    
    Base.metadata.create_all(bind=engine)


def close_db():
    """关闭数据库会话"""
    db_session.remove()
