"""用户与团队管理 API"""
from fastapi import APIRouter, HTTPException, Depends, Request, Body
from pydantic import BaseModel
from typing import List, Optional
from loguru import logger

from services.auth_service import auth_service
from api.middleware import get_current_user_from_request, require_admin, require_team_leader

router = APIRouter(prefix="/api", tags=["用户与团队管理"])


# 请求模型
class CreateUserRequest(BaseModel):
    username: str
    password: str
    real_name: str
    role: str
    team_id: Optional[int] = None
    phone: Optional[str] = None
    email: Optional[str] = None


class UpdateUserRequest(BaseModel):
    real_name: Optional[str] = None
    role: Optional[str] = None
    team_id: Optional[int] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None


class BatchDisableUsersRequest(BaseModel):
    user_ids: List[int]


@router.get("/users")
async def get_users(request: Request):
    """获取用户列表"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    from models.database import db_session
    from models.extended_models import User
    
    db = db_session()
    try:
        users = db.query(User).all()
        result = []
        for u in users:
            result.append({
                "id": u.id,
                "username": u.username,
                "real_name": u.real_name,
                "role": u.role,
                "phone": u.phone,
                "email": u.email,
                "is_active": u.is_active,
                "created_at": u.created_at.isoformat() if u.created_at else None
            })
        return result
    finally:
        db.close()


@router.post("/users")
async def create_user(request: Request, user_req: CreateUserRequest):
    """创建用户"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可创建用户")
    
    db = db_session()
    try:
        # 检查用户名是否已存在
        existing = db.query(User).filter(User.username == user_req.username).first()
        if existing:
            raise HTTPException(status_code=400, detail="用户名已存在")
        
        user = User(
            username=user_req.username,
            password=auth_service.hash_password(user_req.password),
            real_name=user_req.real_name,
            role=user_req.role,
            team_id=user_req.team_id,
            phone=user_req.phone,
            email=user_req.email,
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
        return {
            "message": "用户创建成功",
            "user_id": user.id
        }
    finally:
        db.close()


@router.put("/users/{user_id}")
async def update_user(request: Request, user_id: int, user_req: UpdateUserRequest):
    """更新用户"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可更新用户")
    
    db = db_session()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")
        
        if user_req.real_name:
            user.real_name = user_req.real_name
        if user_req.role:
            user.role = user_req.role
        if user_req.team_id is not None:
            user.team_id = user_req.team_id
        if user_req.phone is not None:
            user.phone = user_req.phone
        if user_req.email is not None:
            user.email = user_req.email
        if user_req.is_active is not None:
            user.is_active = user_req.is_active
        
        db.commit()
        return {"message": "用户更新成功"}
    finally:
        db.close()


@router.delete("/users/{user_id}")
async def delete_user(request: Request, user_id: int):
    """删除用户（软删除）"""
    current_user = get_current_user_from_request(request)
    if not current_user or current_user.role != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可删除用户")
    
    from models.database import db_session
    from models.extended_models import User
    
    db = db_session()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")
        
        user.is_active = False
        db.commit()
        return {"message": "用户已禁用"}
    finally:
        db.close()


@router.post("/users/batch-disable")
async def batch_delete_users(request: Request, user_req: BatchDisableUsersRequest):
    """批量禁用用户（软删除）"""
    current_user = get_current_user_from_request(request)
    if not current_user or current_user.role != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可删除用户")
    
    from models.database import db_session
    from models.extended_models import User
    
    db = db_session()
    try:
        deleted_count = 0
        for user_id in user_req.user_ids:
            user = db.query(User).filter(User.id == user_id).first()
            if user and user.id != current_user.id:  # 不能禁用自己
                user.is_active = False
                deleted_count += 1
        
        db.commit()
        return {"message": f"已禁用 {deleted_count} 个用户"}
    finally:
        db.close()
