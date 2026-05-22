"""认证API - 登录/退出/验证"""
import hashlib
import hmac
import time
import json
import base64
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session
from loguru import logger
from typing import Optional

from models.database import db_session, get_db
from models.user import User
from config import config

router = APIRouter(prefix="/api/auth", tags=["认证管理"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    user: dict
    expires_in: int


class UserInfo(BaseModel):
    id: int
    username: str
    display_name: str
    role: str


def _base64_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')


def _base64_decode(data: str) -> bytes:
    padding = 4 - len(data) % 4
    if padding != 4:
        data += '=' * padding
    return base64.urlsafe_b64decode(data)


def create_token(user: User) -> str:
    """创建JWT token"""
    now = int(time.time())
    payload = {
        "user_id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "iat": now,
        "exp": now + config.JWT_EXPIRE_SECONDS
    }
    header = {"alg": config.JWT_ALGORITHM, "typ": "JWT"}
    header_b64 = _base64_encode(json.dumps(header, separators=(',', ':')).encode('utf-8'))
    payload_b64 = _base64_encode(json.dumps(payload, separators=(',', ':')).encode('utf-8'))
    signing_input = f"{header_b64}.{payload_b64}"
    signature = hmac.new(
        config.JWT_SECRET_KEY.encode('utf-8'),
        signing_input.encode('utf-8'),
        hashlib.sha256
    ).digest()
    signature_b64 = _base64_encode(signature)
    return f"{signing_input}.{signature_b64}"


def verify_token(token: str) -> Optional[dict]:
    """验证JWT token，返回payload或None"""
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None
        header_b64, payload_b64, signature_b64 = parts
        signing_input = f"{header_b64}.{payload_b64}"
        expected_sig = hmac.new(
            config.JWT_SECRET_KEY.encode('utf-8'),
            signing_input.encode('utf-8'),
            hashlib.sha256
        ).digest()
        expected_sig_b64 = _base64_encode(expected_sig)
        if not hmac.compare_digest(signature_b64, expected_sig_b64):
            return None
        payload = json.loads(_base64_decode(payload_b64))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


def get_current_user(authorization: str = Header(None)):
    """依赖注入：从请求头获取当前用户"""
    if not authorization:
        raise HTTPException(status_code=401, detail="未提供认证令牌")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="认证格式错误")
    token = authorization[7:]
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="令牌无效或已过期")
    return payload


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """用户登录"""
    db = db_session()
    try:
        user = db.query(User).filter(
            User.username == request.username,
            User.is_active == True
        ).first()
        if not user or not user.verify_password(request.password):
            logger.warning(f"登录失败：用户名或密码错误 (username={request.username})")
            raise HTTPException(status_code=401, detail="用户名或密码错误")
        token = create_token(user)
        logger.info(f"用户登录成功: {user.username} ({user.display_name})")
        return LoginResponse(
            token=token,
            user=user.to_dict(),
            expires_in=config.JWT_EXPIRE_SECONDS
        )
    finally:
        db.close()


@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """退出登录"""
    logger.info(f"用户退出: {current_user.get('username')}")
    return {"message": "已退出登录"}


@router.get("/verify")
async def verify(current_user: dict = Depends(get_current_user)):
    """验证token是否有效，返回用户信息"""
    return {
        "valid": True,
        "user": {
            "id": current_user.get("user_id"),
            "username": current_user.get("username"),
            "display_name": current_user.get("display_name"),
            "role": current_user.get("role")
        }
    }


def init_default_admin():
    """初始化默认管理员账户（仅首次启动且无用户时创建）"""
    db = db_session()
    try:
        user_count = db.query(User).count()
        if user_count > 0:
            logger.info(f"已有 {user_count} 个用户，跳过默认管理员创建")
            return
        admin = User(
            username="admin",
            password_hash=User.hash_password("admin123"),
            display_name="管理员",
            role="admin",
            is_active=True
        )
        db.add(admin)
        db.commit()
        logger.info("默认管理员账户已创建 (admin / admin123)")
    except Exception as e:
        logger.error(f"创建默认管理员账户失败: {e}")
        db.rollback()
    finally:
        db.close()
