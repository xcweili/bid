"""项目管理 API"""
from fastapi import APIRouter, HTTPException, Request, UploadFile, File, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
from loguru import logger
from datetime import datetime
import threading
import os
import shutil
import json
from pathlib import Path

from services.auth_service import auth_service
from services.task_dispatch_service import dispatch_service
from services.rule_template_service import rule_template_service
from api.middleware import get_current_user_from_request, require_auth, require_team_leader
from models.database import db_session

router = APIRouter(prefix="/api/projects", tags=["项目管理"])


# 请求模型
class CreateProjectRequest(BaseModel):
    project_name: str
    project_type: str  # service, material, engineering
    template_id: Optional[int] = None  # 可选的规则模板 ID


class PackageSplitRequest(BaseModel):
    package_count: int
    package_names: Optional[List[str]] = None


class PackageAssignRequest(BaseModel):
    team_id: int


class RefineTaskRequest(BaseModel):
    mode: str  # "by_document" | "by_criteria"
    team_members: list  # [{"evaluator_id": int, "task_type": "technical|business", ...}]


# ==================== 项目 CRUD ====================

@router.post("")
async def create_project(request: Request, project_req: CreateProjectRequest):
    """创建项目"""
    from models.database import db_session
    from models.extended_models import Project
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    # 只有评标组长和管理员可以创建项目
    if current_user.role not in ["team_leader", "admin"]:
        raise HTTPException(status_code=403, detail="仅评标组长可创建项目")
    
    db = db_session()
    try:
        project = Project(
            project_name=project_req.project_name,
            project_type=project_req.project_type,
            created_by=current_user.id,
            status="draft",
            created_at=datetime.now()
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        
        # 如果指定了模板，应用模板
        if project_req.template_id:
            rule_template_service.apply_template_to_project(project_req.template_id, project.id)
        
        logger.info(f"项目创建成功：{project.id} - {project.project_name}")
        return {
            "message": "项目创建成功",
            "project": {
                "id": project.id,
                "project_name": project.project_name,
                "project_type": project.project_type,
                "status": project.status
            }
        }
    finally:
        db.close()


@router.get("")
async def get_projects(request: Request):
    """获取项目列表（按角色过滤）"""
    from models.database import db_session, engine
    from models.extended_models import Project, Base
    from sqlalchemy.orm import Session
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    # Debug log
    logger.info(f"get_projects: user_id={current_user.id}, role={current_user.role}, team_id={current_user.team_id}")
    
    # 创建新会话而不是使用 scoped_session
    db = Session(engine)
    try:
        from models.extended_models import Package, User, SubTask
        from models.database import DATABASE_PATH
        logger.info(f"get_projects: DATABASE_PATH={DATABASE_PATH}")
        
        query = db.query(Project)
        logger.info(f"get_projects: query={query}, session={db}, session.bind={db.bind}")
        
        # 根据角色过滤项目
        if current_user.role == "admin":
            # 管理员：查看所有项目
            logger.info("get_projects: admin role, returning all projects")
        elif current_user.role == "team_leader":
            # 评标组长：只查看自己创建的项目
            query = query.filter(Project.created_by == current_user.id)
            logger.info(f"get_projects: team_leader role, filtering by created_by={current_user.id}")
        elif current_user.role == "team_manager":
            # 团队负责人：查看分配给自己团队的项目（项目级别分派）
            if current_user.team_id:
                query = query.filter(Project.assigned_team_id == current_user.team_id)
                logger.info(f"get_projects: team_manager role, filtering by assigned_team_id={current_user.team_id}")
            else:
                logger.info("get_projects: team_manager has no team_id, returning empty")
                return []
        elif current_user.role in ["technical_evaluator", "business_evaluator"]:
            # 专家：查看分配给自己的子任务相关的项目
            # 先获取用户参与的所有子任务，然后找到对应的项目
            from models.extended_models import SubTask
            user_subtasks = db.query(SubTask).filter(SubTask.evaluator_id == current_user.id).all()
            project_ids = list(set(st.package_id for st in user_subtasks))  # package_id 实际就是 project_id
            
            if project_ids:
                query = query.filter(Project.id.in_(project_ids))
                logger.info(f"get_projects: evaluator role, found {len(project_ids)} projects from subtasks")
            else:
                logger.info(f"get_projects: evaluator role, no subtasks found, returning empty")
                return []
        else:
            # 其他角色：不返回任何项目
            logger.info(f"get_projects: unknown role {current_user.role}, returning empty")
            return []
        
        projects = query.all()
        
        logger.info(f"get_projects: query returned {len(projects)} projects")
        
        # Fallback to raw SQL if ORM query returns nothing
        if len(projects) == 0:
            from sqlalchemy import text
            raw_result = db.execute(text("SELECT * FROM projects")).fetchall()
            logger.info(f"get_projects: raw SQL returned {len(raw_result)} rows")
        
        result = []
        for p in projects:
            logger.info(f"get_projects: processing project id={p.id}, name={p.project_name}")
            creator = db.query(User).filter(User.id == p.created_by).first()
            package_count = db.query(Package).filter(Package.project_id == p.id).count()
            
            # 获取项目关联的评审规则数量
            from models.extended_models import EvaluationRuleNew
            rules = db.query(EvaluationRuleNew).filter(
                EvaluationRuleNew.template_id == p.id,
                EvaluationRuleNew.is_active == True
            ).all()
            rule_count = len(rules)
            
            # 获取项目分配的团队信息（项目级别分派）
            assigned_team_name = None
            if p.assigned_team_id:
                team = db.query(Team).filter(Team.id == p.assigned_team_id).first()
                assigned_team_name = team.team_name if team else None
            
            result.append({
                "id": p.id,
                "project_name": p.project_name,
                "project_type": p.project_type,
                "status": p.status,
                "total_packages": p.total_packages,
                "total_rules": rule_count,
                "assigned_team_name": assigned_team_name,
                "created_by": creator.real_name if creator else None,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "completed_at": p.completed_at.isoformat() if p.completed_at else None
            })
        
        logger.info(f"get_projects: returning {len(result)} projects")
        return result
    finally:
        db.close()


@router.get("/{project_id}")
async def get_project(request: Request, project_id: int):
    """获取项目详情"""
    from models.database import db_session
    from models.extended_models import Project, Package, User, CompanyBidNew
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        from models.extended_models import Project
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        
        creator = db.query(User).filter(User.id == project.created_by).first()
        packages = db.query(Package).filter(Package.project_id == project_id).all()
        
        package_list = []
        for pkg in packages:
            team = db.query(Team).filter(Team.id == pkg.assigned_team_id).first() if pkg.assigned_team_id else None
            package_list.append({
                "id": pkg.id,
                "package_name": pkg.package_name,
                "package_order": pkg.package_order,
                "status": pkg.status,
                "assigned_team": team.team_name if team else None,
                "assigned_at": pkg.assigned_at.isoformat() if pkg.assigned_at else None
            })
        
        # 获取公司列表
        companies = db.query(CompanyBidNew).filter(CompanyBidNew.project_id == project_id).all()
        company_list = []
        for company in companies:
            # 计算文件数量（排除 .md 和 .json 文件）
            folder_path = company.bid_folder_path
            file_count = 0
            if folder_path:
                # 转换为绝对路径
                from pathlib import Path
                src_dir = Path(__file__).parent.parent
                if folder_path.startswith("src/"):
                    folder_path = str(src_dir / folder_path[4:])
                if folder_path and os.path.exists(folder_path):
                    try:
                        # 遍历所有文件，排除 .md 和 .json 文件
                        excluded_extensions = {'.md', '.json'}
                        for root, dirs, files in os.walk(folder_path):
                            file_count += len([f for f in files if Path(f).suffix.lower() not in excluded_extensions])
                    except:
                        file_count = 0
            
            company_list.append({
                "id": company.id,
                "company_name": company.company_name,
                "status": company.ocr_status or company.status or "pending",
                "file_count": file_count,
                "bid_folder_path": company.bid_folder_path,
                "total_score": company.total_score,
                "created_at": company.created_at.isoformat() if company.created_at else None
            })
        
        # 获取项目分配的团队名称
        assigned_team_name = None
        if project.assigned_team_id:
            team = db.query(Team).filter(Team.id == project.assigned_team_id).first()
            assigned_team_name = team.team_name if team else None
        
        # 获取评审规则数量
        from models.extended_models import EvaluationRuleNew
        rule_count = db.query(EvaluationRuleNew).filter(
            EvaluationRuleNew.template_id == project_id,
            EvaluationRuleNew.is_active == True
        ).count()
        
        # 计算项目进度（基于子任务完成情况）
        from models.extended_models import SubTask
        subtasks = db.query(SubTask).filter(SubTask.package_id == project_id).all()
        if subtasks:
            total_subtasks = len(subtasks)
            completed_subtasks = len([st for st in subtasks if st.status == 'completed'])
            in_progress_subtasks = len([st for st in subtasks if st.status == 'in_progress'])
            project_progress = int((completed_subtasks / total_subtasks) * 100) if total_subtasks > 0 else 0
        else:
            total_subtasks = 0
            completed_subtasks = 0
            in_progress_subtasks = 0
            project_progress = 0
        
        return {
            "id": project.id,
            "project_name": project.project_name,
            "project_type": project.project_type,
            "status": project.status,
            "total_packages": project.total_packages,
            "total_companies": len(companies),
            "total_rules": rule_count,  # 新增：评审规则数量
            "zip_file_path": project.zip_file_path,
            "ocr_status": project.ocr_status,
            "upload_status": project.ocr_status,
            "total_score_avg": project.total_score_avg,
            "assigned_team_id": project.assigned_team_id,
            "assigned_team_name": assigned_team_name,
            "created_by": creator.real_name if creator else None,
            "created_at": project.created_at.isoformat() if project.created_at else None,
            "completed_at": project.completed_at.isoformat() if project.completed_at else None,
            "packages": package_list,
            "companies": company_list,
            "progress": project_progress,  # 项目进度
            "subtask_stats": {
                "total": total_subtasks,
                "completed": completed_subtasks,
                "in_progress": in_progress_subtasks
            }
        }
    finally:
        db.close()


@router.delete("/{project_id}")
async def delete_project(request: Request, project_id: int):
    """删除项目（包括所有关联数据）"""
    from models.database import db_session
    from models.extended_models import Project
    
    current_user = get_current_user_from_request(request)
    if not current_user or current_user.role not in ["admin", "team_leader"]:
        raise HTTPException(status_code=403, detail="无权限删除项目")
    
    db = db_session()
    try:
        from models.extended_models import (
            Project, CompanyBidNew, CompanyBid, Package, Assignment, 
            SubTask, EvaluationResult, EvaluationCriteria, EvaluationRuleNew, Team
        )
        
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        
        # 获取所有关联数据
        companies = db.query(CompanyBidNew).filter(CompanyBidNew.project_id == project_id).all()
        old_companies = db.query(CompanyBid).filter(CompanyBid.task_id == project_id).all()
        packages = db.query(Package).filter(Package.project_id == project_id).all()
        
        # 删除 ZIP 文件
        if project.zip_file_path and os.path.exists(project.zip_file_path):
            os.remove(project.zip_file_path)
        
        # 删除公司文件夹
        for company in companies:
            if company.bid_folder_path and os.path.exists(company.bid_folder_path):
                try:
                    shutil.rmtree(company.bid_folder_path)
                    logger.info(f"已删除公司文件夹：{company.bid_folder_path}")
                except Exception as e:
                    logger.error(f"删除公司文件夹失败 {company.bid_folder_path}: {e}")
        
        # 删除关联数据（按外键顺序）
        for pkg in packages:
            # 删除子任务
            db.query(SubTask).filter(SubTask.package_id == pkg.id).delete()
            # 删除分配记录
            db.query(Assignment).filter(Assignment.package_id == pkg.id).delete()
            # 删除评审结果
            db.query(EvaluationResult).filter(EvaluationResult.package_id == pkg.id).delete()
            # 删除评审项
            db.query(EvaluationCriteria).filter(EvaluationCriteria.package_id == pkg.id).delete()
        
        # 删除项目关联的评审规则
        db.query(EvaluationRuleNew).filter(EvaluationRuleNew.template_id == project_id).delete()
        
        # 删除包
        db.query(Package).filter(Package.project_id == project_id).delete()
        
        # 删除公司数据
        db.query(CompanyBidNew).filter(CompanyBidNew.project_id == project_id).delete()
        db.query(CompanyBid).filter(CompanyBid.task_id == project_id).delete()
        
        # 删除项目
        db.delete(project)
        db.commit()
        
        # 删除项目相关的数据文件夹（整个任务文件夹）
        from pathlib import Path
        src_dir = Path(__file__).parent.parent
        tasks_dir = src_dir / "data" / "tasks" / str(project_id)
        if tasks_dir.exists():
            try:
                shutil.rmtree(tasks_dir)
                logger.info(f"已删除任务文件夹：{tasks_dir}")
            except Exception as e:
                logger.error(f"删除任务文件夹失败 {tasks_dir}: {e}")
        
        logger.info(f"项目已删除：{project_id}")
        return {"message": "项目已删除（包括所有关联数据）"}
    finally:
        db.close()


# ==================== 标书上传 ====================

def process_project_ocr(project_id: int, stop_event: threading.Event = None):
    """处理项目的所有文档 OCR - 使用新模型 CompanyBidNew"""
    from models.database import db_session
    from models.extended_models import Project, CompanyBidNew as CompanyBid
    from services.ocr_service import OCRService
    from services.file_processor import FileProcessor
    
    logger.info(f"[project_id={project_id}] === 开始项目 OCR 处理 ===")
    
    db = db_session()
    try:
        # 更新项目状态为处理中
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            project.ocr_status = 'processing'
            project.status = 'packaging'  # 保持 packaging 状态直到 OCR 完成
            db.commit()
            logger.info(f"[project_id={project_id}] 项目 OCR 状态：processing")
        
        companies = db.query(CompanyBid).filter(CompanyBid.project_id == project_id).all()
        logger.info(f"[project_id={project_id}] 找到 {len(companies)} 家公司需要处理")
        
        if not companies:
            logger.warning(f"[project_id={project_id}] 没有公司数据")
            if project:
                project.ocr_status = 'idle'
                db.commit()
            return
            
        ocr_service = OCRService()
        src_dir = Path(__file__).parent.parent
        file_processor = FileProcessor(str(src_dir / "data"))
        
        total_files = 0
        processed_files = 0
        
        for company in companies:
            # 检查停止事件
            if stop_event and stop_event.is_set():
                logger.info(f"[project_id={project_id}] OCR 处理被用户停止")
                company.ocr_status = 'pending'
                db.commit()
                continue
            
            try:
                company.ocr_status = 'processing'
                db.commit()
                logger.info(f"[project_id={project_id}] 开始处理公司：{company.company_name} (id={company.id})")
                
                folder_path = company.bid_folder_path
                
                # 转换为绝对路径 - folder_path 格式为 "src/data/tasks/X/bids/..."
                if folder_path:
                    src_dir = Path(__file__).parent.parent
                    # 如果已经是绝对路径，直接使用
                    if os.path.isabs(folder_path):
                        abs_path = Path(folder_path)
                    # 如果以 src/ 开头，则基于 src_dir 拼接
                    elif folder_path.startswith("src/"):
                        abs_path = src_dir / folder_path[4:]  # 去掉 "src/" 前缀
                    else:
                        # 其他相对路径，直接拼接
                        abs_path = src_dir / folder_path
                    folder_path = str(abs_path)
                
                if not folder_path or not os.path.exists(folder_path):
                    logger.error(f"[project_id={project_id}] 公司文件夹不存在：{folder_path}")
                    company.ocr_status = 'failed'
                    db.commit()
                    continue
                
                logger.info(f"[project_id={project_id}] 公司文件夹路径：{folder_path}, exists={os.path.exists(folder_path)}")
                files = file_processor._collect_files(Path(folder_path))
                logger.info(f"[project_id={project_id}] 公司 {company.company_name} 找到 {len(files)} 个文件")
                total_files += len(files)
                
                doc_count = 0
                for file_info in files:
                    # 检查停止事件
                    if stop_event and stop_event.is_set():
                        logger.info(f"[project_id={project_id}] OCR 处理被用户停止")
                        break
                    
                    file_path = file_info["file_path"]
                    suffix = Path(file_path).suffix.lower()
                    
                    if suffix not in ['.doc', '.docx', '.pdf']:
                        logger.debug(f"[project_id={project_id}] 跳过非文档文件：{file_path}")
                        continue
                    
                    try:
                        logger.info(f"[project_id={project_id}] 正在 OCR: {Path(file_path).name}")
                        ocr_service.process_document_to_md(file_path, folder_path)
                        doc_count += 1
                        processed_files += 1
                        logger.info(f"[project_id={project_id}] ✓ OCR 完成：{Path(file_path).name}")
                        
                        # 更新解析进度
                        parse_status_map[project_id] = {
                            "status": "parsing",
                            "progress": int(processed_files * 100 / total_files) if total_files > 0 else 0,
                            "total_files": total_files,
                            "parsed_files": processed_files,
                            "error": None
                        }
                    except Exception as e:
                        logger.error(f"[project_id={project_id}] ✗ OCR 失败 {Path(file_path).name}: {e}")
                
                if stop_event and stop_event.is_set():
                    break
                
                if doc_count > 0:
                    company.ocr_status = 'completed'
                    logger.info(f"[project_id={project_id}] ✓ 公司 {company.company_name} OCR 完成，处理了 {doc_count} 个文档")
                else:
                    # 检查是否有可处理的文档
                    doc_files = [f for f in files if Path(f["file_path"]).suffix.lower() in ['.doc', '.docx', '.pdf']]
                    if doc_files:
                        logger.warning(f"[project_id={project_id}] ⚠ 公司 {company.company_name} 有文档但 OCR 失败")
                        company.ocr_status = 'failed'
                    else:
                        logger.info(f"[project_id={project_id}] ℹ 公司 {company.company_name} 没有可处理的文档 (.doc/.docx/.pdf)")
                        company.ocr_status = 'pending'
                db.commit()
                
            except Exception as e:
                logger.error(f"[project_id={project_id}] 处理公司文档失败 {company.company_name}: {e}", exc_info=True)
                company.ocr_status = 'failed'
                db.commit()
        
        # 完成所有处理
        if not (stop_event and stop_event.is_set()):
            logger.info(f"[project_id={project_id}] === 项目 OCR 处理完成 ===")
            if project:
                project.ocr_status = 'completed'
                # 保持 draft 状态，不改变项目状态，等待用户配置规则
                db.commit()
            
            parse_status_map[project_id] = {
                "status": "parsed",
                "progress": 100,
                "total_files": total_files,
                "parsed_files": processed_files,
                "error": None
            }
        else:
            logger.info(f"[project_id={project_id}] === 项目 OCR 处理被停止 ===")
            if project:
                project.ocr_status = 'idle'
                db.commit()
        if project_id in ocr_threads:
            del ocr_threads[project_id]
        
    except Exception as e:
        logger.error(f"[project_id={project_id}] OCR 处理任务失败：{e}", exc_info=True)
        if project:
            project.ocr_status = 'idle'
            db.commit()
        if project_id in ocr_threads:
            del ocr_threads[project_id]
    finally:
        db.close()


@router.post("/{project_id}/upload-bid")
async def upload_bid_file(request: Request, project_id: int, file: UploadFile = File(...)):
    """上传标书 ZIP 文件"""
    from models.database import db_session
    from models.extended_models import Project
    from services.file_processor import FileProcessor
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        from models.extended_models import Project
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        
        # 保存文件
        src_dir = Path(__file__).parent.parent
        upload_dir = src_dir / "data" / "uploads"
        upload_dir.mkdir(parents=True, exist_ok=True)
        file_path = upload_dir / f"{project_id}_{file.filename}"
        
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        project.zip_file_path = str(file_path)
        # 注意：此时不更新状态，等待所有操作成功后再统一更新
        
        # 解压并识别公司（与原有逻辑兼容）
        file_processor = FileProcessor(str(src_dir / "data"))
        companies = file_processor.process_bid_zip(project_id, str(file_path))
        
        if not companies:
            logger.warning(f"项目 {project_id} 未识别到任何公司文件夹")
            # 即使没有公司，也允许上传成功，用户可以手动添加
            project.status = "packaging"
            project.ocr_status = "idle"
            db.commit()
            return {
                "message": "上传成功，但未识别到公司文件夹",
                "companies": [],
                "ocr_status": "idle",
                "warning": "ZIP 文件中未找到符合格式的公司文件夹"
            }
        
        # 保存公司数据
        from models.extended_models import CompanyBidNew as CompanyBid
        for company_data in companies:
            company = CompanyBid(
                project_id=project_id,
                company_name=company_data["company_name"],
                bid_folder_path=company_data["folder_path"],
                ocr_status="pending"  # 初始状态为待解析
            )
            db.add(company)
        
        project.total_companies = len(companies)
        
        # 所有操作成功后，统一更新状态 - 保持 draft 状态，等待配置规则
        project.status = "draft"  # 保持 draft 状态，直到配置规则后才更新为 dispatching
        project.ocr_status = "parsing"  # 设置解析中状态
        
        # 初始化解析状态
        parse_status_map[project_id] = {
            "status": "parsing",
            "progress": 0,
            "total_files": 0,
            "parsed_files": 0,
            "error": None
        }
        
        db.commit()
        
        # 异步触发 OCR（使用新实现）
        stop_event = threading.Event()
        ocr_threads[project_id] = stop_event
        thread = threading.Thread(target=process_project_ocr, args=(project_id, stop_event), daemon=True)
        thread.start()
        
        return {
            "message": "上传成功，已开始解析文档",
            "companies": [c["company_name"] for c in companies],
            "ocr_status": "processing"
        }
    except Exception as e:
        logger.error(f"上传标书失败：{e}", exc_info=True)
        db.rollback()
        # 如果失败，尝试恢复项目状态
        try:
            project = db.query(Project).filter(Project.id == project_id).first()
            if project:
                project.status = "draft"
                project.ocr_status = "idle"
                db.commit()
        except:
            pass
        raise HTTPException(status_code=500, detail=f"上传失败：{str(e)}")
    finally:
        db.close()


# ==================== 分包操作 ====================

@router.post("/{project_id}/split-packages")
async def split_packages(request: Request, project_id: int, split_req: PackageSplitRequest):
    """分包操作"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role not in ["team_leader", "admin"]:
        raise HTTPException(status_code=403, detail="仅评标组长可分包")
    
    try:
        packages = dispatch_service.split_packages(
            project_id=project_id,
            package_count=split_req.package_count,
            creator_id=current_user.id,
            package_names=split_req.package_names
        )
        
        return {
            "message": "分包成功",
            "packages": [{
                "id": p.id,
                "package_name": p.package_name,
                "package_order": p.package_order
            } for p in packages]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{project_id}/dispatch-plan")
async def get_dispatch_plan(request: Request, project_id: int, team_count: int):
    """获取分包建议方案"""
    try:
        plan = dispatch_service.get_package_dispatch_plan(project_id, team_count)
        return plan
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 包分派 ====================

@router.post("/packages/{package_id}/assign-team")
async def assign_package_to_team(request: Request, package_id: int, assign_req: PackageAssignRequest):
    """将包分派给团队"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role not in ["team_leader", "admin"]:
        raise HTTPException(status_code=403, detail="仅评标组长可分派包")
    
    try:
        package = dispatch_service.assign_package_to_team(
            package_id=package_id,
            team_id=assign_req.team_id,
            assigned_by=current_user.id
        )
        
        return {
            "message": "分派成功",
            "package": {
                "id": package.id,
                "package_name": package.package_name,
                "assigned_team_id": package.assigned_team_id
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/packages/batch-assign")
async def batch_assign_packages(request: Request, project_id: int, package_team_mapping: dict):
    """批量分派包"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role not in ["team_leader", "admin"]:
        raise HTTPException(status_code=403, detail="仅评标组长可分派包")
    
    try:
        result = dispatch_service.batch_assign_packages(
            project_id=project_id,
            package_team_mapping={int(k): v for k, v in package_team_mapping.items()},
            assigned_by=current_user.id
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 导入 User/Team 模型 ====================
from models.extended_models import User, Team, CompanyBidNew as CompanyBid
from models.company_bids import CompanyBid as OldCompanyBid
import threading
import time

# 解析状态跟踪
parse_status_map = {}  # project_id -> {status, progress, total_files, parsed_files, error}
ocr_threads = {}  # project_id -> threading.Event (用于停止 OCR 处理)


# ==================== 标书解析状态 API ====================

@router.get("/{project_id}/parse-status")
async def get_parse_status(request: Request, project_id: int):
    """获取标书解析状态"""
    from models.database import db_session
    from models.extended_models import Project, CompanyBidNew as CompanyBid
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        from models.extended_models import Project
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        
        # 获取跟踪的解析状态
        status_info = parse_status_map.get(project_id, {
            "status": "idle",
            "progress": 0,
            "total_files": 0,
            "parsed_files": 0,
            "error": None
        })
        
        # 从数据库获取公司信息（使用 project_id）
        companies = db.query(CompanyBid).filter(CompanyBid.project_id == project_id).all()
        
        # 统计文件数量（排除 .md 和 .json 文件）
        total_files = 0
        for company in companies:
            folder_path = company.bid_folder_path
            if folder_path:
                from pathlib import Path
                src_dir = Path(__file__).parent.parent
                if folder_path.startswith("src/"):
                    folder_path = str(src_dir / folder_path[4:])
                if folder_path and os.path.exists(folder_path):
                    try:
                        excluded_extensions = {'.md', '.json'}
                        for root, dirs, files in os.walk(folder_path):
                            total_files += len([f for f in files if Path(f).suffix.lower() not in excluded_extensions])
                    except:
                        pass
        
        # 根据项目状态和 OCR 状态确定 upload_status
        upload_status = "idle"
        if project.ocr_status == "completed":
            upload_status = "completed"
        elif project.ocr_status == "parsing" or project.ocr_status == "processing":
            upload_status = "parsing"
        elif project.status == "packaging":
            upload_status = "parsing"
        elif project.status == "configuring" and project.ocr_status == "completed":
            upload_status = "completed"
        else:
            upload_status = project.ocr_status or "idle"
        
        return {
            "project_id": project_id,
            "upload_status": upload_status,
            "status": status_info["status"],
            "progress": status_info["progress"],
            "total_files": total_files,  # 从数据库统计
            "parsed_files": total_files,  # 解析完成时，parsed_files = total_files
            "error": status_info["error"],
            "company_count": len(companies),
            "project_status": project.status,  # 返回项目完整状态
            "ocr_status": project.ocr_status   # 返回 OCR 状态
        }
    finally:
        db.close()


@router.post("/{project_id}/stop-parse")
async def stop_parsing(request: Request, project_id: int):
    """停止标书解析"""
    from models.extended_models import Project
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        from models.extended_models import Project
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        
        # 停止解析线程
        if project_id in ocr_threads:
            ocr_threads[project_id].set()  # 设置停止事件
            del ocr_threads[project_id]
        
        # 更新状态
        project.ocr_status = "idle"
        parse_status_map[project_id] = {
            "status": "idle",
            "progress": 0,
            "total_files": 0,
            "parsed_files": 0,
            "error": "用户手动停止"
        }
        db.commit()
        
        return {"message": "解析已停止"}
    finally:
        db.close()


@router.post("/{project_id}/reparse")
async def reparse_bid(request: Request, project_id: int):
    """重新解析标书"""
    from models.extended_models import Project
    from services.file_processor import FileProcessor
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        from models.extended_models import Project
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        
        if not project.zip_file_path or not os.path.exists(project.zip_file_path):
            raise HTTPException(status_code=400, detail="标书文件不存在")
        
        # 清除旧的公司数据
        db.query(CompanyBid).filter(CompanyBid.project_id == project_id).delete()
        db.query(OldCompanyBid).filter(OldCompanyBid.task_id == project_id).delete()
        
        # 重新解压并识别公司
        src_dir = Path(__file__).parent.parent
        file_processor = FileProcessor(str(src_dir / "data"))
        companies = file_processor.process_bid_zip(project_id, project.zip_file_path)
        
        # 保存公司数据
        for company_data in companies:
            company = CompanyBid(
                project_id=project_id,
                company_name=company_data["company_name"],
                bid_folder_path=company_data["folder_path"],
                ocr_status="pending"
            )
            db.add(company)
        
        project.total_companies = len(companies)
        db.commit()
        
        # 更新解析状态
        parse_status_map[project_id] = {
            "status": "parsed",
            "progress": 100,
            "total_files": sum(len(c.get("files", [])) for c in companies),
            "parsed_files": sum(len(c.get("files", [])) for c in companies),
            "error": None
        }
        
        # 更新项目状态为 processing（解析完成）
        project.ocr_status = "completed"
        project.status = "processing"
        db.commit()
        
        return {"message": "已开始重新解析", "company_count": len(companies)}
    finally:
        db.close()


@router.delete("/{project_id}/bid")
async def delete_bid(request: Request, project_id: int):
    """删除标书及解析数据"""
    from models.extended_models import Project
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        from models.extended_models import Project, CompanyBidNew as CompanyBid
        from api.tasks import ocr_threads
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        
        # 停止正在进行的解析
        if project_id in ocr_threads:
            ocr_threads[project_id].set()
            del ocr_threads[project_id]
        
        # 获取所有公司文件夹路径（用于后续删除）
        companies = db.query(CompanyBid).filter(CompanyBid.project_id == project_id).all()
        company_folders = [c.bid_folder_path for c in companies if c.bid_folder_path]
        
        # 删除标书文件
        if project.zip_file_path and os.path.exists(project.zip_file_path):
            os.remove(project.zip_file_path)
        
        # 删除公司数据
        db.query(CompanyBid).filter(CompanyBid.project_id == project_id).delete()
        db.query(OldCompanyBid).filter(OldCompanyBid.task_id == project_id).delete()
        
        # 更新项目状态 - 恢复到上传前的状态
        project.zip_file_path = None
        project.ocr_status = "idle"
        project.total_companies = 0
        project.status = "draft"  # 恢复到草稿状态
        project.total_packages = 0
        db.commit()
        
        # 删除解压的公司文件夹
        for folder_path in company_folders:
            if folder_path and os.path.exists(folder_path):
                try:
                    import shutil
                    shutil.rmtree(folder_path)
                    logger.info(f"已删除公司文件夹：{folder_path}")
                except Exception as e:
                    logger.error(f"删除公司文件夹失败 {folder_path}: {e}")
        
        # 额外检查：删除整个任务文件夹（如果存在）
        # 这样即使数据库里没有公司记录，也能清理残留的文件
        tasks_dir = Path(__file__).parent.parent / "data" / "tasks" / str(project_id)
        if tasks_dir.exists():
            try:
                import shutil
                shutil.rmtree(tasks_dir)
                logger.info(f"已删除任务文件夹：{tasks_dir}")
            except Exception as e:
                logger.error(f"删除任务文件夹失败 {tasks_dir}: {e}")
        
        # 清除解析状态
        if project_id in parse_status_map:
            del parse_status_map[project_id]
        
        return {"message": "标书已删除"}
    finally:
        db.close()


@router.get("/{project_id}/companies")
async def get_project_companies(request: Request, project_id: int):
    """获取项目下的公司列表"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        from models.extended_models import Project
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        
        # 获取公司数据（尝试新旧表）
        companies = db.query(CompanyBid).filter(CompanyBid.project_id == project_id).all()
        if not companies:
            companies = db.query(OldCompanyBid).filter(OldCompanyBid.task_id == project_id).all()
        
        result = []
        for company in companies:
            # 计算文件数量（排除 .md 和 .json 文件）
            folder_path = company.bid_folder_path
            file_count = 0
            if folder_path:
                # 转换为绝对路径
                from pathlib import Path
                src_dir = Path(__file__).parent.parent
                if folder_path.startswith("src/"):
                    folder_path = str(src_dir / folder_path[4:])
                if folder_path and os.path.exists(folder_path):
                    try:
                        # 遍历所有文件，排除 .md 和 .json 文件
                        excluded_extensions = {'.md', '.json'}
                        for root, dirs, files in os.walk(folder_path):
                            file_count += len([f for f in files if Path(f).suffix.lower() not in excluded_extensions])
                    except:
                        file_count = 0
            
            result.append({
                "id": company.id,
                "company_name": company.company_name,
                "status": company.ocr_status or company.status or "pending",
                "file_count": file_count,
                "bid_folder_path": company.bid_folder_path,
                "total_score": company.total_score,
                "created_at": company.created_at.isoformat() if hasattr(company, 'created_at') and company.created_at else None
            })
        
        return {"companies": result, "total": len(result)}
    finally:
        db.close()


@router.get("/{project_id}/file-tree")
async def get_project_file_tree(request: Request, project_id: int, company_id: int):
    """获取项目下某公司的文件树"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        # 查找公司（尝试新旧表）
        company = db.query(CompanyBid).filter(CompanyBid.id == company_id).first()
        if not company:
            company = db.query(OldCompanyBid).filter(OldCompanyBid.id == company_id).first()
        
        if not company:
            raise HTTPException(status_code=404, detail="公司不存在")
        
        folder_path = company.bid_folder_path
        if not folder_path or not os.path.exists(folder_path):
            return {"files": []}
        
        # 构建文件树
        def build_file_tree(folder: Path, parent_key: str = "") -> list:
            files = []
            try:
                items = list(folder.iterdir())
                for item in sorted(items):
                    if item.is_dir():
                        dir_key = f"{parent_key}/{item.name}" if parent_key else item.name
                        dir_files = build_file_tree(item, dir_key)
                        total_size = sum(f.stat().st_size for f in item.rglob('*') if f.is_file()) if dir_files else 0
                        files.append({
                            "key": dir_key,
                            "title": item.name,
                            "type": "folder",
                            "size": total_size,
                            "children": dir_files,
                            "path": str(item)
                        })
                    else:
                        file_key = f"{parent_key}/{item.name}" if parent_key else item.name
                        ext = item.suffix.lower()
                        file_type = 'pdf' if ext == '.pdf' else 'doc' if ext in ['.doc', '.docx'] else 'xls' if ext in ['.xls', '.xlsx'] else 'txt' if ext == '.txt' else 'image' if ext in ['.jpg', '.jpeg', '.png', '.gif'] else 'other'
                        try:
                            file_size = item.stat().st_size
                        except:
                            file_size = 0
                        files.append({
                            "key": file_key,
                            "title": item.name,
                            "type": file_type,
                            "size": file_size,
                            "path": str(item)
                        })
            except Exception as e:
                logger.error(f"读取文件夹失败 {folder}: {e}")
            return files
        
        folder = Path(folder_path)
        file_tree = build_file_tree(folder)
        return {"files": file_tree}
    finally:
        db.close()


# ==================== 团队分派相关 API ====================

@router.get("/{project_id}/can-dispatch")
async def check_can_dispatch(request: Request, project_id: int):
    """检查项目是否可以派发任务
    
    前置条件（必须同时满足）：
    1. 标书已上传并解析完成（project.ocr_status == 'completed'）
    2. 项目必须有配置评审项（至少有一个 EvaluationCriteria）
    3. 如果已有包，所有包必须处于 pending 状态（未派发）才可以重新派发
       如果有包处于 in_progress 或 completed 状态，需要先重置才能派发
    """
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        from models.extended_models import Project
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        
        # 检查标书是否已上传并解析完成
        if not project.zip_file_path:
            return {
                "can_dispatch": False,
                "reason": "请先上传标书"
            }
        
        if project.ocr_status != 'completed':
            return {
                "can_dispatch": False,
                "reason": "标书解析未完成，请等待解析完成"
            }
        
        # 检查是否有评审项（支持两种方式：包关联的评审项 OR 项目关联的评审规则）
        from models.extended_models import Package, EvaluationCriteria, EvaluationRuleNew
        packages = db.query(Package).filter(Package.project_id == project_id).all()
        has_criteria = False
        
        # 方式 1：检查包关联的评审项
        for pkg in packages:
            criteria_count = db.query(EvaluationCriteria).filter(
                EvaluationCriteria.package_id == pkg.id,
                EvaluationCriteria.is_active == True
            ).count()
            if criteria_count > 0:
                has_criteria = True
                break
        
        # 方式 2：检查项目关联的评审规则（如果没有包关联的评审项）
        if not has_criteria:
            rule_count = db.query(EvaluationRuleNew).filter(
                EvaluationRuleNew.template_id == project_id,
                EvaluationRuleNew.is_active == True
            ).count()
            if rule_count > 0:
                has_criteria = True
        
        if not has_criteria:
            return {
                "can_dispatch": False,
                "reason": "请先配置评审规则"
            }
        
        # 检查是否有包处于执行中或完成状态（不允许重新派发）
        active_packages = [p for p in packages if p.status in ['in_progress', 'completed']]
        if active_packages:
            return {
                "can_dispatch": False,
                "reason": f'有 {len(active_packages)} 个包正在执行或已完成，如需重新派发请先重置项目'
            }
        
        return {
            "can_dispatch": True,
            "reason": None
        }
    finally:
        db.close()


@router.post("/{project_id}/reset")
async def reset_project(request: Request, project_id: int):
    """重置项目状态（清空所有派发记录，允许重新派发）"""
    from models.extended_models import Project, Package, Assignment, SubTask, EvaluationResult
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role not in ["team_leader", "admin"]:
        raise HTTPException(status_code=403, detail="仅评标组长或管理员可重置项目")
    
    db = db_session()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        
        # 获取项目下的所有包
        packages = db.query(Package).filter(Package.project_id == project_id).all()
        
        # 删除所有关联数据（按顺序删除外键约束）
        for pkg in packages:
            # 删除子任务
            db.query(SubTask).filter(SubTask.package_id == pkg.id).delete()
            # 删除分配记录
            db.query(Assignment).filter(Assignment.package_id == pkg.id).delete()
            # 重置包状态
            pkg.status = "pending"
            pkg.assigned_team_id = None
            pkg.assigned_by = None
            pkg.assigned_at = None
        
        # 重置项目状态
        project.status = "processing"  # 重置为 processing 状态，表示可以重新派发
        
        db.commit()
        
        logger.info(f"项目 {project_id} 已重置，共重置 {len(packages)} 个包")
        
        return {
            "message": "项目已重置，可以重新派发任务",
            "packages_reset": len(packages)
        }
    finally:
        db.close()


@router.post("/{project_id}/assign-to-team")
async def assign_project_to_team(request: Request, project_id: int, assign_req: PackageAssignRequest):
    """将项目分派给团队（评标组长操作）
    
    评标组长将项目分派给团队，项目状态变为 assigned
    项目包含的文件、评审项等直接随项目分派
    此时不创建子任务，等待团队组长细化任务
    """
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role not in ["team_leader", "admin"]:
        raise HTTPException(status_code=403, detail="仅评标组长可分派项目")
    
    db = db_session()
    try:
        from models.extended_models import Project, Team, CompanyBidNew as CompanyBid, EvaluationRuleNew
        
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        
        team = db.query(Team).filter(Team.id == assign_req.team_id).first()
        if not team:
            raise HTTPException(status_code=404, detail="团队不存在")
        
        # 检查项目是否已上传标书
        if not project.zip_file_path:
            raise HTTPException(status_code=400, detail="项目未上传标书，请先上传")
        
        # 检查项目是否已解析完成
        if project.ocr_status != 'completed':
            raise HTTPException(status_code=400, detail="项目标书未解析完成，请等待解析完成")
        
        # 检查项目是否有评审规则
        rules = db.query(EvaluationRuleNew).filter(
            EvaluationRuleNew.template_id == project_id,
            EvaluationRuleNew.is_active == True
        ).all()
        if not rules:
            raise HTTPException(status_code=400, detail="项目未配置评审规则，请先配置")
        
        # 检查项目是否已分派给其他团队
        if project.status == "assigned":
            raise HTTPException(status_code=400, detail="项目已分派给其他团队")
        
        # 分派项目给团队（项目级别，不需要包）
        project.assigned_team_id = assign_req.team_id
        project.assigned_by = current_user.id
        project.assigned_at = datetime.now()
        project.status = "assigned"  # 项目状态变为 assigned
        
        db.commit()
        
        # 获取公司信息（用于返回）
        companies = db.query(CompanyBid).filter(CompanyBid.project_id == project_id).all()
        
        logger.info(f"项目 {project_id} 已分派给团队 {assign_req.team_id}")
        
        return {
            "message": "分派成功，等待团队组长细化任务",
            "project": {
                "id": project.id,
                "project_name": project.project_name,
                "assigned_team": team.team_name,
                "company_count": len(companies),
                "rule_count": len(rules)
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"分派失败：{e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"分派失败：{str(e)}")
    finally:
        db.close()


@router.put("/{project_id}/assign-to-team")
async def update_project_team_assignment(request: Request, project_id: int, assign_req: PackageAssignRequest):
    """修改项目团队分派（新增）"""
    return await assign_project_to_team(request, project_id, assign_req)


# 请求模型
class PackageAssignRequest(BaseModel):
    team_id: int


class RefineTaskRequest(BaseModel):
    mode: str  # "by_company" | "by_criteria"
    team_members: list  # [{"evaluator_id": int, "task_type": "technical|business", "criteria": [], "documents": []}]


@router.get("/team-assigned-projects")
async def get_team_assigned_projects(request: Request):
    """获取当前用户团队已分派但未细化的项目
    
    只返回状态为 assigned 的项目
    """
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    # 团队组长、团队小组长、专家可以查看
    if current_user.role not in ["team_leader", "team_manager", "technical_evaluator", "business_evaluator", "admin"]:
        raise HTTPException(status_code=403, detail="无权查看团队任务")
    
    db = db_session()
    try:
        from models.extended_models import Project, Team, User, CompanyBidNew as CompanyBid
        
        # 获取当前用户的团队
        if current_user.role in ["admin"]:
            # 管理员可以看到所有 assigned 状态的项目
            projects = db.query(Project).filter(Project.status == "assigned").all()
        else:
            # 其他角色只能看到自己团队的项目
            if not current_user.team_id:
                return {"projects": []}
            projects = db.query(Project).filter(
                Project.status == "assigned",
                Project.assigned_team_id == current_user.team_id
            ).all()
        
        result = []
        for project in projects:
            team = db.query(Team).filter(Team.id == project.assigned_team_id).first() if project.assigned_team_id else None
            assigned_by_user = db.query(User).filter(User.id == project.assigned_by).first() if project.assigned_by else None
            company_count = db.query(CompanyBid).filter(CompanyBid.project_id == project.id).count()
            
            result.append({
                "project_id": project.id,
                "project_name": project.project_name,
                "assigned_team_id": project.assigned_team_id,
                "assigned_team_name": team.team_name if team else None,
                "assigned_by": assigned_by_user.real_name if assigned_by_user else None,
                "assigned_at": project.assigned_at.isoformat() if project.assigned_at else None,
                "status": project.status,
                "company_count": company_count
            })
        
        return {"projects": result}
    finally:
        db.close()


@router.get("/{project_id}/team-assignment")
async def get_project_team_assignment(request: Request, project_id: int):
    """获取项目当前团队分派情况（项目级别）"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        from models.extended_models import Project, Team, User
        
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        
        team = None
        assigned_by_user = None
        if project.assigned_team_id:
            team = db.query(Team).filter(Team.id == project.assigned_team_id).first()
        if project.assigned_by:
            assigned_by_user = db.query(User).filter(User.id == project.assigned_by).first()
        
        return {
            "project_id": project_id,
            "project_name": project.project_name,
            "assigned_team_id": project.assigned_team_id,
            "assigned_team_name": team.team_name if team else None,
            "assigned_by": assigned_by_user.real_name if assigned_by_user else None,
            "assigned_at": project.assigned_at.isoformat() if project.assigned_at else None,
            "status": project.status
        }
    finally:
        db.close()


@router.post("/{project_id}/refine")
async def refine_project_task(request: Request, project_id: int, refine_req: RefineTaskRequest):
    """团队组长细化项目任务
    
    团队组长将已分派到团队的项目细化为子任务，分配给团队成员
    """
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    # 团队组长、团队小组长、管理员可以细化任务
    if current_user.role not in ["team_leader", "team_manager", "admin"]:
        raise HTTPException(status_code=403, detail="仅团队组长可细化任务")
    
    db = db_session()
    try:
        from models.extended_models import Project, SubTask, Team, User
        
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        
        # 检查项目是否已分派给当前用户的团队
        if not project.assigned_team_id:
            raise HTTPException(status_code=400, detail="项目尚未分派给团队")
        
        # 检查项目状态：assigned 可以直接细化，processing 需要先删除旧子任务再重新细化
        if project.status not in ["assigned", "processing"]:
            raise HTTPException(status_code=400, detail=f"项目状态不允许细化：{project.status}")
        
        # 如果项目已经是 processing 状态，先删除所有旧子任务
        if project.status == "processing":
            old_subtasks = db.query(SubTask).filter(SubTask.package_id == project_id).all()
            if old_subtasks:
                for st in old_subtasks:
                    db.delete(st)
                db.commit()
                logger.info(f"项目 {project_id} 重新细化，已删除 {len(old_subtasks)} 个旧子任务")
        
        # 检查当前用户是否属于该团队
        if current_user.role not in ["admin"]:
            user_team_id = current_user.team_id
            if not user_team_id or user_team_id != project.assigned_team_id:
                raise HTTPException(status_code=403, detail="无权细化其他团队的任务")
        
        # 创建子任务
        mode = refine_req.mode
        team_members = refine_req.team_members
        
        # Debug log
        logger.info(f"refine_project_task: mode={mode}, team_members={team_members}, type={type(team_members)}")
        
        if not team_members:
            raise HTTPException(status_code=400, detail="请指定团队成员")
        
        if mode not in ["by_company", "by_criteria"]:
            raise HTTPException(status_code=400, detail="模式必须为 by_company 或 by_criteria")
        
        # 为每个团队成员创建子任务
        # 不再创建虚拟包，直接使用 project_id 作为 package_id
        for idx, member_info in enumerate(team_members):
            # Debug log
            logger.info(f"Processing member {idx}: {member_info}, type={type(member_info)}")
            
            # 确保 member_info 是字典
            if isinstance(member_info, int):
                # 如果是整数，可能是 evaluator_id，构造默认对象
                member_info = {"evaluator_id": member_info, "task_type": "technical"}
            elif isinstance(member_info, str):
                try:
                    member_info = json.loads(member_info)
                except:
                    logger.error(f"Invalid member_info format: {member_info}")
                    raise HTTPException(status_code=400, detail=f"无效的成员数据格式：{member_info}")
            
            if not isinstance(member_info, dict):
                logger.error(f"member_info is not a dict: {member_info}, type={type(member_info)}")
                raise HTTPException(status_code=400, detail=f"成员数据格式错误，期望字典，实际为 {type(member_info)}")
            
            subtask = SubTask(
                package_id=project_id,  # 直接使用 project_id 作为 package_id
                evaluator_id=member_info.get("evaluator_id"),
                task_type=member_info.get("task_type", "technical"),
                mode=mode,
                assigned_documents=json.dumps(member_info.get("documents", [])) if mode == "by_company" else None,
                assigned_criteria=json.dumps(member_info.get("criteria", [])) if mode == "by_criteria" else None,
                status="pending",
                created_at=datetime.now()
            )
            db.add(subtask)
        
        # 更新项目状态为 in_progress/processing
        project.status = "processing"
        
        db.commit()
        
        logger.info(f"项目 {project_id} 已细化为 {len(team_members)} 个子任务，模式：{mode}")
        
        return {
            "message": "任务细化成功",
            "project": {
                "id": project.id,
                "project_name": project.project_name,
                "subtask_count": len(team_members),
                "mode": mode
            },
            "subtasks": [
                {
                    "id": subtask.id,
                    "evaluator_id": subtask.evaluator_id,
                    "mode": subtask.mode,
                    "assigned_documents": json.loads(subtask.assigned_documents) if subtask.assigned_documents else [],
                    "assigned_criteria": json.loads(subtask.assigned_criteria) if subtask.assigned_criteria else [],
                    "status": subtask.status
                }
                for subtask in db.query(SubTask).filter(SubTask.package_id == project_id).all()
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"细化任务失败：{e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"细化失败：{str(e)}")
    finally:
        db.close()


# ==================== 项目评审规则 API ====================

@router.get("/{project_id}/rules")
async def get_project_rules(request: Request, project_id: int):
    """获取项目的评审规则"""
    from models.database import db_session
    from models.extended_models import Project, EvaluationRuleNew
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        
        # 从数据库获取项目的评审规则
        rules = db.query(EvaluationRuleNew).filter(
            EvaluationRuleNew.template_id == project_id,
            EvaluationRuleNew.is_active == True
        ).all()
        
        # 转换为前端需要的格式
        rules_data = []
        for rule in rules:
            config = {}
            if rule.config_json:
                try:
                    config = json.loads(rule.config_json)
                except:
                    config = {}
            
            rules_data.append({
                "id": rule.id,
                "item_name": rule.rule_name,
                "scoring_criteria": rule.rule_content,
                "max_score": config.get("max_score", 0),
                "source_files": config.get("source_files", [])
            })
        
        return {"rules": rules_data}
    except Exception as e:
        logger.error(f"获取评审规则失败：{e}")
        raise HTTPException(status_code=500, detail=f"获取失败：{str(e)}")
    finally:
        db.close()


@router.post("/{project_id}/rules")
async def save_project_rules(request: Request, project_id: int, rules_data: dict):
    """保存项目的评审规则"""
    from models.database import db_session
    from models.extended_models import Project, EvaluationRuleNew
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        
        # 保存评审规则到数据库
        # rules_data 格式：{"rules": [...], "project_type": "..."}
        rules = rules_data.get("rules", [])
        project_type = rules_data.get("project_type", project.project_type)
        
        # 删除项目原有的评审规则
        existing_rules = db.query(EvaluationRuleNew).filter(
            EvaluationRuleNew.template_id == project_id
        ).all()
        for rule in existing_rules:
            db.delete(rule)
        
        # 保存新的评审规则
        for rule_item in rules:
            new_rule = EvaluationRuleNew(
                rule_name=rule_item.get("item_name", ""),
                rule_content=rule_item.get("scoring_criteria", ""),
                config_json=json.dumps({
                    "max_score": rule_item.get("max_score", 0),
                    "source_files": rule_item.get("source_files", [])
                }),
                template_id=project_id,  # 使用 project_id 作为 template_id
                project_type=project_type,
                is_active=True
            )
            db.add(new_rule)
        
        # 更新项目状态：只有当标书已解析完成 AND 评审规则已配置时，才设置为 dispatching
        # 如果标书还没解析完成，保持当前状态（draft 或 packaging）
        if project.ocr_status == 'completed':
            project.status = "dispatching"
        else:
            # 标书还在解析中，保持 draft 状态
            project.status = "draft"
        db.commit()
        
        return {"message": "保存成功", "rules_count": len(rules)}
    except Exception as e:
        db.rollback()
        logger.error(f"保存评审规则失败：{e}")
        raise HTTPException(status_code=500, detail=f"保存失败：{str(e)}")
    finally:
        db.close()
