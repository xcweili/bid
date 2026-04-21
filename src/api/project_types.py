"""项目类型管理 API"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from loguru import logger
from datetime import datetime

from api.middleware import get_current_user_from_request
from models.database import db_session
from models.extended_models import ProjectTypeModel as ProjectType

router = APIRouter(prefix="/api/project-types", tags=["项目类型管理"])


# 请求模型
class CreateProjectTypeRequest(BaseModel):
    type_code: str
    type_name: str
    description: Optional[str] = None
    review_focus: Optional[str] = None
    status: str = "active"


class UpdateProjectTypeRequest(BaseModel):
    type_code: Optional[str] = None
    type_name: Optional[str] = None
    description: Optional[str] = None
    review_focus: Optional[str] = None
    status: Optional[str] = None


@router.get("")
async def get_project_types(request: Request):
    """获取项目类型列表"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        project_types = db.query(ProjectType).all()
        result = []
        for pt in project_types:
            result.append({
                "id": pt.id,
                "type_code": pt.type_code,
                "type_name": pt.type_name,
                "description": pt.description,
                "review_focus": pt.review_focus,
                "status": pt.status,
                "created_at": pt.created_at.isoformat() if pt.created_at else None,
                "updated_at": pt.updated_at.isoformat() if pt.updated_at else None
            })
        return result
    finally:
        db.close()


@router.post("")
async def create_project_type(request: Request, type_req: CreateProjectTypeRequest):
    """创建项目类型"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可创建项目类型")
    
    db = db_session()
    try:
        # 检查 type_code 是否已存在
        existing = db.query(ProjectType).filter(
            ProjectType.type_code == type_req.type_code
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="类型代码已存在")
        
        project_type = ProjectType(
            type_code=type_req.type_code,
            type_name=type_req.type_name,
            description=type_req.description,
            review_focus=type_req.review_focus,
            status=type_req.status,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        db.add(project_type)
        db.commit()
        db.refresh(project_type)
        
        return {
            "message": "项目类型创建成功",
            "id": project_type.id
        }
    finally:
        db.close()


@router.put("/{type_id}")
async def update_project_type(request: Request, type_id: int, type_req: UpdateProjectTypeRequest):
    """更新项目类型"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可更新项目类型")
    
    db = db_session()
    try:
        project_type = db.query(ProjectType).filter(ProjectType.id == type_id).first()
        if not project_type:
            raise HTTPException(status_code=404, detail="项目类型不存在")
        
        # 更新字段
        if type_req.type_code is not None:
            # 检查 type_code 是否被其他类型使用
            existing = db.query(ProjectType).filter(
                ProjectType.type_code == type_req.type_code,
                ProjectType.id != type_id
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail="类型代码已存在")
            project_type.type_code = type_req.type_code
        
        if type_req.type_name is not None:
            project_type.type_name = type_req.type_name
        if type_req.description is not None:
            project_type.description = type_req.description
        if type_req.review_focus is not None:
            project_type.review_focus = type_req.review_focus
        if type_req.status is not None:
            project_type.status = type_req.status
        
        project_type.updated_at = datetime.now()
        
        db.commit()
        return {"message": "项目类型更新成功"}
    finally:
        db.close()


@router.delete("/{type_id}")
async def delete_project_type(request: Request, type_id: int):
    """删除项目类型"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可删除项目类型")
    
    db = db_session()
    try:
        project_type = db.query(ProjectType).filter(ProjectType.id == type_id).first()
        if not project_type:
            raise HTTPException(status_code=404, detail="项目类型不存在")
        
        db.delete(project_type)
        db.commit()
        return {"message": "项目类型已删除"}
    finally:
        db.close()


@router.patch("/{type_id}/toggle-status")
async def toggle_project_type_status(request: Request, type_id: int):
    """切换项目类型状态"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可修改项目类型状态")
    
    db = db_session()
    try:
        project_type = db.query(ProjectType).filter(ProjectType.id == type_id).first()
        if not project_type:
            raise HTTPException(status_code=404, detail="项目类型不存在")
        
        # 切换状态
        project_type.status = "inactive" if project_type.status == "active" else "active"
        project_type.updated_at = datetime.now()
        
        db.commit()
        return {"message": "状态更新成功", "status": project_type.status}
    finally:
        db.close()
