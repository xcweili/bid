"""项目数据导入 API - 接收评标辅助系统推送接口"""
import json
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, Header, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import List, Dict, Optional, Any
from loguru import logger
from datetime import datetime

from models.project_structure import Project, Section, Package, Bidder
from models.evaluation_rules import EvaluationRule, TaskRule
from models.evaluation_items import EvaluationItem, PackageItem as PackageRuleItem
from models.company_bids import CompanyBid
from models.database import db_session
from services.ftp_service import ftp_service
from models.bidder_files import PackageFileUpload

router = APIRouter()

# 请求模型定义
class RuleFileItem(BaseModel):
    file_path: List[str]
    # 允许额外字段（如测试结构化数据）
    extra_fields: Optional[Dict[str, Any]] = None
    
    class Config:
        extra = 'allow'

class EvaluationRuleItem(BaseModel):
    rule_code: str
    rule_name: str
    evaluation_type: str  # 技术 / 商务
    evaluation_stage: str  # 初评 / 详评
    rule_category: str
    rule_content: str
    file_list: List[RuleFileItem]

class BidderItem(BaseModel):
    company_name: str
    social_credit_code: str
    rule_list: List[EvaluationRuleItem]

class PackageItem(BaseModel):
    package_no: str
    bidders: List[BidderItem]

class SectionItem(BaseModel):
    section_code: str
    section_name: str
    packages: List[PackageItem]

class ProjectItem(BaseModel):
    project_code: str
    project_name: str
    sections: List[SectionItem]

class ImportRequest(BaseModel):
    projects: List[ProjectItem]

# 响应模型
class ImportResult(BaseModel):
    code: int = 0
    msg: str = "success"
    data: Dict[str, Any] = {}


def start_ftp_download_and_parse(
    project_code: str,
    section_code: str,
    package_no: str,
    files: List[Dict],
    package_id: int
):
    """启动 FTP 文件下载并解析（后台任务）"""
    db = db_session()
    try:
        logger.info(f"[FTP 下载] 开始任务：{project_code}-{section_code}-{package_no}")
        
        # 创建文件上传记录
        upload_record = PackageFileUpload(
            package_id=package_id,
            status='processing',
            total_files=sum(len(f.get('file_path', [])) for f in files)
        )
        db.add(upload_record)
        db.commit()
        db.refresh(upload_record)
        upload_id = upload_record.id
        
        # 目标目录结构与 zip 上传一致：package_files/pkg_{package_id}/公司名称/
        extract_dir = Path(os.path.dirname(__file__)).parent / "data" / "package_files" / f"pkg_{package_id}"
        extract_dir.mkdir(parents=True, exist_ok=True)
        
        # 收集按公司分类的文件
        files_by_company = {}
        
        def extract_company_name(remote_path: str) -> str:
            """从路径中提取公司名称（从文件向外层找，第一个包含'公司'字样的目录）"""
            path_parts = remote_path.strip('/').split('/')
            # 从文件所在位置向外层查找（去掉文件名，从倒数第二位开始向前找）
            for i in range(len(path_parts)-2, -1, -1):
                part = path_parts[i]
                if '公司' in part:
                    return part
            # 如果没找到包含'公司'的目录，使用最后一个目录名（文件名的上一级）
            if len(path_parts) >= 2:
                return path_parts[-2]
            return "未知公司"
        
        for file_item in files:
            remote_paths = file_item.get('file_path', [])
            for remote_path in remote_paths:
                company_name = extract_company_name(remote_path)
                if company_name not in files_by_company:
                    files_by_company[company_name] = []
                files_by_company[company_name].append(remote_path)
        
        # 使用独立的临时目录下载，避免文件锁影响后续解析
        import shutil
        tmp_base = Path(os.path.dirname(__file__)).parent / "data" / "package_files" / f"_ftp_tmp_{package_id}"
        if tmp_base.exists():
            shutil.rmtree(tmp_base)
        
        batch_tasks = []
        for company_name, remote_paths in files_by_company.items():
            batch_tasks.append({
                "project_code": f"_ftp_tmp_{package_id}",
                "section_code": company_name,
                "package_no": "",
                "files": [{"file_path": remote_paths}]
            })
        
        def on_task_complete(task_key: str, result: dict):
            for f in result.get('failed', []):
                logger.warning(f"[FTP 下载] 文件下载失败：{f}")

        ftp_service.download_batch(
            tasks=batch_tasks,
            on_task_complete=on_task_complete
        )
        
        # 断开 FTP 后，把文件从临时目录移到目标目录
        for company_name in files_by_company:
            src = tmp_base / company_name
            dst = extract_dir / company_name
            dst.mkdir(parents=True, exist_ok=True)
            if src.exists():
                for item in src.iterdir():
                    shutil.copy2(item, dst / item.name)
                logger.debug(f"[FTP 下载] 已移动 {company_name} 文件到目标目录")
        
        # 清理临时目录
        if tmp_base.exists():
            shutil.rmtree(tmp_base)
        
        logger.info(f"[FTP 下载] 下载完成")
        
        # ========== 触发完整解析流程（与 zip 上传相同）==========
        logger.info(f"[FTP 下载] 开始触发完整解析流程")
        
        # 导入解析函数
        from api.package_files_api import process_package_files
        import threading
        
        # 创建停止事件
        stop_event = threading.Event()
        
        # 调用与 zip 上传相同的解析函数
        process_package_files(package_id, upload_id, str(extract_dir), stop_event)
        
        logger.info(f"[FTP 下载] 解析流程已完成")
        
        # 更新上传记录（process_package_files 会关闭会话，需要重新获取）
        try:
            db = db_session()
            upload_record = db.query(PackageFileUpload).filter(PackageFileUpload.id == upload_id).first()
            if upload_record:
                upload_record.status = 'completed'
                upload_record.extract_dir = str(extract_dir)
                upload_record.completed_at = datetime.now()
                db.commit()
            db.close()
        except Exception as update_e:
            logger.error(f"[FTP 下载] 更新上传记录失败：{update_e}")
        
    except Exception as e:
        logger.error(f"[FTP 下载] 任务失败：{project_code}-{section_code}-{package_no} - {e}", exc_info=True)
        # 更新上传记录为失败状态
        try:
            upload_record.status = 'failed'
            db.commit()
        except:
            pass
    finally:
        db.close()


