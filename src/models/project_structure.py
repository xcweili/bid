"""数据库模型 - 项目结构（项目、标段、包）"""
from sqlalchemy import Column, Integer, String, DateTime, Float, Text, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from models.database import Base


class Project(Base):
    """项目表"""
    __tablename__ = 'projects'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    project_code = Column(String(100), nullable=False, unique=True)  # 项目编号，全局唯一
    project_name = Column(String(255), nullable=False)  # 项目名称
    status = Column(String(50), default='pending')  # pending, processing, completed
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # 关系
    sections = relationship('Section', back_populates='project', cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            "id": self.id,
            "project_code": self.project_code,
            "project_name": self.project_name,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "section_count": len(self.sections) if self.sections else 0
        }


class Section(Base):
    """标段表"""
    __tablename__ = 'sections'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey('projects.id'), nullable=False)
    section_code = Column(String(100), nullable=False)  # 标段编号
    section_name = Column(String(255), nullable=False)  # 标段名称
    
    # 关系
    project = relationship('Project', back_populates='sections')
    packages = relationship('Package', back_populates='section', cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            "id": self.id,
            "project_id": self.project_id,
            "section_code": self.section_code,
            "section_name": self.section_name,
            "package_count": len(self.packages) if self.packages else 0
        }


class Package(Base):
    """包表"""
    __tablename__ = 'packages'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    section_id = Column(Integer, ForeignKey('sections.id'), nullable=False)
    package_no = Column(String(100), nullable=False)  # 包号
    status = Column(String(50), default='pending')  # pending, processing, completed
    zip_file_path = Column(String(500))  # 标书文件路径
    evaluation_status = Column(String(50), default='pending')  # pending, evaluating, completed, failed
    
    # 关系
    section = relationship('Section', back_populates='packages')
    bidders = relationship('Bidder', back_populates='package', cascade='all, delete-orphan')
    package_items = relationship('PackageItem', back_populates='package', cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            "id": self.id,
            "section_id": self.section_id,
            "package_no": self.package_no,
            "status": self.status,
            "evaluation_status": self.evaluation_status,
            "zip_file_path": self.zip_file_path,
            "bidder_count": len(self.bidders) if self.bidders else 0,
            "item_count": len(self.package_items) if self.package_items else 0
        }


class Bidder(Base):
    """投标人表"""
    __tablename__ = 'bidders'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    package_id = Column(Integer, ForeignKey('packages.id'), nullable=False)
    company_name = Column(String(255), nullable=False)  # 公司名称
    social_credit_code = Column(String(50))  # 统一社会信用代码
    
    # 关系
    package = relationship('Package', back_populates='bidders')
    
    def to_dict(self):
        return {
            "id": self.id,
            "package_id": self.package_id,
            "company_name": self.company_name,
            "social_credit_code": self.social_credit_code
        }