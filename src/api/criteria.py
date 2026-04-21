"""评审项管理 API"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
from loguru import logger
from datetime import datetime
import json

from api.middleware import get_current_user_from_request
from models.database import db_session
from models.extended_models import EvaluationCriteria, Package

router = APIRouter(prefix="/api/criteria", tags=["评审项管理"])


# 请求模型
class CreateCriteriaRequest(BaseModel):
    package_id: int
    criteria_name: str
    criteria_type: str  # technical/business
    max_score: float = 100.0
    scoring_criteria: Optional[str] = None
    config: Optional[dict] = None


class UpdateCriteriaRequest(BaseModel):
    criteria_name: Optional[str] = None
    criteria_type: Optional[str] = None
    max_score: Optional[float] = None
    scoring_criteria: Optional[str] = None
    config: Optional[dict] = None
    is_active: Optional[bool] = None


@router.get("/package/{package_id}")
async def get_package_criteria(request: Request, package_id: int):
    """获取包的评审项列表"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        criteria_list = db.query(EvaluationCriteria).filter(
            EvaluationCriteria.package_id == package_id,
            EvaluationCriteria.is_active == True
        ).all()
        
        return [{
            "id": c.id,
            "package_id": c.package_id,
            "criteria_name": c.criteria_name,
            "criteria_type": c.criteria_type,
            "max_score": c.max_score,
            "scoring_criteria": c.scoring_criteria,
            "config": json.loads(c.config_json) if c.config_json else None,
            "created_at": c.created_at.isoformat() if c.created_at else None
        } for c in criteria_list]
    finally:
        db.close()