@router.post("/import-project-bid-structure", response_model=ImportResult)
async def import_project_bid_structure(
    request: ImportRequest,
    authorization: Optional[str] = Header(None),
    background_tasks: BackgroundTasks = None
):
    """
    接收评标辅助系统推送接口
    
    包含项目 - 标段 - 包 - 细则 - 投标人 - 文件全路径信息
    
    请求头鉴权：Authorization: bearer apikey
    """
    # 简单的鉴权验证（可根据实际需求扩展）
    if authorization and authorization.startswith('bearer '):
        api_key = authorization.split(' ')[1]
        # 可以在这里添加更复杂的 API key 验证逻辑
        logger.info(f"API 请求已鉴权，API Key: {api_key[:8]}***")
    else:
        logger.warning("API 请求未携带授权信息")
    
    db = db_session()
    try:
        # 统计变量
        stats = {
            "imported_pairs": 0,
            "cleared_rows": 0,
            "created_rows": 0,
            "created_projects": 0,
            "created_sections": 0,
            "created_packages": 0,
            "created_bidders": 0,
            "created_rules": 0,
            "error_count": 0,
            "errors": []
        }
        
        for project_data in request.projects:
            try:
                # 查找或创建项目
                project = db.query(Project).filter(
                    Project.project_code == project_data.project_code
                ).first()
                
                if project:
                    logger.info(f"项目已存在，更新: {project_data.project_code}")
                    project.project_name = project_data.project_name
                else:
                    project = Project(
                        project_code=project_data.project_code,
                        project_name=project_data.project_name
                    )
                    db.add(project)
                    stats["created_projects"] += 1
                
                db.flush()  # 获取 project.id
                
                # 处理标段
                for section_data in project_data.sections:
                    try:
                        # 查找或创建标段
                        section = db.query(Section).filter(
                            Section.project_id == project.id,
                            Section.section_code == section_data.section_code
                        ).first()
                        
                        if section:
                            logger.info(f"标段已存在，更新: {section_data.section_code}")
                            section.section_name = section_data.section_name
                        else:
                            section = Section(
                                project_id=project.id,
                                section_code=section_data.section_code,
                                section_name=section_data.section_name
                            )
                            db.add(section)
                            stats["created_sections"] += 1
                        
                        db.flush()  # 获取 section.id
                        
                        # 处理包
                        for package_data in section_data.packages:
                            try:
                                # 查找或创建包
                                pkg = db.query(Package).filter(
                                    Package.section_id == section.id,
                                    Package.package_no == package_data.package_no
                                ).first()
                                
                                if pkg:
                                    logger.info(f"包已存在，更新: {package_data.package_no}")
                                else:
                                    pkg = Package(
                                        section_id=section.id,
                                        package_no=package_data.package_no
                                    )
                                    db.add(pkg)
                                    stats["created_packages"] += 1
                                
                                db.flush()  # 获取 pkg.id
                                
                                # 处理投标人
                                for bidder_data in package_data.bidders:
                                    try:
                                        # 查找或创建投标人
                                        bidder = db.query(Bidder).filter(
                                            Bidder.package_id == pkg.id,
                                            Bidder.company_name == bidder_data.company_name
                                        ).first()
                                        
                                        if bidder:
                                            logger.info(f"投标人已存在，更新: {bidder_data.company_name}")
                                            bidder.social_credit_code = bidder_data.social_credit_code
                                        else:
                                            bidder = Bidder(
                                                package_id=pkg.id,
                                                company_name=bidder_data.company_name,
                                                social_credit_code=bidder_data.social_credit_code
                                            )
                                            db.add(bidder)
                                            stats["created_bidders"] += 1
                                        
                                        db.flush()
                                        
                                        # 处理评审规则：收集所有投标人的规则，去重后写入包级配置
                                        for rule_data in bidder_data.rule_list:
                                            # 查找或创建 EvaluationItem（全局模板）
                                            item = db.query(EvaluationItem).filter(
                                                EvaluationItem.item_code == rule_data.rule_code
                                            ).first()
                                            
                                            if not item:
                                                item = EvaluationItem(
                                                    item_code=rule_data.rule_code,
                                                    item_name=rule_data.rule_name,
                                                    item_content=rule_data.rule_content,
                                                    is_active=True
                                                )
                                                db.add(item)
                                                db.flush()
                                                stats["created_rules"] += 1
                                            
                                            # 创建/更新 PackageRuleItem（包级配置）
                                            pi = db.query(PackageRuleItem).filter(
                                                PackageRuleItem.package_id == pkg.id,
                                                PackageRuleItem.item_id == item.id
                                            ).first()
                                            
                                            if not pi:
                                                # 提取绑定的文件名列表（去重）
                                                bound_names = []
                                                for rf in rule_data.file_list:
                                                    for fp in rf.file_path:
                                                        fname = os.path.basename(fp)
                                                        if fname not in bound_names:
                                                            bound_names.append(fname)
                                                
                                                pi = PackageRuleItem(
                                                    package_id=pkg.id,
                                                    item_id=item.id,
                                                    is_required=True,
                                                    evaluation_type=rule_data.evaluation_type,
                                                    evaluation_stage=rule_data.evaluation_stage,
                                                    rule_category=rule_data.rule_category,
                                                    rule_content=rule_data.rule_content,
                                                    bound_filenames=json.dumps(bound_names, ensure_ascii=False)
                                                )
                                                db.add(pi)
                                            else:
                                                # 已存在时更新包级配置字段
                                                pi.evaluation_type = rule_data.evaluation_type
                                                pi.evaluation_stage = rule_data.evaluation_stage
                                                pi.rule_category = rule_data.rule_category
                                                pi.rule_content = rule_data.rule_content
                                            
                                            stats["imported_pairs"] += 1
                                        
                                    except Exception as e:
                                        stats["error_count"] += 1
                                        stats["errors"].append(f"投标人处理失败: {bidder_data.company_name} - {str(e)}")
                                        logger.error(f"投标人处理失败: {bidder_data.company_name} - {e}")
                            
                            except Exception as e:
                                stats["error_count"] += 1
                                stats["errors"].append(f"包处理失败: {package_data.package_no} - {str(e)}")
                                logger.error(f"包处理失败: {package_data.package_no} - {e}")
                        
                    except Exception as e:
                        stats["error_count"] += 1
                        stats["errors"].append(f"标段处理失败: {section_data.section_code} - {str(e)}")
                        logger.error(f"标段处理失败: {section_data.section_code} - {e}")
            
            except Exception as e:
                stats["error_count"] += 1
                stats["errors"].append(f"项目处理失败: {project_data.project_code} - {str(e)}")
                logger.error(f"项目处理失败: {project_data.project_code} - {e}")
        
        # 提交事务
        db.commit()
        
        # 更新总行数统计
        stats["created_rows"] = (
            stats["created_projects"] + 
            stats["created_sections"] + 
            stats["created_packages"] + 
            stats["created_bidders"]
        )
        
        logger.info(f"项目数据导入完成：{stats}")
        
        # 启动 FTP 文件下载任务（后台异步执行）
        if background_tasks:
            for project_data in request.projects:
                for section_data in project_data.sections:
                    for package_data in section_data.packages:
                        # 收集所有文件（转换为字典格式）
                        all_files = []
                        for bidder_data in package_data.bidders:
                            for rule_data in bidder_data.rule_list:
                                for file_item in rule_data.file_list:
                                    all_files.append(file_item.dict())
                        
                        if all_files:
                            # 查找对应的包 ID
                            pkg = db.query(Package).filter(
                                Package.section_id == db.query(Section).filter(
                                    Section.section_code == section_data.section_code,
                                    Section.project_id == db.query(Project).filter(
                                        Project.project_code == project_data.project_code
                                    ).first().id
                                ).first().id,
                                Package.package_no == package_data.package_no
                            ).first()
                            
                            if pkg:
                                logger.info(f"将启动 FTP 下载任务：{project_data.project_code}-{section_data.section_code}-{package_data.package_no}")
                                background_tasks.add_task(
                                    start_ftp_download_and_parse,
                                    project_data.project_code,
                                    section_data.section_code,
                                    package_data.package_no,
                                    all_files,
                                    pkg.id
                                )
                            else:
                                logger.warning(f"未找到对应的包，跳过 FTP 下载：{package_data.package_no}")
        
        return ImportResult(data=stats)
        
    except Exception as e:
        db.rollback()
        logger.error(f"项目数据导入失败: {e}")
        raise HTTPException(status_code=500, detail=f"导入失败: {str(e)}")
    finally:
        db.close()


