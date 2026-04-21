"""评审执行 API"""
from fastapi import APIRouter, HTTPException, Request, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from loguru import logger

from services.evaluation_service import evaluation_service
from services.summary_service import summary_service
from api.middleware import get_current_user_from_request

router = APIRouter(prefix="/api/evaluate", tags=["评审执行"])


# 请求模型
class StartEvaluationRequest(BaseModel):
    assignment_id: int


class SummarizePackageRequest(BaseModel):
    package_id: int


@router.post("/start")
async def start_evaluation(request: Request, eval_req: StartEvaluationRequest, background_tasks: BackgroundTasks):
    """开始评审任务
    
    支持两种模式：
    - by_package: 按包评审（模式 A）
    - by_criteria: 按评审项评审（模式 B）
    """
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    try:
        # 检查权限 - 支持 Assignment 和 SubTask 两种模型
        from models.database import db_session
        from models.extended_models import Assignment, SubTask
        
        db = db_session()
        try:
            # 先尝试查找 Assignment
            assignment = db.query(Assignment).filter(Assignment.id == eval_req.assignment_id).first()
            if assignment:
                # Assignment 模型
                if assignment.evaluator_id != current_user.id and current_user.role not in ["admin", "team_leader", "team_manager"]:
                    raise HTTPException(status_code=403, detail="无权限执行此任务")
            else:
                # 尝试查找 SubTask
                subtask = db.query(SubTask).filter(SubTask.id == eval_req.assignment_id).first()
                if not subtask:
                    raise HTTPException(status_code=404, detail="任务不存在")
                
                # SubTask 模型 - 检查是否是自己的任务或管理员
                if subtask.evaluator_id != current_user.id and current_user.role not in ["admin", "team_leader", "team_manager"]:
                    raise HTTPException(status_code=403, detail="无权限执行此任务")
        finally:
            db.close()
        
        # 异步执行评审
        background_tasks.add_task(evaluation_service.start_evaluation, eval_req.assignment_id)
        
        return {
            "message": "评审任务已启动",
            "assignment_id": eval_req.assignment_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"启动评审失败：{e}")
        raise HTTPException(status_code=500, detail="启动评审失败")


@router.post("/stop")
async def stop_evaluation(request: Request, eval_req: StartEvaluationRequest):
    """停止评审任务"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    try:
        # 检查权限 - 支持 Assignment 和 SubTask 两种模型
        from models.database import db_session
        from models.extended_models import Assignment, SubTask
        
        db = db_session()
        try:
            # 先尝试查找 Assignment
            assignment = db.query(Assignment).filter(Assignment.id == eval_req.assignment_id).first()
            if assignment:
                # Assignment 模型
                if assignment.evaluator_id != current_user.id and current_user.role not in ["admin", "team_leader", "team_manager"]:
                    raise HTTPException(status_code=403, detail="无权限执行此任务")
                
                # 检查任务是否正在运行
                if assignment.status != "in_progress":
                    raise HTTPException(status_code=400, detail="任务当前未运行")
                
                # 调用服务停止评审
                evaluation_service.stop_evaluation(eval_req.assignment_id)
                
                return {
                    "message": "评审任务已停止",
                    "assignment_id": eval_req.assignment_id
                }
            else:
                # 尝试查找 SubTask
                subtask = db.query(SubTask).filter(SubTask.id == eval_req.assignment_id).first()
                if not subtask:
                    raise HTTPException(status_code=404, detail="任务不存在")
                
                # SubTask 模型 - 检查是否是自己的任务或管理员
                if subtask.evaluator_id != current_user.id and current_user.role not in ["admin", "team_leader", "team_manager"]:
                    raise HTTPException(status_code=403, detail="无权限执行此任务")
                
                # 检查任务是否正在运行
                if subtask.status != "in_progress":
                    raise HTTPException(status_code=400, detail="任务当前未运行")
                
                # 调用服务停止评审
                evaluation_service.stop_evaluation(eval_req.assignment_id)
                
                return {
                    "message": "评审任务已停止",
                    "subtask_id": eval_req.assignment_id
                }
        finally:
            db.close()
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"停止评审失败：{e}")
        raise HTTPException(status_code=500, detail="停止评审失败")


@router.post("/summarize-package")
async def summarize_package(request: Request, summary_req: SummarizePackageRequest):
    """汇总包的评审结果（模式 B 专用）"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    # 团队小组长、评标组长、管理员可以汇总
    if current_user.role not in ["team_manager", "team_leader", "admin"]:
        raise HTTPException(status_code=403, detail="无权限汇总结果")
    
    try:
        result = summary_service.summarize_package(summary_req.package_id)
        return result
        
    except Exception as e:
        logger.error(f"汇总失败：{e}")
        raise HTTPException(status_code=500, detail=f"汇总失败：{str(e)}")


@router.get("/package/{package_id}/readiness")
async def check_package_readiness(request: Request, package_id: int):
    """检查包的评审完成度"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    try:
        result = summary_service.check_package_readiness(package_id)
        return result
        
    except Exception as e:
        logger.error(f"检查完成度失败：{e}")
        raise HTTPException(status_code=500, detail="检查失败")


@router.get("/assignment/{assignment_id}/result")
async def get_assignment_result(request: Request, assignment_id: int):
    """获取任务评审结果"""
    from models.database import db_session
    from models.extended_models import EvaluationResultNew as EvaluationResult, Assignment
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        # 检查权限
        assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
        if not assignment:
            raise HTTPException(status_code=404, detail="任务不存在")
        
        if assignment.evaluator_id != current_user.id and current_user.role not in ["admin", "team_leader", "team_manager"]:
            raise HTTPException(status_code=403, detail="无权限查看")
        
        # 获取评审结果
        results = db.query(EvaluationResult).filter(
            EvaluationResult.assignment_id == assignment_id
        ).all()
        
        return [{
            "id": r.id,
            "package_id": r.package_id,
            "company_id": r.company_id,
            "criteria_id": r.criteria_id,
            "criteria_type": r.criteria_type,
            "score": r.score,
            "max_score": r.max_score,
            "reason": r.reason,
            "evidence": r.evidence,
            "created_at": r.created_at.isoformat() if r.created_at else None
        } for r in results]
        
    finally:
        db.close()