@router.get("/package/{package_id}/by-type")
async def get_criteria_by_type(request: Request, package_id: int, criteria_type: str):
    """按类型获取评审项（technical/business）"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        criteria_list = db.query(EvaluationCriteria).filter(
            EvaluationCriteria.package_id == package_id,
            EvaluationCriteria.criteria_type == criteria_type,
            EvaluationCriteria.is_active == True
        ).all()
        
        return [{
            "id": c.id,
            "criteria_name": c.criteria_name,
            "criteria_type": c.criteria_type,
            "max_score": c.max_score,
            "scoring_criteria": c.scoring_criteria
        } for c in criteria_list]
    finally:
        db.close()


@router.post("")
async def create_criteria(request: Request, criteria_req: CreateCriteriaRequest):
    """创建评审项"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    # 团队小组长、评标组长、管理员可以创建
    if current_user.role not in ["team_manager", "team_leader", "admin"]:
        raise HTTPException(status_code=403, detail="无权限创建评审项")
    
    db = db_session()
    try:
        # 检查包是否存在
        package = db.query(Package).filter(Package.id == criteria_req.package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")
        
        criteria = EvaluationCriteria(
            package_id=criteria_req.package_id,
            criteria_name=criteria_req.criteria_name,
            criteria_type=criteria_req.criteria_type,
            max_score=criteria_req.max_score,
            scoring_criteria=criteria_req.scoring_criteria,
            config_json=json.dumps(criteria_req.config) if criteria_req.config else None,
            is_active=True,
            created_at=datetime.now()
        )
        db.add(criteria)
        db.commit()
        db.refresh(criteria)
        
        return {
            "message": "评审项创建成功",
            "criteria": {
                "id": criteria.id,
                "criteria_name": criteria.criteria_name,
                "criteria_type": criteria.criteria_type
            }
        }
    finally:
        db.close()


@router.post("/batch-create")
async def batch_create_criteria(request: Request, package_id: int, criteria_list: List[dict]):
    """批量创建评审项（从模板导入）"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role not in ["team_manager", "team_leader", "admin"]:
        raise HTTPException(status_code=403, detail="无权限创建评审项")
    
    db = db_session()
    try:
        # 检查包是否存在
        package = db.query(Package).filter(Package.id == package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")
        
        created_count = 0
        for criteria_data in criteria_list:
            criteria = EvaluationCriteria(
                package_id=package_id,
                criteria_name=criteria_data.get("criteria_name", ""),
                criteria_type=criteria_data.get("criteria_type", "technical"),
                max_score=criteria_data.get("max_score", 100.0),
                scoring_criteria=criteria_data.get("scoring_criteria", ""),
                config_json=json.dumps(criteria_data.get("config", {})) if criteria_data.get("config") else None,
                is_active=True,
                created_at=datetime.now()
            )
            db.add(criteria)
            created_count += 1
        
        db.commit()
        
        return {
            "message": f"批量创建成功，共 {created_count} 个评审项",
            "count": created_count
        }
    finally:
        db.close()


@router.put("/{criteria_id}")
async def update_criteria(request: Request, criteria_id: int, criteria_req: UpdateCriteriaRequest):
    """更新评审项"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role not in ["team_manager", "team_leader", "admin"]:
        raise HTTPException(status_code=403, detail="无权限更新评审项")
    
    db = db_session()
    try:
        criteria = db.query(EvaluationCriteria).filter(
            EvaluationCriteria.id == criteria_id
        ).first()
        
        if not criteria:
            raise HTTPException(status_code=404, detail="评审项不存在")
        
        if criteria_req.criteria_name:
            criteria.criteria_name = criteria_req.criteria_name
        if criteria_req.criteria_type:
            criteria.criteria_type = criteria_req.criteria_type
        if criteria_req.max_score:
            criteria.max_score = criteria_req.max_score
        if criteria_req.scoring_criteria:
            criteria.scoring_criteria = criteria_req.scoring_criteria
        if criteria_req.config:
            criteria.config_json = json.dumps(criteria_req.config)
        if criteria_req.is_active is not None:
            criteria.is_active = criteria_req.is_active
        
        criteria.updated_at = datetime.now()
        db.commit()
        
        return {"message": "评审项更新成功"}
    finally:
        db.close()


@router.delete("/{criteria_id}")
async def delete_criteria(request: Request, criteria_id: int):
    """删除评审项（软删除）"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role not in ["team_manager", "team_leader", "admin"]:
        raise HTTPException(status_code=403, detail="无权限删除评审项")
    
    db = db_session()
    try:
        criteria = db.query(EvaluationCriteria).filter(
            EvaluationCriteria.id == criteria_id
        ).first()
        
        if not criteria:
            raise HTTPException(status_code=404, detail="评审项不存在")
        
        criteria.is_active = False
        db.commit()
        
        return {"message": "评审项已删除"}
    finally:
        db.close()


@router.post("/package/{package_id}/from-template")
async def load_criteria_from_template(request: Request, package_id: int, template_type: str):
    """从模板加载评审项"""
    from services.rule_template_service import rule_template_service
    
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role not in ["team_manager", "team_leader", "admin"]:
        raise HTTPException(status_code=403, detail="无权限加载模板")
    
    db = db_session()
    try:
        # 检查包是否存在
        package = db.query(Package).filter(Package.id == package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")
        
        # 获取模板
        template = rule_template_service.get_template_by_type(template_type)
        if not template:
            raise HTTPException(status_code=404, detail="模板不存在")
        
        # 从模板配置中提取评审项
        items = template.get("items", [])
        criteria_list = []
        
        for item in items:
            # 判断类型
            criteria_type = "technical"
            item_name = item.get("item_name", "").lower()
            if any(kw in item_name for kw in ["商务", "价格", "报价", "业绩", "资质"]):
                criteria_type = "business"
            
            criteria = EvaluationCriteria(
                package_id=package_id,
                criteria_name=item.get("item_name", ""),
                criteria_type=criteria_type,
                max_score=item.get("max_score", 100.0),
                scoring_criteria=item.get("scoring_criteria", ""),
                config_json=json.dumps(item) if item else None,
                is_active=True,
                created_at=datetime.now()
            )
            db.add(criteria)
            criteria_list.append(criteria)
        
        db.commit()
        
        return {
            "message": f"从模板加载成功，共 {len(criteria_list)} 个评审项",
            "count": len(criteria_list)
        }
    finally:
        db.close()
