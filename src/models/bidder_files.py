"""数据库模型 - 文件解析状态"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from models.database import Base


class BidderFile(Base):
    """投标人文件表 - 记录投标人上传的文件信息"""
    __tablename__ = 'bidder_files'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    bidder_id = Column(Integer, ForeignKey('bidders.id'), nullable=False)  # 关联投标人
    file_name = Column(String(255), nullable=False)  # 文件名
    file_path = Column(String(500), nullable=False)  # 文件路径
    file_type = Column(String(50))  # 文件类型：pdf, docx, txt, md等
    file_size = Column(Integer)  # 文件大小（字节）
    parsed = Column(Boolean, default=False)  # 是否已解析
    parse_status = Column(String(50), default='pending')  # 解析状态：pending, processing, completed, failed
    parse_error = Column(String(500))  # 解析错误信息
    ocr_status = Column(String(50), default='pending')  # OCR 状态：pending, processing, completed, failed, no_images
    ocr_total_images = Column(Integer, default=0)  # 总图片数
    ocr_completed_images = Column(Integer, default=0)  # 已完成 OCR 的图片数
    created_at = Column(DateTime, default=datetime.now)
    
    # 关系
    bidder = relationship('Bidder', back_populates='files')
    
    def to_dict(self):
        return {
            "id": self.id,
            "bidder_id": self.bidder_id,
            "file_name": self.file_name,
            "file_path": self.file_path,
            "file_type": self.file_type,
            "file_size": self.file_size,
            "parsed": self.parsed,
            "parse_status": self.parse_status,
            "parse_error": self.parse_error,
            "ocr_status": self.ocr_status,
            "ocr_total_images": self.ocr_total_images,
            "ocr_completed_images": self.ocr_completed_images,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class PackageFileUpload(Base):
    """包文件上传记录 - 记录包级别的文件上传历史"""
    __tablename__ = 'package_file_uploads'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    package_id = Column(Integer, ForeignKey('packages.id'), nullable=False)  # 关联包
    zip_file_path = Column(String(500))  # 上传的zip文件路径
    extract_dir = Column(String(500))  # 解压后的目录路径（存储实际的二级目录，如"投标文件-技术"）
    status = Column(String(50), default='pending')  # 整体状态：pending, processing, completed, failed
    total_files = Column(Integer, default=0)  # 总文件数
    parsed_files = Column(Integer, default=0)  # 已解析文件数
    created_at = Column(DateTime, default=datetime.now)
    completed_at = Column(DateTime)  # 完成时间
    
    # 关系
    package = relationship('Package', back_populates='file_uploads')
    
    def to_dict(self):
        return {
            "id": self.id,
            "package_id": self.package_id,
            "zip_file_path": self.zip_file_path,
            "extract_dir": self.extract_dir,
            "status": self.status,
            "total_files": self.total_files,
            "parsed_files": self.parsed_files,
            "progress": (self.parsed_files / self.total_files * 100) if self.total_files > 0 else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None
        }
