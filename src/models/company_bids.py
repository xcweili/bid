"""数据库模型 - 公司标书"""
from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from models.database import Base


class CompanyBid(Base):
    """公司标书表"""
    __tablename__ = 'company_bids'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(Integer, nullable=False)
    company_name = Column(String(255), nullable=False)
    bid_folder_path = Column(String(500))
    status = Column(String(50), default='pending')  # pending, processing, completed, failed
    total_score = Column(Float)
    ocr_status = Column(String(50), default='pending')  # pending, processing, completed, failed - 文档解析状态
    processed_rules = Column(Integer, default=0)  # 已处理的规则数
    total_rules = Column(Integer, default=0)  # 总规则数
    created_at = Column(DateTime, default=datetime.now)
    
    # 新增：与投标人的关联
    bidder_id = Column(Integer, ForeignKey('bidders.id'))
    bidder = relationship('Bidder', backref='company_bids')
    
    def to_dict(self):
        return {
            "id": self.id,
            "task_id": self.task_id,
            "company_name": self.company_name,
            "bid_folder_path": self.bid_folder_path,
            "status": self.status,
            "total_score": self.total_score,
            "ocr_status": self.ocr_status,
            "processed_rules": self.processed_rules,
            "total_rules": self.total_rules,
            "bidder_id": self.bidder_id,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }