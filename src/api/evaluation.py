"""评审执行 API"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional, Dict
from loguru import logger
from datetime import datetime
import json

from api.middleware import get_current_user_from_request, require_evaluator
from models.database import db_session
from models.extended_models import (
    User, Team, TeamMember, 
    EvaluationResultNew as EvaluationResult, 
    CompanyBidNew as CompanyBid, 
    SubTask, Package, Project
)

router = APIRouter(prefix="/api/evaluation", tags=["评审执行"])


# 请求模型
class SubmitEvaluationRequest(BaseModel):
    subtask_id: Optional[int] = None
    package_id: int
    company_id: int
    criteria_id: Optional[int] = None
    score: float
    max_score: float = 100.0
    reason: str
    evidence: Optional[str] = None
    evidence_details: Optional[Dict] = None


@router.get("/my-tasks")
async def get_my_evaluation_tasks(request: Request):
    """获取我的任务（项目级别 + 子任务级别）
    
    返回嵌套结构：每个项目包含其子任务数组
    
    根据用户角色返回不同的任务列表：
    1. admin: 所有项目和子任务
    2. team_leader: 已分派给团队的项目 + 子任务
    3. team_manager: 已分派给团队的项目 + 子任务
    4. technical_evaluator: 分配给自己的子任务（技术评审）
    5. business_evaluator: 分配给自己的子任务（商务评审）
    """
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        result = []
        
        if current_user.role == "admin":
            # 管理员：获取所有项目和子任务
            assigned_projects = db.query(Project).filter(
                Project.assigned_team_id.isnot(None),
                Project.status.in_(['assigned', 'processing'])
            ).all()
            
            # 获取所有子任务用于后续关联
            all_subtasks = db.query(SubTask).all()
            subtask_by_package = {}
            for st in all_subtasks:
                if st.package_id not in subtask_by_package:
                    subtask_by_package[st.package_id] = []
                subtask_by_package[st.package_id].append(st)
            
            for p in assigned_projects:
                team = db.query(Team).filter(Team.id == p.assigned_team_id).first()
                
                # 获取该项目下的所有包
                packages = db.query(Package).filter(Package.project_id == p.id).all()
                package_ids = [pkg.id for pkg in packages]
                
                # 获取这些包下的子任务
                project_subtasks = []
                for pkg_id in package_ids:
                    if pkg_id in subtask_by_package:
                        project_subtasks.extend(subtask_by_package[pkg_id])
                
                result.append({
                    "id": p.id,
                    "project_name": p.project_name,
                    "status": p.status,
                    "progress_percent": 0,
                    "assigned_team_id": p.assigned_team_id,
                    "assigned_team_name": team.team_name if team else None,
                    "can_dispatch": True,
                    "can_refine": False,
                    "subtasks": []  # 嵌套子任务数组
                })
                
                # 填充子任务
                for st in project_subtasks:
                    evaluator = db.query(User).filter(User.id == st.evaluator_id).first() if st.evaluator_id else None
                    result[-1]["subtasks"].append({
                        "id": st.id,
                        "package_id": p.id,  # 兼容前端，实际就是 project_id
                        "package_name": p.project_name,  # 使用项目名称
                        "evaluator_id": st.evaluator_id,
                        "evaluator_name": evaluator.real_name if evaluator else None,
                        "task_type": st.task_type,
                        "mode": st.mode,
                        "status": st.status,
                        "progress_percent": 0,
                        "assigned_documents": json.loads(st.assigned_documents) if st.assigned_documents else [],
                        "assigned_criteria": json.loads(st.assigned_criteria) if st.assigned_criteria else []
                    })
            
            return result
        elif current_user.role in ["team_leader", "team_manager"]:
            # 团队领导/经理：获取分配到自己团队的项目和子任务
            # team_leader 角色需要看到所有分配到自己团队的项目（包括自己派分出去的）
            
            # 获取用户所属的团队 ID
            # team_leader 可能没有 team_id，需要查询 TeamMember 表
            # team_manager 有 team_id 字段
            team_ids = []
            
            if current_user.role == "team_manager" and current_user.team_id:
                team_ids = [current_user.team_id]
            elif current_user.role == "team_leader":
                # team_leader 通过 TeamMember 表查询，或者获取所有团队
                team_memberships = db.query(TeamMember).filter(
                    TeamMember.user_id == current_user.id,
                    TeamMember.is_active == True
                ).all()
                team_ids = [tm.team_id for tm in team_memberships]
                # 如果 team_leader 不在任何团队中，获取所有团队
                if not team_ids:
                    all_teams = db.query(Team).all()
                    team_ids = [t.id for t in all_teams]
            else:
                team_ids = []
            
            if team_ids:
                # 查询分配到自己团队的项目（包括 assigned 和 processing 状态）
                assigned_projects = db.query(Project).filter(
                    Project.assigned_team_id.in_(team_ids),
                    Project.status.in_(['assigned', 'processing'])
                ).all()
                
                # 构建子任务索引（按 project_id）
                subtask_by_project = {}
                for p in assigned_projects:
                    subtasks = db.query(SubTask).filter(SubTask.package_id == p.id).all()
                    subtask_by_project[p.id] = subtasks
                
                for p in assigned_projects:
                    team = db.query(Team).filter(Team.id == p.assigned_team_id).first()
                    
                    # 获取该项目下的子任务
                    project_subtasks = subtask_by_project.get(p.id, [])
                    
                    # 计算项目进度：基于子任务完成情况
                    total_subtasks = len(project_subtasks)
                    completed_subtasks = len([st for st in project_subtasks if st.status == 'completed'])
                    project_progress = int((completed_subtasks / total_subtasks) * 100) if total_subtasks > 0 else 0
                    
                    # team_leader 和 team_manager 都可以看到项目，但只有 team_manager 可以细化
                    project_data = {
                        "id": p.id,
                        "project_name": p.project_name,
                        "status": p.status,
                        "progress_percent": project_progress,
                        "assigned_team_id": p.assigned_team_id,
                        "assigned_team_name": team.team_name if team else None,
                        "can_dispatch": False,  # 不再支持二次分派
                        "can_refine": current_user.role == "team_manager" and p.status == 'assigned',
                        "subtasks": []
                    }
                    result.append(project_data)
                    
                    # 填充子任务
                    for st in project_subtasks:
                        evaluator = db.query(User).filter(User.id == st.evaluator_id).first() if st.evaluator_id else None
                        
                        # 计算子任务的总分、完成公司数和评审信息数
                        # 根据子任务的 mode 和分配情况计算
                        total_score = 0
                        completed_companies = 0
                        evaluation_count = 0
                        
                        if st.mode == 'by_company' and st.assigned_documents:
                            # 按公司模式：assigned_documents 存储公司 ID 列表
                            company_ids = json.loads(st.assigned_documents)
                            # 统计这些公司的评审结果
                            eval_results = db.query(EvaluationResult).filter(
                                EvaluationResult.company_id.in_(company_ids),
                                EvaluationResult.subtask_id == st.id
                            ).all()
                            evaluation_count = len(eval_results)
                            total_score = sum(r.score for r in eval_results if r.score is not None)
                            # 计算已完成的公司数（有评审结果的公司）
                            completed_company_ids = set(r.company_id for r in eval_results if r.score is not None)
                            completed_companies = len(completed_company_ids)
                        elif st.mode == 'by_criteria' and st.assigned_criteria:
                            # 按评审项模式：assigned_criteria 存储评审项 ID 列表
                            criteria_ids = json.loads(st.assigned_criteria)
                            # 获取项目下所有公司
                            companies = db.query(CompanyBid).filter(CompanyBid.project_id == p.id).all()
                            company_ids = [c.id for c in companies]
                            # 统计这些公司的评审结果（仅分配的评审项）
                            eval_results = db.query(EvaluationResult).filter(
                                EvaluationResult.company_id.in_(company_ids),
                                EvaluationResult.criteria_id.in_(criteria_ids),
                                EvaluationResult.subtask_id == st.id
                            ).all()
                            evaluation_count = len(eval_results)
                            total_score = sum(r.score for r in eval_results if r.score is not None)
                            # 计算已完成的公司数
                            completed_company_ids = set(r.company_id for r in eval_results if r.score is not None)
                            completed_companies = len(completed_company_ids)
                        
                        result[-1]["subtasks"].append({
                            "id": st.id,
                            "package_id": p.id,
                            "package_name": p.project_name,
                            "evaluator_id": st.evaluator_id,
                            "evaluator_name": evaluator.real_name if evaluator else None,
                            "task_type": st.task_type,
                            "mode": st.mode,
                            "status": st.status,
                            "progress_percent": st.progress_percent or 0,
                            "total_score": round(total_score, 2) if total_score > 0 else None,
                            "completed_companies": completed_companies,
                            "evaluation_count": evaluation_count,
                            "assigned_documents": json.loads(st.assigned_documents) if st.assigned_documents else [],
                            "assigned_criteria": json.loads(st.assigned_criteria) if st.assigned_criteria else []
                        })
            else:
                assigned_projects = []
        elif current_user.role in ["technical_evaluator", "business_evaluator"]:
            # 专家：只返回分配给自己的子任务（扁平列表）
            my_subtasks = db.query(SubTask).filter(
                SubTask.evaluator_id == current_user.id
            ).all()
            
            result = []
            for st in my_subtasks:
                # package_id 实际就是 project_id（虚拟包概念已废弃）
                project_id = st.package_id
                project = db.query(Project).filter(Project.id == project_id).first()
                evaluator = db.query(User).filter(User.id == st.evaluator_id).first() if st.evaluator_id else None
                
                # 计算公司数和评审项数 - 根据子任务的分配情况计算
                company_count = 0
                criteria_count = 0
                
                # 根据模式计算分配的资源数量
                if st.mode == 'by_criteria':
                    # 按评审项模式：分配的是评审项，公司数量 = 项目下所有公司
                    if st.assigned_criteria:
                        criteria_ids = json.loads(st.assigned_criteria)
                        criteria_count = len(criteria_ids)
                    # 公司数量 = 项目下的所有公司数
                    companies = db.query(CompanyBid).filter(CompanyBid.project_id == project_id).all()
                    company_count = len(companies)
                elif st.mode == 'by_company':
                    # 按公司模式：分配的是公司，assigned_documents 实际存储的是公司 ID 列表
                    if st.assigned_documents:
                        company_ids = json.loads(st.assigned_documents)
                        company_count = len(company_ids)
                    # 评审项数量 = 项目下的所有评审项数
                    from models.extended_models import EvaluationRuleNew
                    criteria_rules = db.query(EvaluationRuleNew).filter(
                        EvaluationRuleNew.template_id == project_id,
                        EvaluationRuleNew.is_active == True
                    ).all()
                    criteria_count = len(criteria_rules)
                
                result.append({
                    "id": st.id,
                    "project_id": project_id,
                    "project_name": project.project_name if project else "未知项目",
                    "package_id": project_id,  # 兼容前端，实际就是 project_id
                    "package_name": project.project_name if project else "未知项目",
                    "evaluator_id": st.evaluator_id,
                    "evaluator_name": evaluator.real_name if evaluator else None,
                    "task_type": st.task_type,
                    "mode": st.mode,
                    "status": st.status,
                    "progress_percent": st.progress_percent or 0,
                    "company_count": company_count,
                    "criteria_count": criteria_count,
                    "assigned_documents": json.loads(st.assigned_documents) if st.assigned_documents else [],
                    "assigned_criteria": json.loads(st.assigned_criteria) if st.assigned_criteria else [],
                    "can_dispatch": False,
                    "can_refine": False,
                    "subtasks": []
                })
            
            return result
        else:
            return []
        
        return result
    finally:
        db.close()


@router.get("/package/{package_id}/companies")
async def get_package_companies(request: Request, package_id: int):
    """获取项目下的所有公司（package_id 实际为 project_id）"""
    from models.database import db_session
    from models.extended_models import CompanyBidNew as CompanyBid, EvaluationResultNew as EvaluationResult
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        # package_id 实际就是 project_id（虚拟包概念已废弃）
        # 直接根据 project_id 查询公司
        companies = db.query(CompanyBid).filter(CompanyBid.project_id == package_id).all()
        
        result = []
        for c in companies:
            # 动态计算公司总分（所有评审项的分数总和）
            eval_results = db.query(EvaluationResult).filter(
                EvaluationResult.company_id == c.id
            ).all()
            total_score = sum(r.score for r in eval_results) if eval_results else 0
            
            result.append({
                "id": c.id,
                "company_name": c.company_name,
                "bid_folder_path": c.bid_folder_path,
                "ocr_status": c.ocr_status,
                "total_score": total_score,  # 动态计算的总分
                "ranking": c.ranking,
                "status": c.status
            })
        
        # 按总分排序
        result.sort(key=lambda x: x["total_score"], reverse=True)
        
        # 更新排名
        for i, item in enumerate(result):
            item["ranking"] = i + 1
        
        return result
    finally:
        db.close()


@router.get("/package/{package_id}/criteria")
async def get_package_criteria(request: Request, package_id: int):
    """获取包的评审项"""
    from models.database import db_session
    from models.extended_models import Package, EvaluationRule, TaskRule, Project
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        package = db.query(Package).filter(Package.id == package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")
        
        project = db.query(Project).filter(Project.id == package.project_id).first()
        
        # 获取项目关联的评审规则
        task_rules = db.query(TaskRule).filter(TaskRule.task_id == project.id).all()
        rule_ids = [tr.rule_id for tr in task_rules]
        
        rules = db.query(EvaluationRule).filter(
            EvaluationRule.id.in_(rule_ids),
            EvaluationRule.is_active == True
        ).all()
        
        return [{
            "id": r.id,
            "rule_name": r.rule_name,
            "rule_content": r.rule_content,
            "config": json.loads(r.config_json) if r.config_json else None
        } for r in rules]
    finally:
        db.close()


@router.post("/submit")
async def submit_evaluation(request: Request, eval_req: SubmitEvaluationRequest):
    """提交评审结果"""
    from models.database import db_session
    from models.extended_models import EvaluationResult, SubTask
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        # 如果指定了子任务，检查权限
        if eval_req.subtask_id:
            subtask = db.query(SubTask).filter(SubTask.id == eval_req.subtask_id).first()
            if not subtask:
                raise HTTPException(status_code=404, detail="子任务不存在")
            
            if subtask.evaluator_id != current_user.id:
                raise HTTPException(status_code=403, detail="无权限提交此任务的评审结果")
        
        # 创建评审结果
        result = EvaluationResult(
            subtask_id=eval_req.subtask_id,
            package_id=eval_req.package_id,
            company_id=eval_req.company_id,
            criteria_id=eval_req.criteria_id,
            score=eval_req.score,
            max_score=eval_req.max_score,
            reason=eval_req.reason,
            evidence=eval_req.evidence or "",
            evidence_details=json.dumps(eval_req.evidence_details) if eval_req.evidence_details else None,
            evaluator_id=current_user.id,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        db.add(result)
        db.commit()
        db.refresh(result)
        
        # 更新子任务进度
        if eval_req.subtask_id:
            subtask = db.query(SubTask).filter(SubTask.id == eval_req.subtask_id).first()
            if subtask:
                subtask.progress_percent = min(subtask.progress_percent + 10, 100)
                if subtask.progress_percent == 100:
                    subtask.status = "completed"
                    subtask.completed_at = datetime.now()
                db.commit()
        
        return {
            "message": "评审结果提交成功",
            "result_id": result.id
        }
    finally:
        db.close()


@router.get("/package/{package_id}/results")
async def get_package_results(request: Request, package_id: int):
    """获取包的评审结果汇总"""
    from models.database import db_session
    from models.extended_models import EvaluationResult, CompanyBidNew as CompanyBid, SubTask
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        # 获取项目下所有公司的评审结果（package_id 实际为 project_id）
        companies = db.query(CompanyBid).filter(CompanyBid.project_id == package_id).all()
        
        result = []
        for company in companies:
            eval_results = db.query(EvaluationResult).filter(
                EvaluationResult.company_id == company.id
            ).all()
            
            total_score = sum(r.score for r in eval_results) if eval_results else 0
            
            result.append({
                "company_id": company.id,
                "company_name": company.company_name,
                "evaluation_count": len(eval_results),
                "total_score": total_score,
                "details": [{
                    "criteria_id": r.criteria_id,
                    "score": r.score,
                    "max_score": r.max_score,
                    "reason": r.reason,
                    "evidence": r.evidence,
                    "evaluator_id": r.evaluator_id,
                    "created_at": r.created_at.isoformat() if r.created_at else None
                } for r in eval_results]
            })
        
        # 按总分排序
        result.sort(key=lambda x: x["total_score"], reverse=True)
        
        # 添加排名
        for i, item in enumerate(result):
            item["ranking"] = i + 1
        
        return result
    finally:
        db.close()


@router.get("/project/{project_id}/summary")
async def get_project_summary(request: Request, project_id: int):
    """获取项目评审汇总"""
    from models.database import db_session
    from models.extended_models import Project, Package, CompanyBidNew as CompanyBid, EvaluationResult
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        
        # 获取所有包
        packages = db.query(Package).filter(Package.project_id == project_id).all()
        
        # 获取所有公司
        companies = db.query(CompanyBid).filter(CompanyBid.project_id == project_id).all()
        
        # 计算汇总数据
        total_companies = len(companies)
        completed_companies = len([c for c in companies if c.status == "completed"])
        
        company_scores = []
        for company in companies:
            eval_results = db.query(EvaluationResult).filter(
                EvaluationResult.company_id == company.id
            ).all()
            
            total_score = sum(r.score for r in eval_results) if eval_results else 0
            company_scores.append({
                "company_id": company.id,
                "company_name": company.company_name,
                "total_score": total_score,
                "status": company.status,
                "ranking": company.ranking
            })
        
        # 按分数排序
        company_scores.sort(key=lambda x: x["total_score"], reverse=True)
        
        # 计算平均分
        avg_score = sum(c["total_score"] for c in company_scores) / len(company_scores) if company_scores else 0
        
        return {
            "project_id": project.id,
            "project_name": project.project_name,
            "project_type": project.project_type,
            "status": project.status,
            "total_packages": len(packages),
            "total_companies": total_companies,
            "completed_companies": completed_companies,
            "avg_score": round(avg_score, 2),
            "rankings": company_scores
        }
    finally:
        db.close()


@router.get("/subtask/{subtask_id}/result")
async def get_subtask_result(request: Request, subtask_id: int):
    """获取子任务的评审结果"""
    from models.database import db_session
    from models.extended_models import SubTask, EvaluationResultNew as EvaluationResult, CompanyBidNew as CompanyBid
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        # 获取子任务
        subtask = db.query(SubTask).filter(SubTask.id == subtask_id).first()
        if not subtask:
            raise HTTPException(status_code=404, detail="子任务不存在")
        
        # 检查权限：子任务分配的用户、admin、team_manager、team_leader 都可以访问
        if subtask.evaluator_id != current_user.id and current_user.role not in ["admin", "team_manager", "team_leader"]:
            raise HTTPException(status_code=403, detail="无权限访问此任务")
        
        # 获取子任务分配的公司或评审项
        assigned_documents = json.loads(subtask.assigned_documents) if subtask.assigned_documents else []
        assigned_criteria = json.loads(subtask.assigned_criteria) if subtask.assigned_criteria else []
        
        result = []
        
        if subtask.mode == 'by_company' and assigned_documents:
            # 按公司模式：获取这些公司的所有评审结果（嵌套结构）
            companies = db.query(CompanyBid).filter(CompanyBid.id.in_(assigned_documents)).all()
            for company in companies:
                eval_results = db.query(EvaluationResult).filter(
                    EvaluationResult.company_id == company.id,
                    EvaluationResult.subtask_id == subtask_id
                ).all()
                
                details = []
                for r in eval_results:
                    details.append({
                        "criteria_id": r.criteria_id,
                        "score": r.score,
                        "max_score": r.max_score,
                        "reason": r.reason,
                        "evidence": r.evidence,
                        "evaluator_id": r.evaluator_id,
                        "created_at": r.created_at.isoformat() if r.created_at else None
                    })
                
                result.append({
                    "company_id": company.id,
                    "company_name": company.company_name,
                    "detail": details
                })
        elif subtask.mode == 'by_criteria' and assigned_criteria:
            # 按评审项模式：获取项目下所有公司的这些评审项结果（嵌套结构）
            companies = db.query(CompanyBid).filter(
                CompanyBid.project_id == subtask.package_id
            ).all()
            
            for company in companies:
                eval_results = db.query(EvaluationResult).filter(
                    EvaluationResult.company_id == company.id,
                    EvaluationResult.criteria_id.in_(assigned_criteria),
                    EvaluationResult.subtask_id == subtask_id
                ).all()
                
                details = []
                for r in eval_results:
                    details.append({
                        "criteria_id": r.criteria_id,
                        "score": r.score,
                        "max_score": r.max_score,
                        "reason": r.reason,
                        "evidence": r.evidence,
                        "evaluator_id": r.evaluator_id,
                        "created_at": r.created_at.isoformat() if r.created_at else None
                    })
                
                result.append({
                    "company_id": company.id,
                    "company_name": company.company_name,
                    "detail": details
                })
        
        return result
    finally:
        db.close()
