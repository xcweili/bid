"""评审结果模型"""
from sqlalchemy import Column, Integer, Float, String, Text, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from models.database import Base

class EvaluationResult(Base):
    """评审结果模型"""
    __tablename__ = 'evaluation_results'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    package_id = Column(Integer, ForeignKey('packages.id'), nullable=False)
    bidder_id = Column(Integer, ForeignKey('bidders.id'), nullable=False)
    item_id = Column(Integer, ForeignKey('evaluation_items.id'), nullable=False)
    score = Column(Float)  # 得分
    score_reason = Column(Text)  # 评分理由
    evaluation_status = Column(String(50), default='pending')  # pending, completed
    evaluation_basis = Column(Text)  # 评审依据
    source_filename = Column(String(500))  # 引用来源文件名
    source_page = Column(String(50))  # 引用来源页码
    source_quote = Column(Text)  # 原文引用
    
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # 关系
    package = relationship('Package', backref='results')
    bidder = relationship('Bidder', backref='results')
    item = relationship('EvaluationItem', backref='results')
    
    def to_dict(self):
        return {
            'id': self.id,
            'package_id': self.package_id,
            'bidder_id': self.bidder_id,
            'item_id': self.item_id,
            'item_code': self.item.item_code if self.item and hasattr(self.item, 'item_code') else '',
            'item_name': self.item.item_name if self.item and hasattr(self.item, 'item_name') else '',
            'company_name': self.bidder.company_name if self.bidder and hasattr(self.bidder, 'company_name') else '',
            'score': self.score,
            'score_reason': self.score_reason,
            'evaluation_status': self.evaluation_status,
            'evaluation_basis': self.evaluation_basis,
            'source_filename': self.source_filename,
            'source_page': self.source_page,
            'source_quote': self.source_quote,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }