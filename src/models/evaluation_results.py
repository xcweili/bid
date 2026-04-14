"""数据库模型 - 评审结果"""
from sqlalchemy import Column, Integer, String, DateTime, Float, Text, JSON
from datetime import datetime
from models.database import Base


class EvaluationResult(Base):
    """评审项结果表"""
    __tablename__ = 'evaluation_results'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    company_bid_id = Column(Integer, nullable=False)
    rule_id = Column(Integer, nullable=False)
    rule_name = Column(String(255))
    score = Column(Float)
    max_score = Column(Float)
    reason = Column(Text)  # 评分理由
    evidence = Column(Text)  # 依据说明
    evidence_details = Column(Text)  # JSON 字符串，详细的原文引用
    llm_prompt = Column(Text)  # 使用的 prompt
    llm_response = Column(Text)  # LLM 原始响应
    created_at = Column(DateTime, default=datetime.now)
    
    def to_dict(self):
        import json
        return {
            "id": self.id,
            "company_bid_id": self.company_bid_id,
            "rule_id": self.rule_id,
            "rule_name": self.rule_name,
            "score": self.score,
            "max_score": self.max_score,
            "reason": self.reason,
            "evidence": self.evidence,
            "evidence_details": json.loads(self.evidence_details) if self.evidence_details else [],
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
