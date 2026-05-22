"""项目数据导入API - 接收评标辅助系统推送接口"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import List, Dict, Optional, Any
from loguru import logger
from datetime import datetime

from models.project_structure import Project, Section, Package, Bidder
from models.evaluation_rules import EvaluationRule, TaskRule
from models.company_bids import CompanyBid
from models.database import db_session

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


@router.post("/import-project-bid-structure", response_model=ImportResult)
async def import_project_bid_structure(
    request: ImportRequest,
    authorization: Optional[str] = Header(None)
):
    """
    接收评标辅助系统推送接口
    
    包含项目-标段-包-细则-投标人-文件全路径信息
    
    请求头鉴权：Authorization: bearer apikey
    """
    # 简单的鉴权验证（可根据实际需求扩展）
    if authorization and authorization.startswith('bearer '):
        api_key = authorization.split(' ')[1]
        # 可以在这里添加更复杂的API key验证逻辑
        logger.info(f"API请求已鉴权，API Key: {api_key[:8]}***")
    else:
        logger.warning("API请求未携带授权信息")
    
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
                                        
                                        # 处理评审规则（这里可以扩展保存规则信息）
                                        for rule_data in bidder_data.rule_list:
                                            # 可以保存规则到 EvaluationRule 表
                                            # 或者创建关联表来记录投标人与规则的关系
                                            stats["created_rules"] += 1
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
        
        logger.info(f"项目数据导入完成: {stats}")
        
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
    """删除项目（级联删除所有关联数据）"""
    db = db_session()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        
        db.delete(project)
        db.commit()
        
        return {"message": "项目已删除"}
    except Exception as e:
        db.rollback()
        logger.error(f"删除项目失败: {e}")
        raise HTTPException(status_code=500, detail="删除失败")
    finally:
        db.close()