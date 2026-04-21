"""任务分配 API"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from loguru import logger
from datetime import datetime
import json

from api.middleware import get_current_user_from_request
from models.database import db_session
from models.extended_models import Assignment, Package, EvaluationCriteria, User

router = APIRouter(prefix="/api/assignments", tags=["任务分配"])


# 请求模型
class AssignByPackageRequest(BaseModel):
    package_ids: List[int]
    evaluator_id: int


class AssignByCriteriaRequest(BaseModel):
    package_id: int
    criteria_ids: List[int]
    evaluator_id: int


class BatchAssignRequest(BaseModel):
    assignments: List[dict]  # [{"package_id": int, "evaluator_id": int, "criteria_ids": Optional[List[int]]}]


class AssignByCompanyRequest(BaseModel):
    package_id: int
    company_id: int
    evaluator_id: int


class AssignmentItem(BaseModel):
    package_id: int
    company_id: Optional[int] = None
    evaluator_id: int
    assignment_type: str  # by_package/by_company/by_criteria
    assigned_criteria_ids: Optional[List[int]] = None


class BatchAssignRequestV2(BaseModel):
    assignments: List[AssignmentItem]


@router.get("/package/{package_id}")
async def get_package_assignments(request: Request, package_id: int):
    """获取包的所有任务分配"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        assignments = db.query(Assignment).filter(
            Assignment.package_id == package_id
        ).all()
        
        result = []
        for a in assignments:
            result.append({
                "id": a.id,
                "package_id": a.package_id,
                "team_leader_id": a.team_leader_id,
                "evaluator_id": a.evaluator_id,
                "assignment_type": a.assignment_type,
                "assigned_criteria_ids": json.loads(a.assigned_criteria_ids) if a.assigned_criteria_ids else None,
                "status": a.status,
                "progress_percent": a.progress_percent,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "completed_at": a.completed_at.isoformat() if a.completed_at else None
            })
        
        return result
    finally:
        db.close()


@router.get("/my")
async def get_my_assignments(request: Request):
    """获取我的任务分配"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        assignments = db.query(Assignment).filter(
            Assignment.evaluator_id == current_user.id
        ).all()
        
        result = []
        for a in assignments:
            result.append({
                "id": a.id,
                "package_id": a.package_id,
                "assignment_type": a.assignment_type,
                "assigned_criteria_ids": json.loads(a.assigned_criteria_ids) if a.assigned_criteria_ids else None,
                "status": a.status,
                "progress_percent": a.progress_percent,
                "created_at": a.created_at.isoformat() if a.created_at else None
            })
        
        return result
    finally:
        db.close()


@router.post("/assign-by-package")
async def assign_by_package(request: Request, assign_req: AssignByPackageRequest):
    """按包分配任务"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    # 团队小组长、评标组长、管理员可以分配
    if current_user.role not in ["team_manager", "team_leader", "admin"]:
        raise HTTPException(status_code=403, detail="无权限分配任务")
    
    db = db_session()
    try:
        created = []
        for package_id in assign_req.package_ids:
            # 检查包是否存在
            package = db.query(Package).filter(Package.id == package_id).first()
            if not package:
                logger.warning(f"包不存在：{package_id}")
                continue
            
            assignment = Assignment(
                package_id=package_id,
                team_leader_id=current_user.id,
                evaluator_id=assign_req.evaluator_id,
                assignment_type="by_package",
                assigned_criteria_ids=None,
                status="pending",
                created_at=datetime.now()
            )
            db.add(assignment)
            created.append(package_id)
        
        db.commit()
        
        return {
            "message": f"按包分配成功，共 {len(created)} 个包",
            "package_ids": created
        }
    finally:
        db.close()


@router.post("/assign-by-criteria")
async def assign_by_criteria(request: Request, assign_req: AssignByCriteriaRequest):
    """按评审项分配任务"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role not in ["team_manager", "team_leader", "admin"]:
        raise HTTPException(status_code=403, detail="无权限分配任务")
    
    db = db_session()
    try:
        # 检查包是否存在
        package = db.query(Package).filter(Package.id == assign_req.package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")
        
        # 检查评审项是否存在
        criteria_ids = assign_req.criteria_ids
        criteria_count = db.query(EvaluationCriteria).filter(
            EvaluationCriteria.id.in_(criteria_ids),
            EvaluationCriteria.package_id == assign_req.package_id
        ).count()
        
        if criteria_count != len(criteria_ids):
            raise HTTPException(status_code=400, detail="部分评审项不存在")
        
        assignment = Assignment(
            package_id=assign_req.package_id,
            team_leader_id=current_user.id,
            evaluator_id=assign_req.evaluator_id,
            assignment_type="by_criteria",
            assigned_criteria_ids=json.dumps(criteria_ids),
            status="pending",
            created_at=datetime.now()
        )
        db.add(assignment)
        db.commit()
        db.refresh(assignment)
        
        return {
            "message": "按评审项分配成功",
            "assignment": {
                "id": assignment.id,
                "package_id": assignment.package_id,
                "criteria_ids": criteria_ids
            }
        }
    finally:
        db.close()


@router.post("/batch-assign")
async def batch_assign(request: Request, batch_req: BatchAssignRequest):
    """批量分配任务"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role not in ["team_manager", "team_leader", "admin"]:
        raise HTTPException(status_code=403, detail="无权限分配任务")
    
    db = db_session()
    try:
        created_count = 0
        for assign_data in batch_req.assignments:
            package_id = assign_data.get("package_id")
            evaluator_id = assign_data.get("evaluator_id")
            criteria_ids = assign_data.get("criteria_ids")
            
            if not package_id or not evaluator_id:
                continue
            
            # 判断分配类型
            if criteria_ids and len(criteria_ids) > 0:
                assignment_type = "by_criteria"
                assigned_criteria_ids = json.dumps(criteria_ids)
            else:
                assignment_type = "by_package"
                assigned_criteria_ids = None
            
            assignment = Assignment(
                package_id=package_id,
                team_leader_id=current_user.id,
                evaluator_id=evaluator_id,
                assignment_type=assignment_type,
                assigned_criteria_ids=assigned_criteria_ids,
                status="pending",
                created_at=datetime.now()
            )
            db.add(assignment)
            created_count += 1
        
        db.commit()
        
        return {
            "message": f"批量分配成功，共 {created_count} 个任务",
            "count": created_count
        }
    finally:
        db.close()