@router.get("/projects")
async def get_projects():
    """获取项目列表"""
    db = db_session()
    try:
        projects = db.query(Project).all()
        result = []
        for project in projects:
            project_dict = project.to_dict()
            # 添加标段信息
            sections = []
            for section in project.sections:
                section_dict = section.to_dict()
                # 添加包信息
                packages = []
                for pkg in section.packages:
                    pkg_dict = pkg.to_dict()
                    # 查询实际关联的评审项数量，确保 item_count 正确
                    from models.evaluation_items import PackageItem
                    actual_item_count = db.query(PackageItem).filter(PackageItem.package_id == pkg.id).count()
                    pkg_dict['item_count'] = actual_item_count
                    # 添加投标人信息
                    bidders = [b.to_dict() for b in pkg.bidders]
                    pkg_dict['bidders'] = bidders
                    packages.append(pkg_dict)
                section_dict['packages'] = packages
                sections.append(section_dict)
            project_dict['sections'] = sections
            result.append(project_dict)
        return result
    finally:
        db.close()


@router.get("/projects/{project_id}")
async def get_project(project_id: int):
    """获取项目详情"""
    db = db_session()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        
        project_dict = project.to_dict()
        # 添加标段信息
        sections = []
        for section in project.sections:
            section_dict = section.to_dict()
            # 添加包信息
            packages = []
            for pkg in section.packages:
                pkg_dict = pkg.to_dict()
                # 查询实际关联的评审项数量，确保 item_count 正确
                from models.evaluation_items import PackageItem
                actual_item_count = db.query(PackageItem).filter(PackageItem.package_id == pkg.id).count()
                pkg_dict['item_count'] = actual_item_count
                # 添加投标人信息
                bidders = [b.to_dict() for b in pkg.bidders]
                pkg_dict['bidders'] = bidders
                packages.append(pkg_dict)
            section_dict['packages'] = packages
            sections.append(section_dict)
        project_dict['sections'] = sections
        
        return project_dict
    finally:
        db.close()


