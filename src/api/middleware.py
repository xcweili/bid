"""认证中间件 - 保护 API 路由"""
from functools import wraps
from fastapi import Request, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from services.auth_service import auth_service
from loguru import logger

# HTTP Bearer 认证
security = HTTPBearer(auto_error=False)


def get_current_user_from_request(request: Request):
    """从请求中获取当前用户"""
    # 从 Header 获取 token
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return None
    
    # 解析 Bearer token
    try:
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]  # 去掉 "Bearer " 前缀
        else:
            token = auth_header
    except:
        return None
    
    if not token:
        return None
    
    return auth_service.verify_token(token)


def require_auth(required_roles: list = None):
    """认证装饰器
    
    Args:
        required_roles: 允许的角色列表，None 表示任何已登录用户
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, request: Request = None, **kwargs):
            if not request:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="请求对象缺失"
                )
            
            # 获取当前用户
            user = get_current_user_from_request(request)
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="未授权访问"
                )
            
            # 检查角色权限
            if required_roles and user.role not in required_roles:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"权限不足，需要以下角色之一：{required_roles}"
                )
            
            # 将用户注入到 request.state
            request.state.user = user
            
            return await func(*args, request=request, **kwargs)
        return wrapper
    return decorator


def require_admin(func):
    """管理员权限装饰器"""
    return require_auth(required_roles=["admin"])(func)


def require_team_leader(func):
    """评标组长权限装饰器"""
    return require_auth(required_roles=["team_leader"])(func)


def require_team_manager(func):
    """团队负责人权限装饰器"""
    return require_auth(required_roles=["team_manager", "admin"])(func)


def require_evaluator(func):
    """评审员权限装饰器（包括技术和商务）"""
    return require_auth(required_roles=[
        "technical_evaluator", 
        "business_evaluator",
        "team_manager",
        "admin"
    ])(func)