@router.post("/assign-by-company")
async def assign_by_company(request: Request, req: AssignByCompanyRequest):
    """按公司分配任务"""
    from models.extended_models import CompanyBidNew
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    # 只有 team_leader 可以分配
    if current_user.role not in ["team_leader", "admin"]:
        raise HTTPException(status_code=403, detail="仅评标组长可分配任务")
    
    db = db_session()
    try:
        # 检查公司和包是否存在
        company = db.query(CompanyBidNew).filter(CompanyBidNew.id == req.company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail="公司不存在")
        
        package = db.query(Package).filter(Package.id == req.package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")
        
        # 检查评估员是否存在
        evaluator = db.query(User).filter(User.id == req.evaluator_id).first()
        if not evaluator:
            raise HTTPException(status_code=404, detail="评估员不存在")
        
        # 检查是否已存在相同分配
        existing = db.query(Assignment).filter(
            Assignment.package_id == req.package_id,
            Assignment.company_id == req.company_id,
            Assignment.evaluator_id == req.evaluator_id
        ).first()
        
        if existing:
            raise HTTPException(status_code=400, detail="该分配已存在")
        
        # 创建分配
        assignment = Assignment(
            package_id=req.package_id,
            company_id=req.company_id,
            evaluator_id=req.evaluator_id,
            team_leader_id=current_user.id,
            assignment_type="by_company",
            status="pending",
            progress_percent=0,
            created_at=datetime.now()
        )
        db.add(assignment)
        db.commit()
        db.refresh(assignment)
        
        return {
            "message": "分配成功",
            "assignment": {
                "id": assignment.id,
                "package_id": assignment.package_id,
                "company_id": assignment.company_id,
                "company_name": company.company_name,
                "evaluator_id": assignment.evaluator_id,
                "evaluator_name": evaluator.real_name,
                "assignment_type": assignment.assignment_type,
                "status": assignment.status
            }
        }
    finally:
        db.close()


@router.post("/batch-assign-v2")
async def batch_assign_v2(request: Request, req: BatchAssignRequestV2):
    """批量分配（支持混合模式）"""
    from models.extended_models import CompanyBidNew, User
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role not in ["team_leader", "admin"]:
        raise HTTPException(status_code=403, detail="仅评标组长可分配任务")
    
    db = db_session()
    try:
        created_assignments = []
        errors = []
        
        for item in req.assignments:
            try:
                # 验证基础数据
                package = db.query(Package).filter(Package.id == item.package_id).first()
                if not package:
                    errors.append({"item": {"package_id": item.package_id, "evaluator_id": item.evaluator_id}, "error": "包不存在"})
                    continue
                
                evaluator = db.query(User).filter(User.id == item.evaluator_id).first()
                if not evaluator:
                    errors.append({"item": {"package_id": item.package_id, "evaluator_id": item.evaluator_id}, "error": "评估员不存在"})
                    continue
                
                company = None
                if item.company_id:
                    company = db.query(CompanyBidNew).filter(CompanyBidNew.id == item.company_id).first()
                    if not company:
                        errors.append({"item": {"package_id": item.package_id, "company_id": item.company_id}, "error": "公司不存在"})
                        continue
                
                # 检查是否已存在
                existing = db.query(Assignment).filter(
                    Assignment.package_id == item.package_id,
                    Assignment.company_id == item.company_id,
                    Assignment.evaluator_id == item.evaluator_id
                ).first()
                
                if existing:
                    errors.append({"item": {"package_id": item.package_id, "company_id": item.company_id, "evaluator_id": item.evaluator_id}, "error": "分配已存在"})
                    continue
                
                # 创建分配
                assignment = Assignment(
                    package_id=item.package_id,
                    company_id=item.company_id,
                    evaluator_id=item.evaluator_id,
                    team_leader_id=current_user.id,
                    assignment_type=item.assignment_type,
                    assigned_criteria_ids=json.dumps(item.assigned_criteria_ids) if item.assigned_criteria_ids else None,
                    status="pending",
                    progress_percent=0,
                    created_at=datetime.now()
                )
                db.add(assignment)
                created_assignments.append(assignment)
                
            except Exception as e:
                errors.append({"item": {"package_id": item.package_id, "evaluator_id": item.evaluator_id}, "error": str(e)})
        
        db.commit()
        
        # 刷新创建的数据
        for assignment in created_assignments:
            db.refresh(assignment)
        
        return {
            "message": f"成功创建 {len(created_assignments)} 个分配",
            "created_count": len(created_assignments),
            "error_count": len(errors),
            "assignments": [
                {
                    "id": a.id,
                    "package_id": a.package_id,
                    "company_id": a.company_id,
                    "evaluator_id": a.evaluator_id,
                    "assignment_type": a.assignment_type,
                    "status": a.status
                }
                for a in created_assignments
            ],
            "errors": errors
        }
    finally:
        db.close()


@router.get("/teams/{team_id}/available-experts")
async def get_available_experts(request: Request, team_id: int):
    """获取团队可用专家列表"""
    from models.extended_models import Team, TeamMember, User, Assignment
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        # 检查团队是否存在
        team = db.query(Team).filter(Team.id == team_id).first()
        if not team:
            raise HTTPException(status_code=404, detail="团队不存在")
        
        # 获取团队成员
        members = db.query(TeamMember).filter(
            TeamMember.team_id == team_id,
            TeamMember.is_active == True
        ).all()
        
        expert_list = []
        for member in members:
            user = db.query(User).filter(User.id == member.user_id).first()
            if not user:
                continue
            
            # 只返回评审员角色
            if user.role not in ["technical_evaluator", "business_evaluator"]:
                continue
            
            # 计算当前任务数
            task_count = db.query(Assignment).filter(
                Assignment.evaluator_id == user.id,
                Assignment.status.in_(["pending", "in_progress"])
            ).count()
            
            expert_list.append({
                "id": user.id,
                "real_name": user.real_name,
                "role": user.role,
                "current_task_count": task_count
            })
        
        return expert_list
    finally:
        db.close()


@router.get("/package/{package_id}/dispatch-info")
async def get_package_dispatch_info(request: Request, package_id: int):
    """
    获取包的所有分配相关信息
    
    返回：
    - package 信息
    - criteria_list: 包的评审项列表
    - company_list: 项目下的公司列表
    - team_members: 团队成员列表
    - current_assignments: 当前分配情况
    - stats: 统计信息
    """
    from models.extended_models import Package, EvaluationCriteria, CompanyBidNew, TeamMember, Team, User, Assignment
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        # 1. 查询包信息
        package = db.query(Package).filter(Package.id == package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")
        
        # 2. 获取评审项列表
        criteria_list = db.query(EvaluationCriteria).filter(
            EvaluationCriteria.package_id == package_id,
            EvaluationCriteria.is_active == True
        ).all()
        
        # 3. 获取公司列表（项目下的所有公司）
        company_list = db.query(CompanyBidNew).filter(
            CompanyBidNew.project_id == package.project_id
        ).all()
        
        # 4. 获取团队成员（从项目关联的团队）
        team_members = []
        if package.assigned_team_id:
            members = db.query(TeamMember).filter(
                TeamMember.team_id == package.assigned_team_id,
                TeamMember.is_active == True
            ).all()
            
            for member in members:
                user = db.query(User).filter(User.id == member.user_id).first()
                if user and user.role in ["technical_evaluator", "business_evaluator"]:
                    # 计算当前工作负载
                    workload = db.query(Assignment).filter(
                        Assignment.evaluator_id == user.id,
                        Assignment.status.in_(["pending", "in_progress"])
                    ).count()
                    
                    team_members.append({
                        "id": user.id,
                        "real_name": user.real_name,
                        "role": user.role,
                        "current_workload": workload
                    })
        
        # 5. 获取当前分配情况
        current_assignments = db.query(Assignment).filter(
            Assignment.package_id == package_id
        ).all()
        
        # 6. 计算统计信息
        stats = {
            "total_criteria": len(criteria_list),
            "total_companies": len(company_list),
            "total_members": len(team_members),
            "total_assignments": len(current_assignments),
            "pending_count": sum(1 for a in current_assignments if a.status == "pending"),
            "in_progress_count": sum(1 for a in current_assignments if a.status == "in_progress"),
            "completed_count": sum(1 for a in current_assignments if a.status == "completed"),
        }
        
        return {
            "package": {
                "id": package.id,
                "package_name": package.package_name,
                "project_id": package.project_id,
                "status": package.status,
                "dispatch_mode": package.dispatch_mode
            },
            "criteria_list": [
                {
                    "id": c.id,
                    "criteria_name": c.criteria_name,
                    "criteria_type": c.criteria_type,
                    "max_score": c.max_score,
                    "scoring_criteria": c.scoring_criteria
                }
                for c in criteria_list
            ],
            "company_list": [
                {
                    "id": c.id,
                    "company_name": c.company_name,
                    "status": c.status,
                    "assigned_count": 0
                }
                for c in company_list
            ],
            "team_members": team_members,
            "current_assignments": [
                {
                    "id": a.id,
                    "evaluator_id": a.evaluator_id,
                    "assignment_type": a.assignment_type,
                    "assigned_criteria_ids": json.loads(a.assigned_criteria_ids) if a.assigned_criteria_ids else [],
                    "status": a.status
                }
                for a in current_assignments
            ],
            "stats": stats
        }
    finally:
        db.close()


@router.post("/assignments/clear/{package_id}")
async def clear_package_assignments(request: Request, package_id: int):
    """清空包的所有分配"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role not in ["team_leader", "admin"]:
        raise HTTPException(status_code=403, detail="仅评标组长可清空分配")
    
    db = db_session()
    try:
        # 检查包是否存在
        package = db.query(Package).filter(Package.id == package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")
        
        # 删除所有分配记录
        deleted_count = db.query(Assignment).filter(
            Assignment.package_id == package_id
        ).delete()
        
        db.commit()
        
        return {
            "message": f"清空成功，已删除 {deleted_count} 条分配记录",
            "deleted_count": deleted_count
        }
    finally:
        db.close()


@router.get("/assignments/stats/package/{package_id}")
async def get_assignment_stats(request: Request, package_id: int):
    """获取包的分配统计"""
    from sqlalchemy import func
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        package = db.query(Package).filter(Package.id == package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")
        
        # 统计各状态数量
        stats = db.query(
            Assignment.status,
            func.count(Assignment.id).label("count")
        ).filter(
            Assignment.package_id == package_id
        ).group_by(Assignment.status).all()
        
        result = {
            "total": 0,
            "pending": 0,
            "in_progress": 0,
            "completed": 0
        }
        
        for status, count in stats:
            result[status] = count
            result["total"] += count
        
        # 计算各评估员工作负载
        workload_stats = db.query(
            Assignment.evaluator_id,
            func.count(Assignment.id).label("task_count")
        ).filter(
            Assignment.package_id == package_id,
            Assignment.status.in_(["pending", "in_progress"])
        ).group_by(Assignment.evaluator_id).all()
        
        evaluator_workloads = []
        for evaluator_id, task_count in workload_stats:
            evaluator = db.query(User).filter(User.id == evaluator_id).first()
            evaluator_workloads.append({
                "evaluator_id": evaluator_id,
                "evaluator_name": evaluator.real_name if evaluator else "未知",
                "assigned_count": task_count
            })
        
        result["evaluator_workloads"] = evaluator_workloads
        
        return result
    finally:
        db.close()


@router.get("/assignments/package/{package_id}/full-view")
async def get_package_full_view(request: Request, package_id: int):
    """获取包的完整分配视图"""
    from models.extended_models import CompanyBidNew, Assignment, User
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        package = db.query(Package).filter(Package.id == package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")
        
        # 获取包下的所有公司
        companies = db.query(CompanyBidNew).filter(
            CompanyBidNew.project_id == package.project_id
        ).all()
        
        company_list = []
        for company in companies:
            # 获取该公司的所有分配
            assignments = db.query(Assignment).filter(
                Assignment.company_id == company.id
            ).all()
            
            assignment_list = []
            for assignment in assignments:
                evaluator = db.query(User).filter(User.id == assignment.evaluator_id).first()
                
                # 解析评审项 IDs
                criteria_ids = []
                if assignment.assigned_criteria_ids:
                    try:
                        criteria_ids = json.loads(assignment.assigned_criteria_ids)
                    except:
                        pass
                
                assignment_list.append({
                    "assignment_id": assignment.id,
                    "evaluator_id": assignment.evaluator_id,
                    "evaluator_name": evaluator.real_name if evaluator else "未知",
                    "assignment_type": assignment.assignment_type,
                    "assigned_criteria": criteria_ids,
                    "status": assignment.status,
                    "progress": assignment.progress_percent
                })
            
            company_list.append({
                "company_id": company.id,
                "company_name": company.company_name,
                "assignments": assignment_list
            })
        
        return {
            "package_id": package_id,
            "project_id": package.project_id,
            "companies": company_list
        }
    finally:
        db.close()


@router.put("/{assignment_id}")
async def update_assignment(request: Request, assignment_id: int, status: str = None, progress_percent: int = None):
    """更新任务分配状态"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
        if not assignment:
            raise HTTPException(status_code=404, detail="任务分配不存在")
        
        # 检查权限：专家只能更新自己的任务
        if assignment.evaluator_id != current_user.id and current_user.role not in ["admin", "team_leader", "team_manager"]:
            raise HTTPException(status_code=403, detail="无权限更新此任务")
        
        if status:
            assignment.status = status
            if status == "in_progress" and not assignment.started_at:
                assignment.started_at = datetime.now()
            elif status == "completed":
                assignment.completed_at = datetime.now()
                assignment.progress_percent = 100
        
        if progress_percent is not None:
            assignment.progress_percent = progress_percent
        
        db.commit()
        
        return {"message": "任务状态更新成功"}
    finally:
        db.close()


@router.get("/{assignment_id}")
async def get_assignment(request: Request, assignment_id: int):
    """获取任务分配详情"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
        if not assignment:
            raise HTTPException(status_code=404, detail="任务分配不存在")
        
        # 获取分配的评审项列表（如果是 by_criteria 模式）
        assigned_criteria = []
        if assignment.assigned_criteria_ids:
            criteria_ids = json.loads(assignment.assigned_criteria_ids)
            criteria_list = db.query(EvaluationCriteria).filter(
                EvaluationCriteria.id.in_(criteria_ids)
            ).all()
            assigned_criteria = [{
                "id": c.id,
                "criteria_name": c.criteria_name,
                "criteria_type": c.criteria_type,
                "max_score": c.max_score
            } for c in criteria_list]
        
        # 获取评审人姓名
        evaluator = db.query(User).filter(User.id == assignment.evaluator_id).first()
        evaluator_name = evaluator.real_name if evaluator else None
        
        return {
            "id": assignment.id,
            "package_id": assignment.package_id,
            "team_leader_id": assignment.team_leader_id,
            "evaluator_id": assignment.evaluator_id,
            "evaluator_name": evaluator_name,
            "assignment_type": assignment.assignment_type,
            "assigned_criteria": assigned_criteria,
            "status": assignment.status,
            "progress_percent": assignment.progress_percent,
            "created_at": assignment.created_at.isoformat() if assignment.created_at else None,
            "started_at": assignment.started_at.isoformat() if assignment.started_at else None,
            "completed_at": assignment.completed_at.isoformat() if assignment.completed_at else None
        }
    finally:
        db.close()


# ==================== 新增：批量分配 API 的请求模型 ====================

class BatchAssignCriteriaRequest(BaseModel):
    """批量分配评审项请求"""
    package_id: int
    team_assignments: List[Dict[str, Any]]  # [{"evaluator_id": int, "criteria_ids": [1,2,3]}, ...]


class BatchAssignCompaniesRequest(BaseModel):
    """批量分配公司请求"""
    package_id: int
    team_assignments: List[Dict[str, Any]]  # [{"evaluator_id": int, "company_ids": [1,2,3]}, ...]


class BatchAssignDocumentsRequest(BaseModel):
    """批量分配文档请求"""
    package_id: int
    team_assignments: List[Dict[str, Any]]  # [{"evaluator_id": int, "document_ids": [1,2,3]}, ...]


# ==================== 新增 API 1: 批量分配评审项 ====================

@router.post("/batch-assign-criteria")
async def batch_assign_criteria(request: Request, req: BatchAssignCriteriaRequest):
    """
    批量分配评审项给团队成员
    
    功能：
    1. 验证权限 (team_leader/admin)
    2. 查询 package 和团队成员
    3. 为每个 evaluator 创建 Assignment
    4. assignment_type="by_criteria", dispatch_mode="by_criteria"
    5. assigned_criteria_ids 存储为 JSON 字符串
    6. 批量提交事务
    """
    from models.extended_models import CompanyBidNew, User, TeamMember, Team
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    # 验证权限：只有 team_leader 和 admin 可以分配
    if current_user.role not in ["team_leader", "admin"]:
        raise HTTPException(status_code=403, detail="仅评标组长可分配任务")
    
    db = db_session()
    try:
        # Debug log
        logger.info(f"batch_assign_criteria: package_id={req.package_id}, team_assignments={req.team_assignments}, type={type(req.team_assignments)}")
        
        # 1. 查询 package 是否存在
        package = db.query(Package).filter(Package.id == req.package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")
        
        # 2. 批量创建分配
        created_assignments = []
        errors = []
        
        # 确保 team_assignments 是列表
        if isinstance(req.team_assignments, str):
            import json
            try:
                team_assignments = json.loads(req.team_assignments)
            except:
                raise HTTPException(status_code=400, detail="无效的分配数据格式")
        else:
            team_assignments = req.team_assignments
        
        for assign_data in team_assignments:
            try:
                # 确保 assign_data 是字典
                if isinstance(assign_data, str):
                    import json
                    assign_data = json.loads(assign_data)
                
                evaluator_id = assign_data.get("evaluator_id")
                criteria_ids = assign_data.get("criteria_ids", [])
                
                if not evaluator_id:
                    errors.append({
                        "data": assign_data,
                        "error": "缺少 evaluator_id"
                    })
                    continue
                
                # 验证评估员是否存在
                evaluator = db.query(User).filter(User.id == evaluator_id).first()
                if not evaluator:
                    errors.append({
                        "data": assign_data,
                        "error": f"评估员 {evaluator_id} 不存在"
                    })
                    continue
                
                # 验证评审项是否存在（如果是 by_criteria 模式）
                if criteria_ids and len(criteria_ids) > 0:
                    criteria_count = db.query(EvaluationCriteria).filter(
                        EvaluationCriteria.id.in_(criteria_ids),
                        EvaluationCriteria.package_id == req.package_id
                    ).count()
                    
                    if criteria_count != len(criteria_ids):
                        errors.append({
                            "data": assign_data,
                            "error": "部分评审项不存在或不属于该包"
                        })
                        continue
                
                # 检查是否已存在相同分配
                existing = db.query(Assignment).filter(
                    Assignment.package_id == req.package_id,
                    Assignment.evaluator_id == evaluator_id,
                    Assignment.assignment_type == "by_criteria"
                ).first()
                
                if existing:
                    errors.append({
                        "data": assign_data,
                        "error": f"评估员 {evaluator_id} 已存在 by_criteria 分配"
                    })
                    continue
                
                # 创建 Assignment
                assignment = Assignment(
                    package_id=req.package_id,
                    evaluator_id=evaluator_id,
                    team_leader_id=current_user.id,
                    assignment_type="by_criteria",
                    dispatch_mode="by_criteria",
                    assigned_criteria_ids=json.dumps(criteria_ids) if criteria_ids else None,
                    status="pending",
                    progress_percent=0,
                    created_at=datetime.now()
                )
                db.add(assignment)
                created_assignments.append(assignment)
                
            except Exception as e:
                errors.append({
                    "data": assign_data,
                    "error": str(e)
                })
        
        # 批量提交事务
        db.commit()
        
        # 刷新创建的数据
        for assignment in created_assignments:
            db.refresh(assignment)
        
        return {
            "message": f"批量分配评审项成功，共 {len(created_assignments)} 个任务",
            "created_count": len(created_assignments),
            "error_count": len(errors),
            "assignments": [
                {
                    "id": a.id,
                    "package_id": a.package_id,
                    "evaluator_id": a.evaluator_id,
                    "assignment_type": a.assignment_type,
                    "dispatch_mode": a.dispatch_mode,
                    "assigned_criteria_ids": json.loads(a.assigned_criteria_ids) if a.assigned_criteria_ids else [],
                    "status": a.status
                }
                for a in created_assignments
            ],
            "errors": errors
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"批量分配评审项失败：{e}")
        raise HTTPException(status_code=500, detail=f"服务器错误：{str(e)}")
    finally:
        db.close()


# ==================== 新增 API 2: 批量分配公司 ====================

@router.post("/batch-assign-companies")
async def batch_assign_companies(request: Request, req: BatchAssignCompaniesRequest):
    """
    批量分配公司给团队成员
    
    功能：
    1. 验证权限
    2. 查询 package 和公司列表
    3. 为每个 evaluator 创建 Assignment
    4. assignment_type="by_company", dispatch_mode="by_company"
    5. company_id 字段存储分配的公司 ID
    6. 批量提交事务
    """
    from models.extended_models import CompanyBidNew, User
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    # 验证权限：只有 team_leader 和 admin 可以分配
    if current_user.role not in ["team_leader", "admin"]:
        raise HTTPException(status_code=403, detail="仅评标组长可分配任务")
    
    db = db_session()
    try:
        # Debug log
        logger.info(f"batch_assign_companies: package_id={req.package_id}, team_assignments={req.team_assignments}, type={type(req.team_assignments)}")
        
        # 1. 查询 package 是否存在
        package = db.query(Package).filter(Package.id == req.package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")
        
        # 2. 批量创建分配
        created_assignments = []
        errors = []
        
        # 确保 team_assignments 是列表
        if isinstance(req.team_assignments, str):
            import json
            try:
                team_assignments = json.loads(req.team_assignments)
            except:
                raise HTTPException(status_code=400, detail="无效的分配数据格式")
        else:
            team_assignments = req.team_assignments
        
        for assign_data in team_assignments:
            try:
                # 确保 assign_data 是字典
                if isinstance(assign_data, str):
                    import json
                    assign_data = json.loads(assign_data)
                
                evaluator_id = assign_data.get("evaluator_id")
                company_ids = assign_data.get("company_ids", [])
                
                if not evaluator_id:
                    errors.append({
                        "data": assign_data,
                        "error": "缺少 evaluator_id"
                    })
                    continue
                
                # 验证评估员是否存在
                evaluator = db.query(User).filter(User.id == evaluator_id).first()
                if not evaluator:
                    errors.append({
                        "data": assign_data,
                        "error": f"评估员 {evaluator_id} 不存在"
                    })
                    continue
                
                # 验证公司是否存在
                valid_company_ids = []
                for company_id in company_ids:
                    company = db.query(CompanyBidNew).filter(
                        CompanyBidNew.id == company_id,
                        CompanyBidNew.project_id == package.project_id
                    ).first()
                    
                    if company:
                        valid_company_ids.append(company_id)
                    else:
                        errors.append({
                            "data": assign_data,
                            "error": f"公司 {company_id} 不存在或不属于该项目"
                        })
                        break
                
                if len(errors) > 0 and errors[-1]["data"] == assign_data:
                    continue
                
                # 为每个公司创建 Assignment
                for company_id in valid_company_ids:
                    # 检查是否已存在相同分配
                    existing = db.query(Assignment).filter(
                        Assignment.package_id == req.package_id,
                        Assignment.company_id == company_id,
                        Assignment.evaluator_id == evaluator_id
                    ).first()
                    
                    if existing:
                        errors.append({
                            "data": {**assign_data, "company_id": company_id},
                            "error": f"评估员 {evaluator_id} 已分配公司 {company_id}"
                        })
                        continue
                    
                    # 获取公司信息
                    company = db.query(CompanyBidNew).filter(CompanyBidNew.id == company_id).first()
                    
                    # 创建 Assignment
                    assignment = Assignment(
                        package_id=req.package_id,
                        company_id=company_id,
                        evaluator_id=evaluator_id,
                        team_leader_id=current_user.id,
                        assignment_type="by_company",
                        dispatch_mode="by_company",
                        status="pending",
                        progress_percent=0,
                        created_at=datetime.now()
                    )
                    db.add(assignment)
                    created_assignments.append({
                        "assignment": assignment,
                        "company_name": company.company_name if company else "未知"
                    })
                
            except Exception as e:
                errors.append({
                    "data": assign_data,
                    "error": str(e)
                })
        
        # 批量提交事务
        db.commit()
        
        # 刷新创建的数据
        for item in created_assignments:
            db.refresh(item["assignment"])
        
        return {
            "message": f"批量分配公司成功，共 {len(created_assignments)} 个任务",
            "created_count": len(created_assignments),
            "error_count": len(errors),
            "assignments": [
                {
                    "id": item["assignment"].id,
                    "package_id": item["assignment"].package_id,
                    "company_id": item["assignment"].company_id,
                    "company_name": item["company_name"],
                    "evaluator_id": item["assignment"].evaluator_id,
                    "assignment_type": item["assignment"].assignment_type,
                    "dispatch_mode": item["assignment"].dispatch_mode,
                    "status": item["assignment"].status
                }
                for item in created_assignments
            ],
            "errors": errors
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"批量分配公司失败：{e}")
        raise HTTPException(status_code=500, detail=f"服务器错误：{str(e)}")
    finally:
        db.close()


# ==================== 新增 API 3: 执行视图 ====================

# ==================== 新增 API: 撤销分配 ====================

@router.delete("/{assignment_id}")
async def delete_assignment(request: Request, assignment_id: int):
    """删除/撤销任务分配"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
        if not assignment:
            raise HTTPException(status_code=404, detail="任务分配不存在")
        
        # 检查权限：专家只能删除自己的任务，管理员和组长可以删除任何任务
        if (assignment.evaluator_id != current_user.id and 
            current_user.role not in ["admin", "team_leader", "team_manager"]):
            raise HTTPException(status_code=403, detail="无权限删除此任务")
        
        # 删除分配记录
        db.delete(assignment)
        db.commit()
        
        return {
            "message": "分配已撤销",
            "assignment_id": assignment_id
        }
    finally:
        db.close()


@router.post("/batch-cancel")
async def batch_cancel_assignments(request: Request, assignment_ids: List[int]):
    """批量撤销任务分配"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role not in ["admin", "team_leader", "team_manager"]:
        raise HTTPException(status_code=403, detail="仅管理员或组长可批量撤销")
    
    db = db_session()
    try:
        deleted_count = 0
        errors = []
        
        for assignment_id in assignment_ids:
            try:
                assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
                if not assignment:
                    errors.append({"id": assignment_id, "error": "分配不存在"})
                    continue
                
                db.delete(assignment)
                deleted_count += 1
            except Exception as e:
                errors.append({"id": assignment_id, "error": str(e)})
        
        db.commit()
        
        return {
            "message": f"批量撤销成功，共 {deleted_count} 个分配",
            "deleted_count": deleted_count,
            "error_count": len(errors),
            "errors": errors
        }
    finally:
        db.close()


# ==================== 新增 API: 分配历史 ====================

@router.get("/history/{package_id}")
async def get_assignment_history(request: Request, package_id: int):
    """获取包的分配历史记录"""
    from sqlalchemy import desc
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        # 获取包的所有分配记录（包含已删除的）
        # 注意：需要扩展 Assignment 模型添加操作历史表
        # 这里返回当前所有的分配记录作为基础历史
        
        assignments = db.query(Assignment).filter(
            Assignment.package_id == package_id
        ).order_by(desc(Assignment.created_at)).all()
        
        history = []
        for a in assignments:
            evaluator = db.query(User).filter(User.id == a.evaluator_id).first()
            history.append({
                "assignment_id": a.id,
                "package_id": a.package_id,
                "company_id": a.company_id,
                "evaluator_id": a.evaluator_id,
                "evaluator_name": evaluator.real_name if evaluator else "未知",
                "assignment_type": a.assignment_type,
                "dispatch_mode": a.dispatch_mode,
                "assigned_criteria_ids": json.loads(a.assigned_criteria_ids) if a.assigned_criteria_ids else None,
                "status": a.status,
                "progress_percent": a.progress_percent,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "started_at": a.started_at.isoformat() if a.started_at else None,
                "completed_at": a.completed_at.isoformat() if a.completed_at else None
            })
        
        return {
            "package_id": package_id,
            "total_count": len(history),
            "history": history
        }
    finally:
        db.close()


# ==================== 新增 API: 智能推荐 ====================

@router.post("/recommend")
async def recommend_assignments(request: Request, package_id: int, mode: str = "by_criteria"):
    """智能推荐分配方案"""
    from models.extended_models import TeamMember, Team
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        # 1. 获取包信息
        package = db.query(Package).filter(Package.id == package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")
        
        # 2. 获取资源列表
        if mode == "by_criteria":
            resources = db.query(EvaluationCriteria).filter(
                EvaluationCriteria.package_id == package_id
            ).all()
            resource_type = "criteria"
        else:
            resources = db.query(CompanyBidNew).filter(
                CompanyBidNew.project_id == package.project_id
            ).all()
            resource_type = "company"
        
        # 3. 获取团队成员及其当前负载
        # 这里简化处理，假设团队成员从项目获取
        # 实际应该从团队表获取
        team_members = []
        
        # 4. 基于负载均衡算法进行推荐
        # 简单轮询分配
        recommendations = []
        for i, resource in enumerate(resources):
            member_index = i % max(len(team_members), 1)
            recommendations.append({
                "resource_id": resource.id,
                "resource_name": resource.company_name if resource_type == "company" else resource.criteria_name,
                "recommended_evaluator_id": team_members[member_index]["id"] if team_members else None,
                "recommended_evaluator_name": team_members[member_index]["real_name"] if team_members else None
            })
        
        # 5. 按评估人分组
        grouped_recommendations = {}
        for rec in recommendations:
            evaluator_id = rec["recommended_evaluator_id"]
            if evaluator_id:
                if evaluator_id not in grouped_recommendations:
                    grouped_recommendations[evaluator_id] = {
                        "evaluator_id": evaluator_id,
                        "evaluator_name": rec["recommended_evaluator_name"],
                        "resource_ids": [],
                        "resource_names": []
                    }
                grouped_recommendations[evaluator_id]["resource_ids"].append(rec["resource_id"])
                grouped_recommendations[evaluator_id]["resource_names"].append(rec["resource_name"])
        
        return {
            "package_id": package_id,
            "mode": mode,
            "total_resources": len(resources),
            "recommendations": list(grouped_recommendations.values()),
            "algorithm": "load_balanced_round_robin"
        }
    finally:
        db.close()


# ==================== 新增 API: 导出 ====================

@router.get("/{package_id}/export")
async def export_assignments(request: Request, package_id: int, format: str = "excel"):
    """导出分配结果"""
    import io
    from fastapi.responses import StreamingResponse
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        # 获取包的所有分配
        assignments = db.query(Assignment).filter(
            Assignment.package_id == package_id
        ).all()
        
        if format == "csv":
            # CSV 格式导出
            csv_buffer = io.StringIO()
            csv_buffer.write("分配 ID,包 ID,公司 ID,公司名，评估人 ID,评估人名，分配类型，状态，进度，创建时间\n")
            
            for a in assignments:
                company = db.query(CompanyBidNew).filter(CompanyBidNew.id == a.company_id).first()
                evaluator = db.query(User).filter(User.id == a.evaluator_id).first()
                
                company_name = company.company_name if company else ""
                evaluator_name = evaluator.real_name if evaluator else ""
                
                csv_buffer.write(f"{a.id},{a.package_id},{a.company_id or ''},{company_name},{a.evaluator_id},{evaluator_name},{a.assignment_type},{a.status},{a.progress_percent},{a.created_at.isoformat() if a.created_at else ''}\n")
            
            csv_content = csv_buffer.getvalue()
            return StreamingResponse(
                io.BytesIO(csv_content.encode('utf-8')),
                media_type="text/csv",
                headers={"Content-Disposition": f"attachment; filename=assignments_{package_id}.csv"}
            )
        
        else:
            # Excel 格式导出（需要 openpyxl）
            try:
                from openpyxl import Workbook
                wb = Workbook()
                ws = wb.active
                ws.title = "分配结果"
                
                # 表头
                ws.append(["分配 ID", "包 ID", "公司 ID", "公司名", "评估人 ID", "评估人名", "分配类型", "状态", "进度 (%)", "创建时间"])
                
                for a in assignments:
                    company = db.query(CompanyBidNew).filter(CompanyBidNew.id == a.company_id).first()
                    evaluator = db.query(User).filter(User.id == a.evaluator_id).first()
                    
                    company_name = company.company_name if company else ""
                    evaluator_name = evaluator.real_name if evaluator else ""
                    
                    ws.append([
                        a.id,
                        a.package_id,
                        a.company_id or "",
                        company_name,
                        a.evaluator_id,
                        evaluator_name,
                        a.assignment_type,
                        a.status,
                        a.progress_percent,
                        a.created_at.isoformat() if a.created_at else ""
                    ])
                
                # 调整列宽
                ws.column_dimensions['A'].width = 10
                ws.column_dimensions['B'].width = 10
                ws.column_dimensions['C'].width = 10
                ws.column_dimensions['D'].width = 25
                ws.column_dimensions['E'].width = 12
                ws.column_dimensions['F'].width = 15
                ws.column_dimensions['G'].width = 15
                ws.column_dimensions['H'].width = 12
                ws.column_dimensions['I'].width = 10
                ws.column_dimensions['J'].width = 25
                
                # 输出到内存
                excel_buffer = io.BytesIO()
                wb.save(excel_buffer)
                excel_buffer.seek(0)
                
                return StreamingResponse(
                    excel_buffer,
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f"attachment; filename=assignments_{package_id}.xlsx"}
                )
            except ImportError:
                raise HTTPException(status_code=500, detail="Excel 导出依赖未安装，请使用 CSV 格式")
    finally:
        db.close()


@router.get("/{assignment_id}/execution-view")
async def get_execution_view(request: Request, assignment_id: int):
    """
    获取任务分配的执行视图
    
    功能：
    1. 查询 assignment 详情
    2. 根据 assignment_type 返回不同数据：
       - by_criteria: 所有公司 + 分配的评审项 + 文件树
       - by_company: 分配的公司 + 所有评审项 + 文件树
    3. 从公司投标记录获取文件信息
    """
    from models.extended_models import CompanyBidNew, EvaluationCriteria
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        # 1. 查询 assignment 详情
        assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
        if not assignment:
            raise HTTPException(status_code=404, detail="任务分配不存在")
        
        # 检查权限：专家只能查看自己的任务，管理员和组长可以查看所有
        if (assignment.evaluator_id != current_user.id and 
            current_user.role not in ["admin", "team_leader", "team_manager"]):
            raise HTTPException(status_code=403, detail="无权限查看此任务")
        
        # 获取包信息
        package = db.query(Package).filter(Package.id == assignment.package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")
        
        # 获取项目下的所有公司
        all_companies = db.query(CompanyBidNew).filter(
            CompanyBidNew.project_id == package.project_id
        ).all()
        
        # 获取包的所有评审项
        all_criteria = db.query(EvaluationCriteria).filter(
            EvaluationCriteria.package_id == assignment.package_id
        ).all()
        
        # 解析分配的评审项 IDs
        assigned_criteria_ids = []
        if assignment.assigned_criteria_ids:
            try:
                assigned_criteria_ids = json.loads(assignment.assigned_criteria_ids)
            except json.JSONDecodeError:
                assigned_criteria_ids = []
        
        # 构建文件树（从公司投标记录的 bid_folder_path 解析）
        def build_file_tree(company_id: int) -> list:
            """从公司投标记录构建文件树"""
            company = db.query(CompanyBidNew).filter(CompanyBidNew.id == company_id).first()
            if not company:
                return []
            
            # 从公司记录的 bid_folder_path 获取文件信息
            # 注意：实际文件树可能需要从文件系统扫描或单独的文件表获取
            # 这里返回公司记录中的基本信息
            file_tree = []
            if company.bid_folder_path:
                file_info = {
                    "folder_path": company.bid_folder_path,
                    "company_name": company.company_name,
                    "status": company.status,
                    "ocr_status": company.ocr_status,
                    "note": "文件树需从文件系统扫描获取，当前返回文件夹路径"
                }
                file_tree.append(file_info)
            
            return file_tree
        
        # 根据 assignment_type 返回不同数据
        if assignment.assignment_type == "by_criteria":
            # 按评审项分配模式：返回所有公司 + 分配的评审项 + 文件树
            company_list = []
            for company in all_companies:
                # 构建该公司的文件树
                file_tree = build_file_tree(company.id)
                
                company_list.append({
                    "company_id": company.id,
                    "company_name": company.company_name,
                    "status": company.status,
                    "file_count": len(file_tree),
                    "files": file_tree
                })
            
            # 获取分配的评审项详情
            assigned_criteria_list = []
            criteria_list = db.query(EvaluationCriteria).filter(
                EvaluationCriteria.id.in_(assigned_criteria_ids)
            ).all()
            for criteria in criteria_list:
                assigned_criteria_list.append({
                    "id": criteria.id,
                    "criteria_name": criteria.criteria_name,
                    "criteria_type": criteria.criteria_type,
                    "max_score": criteria.max_score,
                    "scoring_criteria": criteria.scoring_criteria
                })
            
            return {
                "assignment_id": assignment.id,
                "assignment_type": assignment.assignment_type,
                "dispatch_mode": assignment.dispatch_mode,
                "package_id": assignment.package_id,
                "package_name": package.package_name,
                "evaluator_id": assignment.evaluator_id,
                "status": assignment.status,
                "progress_percent": assignment.progress_percent,
                "assigned_criteria": assigned_criteria_list,
                "companies": company_list,
                "created_at": assignment.created_at.isoformat() if assignment.created_at else None,
                "started_at": assignment.started_at.isoformat() if assignment.started_at else None,
                "completed_at": assignment.completed_at.isoformat() if assignment.completed_at else None
            }
        
        elif assignment.assignment_type == "by_company":
            # 按公司分配模式：返回分配的公司 + 所有评审项 + 文件树
            if assignment.company_id:
                company = db.query(CompanyBidNew).filter(
                    CompanyBidNew.id == assignment.company_id
                ).first()
                
                # 构建文件树
                file_tree = build_file_tree(assignment.company_id)
                
                # 获取所有评审项详情
                all_criteria_list = []
                for criteria in all_criteria:
                    all_criteria_list.append({
                        "id": criteria.id,
                        "criteria_name": criteria.criteria_name,
                        "criteria_type": criteria.criteria_type,
                        "max_score": criteria.max_score,
                        "scoring_criteria": criteria.scoring_criteria
                    })
                
                return {
                    "assignment_id": assignment.id,
                    "assignment_type": assignment.assignment_type,
                    "dispatch_mode": assignment.dispatch_mode,
                    "package_id": assignment.package_id,
                    "package_name": package.package_name,
                    "evaluator_id": assignment.evaluator_id,
                    "status": assignment.status,
                    "progress_percent": assignment.progress_percent,
                    "company": {
                        "company_id": company.id if company else None,
                        "company_name": company.company_name if company else "未知",
                        "status": company.status if company else None,
                        "file_count": len(file_tree),
                        "files": file_tree
                    },
                    "criteria": all_criteria_list,
                    "created_at": assignment.created_at.isoformat() if assignment.created_at else None,
                    "started_at": assignment.started_at.isoformat() if assignment.started_at else None,
                    "completed_at": assignment.completed_at.isoformat() if assignment.completed_at else None
                }
            else:
                raise HTTPException(status_code=400, detail="by_company 模式的分配缺少 company_id")
        
        else:
            # 其他模式（by_package）：返回所有公司 + 所有评审项 + 文件树
            company_list = []
            for company in all_companies:
                file_tree = build_file_tree(company.id)
                
                company_list.append({
                    "company_id": company.id,
                    "company_name": company.company_name,
                    "status": company.status,
                    "file_count": len(file_tree),
                    "files": file_tree
                })
            
            all_criteria_list = []
            for criteria in all_criteria:
                all_criteria_list.append({
                    "id": criteria.id,
                    "criteria_name": criteria.criteria_name,
                    "criteria_type": criteria.criteria_type,
                    "max_score": criteria.max_score,
                    "scoring_criteria": criteria.scoring_criteria
                })
            
            return {
                "assignment_id": assignment.id,
                "assignment_type": assignment.assignment_type,
                "dispatch_mode": assignment.dispatch_mode,
                "package_id": assignment.package_id,
                "package_name": package.package_name,
                "evaluator_id": assignment.evaluator_id,
                "status": assignment.status,
                "progress_percent": assignment.progress_percent,
                "companies": company_list,
                "criteria": all_criteria_list,
                "created_at": assignment.created_at.isoformat() if assignment.created_at else None,
                "started_at": assignment.started_at.isoformat() if assignment.started_at else None,
                "completed_at": assignment.completed_at.isoformat() if assignment.completed_at else None
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取执行视图失败：{e}")
        raise HTTPException(status_code=500, detail=f"服务器错误：{str(e)}")
    finally:
        db.close()
