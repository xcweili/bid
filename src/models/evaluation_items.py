"""数据库模型 - 评审项"""
import json
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Boolean, Table
from sqlalchemy.orm import relationship
from datetime import datetime
from models.database import Base

# 评审项与文件关联表（多对多）
evaluation_item_files = Table(
    'evaluation_item_files',
    Base.metadata,
    Column('item_id', Integer, ForeignKey('evaluation_items.id'), primary_key=True),
    Column('file_id', Integer, ForeignKey('files.id'), primary_key=True)
)


class EvaluationItem(Base):
    """评审项表 - 单独配置的评审项"""
    __tablename__ = 'evaluation_items'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    item_code = Column(String(100), nullable=False, unique=True)  # 评审项编号
    item_name = Column(String(255), nullable=False)  # 评审项名称
    item_content = Column(Text)  # 评审项内容（markdown格式）
    material_category = Column(String(200))  # 物资品类（用于筛选）
    is_active = Column(Boolean, default=True)  # 是否启用
    workflow_id = Column(String(100))  # Dify 工作流 ID，每个评审项对应一个 Dify 工作流
    api_key = Column(String(200))  # Dify API Key，用于访问工作流
    base_url = Column(String(200))  # Dify API 基础地址
    
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # 关系
    package_items = relationship('PackageItem', back_populates='item')
    files = relationship('File', secondary=evaluation_item_files, back_populates='evaluation_items')
    
    def to_dict(self):
        return {
            "id": self.id,
            "item_code": self.item_code,
            "item_name": self.item_name,
            "item_content": self.item_content,
            "material_category": self.material_category,
            "is_active": self.is_active,
            "workflow_id": self.workflow_id,
            "api_key": self.api_key,
            "base_url": self.base_url,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }

    def to_dict_with_files(self):
        result = self.to_dict()
        result["files"] = [file.to_dict() for file in self.files]
        return result


class PackageItem(Base):
    """包-评审项关联表（包级规则配置，独立存储，支持修改）"""
    __tablename__ = 'package_items'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    package_id = Column(Integer, ForeignKey('packages.id'), nullable=False)
    item_id = Column(Integer, ForeignKey('evaluation_items.id'), nullable=False)
    is_required = Column(Boolean, default=True)  # 是否必填
    
    # 包级规则独立配置字段（覆盖模板，不影响其他包）
    evaluation_type = Column(String(50))  # 技术 / 商务
    evaluation_stage = Column(String(50))  # 初评 / 详评
    rule_category = Column(String(50))   # 规则分类
    rule_content = Column(Text)           # 评审内容（可覆盖模板）
    bound_filenames = Column(Text)        # JSON 数组，绑定的文件名列表
    
    # 关系
    package = relationship('Package', back_populates='package_items')
    item = relationship('EvaluationItem', back_populates='package_items')
    
    def to_dict(self):
        return {
            "id": self.id,
            "package_id": self.package_id,
            "item_id": self.item_id,
            "is_required": self.is_required,
            "evaluation_type": self.evaluation_type,
            "evaluation_stage": self.evaluation_stage,
            "rule_category": self.rule_category,
            "rule_content": self.rule_content,
            "bound_filenames": json.loads(self.bound_filenames) if self.bound_filenames else []
        }


class File(Base):
    """文件表 - 用于存储评审项绑定的文件"""
    __tablename__ = 'files'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    file_name = Column(String(255), nullable=False)  # 文件名
    file_path = Column(String(500), nullable=False)  # 文件路径
    file_type = Column(String(100))  # 文件类型（如 pdf, docx, xlsx 等）
    file_size = Column(Integer)  # 文件大小（字节）
    description = Column(Text)  # 文件描述
    
    created_at = Column(DateTime, default=datetime.now)
    
    # 关系
    evaluation_items = relationship('EvaluationItem', secondary=evaluation_item_files, back_populates='files')
    
    def to_dict(self):
        return {
            "id": self.id,
            "file_name": self.file_name,
            "file_path": self.file_path,
            "file_type": self.file_type,
            "file_size": self.file_size,
            "description": self.description,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
