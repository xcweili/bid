"""Dify 工作流执行结果模型"""
from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from models.database import Base


class DifyWorkflowRun(Base):
    """Dify 工作流执行记录"""
    __tablename__ = 'dify_workflow_runs'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    package_id = Column(Integer, ForeignKey('packages.id'), nullable=False)
    bidder_id = Column(Integer, ForeignKey('bidders.id'), nullable=False)
    file_id = Column(Integer, ForeignKey('bidder_files.id'), nullable=False)
    
    # Dify 返回的数据
    dify_workflow_run_id = Column(String(100))  # Dify 的 workflow_run_id
    dify_task_id = Column(String(100))  # Dify 的 task_id
    status = Column(String(50), default='pending')  # pending, running, completed, failed
    outputs = Column(Text)  # 工作流输出（JSON 字符串）
    error = Column(String(500))  # 错误信息
    elapsed_time = Column(Float)  # 执行耗时（秒）
    total_tokens = Column(Integer)  # 消耗的 token 数
    total_steps = Column(Integer)  # 总步数
    
    created_at = Column(DateTime, default=datetime.now)
    finished_at = Column(DateTime)
    
    # 关系
    package = relationship('Package', backref='workflow_runs')
    bidder = relationship('Bidder', backref='workflow_runs')
    bidder_file = relationship('BidderFile', backref='workflow_runs')
    
    def to_dict(self):
        return {
            'id': self.id,
            'package_id': self.package_id,
            'bidder_id': self.bidder_id,
            'file_id': self.file_id,
            'dify_workflow_run_id': self.dify_workflow_run_id,
            'dify_task_id': self.dify_task_id,
            'status': self.status,
            'outputs': self.outputs,
            'error': self.error,
            'elapsed_time': self.elapsed_time,
            'total_tokens': self.total_tokens,
            'total_steps': self.total_steps,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'finished_at': self.finished_at.isoformat() if self.finished_at else None
        }