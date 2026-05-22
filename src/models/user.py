"""用户模型"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from datetime import datetime
from models.database import Base
import hashlib
import os


class User(Base):
    """用户表"""
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(200), nullable=False)
    display_name = Column(String(100), nullable=False)
    role = Column(String(50), default='admin')
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    @staticmethod
    def hash_password(password: str) -> str:
        """对密码进行加盐哈希"""
        salt = os.urandom(16).hex()
        hash_obj = hashlib.sha256((salt + password).encode('utf-8'))
        return f"{salt}${hash_obj.hexdigest()}"

    @staticmethod
    def hash_password_raw(password: str, salt: str) -> str:
        """使用指定盐值计算密码哈希"""
        hash_obj = hashlib.sha256((salt + password).encode('utf-8'))
        return hash_obj.hexdigest()

    def verify_password(self, password: str) -> bool:
        """验证密码"""
        if '$' not in self.password_hash:
            return False
        salt, stored_hash = self.password_hash.split('$', 1)
        return self.hash_password_raw(password, salt) == stored_hash

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "display_name": self.display_name,
            "role": self.role,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
