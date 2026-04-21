"""认证 API 路由"""
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Optional
from loguru import logger

from services.auth_service import auth_service, init_default_users
from api.middleware import get_current_user_from_request

router = APIRouter(prefix="/api/auth", tags=["认证"])


# 请求模型
class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    real_name: str
    role: Optional[str] = "technical_evaluator"
    team_id: Optional[int] = None
    phone: Optional[str] = None
    email: Optional[str] = None


@router.post("/login")
async def login(request: LoginRequest):
    """用户登录"""
    result = auth_service.login(request.username, request.password)
    if not result:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    return result


@router.post("/register")
async def register(request: RegisterRequest):
    """用户注册"""
    user = auth_service.register_user(
        username=request.username,
        password=request.password,
        real_name=request.real_name,
        role=request.role,
        team_id=request.team_id,
        phone=request.phone,
        email=request.email
    )
    if not user:
        raise HTTPException(status_code=400, detail="用户名已存在或注册失败")
    return {
        "message": "注册成功",
        "user": {
            "id": user.id,
            "username": user.username,
            "real_name": user.real_name,
            "role": user.role
        }
    }


@router.post("/logout")
async def logout(request: Request):
    """用户登出"""
    user = get_current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="未授权")
    
    # 从 Header 获取 token
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token 缺失")
    
    token = auth_header.split(" ")[1]
    success = auth_service.logout(token)
    
    if not success:
        raise HTTPException(status_code=400, detail="登出失败")
    
    return {"message": "登出成功"}


@router.get("/me")
async def get_current_user(request: Request):
    """获取当前用户信息"""
    user = get_current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="未授权")
    
    return auth_service.get_current_user(user.token if hasattr(user, 'token') else "")


@router.get("/verify")
async def verify_token(request: Request):
    """验证 Token 有效性"""
    user = get_current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="Token 无效或已过期")
    
    return {
        "valid": True,
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role
        }
    }


@router.post("/init-default-users")
async def init_default():
    """初始化默认用户（仅用于首次部署）"""
    try:
        init_default_users()
        return {"message": "默认用户初始化完成"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"初始化失败：{str(e)}")
