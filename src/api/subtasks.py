"""子任务管理 API"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
from loguru import logger
from datetime import datetime
import json

from services.task_dispatch_service import dispatch_service
from api.middleware import get_current_user_from_request, require_evaluator

router = APIRouter(prefix="/api/subtasks", tags=["子任务管理"])


# 请求模型
class CreateSubTaskRequest(BaseModel):
    package_id: int
    evaluator_id: Optional[int] = None
    task_type: str  # technical, business
    mode: str  # by_document, by_criteria
    assigned_documents: Optional[List[str]] = None
    assigned_criteria: Optional[List[str]] = None


class BatchCreateSubTasksRequest(BaseModel):
    package_id: int
    mode: str  # by_document, by_criteria
    evaluator_list: List[dict]  # [{"evaluator_id": int, "task_type": str, "documents/criteria": [...]}]


# ==================== 子任务 CRUD ====================

@router.post("")
async def create_subtask(request: Request, subtask_req: CreateSubTaskRequest):
    """创建子任务"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    from models.database import db_session
    from models.extended_models import SubTask, Package
    
    db = db_session()
    try:
        # 检查包是否存在
        package = db.query(Package).filter(Package.id == subtask_req.package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")
        
        subtask = SubTask(
            package_id=subtask_req.package_id,
            evaluator_id=subtask_req.evaluator_id,
            task_type=subtask_req.task_type,
            mode=subtask_req.mode,
            assigned_documents=json.dumps(subtask_req.assigned_documents) if subtask_req.assigned_documents else None,
            assigned_criteria=json.dumps(subtask_req.assigned_criteria) if subtask_req.assigned_criteria else None,
            status="pending",
            created_at=datetime.now()
        )
        db.add(subtask)
        db.commit()
        db.refresh(subtask)
        
        return {
            "message": "子任务创建成功",
            "subtask": {
                "id": subtask.id,
                "package_id": subtask.package_id,
                "task_type": subtask.task_type,
                "mode": subtask.mode,
                "status": subtask.status
            }
        }
    finally:
        db.close()


@router.post("/batch-create")
async def batch_create_subtasks(request: Request, subtasks_req: BatchCreateSubTasksRequest):
    """批量创建子任务"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role not in ["team_leader", "team_manager", "admin"]:
        raise HTTPException(status_code=403, detail="无权限创建子任务")
    
    try:
        if subtasks_req.mode == "by_document":
            subtasks = dispatch_service.create_subtasks_by_document(
                package_id=subtasks_req.package_id,
                evaluator_list=subtasks_req.evaluator_list,
                mode=subtasks_req.mode
            )
        else:
            subtasks = dispatch_service.create_subtasks_by_criteria(
                package_id=subtasks_req.package_id,
                evaluator_list=subtasks_req.evaluator_list,
                mode=subtasks_req.mode
            )
        
        return {
            "message": f"批量创建成功，共 {len(subtasks)} 个子任务",
            "count": len(subtasks)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/package/{package_id}")
async def get_package_subtasks(request: Request, package_id: int):
    """获取包的所有子任务"""
    from models.database import db_session
    from models.extended_models import SubTask, User
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        subtasks = db.query(SubTask).filter(SubTask.package_id == package_id).all()
        
        result = []
        for st in subtasks:
            evaluator = db.query(User).filter(User.id == st.evaluator_id).first() if st.evaluator_id else None
            result.append({
                "id": st.id,
                "package_id": st.package_id,
                "evaluator_id": st.evaluator_id,
                "evaluator_name": evaluator.real_name if evaluator else None,
                "task_type": st.task_type,
                "mode": st.mode,
                "assigned_documents": json.loads(st.assigned_documents) if st.assigned_documents else None,
                "assigned_criteria": json.loads(st.assigned_criteria) if st.assigned_criteria else None,
                "status": st.status,
                "progress_percent": st.progress_percent,
                "created_at": st.created_at.isoformat() if st.created_at else None,
                "completed_at": st.completed_at.isoformat() if st.completed_at else None
            })
        
        return result
    finally:
        db.close()


@router.get("/my")
async def get_my_tasks(request: Request):
    """获取我的评审任务"""
    from models.database import db_session
    from models.extended_models import SubTask, Package, Project
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        subtasks = db.query(SubTask).filter(SubTask.evaluator_id == current_user.id).all()
        
        result = []
        for st in subtasks:
            package = db.query(Package).filter(Package.id == st.package_id).first()
            project = db.query(Project).filter(Project.id == package.project_id).first() if package else None
            
            result.append({
                "id": st.id,
                "package_id": st.package_id,
                "package_name": package.package_name if package else None,
                "project_id": project.id if project else None,
                "project_name": project.project_name if project else None,
                "task_type": st.task_type,
                "mode": st.mode,
                "assigned_documents": json.loads(st.assigned_documents) if st.assigned_documents else None,
                "assigned_criteria": json.loads(st.assigned_criteria) if st.assigned_criteria else None,
                "status": st.status,
                "progress_percent": st.progress_percent,
                "created_at": st.created_at.isoformat() if st.created_at else None
            })
        
        return result
    finally:
        db.close()


@router.put("/{subtask_id}")
async def update_subtask(request: Request, subtask_id: int, status: str = None, progress_percent: int = None):
    """更新子任务状态"""
    from models.database import db_session
    from models.extended_models import SubTask
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        subtask = db.query(SubTask).filter(SubTask.id == subtask_id).first()
        if not subtask:
            raise HTTPException(status_code=404, detail="子任务不存在")
        
        # 检查权限：只能更新自己的任务
        if subtask.evaluator_id != current_user.id and current_user.role not in ["admin", "team_manager"]:
            raise HTTPException(status_code=403, detail="无权限更新此任务")
        
        if status:
            subtask.status = status
            if status == "in_progress" and not subtask.started_at:
                subtask.started_at = datetime.now()
            elif status == "completed":
                subtask.completed_at = datetime.now()
                subtask.progress_percent = 100
        
        if progress_percent is not None:
            subtask.progress_percent = progress_percent
        
        db.commit()
        return {"message": "子任务更新成功"}
    finally:
        db.close()


@router.get("/{subtask_id}")
async def get_subtask(request: Request, subtask_id: int):
    """获取子任务详情"""
    from models.database import db_session
    from models.extended_models import SubTask, User, Package, CompanyBidNew as CompanyBid
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        subtask = db.query(SubTask).filter(SubTask.id == subtask_id).first()
        if not subtask:
            raise HTTPException(status_code=404, detail="子任务不存在")
        
        evaluator = db.query(User).filter(User.id == subtask.evaluator_id).first() if subtask.evaluator_id else None
        package = db.query(Package).filter(Package.id == subtask.package_id).first()
        
        return {
            "id": subtask.id,
            "package_id": subtask.package_id,
            "package_name": package.package_name if package else None,
            "evaluator_id": subtask.evaluator_id,
            "evaluator_name": evaluator.real_name if evaluator else None,
            "task_type": subtask.task_type,
            "mode": subtask.mode,
            "assigned_documents": json.loads(subtask.assigned_documents) if subtask.assigned_documents else None,
            "assigned_criteria": json.loads(subtask.assigned_criteria) if subtask.assigned_criteria else None,
            "status": subtask.status,
            "progress_percent": subtask.progress_percent,
            "created_at": subtask.created_at.isoformat() if subtask.created_at else None,
            "started_at": subtask.started_at.isoformat() if subtask.started_at else None,
            "completed_at": subtask.completed_at.isoformat() if subtask.completed_at else None
        }
    finally:
        db.close()
