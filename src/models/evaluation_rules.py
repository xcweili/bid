"""数据库模型 - 评审规则"""
from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean
from datetime import datetime
import json
from models.database import Base


class EvaluationRule(Base):
    """评审规则表"""
    __tablename__ = 'evaluation_rules'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_name = Column(String(255), nullable=False)
    rule_file_path = Column(String(500))
    rule_content = Column(Text)
    config_json = Column(Text)  # JSON 字符串存储配置
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    def to_dict(self):
        return {
            "id": self.id,
            "rule_name": self.rule_name,
            "rule_file_path": self.rule_file_path,
            "rule_content": self.rule_content,
            "config": json.loads(self.config_json) if self.config_json else {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }
    
    def set_config(self, config_dict):
        """设置配置 JSON"""
        self.config_json = json.dumps(config_dict, ensure_ascii=False)


class TaskRule(Base):
    """任务 - 规则关联表"""
    __tablename__ = 'task_rules'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(Integer, nullable=False)
    rule_id = Column(Integer, nullable=False)
    is_active = Column(Boolean, default=True)
    
    def to_dict(self):
        return {
            "id": self.id,
            "task_id": self.task_id,
            "rule_id": self.rule_id,
            "is_active": self.is_active
        }
