"""任务分配中心辅助 API"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from loguru import logger
from datetime import datetime
import json

from api.middleware import get_current_user_from_request
from models.database import db_session
from models.extended_models import Assignment, Package, EvaluationCriteria, User, CompanyBidNew, TeamMember, Team

router = APIRouter(prefix="/api/assignments", tags=["任务分配中心"])


# ==================== 请求/响应模型 ====================

class PackageDispatchInfoResponse(BaseModel):
    """包分配信息响应"""
    package: Dict[str, Any]
    criteria_list: List[Dict[str, Any]]
    company_list: List[Dict[str, Any]]
    team_members: List[Dict[str, Any]]
    current_assignments: List[Dict[str, Any]]
    stats: Dict[str, Any]


class AssignmentStatsResponse(BaseModel):
    """分配统计响应"""
    total: int
    pending: int
    in_progress: int
    completed: int
    unassigned_resources: int
    evaluator_workloads: List[Dict[str, Any]]


# ==================== API 接口 ====================

@router.get("/package/{package_id}/dispatch-info")
async def get_package_dispatch_info(request: Request, package_id: int):
    """
    获取包的分配信息（用于前端分配面板）
    
    返回：
    - 包的评审项列表
    - 包的公司列表
    - 团队成员列表
    - 当前分配情况
    """
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        # 1. 查询包信息
        package = db.query(Package).filter(Package.id == package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")
        
        # 2. 获取包的评审项列表
        criteria_list = db.query(EvaluationCriteria).filter(
            EvaluationCriteria.package_id == package_id,
            EvaluationCriteria.is_active == True
        ).all()
        
        criteria_data = [{
            "id": c.id,
            "criteria_name": c.criteria_name,
            "criteria_type": c.criteria_type,
            "max_score": c.max_score,
            "weight": c.weight if hasattr(c, 'weight') else 1.0
        } for c in criteria_list]
        
        # 3. 获取项目下的公司列表
        companies = db.query(CompanyBidNew).filter(
            CompanyBidNew.project_id == package.project_id
        ).all()
        
        company_data = [{
            "id": c.id,
            "company_name": c.company_name,
            "status": c.status,
            "assigned_count": db.query(Assignment).filter(
                Assignment.company_id == c.id
            ).count()
        } for c in companies]
        
        # 4. 获取团队成员列表（从当前用户的团队获取）
        team_members = []
        if current_user.team_id:
            members = db.query(TeamMember).filter(
                TeamMember.team_id == current_user.team_id,
                TeamMember.is_active == True
            ).all()
            
            for member in members:
                user = db.query(User).filter(User.id == member.user_id).first()
                if user:
                    # 只返回评审员角色
                    if user.role in ["technical_evaluator", "business_evaluator"]:
                        team_members.append({
                            "id": user.id,
                            "real_name": user.real_name,
                            "role": user.role,
                            "avatar": user.avatar if hasattr(user, 'avatar') else None,
                            "current_workload": db.query(Assignment).filter(
                                Assignment.evaluator_id == user.id,
                                Assignment.status.in_(["pending", "in_progress"])
                            ).count()
                        })
        
        # 5. 获取当前分配情况
        assignments = db.query(Assignment).filter(
            Assignment.package_id == package_id
        ).all()
        
        assignment_data = []
        for a in assignments:
            evaluator = db.query(User).filter(User.id == a.evaluator_id).first()
            company = db.query(CompanyBidNew).filter(
                CompanyBidNew.id == a.company_id
            ).first() if a.company_id else None
            
            # 解析评审项 IDs
            criteria_ids = []
            if a.assigned_criteria_ids:
                try:
                    criteria_ids = json.loads(a.assigned_criteria_ids)
                except:
                    pass
            
            assignment_data.append({
                "id": a.id,
                "package_id": a.package_id,
                "company_id": a.company_id,
                "company_name": company.company_name if company else None,
                "evaluator_id": a.evaluator_id,
                "evaluator_name": evaluator.real_name if evaluator else "未知",
                "assignment_type": a.assignment_type,
                "dispatch_mode": a.dispatch_mode,
                "assigned_criteria_ids": criteria_ids,
                "status": a.status,
                "progress_percent": a.progress_percent,
                "created_at": a.created_at.isoformat() if a.created_at else None
            })
        
        # 6. 计算统计信息
        stats = {
            "total": len(assignments),
            "pending": db.query(Assignment).filter(
                Assignment.package_id == package_id,
                Assignment.status == "pending"
            ).count(),
            "in_progress": db.query(Assignment).filter(
                Assignment.package_id == package_id,
                Assignment.status == "in_progress"
            ).count(),
            "completed": db.query(Assignment).filter(
                Assignment.package_id == package_id,
                Assignment.status == "completed"
            ).count(),
            "unassigned_resources": len(company_data) - len(set(
                a.company_id for a in assignments if a.company_id
            )),
            "evaluator_workloads": [
                {
                    "evaluator_id": a.evaluator_id,
                    "evaluator_name": a.evaluator_name,
                    "assigned_count": len([
                        x for x in assignment_data 
                        if x["evaluator_id"] == a.evaluator_id
                    ])
                }
                for a in assignment_data
            ]
        }
        
        return {
            "package": {
                "id": package.id,
                "package_name": package.package_name,
                "project_id": package.project_id,
                "status": package.status,
                "dispatch_mode": package.dispatch_mode
            },
            "criteria_list": criteria_data,
            "company_list": company_data,
            "team_members": team_members,
            "current_assignments": assignment_data,
            "stats": stats
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取包分配信息失败：{e}")
        raise HTTPException(status_code=500, detail=f"服务器错误：{str(e)}")
    finally:
        db.close()


@router.post("/clear/{package_id}")
async def clear_package_assignments(request: Request, package_id: int):
    """
    清空包的所有分配（用于重新分配）
    
    权限：团队组长/管理员
    """
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    # 验证权限
    if current_user.role not in ["team_leader", "admin"]:
        raise HTTPException(status_code=403, detail="仅评标组长可清空分配")
    
    db = db_session()
    try:
        # 检查包是否存在
        package = db.query(Package).filter(Package.id == package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")
        
        # 删除所有分配记录
        count = db.query(Assignment).filter(
            Assignment.package_id == package_id
        ).delete()
        
        db.commit()
        
        logger.info(f"用户 {current_user.id} 清空了包 {package_id} 的 {count} 条分配记录")
        
        return {
            "message": f"清空成功，共删除 {count} 条分配记录",
            "deleted_count": count
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"清空分配失败：{e}")
        raise HTTPException(status_code=500, detail=f"服务器错误：{str(e)}")
    finally:
        db.close()


@router.get("/stats/package/{package_id}")
async def get_assignment_stats(request: Request, package_id: int):
    """
    获取包的分配统计
    
    返回：
    - 总分配数
    - 待处理数
    - 进行中数
    - 已完成数
    - 各评估员工作负载
    """
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        # 检查包是否存在
        package = db.query(Package).filter(Package.id == package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")
        
        # 获取所有分配
        assignments = db.query(Assignment).filter(
            Assignment.package_id == package_id
        ).all()
        
        # 统计各状态数量
        total = len(assignments)
        pending = db.query(Assignment).filter(
            Assignment.package_id == package_id,
            Assignment.status == "pending"
        ).count()
        in_progress = db.query(Assignment).filter(
            Assignment.package_id == package_id,
            Assignment.status == "in_progress"
        ).count()
        completed = db.query(Assignment).filter(
            Assignment.package_id == package_id,
            Assignment.status == "completed"
        ).count()
        
        # 获取未分配的公司数量
        companies = db.query(CompanyBidNew).filter(
            CompanyBidNew.project_id == package.project_id
        ).all()
        
        assigned_company_ids = set(
            a.company_id for a in assignments if a.company_id
        )
        unassigned_count = len(companies) - len(assigned_company_ids)
        
        # 获取各评估员工作负载
        evaluator_workloads = []
        evaluator_ids = set(a.evaluator_id for a in assignments)
        
        for evaluator_id in evaluator_ids:
            evaluator = db.query(User).filter(User.id == evaluator_id).first()
            if evaluator:
                workload = db.query(Assignment).filter(
                    Assignment.evaluator_id == evaluator_id,
                    Assignment.package_id == package_id,
                    Assignment.status.in_(["pending", "in_progress"])
                ).count()
                
                evaluator_workloads.append({
                    "evaluator_id": evaluator_id,
                    "evaluator_name": evaluator.real_name,
                    "assigned_count": workload
                })
        
        return {
            "package_id": package_id,
            "package_name": package.package_name,
            "total": total,
            "pending": pending,
            "in_progress": in_progress,
            "completed": completed,
            "unassigned_resources": unassigned_count,
            "evaluator_workloads": evaluator_workloads
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取分配统计失败：{e}")
        raise HTTPException(status_code=500, detail=f"服务器错误：{str(e)}")
    finally:
        db.close()


@router.delete("/{assignment_id}")
async def delete_assignment(request: Request, assignment_id: int):
    """
    删除任务分配
    
    权限：团队组长/管理员
    """
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    # 验证权限
    if current_user.role not in ["team_leader", "admin"]:
        raise HTTPException(status_code=403, detail="仅评标组长可删除分配")
    
    db = db_session()
    try:
        assignment = db.query(Assignment).filter(
            Assignment.id == assignment_id
        ).first()
        
        if not assignment:
            raise HTTPException(status_code=404, detail="分配记录不存在")
        
        db.delete(assignment)
        db.commit()
        
        logger.info(f"用户 {current_user.id} 删除了分配记录 {assignment_id}")
        
        return {"message": "删除成功"}
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"删除分配失败：{e}")
        raise HTTPException(status_code=500, detail=f"服务器错误：{str(e)}")
    finally:
        db.close()
