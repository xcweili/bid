"""数据库模型 - 评审任务"""
from sqlalchemy import Column, Integer, String, DateTime, Float, Text, ForeignKey, Table
from sqlalchemy.ext.declarative import declared_attr
from datetime import datetime
from models.database import Base


class EvaluationTask(Base):
    """评审任务表"""
    __tablename__ = 'evaluation_tasks'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    task_name = Column(String(255), nullable=False)
    status = Column(String(50), default='pending')  # pending, processing, completed, failed
    zip_file_path = Column(String(500))
    created_at = Column(DateTime, default=datetime.now)
    completed_at = Column(DateTime)
    total_companies = Column(Integer, default=0)
    total_score_avg = Column(Float)
    ocr_status = Column(String(50), default='idle')  # idle, processing - 文档解析状态
    processed_rules = Column(Integer, default=0)  # 已处理的规则数
    total_rules = Column(Integer, default=0)  # 总规则数
    
    def to_dict(self):
        return {
            "id": self.id,
            "task_name": self.task_name,
            "status": self.status,
            "zip_file_path": self.zip_file_path,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "total_companies": self.total_companies,
            "total_score_avg": self.total_score_avg,
            "ocr_status": self.ocr_status,
            "processed_rules": self.processed_rules,
            "total_rules": self.total_rules,
            "rule_ids": []  # 在 API 中单独查询
        }
