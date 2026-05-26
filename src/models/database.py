"""数据库配置和连接"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session
from sqlalchemy.ext.declarative import declarative_base
import os

# 数据库 URL
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATABASE_PATH = os.path.join(BASE_DIR, "bid_evaluation.db")
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATABASE_PATH}")

# 创建引擎
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)

# 创建会话工厂
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 创建 scoped_session
_scoped_session = scoped_session(SessionLocal)


class _AutoClosingSession:
    def __call__(self):
        sess = _scoped_session()
        if not getattr(sess, '_db_closing', False):
            sess._db_closing = False
            original_close = sess.close
            def _patched_close():
                if not sess._db_closing:
                    sess._db_closing = True
                    try:
                        original_close()
                    finally:
                        _scoped_session.remove()
            sess.close = _patched_close
        return sess

    def remove(self):
        _scoped_session.remove()


db_session = _AutoClosingSession()

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
    from models.project_structure import Project, Section, Package, Bidder
    from models.evaluation_items import EvaluationItem, PackageItem
    from models.bidder_files import BidderFile, PackageFileUpload
    from models.dify_workflow import DifyWorkflowRun
    from models.user import User
    
    Base.metadata.create_all(bind=engine)


def close_db():
    """关闭数据库会话"""
    db_session.remove()
