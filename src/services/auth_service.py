"""认证服务 - 用户登录、Token 管理、权限检查"""
import secrets
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Dict
from loguru import logger
from sqlalchemy.orm import Session
from sqlalchemy import text

from models.database import db_session
from models.extended_models import User, UserSessionNew, UserRole


class AuthService:
    """认证服务类"""

    def __init__(self, token_expire_hours: int = 24):
        self.token_expire_hours = token_expire_hours

    def hash_password(self, password: str) -> str:
        """密码哈希"""
        return hashlib.sha256(password.encode()).hexdigest()

    def verify_password(self, password: str, password_hash: str) -> bool:
        """验证密码"""
        return self.hash_password(password) == password_hash

    def generate_token(self) -> str:
        """生成随机 token"""
        return secrets.token_urlsafe(32)

    def register_user(self, username: str, password: str, real_name: str,
                     role: str = UserRole.TECHNICAL_EVALUATOR.value,
                     team_id: int = None, phone: str = None, email: str = None) -> Optional[User]:
        """注册用户"""
        db = db_session()
        try:
            # 检查用户名是否已存在
            existing = db.query(User).filter(User.username == username).first()
            if existing:
                logger.warning(f"用户名已存在：{username}")
                return None

            # 创建新用户
            user = User(
                username=username,
                password_hash=self.hash_password(password),
                real_name=real_name,
                role=role,
                team_id=team_id,
                phone=phone,
                email=email,
                is_active=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)

            logger.info(f"用户注册成功：{username}")
            return user

        except Exception as e:
            db.rollback()
            logger.error(f"用户注册失败：{e}")
            return None
        finally:
            db.close()

    def login(self, username: str, password: str) -> Optional[Dict]:
        """用户登录"""
        db = db_session()
        try:
            user = db.query(User).filter(User.username == username).first()
            if not user:
                logger.warning(f"用户不存在：{username}")
                return None

            if not self.verify_password(password, user.password_hash):
                logger.warning(f"密码错误：{username}")
                return None

            if not user.is_active:
                logger.warning(f"用户已被禁用：{username}")
                return None

            # 生成 token
            token = self.generate_token()
            expires_at = datetime.now() + timedelta(hours=self.token_expire_hours)

            # 保存 session
            session = UserSessionNew(
                user_id=user.id,
                token=token,
                expires_at=expires_at
            )
            db.add(session)
            db.commit()

            # 返回用户信息和 token
            return {
                "token": token,
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "real_name": user.real_name,
                    "role": user.role,
                    "team_id": user.team_id
                },
                "expires_at": expires_at.isoformat()
            }

        except Exception as e:
            db.rollback()
            logger.error(f"登录失败：{e}")
            return None
        finally:
            db.close()

    def logout(self, token: str) -> bool:
        """用户登出"""
        db = db_session()
        try:
            session = db.query(UserSessionNew).filter(UserSessionNew.token == token).first()
            if session:
                db.delete(session)
                db.commit()
                logger.info(f"用户登出：{session.user_id}")
                return True
            return False
        except Exception as e:
            db.rollback()
            logger.error(f"登出失败：{e}")
            return False
        finally:
            db.close()

    def verify_token(self, token: str) -> Optional[User]:
        """验证 token，返回对应用户"""
        db = db_session()
        try:
            session = db.query(UserSessionNew).filter(
                UserSessionNew.token == token,
                UserSessionNew.expires_at > datetime.now()
            ).first()

            if not session:
                return None

            user = db.query(User).filter(User.id == session.user_id).first()
            if not user or not user.is_active:
                return None

            return user

        except Exception as e:
            logger.error(f"Token 验证失败：{e}")
            return None
        finally:
            db.close()

    def get_current_user(self, token: str) -> Optional[Dict]:
        """获取当前用户信息"""
        user = self.verify_token(token)
        if not user:
            return None

        return {
            "id": user.id,
            "username": user.username,
            "real_name": user.real_name,
            "role": user.role,
            "team_id": user.team_id,
            "phone": user.phone,
            "email": user.email
        }

    def has_permission(self, user: User, required_roles: list) -> bool:
        """检查用户是否有权限"""
        if not user:
            return False
        return user.role in required_roles

    def cleanup_expired_sessions(self):
        """清理过期会话"""
        db = db_session()
        try:
            count = db.query(UserSessionNew).filter(
                UserSessionNew.expires_at <= datetime.now()
            ).delete()
            db.commit()
            logger.info(f"清理了 {count} 个过期会话")
            return count
        except Exception as e:
            db.rollback()
            logger.error(f"清理过期会话失败：{e}")
            return 0
        finally:
            db.close()


# 全局认证服务实例
auth_service = AuthService()


# 初始化默认用户
def init_default_users():
    """初始化默认用户（仅首次运行）"""
    db = db_session()
    try:
        # 检查是否已有用户
        if db.query(User).count() > 0:
            logger.info("用户已存在，跳过初始化")
            return

        # 创建管理员
        auth_service.register_user(
            username="admin",
            password="admin123",
            real_name="系统管理员",
            role=UserRole.ADMIN.value
        )

        # 创建评标组长
        auth_service.register_user(
            username="leader",
            password="leader123",
            real_name="评标组长",
            role=UserRole.TEAM_LEADER.value
        )

        # 创建团队负责人
        auth_service.register_user(
            username="manager1",
            password="manager123",
            real_name="团队 1 负责人",
            role=UserRole.TEAM_MANAGER.value
        )

        # 创建技术专家
        auth_service.register_user(
            username="tech1",
            password="tech123",
            real_name="技术专家 1",
            role=UserRole.TECHNICAL_EVALUATOR.value
        )

        # 创建商务专家
        auth_service.register_user(
            username="biz1",
            password="biz123",
            real_name="商务专家 1",
            role=UserRole.BUSINESS_EVALUATOR.value
        )

        # 创建团队小组长
        auth_service.register_user(
            username="group1",
            password="group123",
            real_name="团队小组长 1",
            role=UserRole.TEAM_MANAGER.value
        )

        logger.info("✅ 默认用户初始化完成")
        logger.info("用户名/密码:")
        logger.info("  admin / admin123")
        logger.info("  leader / leader123")
        logger.info("  manager1 / manager123")
        logger.info("  tech1 / tech123")
        logger.info("  biz1 / biz123")

    finally:
        db.close()


if __name__ == "__main__":
    init_default_users()
