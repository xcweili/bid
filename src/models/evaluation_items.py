"""数据库模型 - 评审项"""
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Boolean, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from models.database import Base


class EvaluationItem(Base):
    """评审项表 - 单独配置的评审项"""
    __tablename__ = 'evaluation_items'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    item_code = Column(String(100), nullable=False, unique=True)  # 评审项编号
    item_name = Column(String(255), nullable=False)  # 评审项名称
    item_description = Column(Text)  # 评审项描述
    max_score = Column(Float, default=100.0)  # 最高分
    min_score = Column(Float, default=0.0)  # 最低分
    weight = Column(Float, default=1.0)  # 权重
    material_category = Column(String(200))  # 物资品类（用于筛选）
    is_active = Column(Boolean, default=True)  # 是否启用
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # 关系
    package_items = relationship('PackageItem', back_populates='item')
    
    def to_dict(self):
        return {
            "id": self.id,
            "item_code": self.item_code,
            "item_name": self.item_name,
            "item_description": self.item_description,
            "max_score": self.max_score,
            "min_score": self.min_score,
            "weight": self.weight,
            "material_category": self.material_category,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }


class PackageItem(Base):
    """包-评审项关联表"""
    __tablename__ = 'package_items'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    package_id = Column(Integer, ForeignKey('packages.id'), nullable=False)
    item_id = Column(Integer, ForeignKey('evaluation_items.id'), nullable=False)
    is_required = Column(Boolean, default=True)  # 是否必填
    custom_weight = Column(Float)  # 自定义权重（覆盖评审项默认权重）
    
    # 关系
    package = relationship('Package', back_populates='package_items')
    item = relationship('EvaluationItem', back_populates='package_items')
    
    def to_dict(self):
        return {
            "id": self.id,
            "package_id": self.package_id,
            "item_id": self.item_id,
            "is_required": self.is_required,
            "custom_weight": self.custom_weight
        }