@router.delete("/projects/{project_id}")
async def delete_project(project_id: int):
    """删除项目（级联删除所有关联数据和文件）"""
    import shutil
    db = db_session()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        
        # 收集所有包ID，用于删除磁盘文件
        pkg_ids = []
        for section in project.sections:
            for pkg in section.packages:
                pkg_ids.append(pkg.id)
        
        # 先删除磁盘上的包文件和相关上传文件
        src_dir = Path(__file__).parent.parent
        for pkg_id in pkg_ids:
            # 删除包文件目录
            extract_dir = src_dir / "data" / "package_files" / f"pkg_{pkg_id}"
            if extract_dir.exists():
                try:
                    shutil.rmtree(extract_dir)
                    logger.info(f"已删除包文件目录: {extract_dir}")
                except Exception as e:
                    logger.error(f"删除包文件目录失败 {extract_dir}: {e}")
            
            # 删除上传的ZIP文件
            from models.bidder_files import PackageFileUpload
            uploads = db.query(PackageFileUpload).filter(
                PackageFileUpload.package_id == pkg_id
            ).all()
            for upload in uploads:
                if upload.zip_file_path and os.path.exists(upload.zip_file_path):
                    try:
                        os.remove(upload.zip_file_path)
                        logger.info(f"已删除ZIP文件: {upload.zip_file_path}")
                    except Exception as e:
                        logger.error(f"删除ZIP文件失败 {upload.zip_file_path}: {e}")
        
        # 级联删除数据库记录
        db.delete(project)
        db.commit()
        
        return {"message": "项目已删除", "deleted_packages": len(pkg_ids)}
    except Exception as e:
        db.rollback()
        logger.error(f"删除项目失败: {e}")
        raise HTTPException(status_code=500, detail="删除失败")
    finally:
        db.close()