"""规则管理 API"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from pathlib import Path
import shutil
import json

from models.database import db_session
from models.evaluation_rules import EvaluationRule, TaskRule
from services.rule_config import RuleConfigManager
from config import config

router = APIRouter()
rule_config_manager = RuleConfigManager()


class RuleUploadResponse(BaseModel):
    id: int
    rule_name: str
    rule_file_path: Optional[str]
    rule_content: Optional[str] = None
    config: Optional[dict] = None
    created_at: Optional[str]


class RuleConfigUpdate(BaseModel):
    items: List[dict]


class ReviewItemCreate(BaseModel):
    item_name: str
    content: str
    source_files: List[str] = []
    max_score: float = 10
    is_active: bool = True


@router.post("/", response_model=RuleUploadResponse)
async def upload_rule(file: UploadFile = File(...)):
    """上传评审规则 MD 文件"""
    db = db_session()
    try:
        # 保存文件
        rules_dir = Path(config.RULES_DIR)
        rules_dir.mkdir(parents=True, exist_ok=True)
        
        file_path = rules_dir / file.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # 读取内容
        content = file_path.read_text(encoding='utf-8')
        
        # 创建规则记录
        rule = EvaluationRule(
            rule_name=file.filename.replace('.md', ''),
            rule_file_path=str(file_path),
            rule_content=content
        )
        db.add(rule)
        db.commit()
        db.refresh(rule)
        
        return rule.to_dict()
    finally:
        db.close()


@router.get("/", response_model=List[RuleUploadResponse])
async def list_rules():
    """获取规则列表"""
    db = db_session()
    try:
        rules = db.query(EvaluationRule).all()
        result = []
        for rule in rules:
            rule_dict = rule.to_dict()
            # 确保返回规则内容
            if not rule_dict.get('rule_content') and rule.rule_content:
                rule_dict['rule_content'] = rule.rule_content
            result.append(rule_dict)
        return result
    finally:
        db.close()


@router.get("/{rule_id}", response_model=RuleUploadResponse)
async def get_rule(rule_id: int):
    """获取规则详情"""
    db = db_session()
    try:
        rule = db.query(EvaluationRule).filter(EvaluationRule.id == rule_id).first()
        if not rule:
            raise HTTPException(status_code=404, detail="规则不存在")
        return rule.to_dict()
    finally:
        db.close()


@router.put("/{rule_id}/config")
async def update_rule_config(rule_id: int, config_data: RuleConfigUpdate):
    """更新规则配置"""
    db = db_session()
    try:
        rule = db.query(EvaluationRule).filter(EvaluationRule.id == rule_id).first()
        if not rule:
            raise HTTPException(status_code=404, detail="规则不存在")
        
        # 保存配置
        config_dict = {"items": [item.dict() if hasattr(item, 'dict') else item for item in config_data.items]}
        rule.set_config(config_dict)
        db.commit()
        
        # 也保存到内存缓存
        rule_config_manager.create_rule_config(rule_id, config_dict)
        
        return {"message": "配置更新成功"}
    finally:
        db.close()


@router.post("/item/", response_model=RuleUploadResponse)
async def create_review_item(item: ReviewItemCreate):
    """创建评审项（直接创建规则记录）"""
    db = db_session()
    try:
        # 创建规则记录（评审项本质上就是一个规则）
        rule = EvaluationRule(
            rule_name=item.item_name,
            rule_content=item.content,
            config_json=json.dumps({
                "items": [{
                    "item_name": item.item_name,
                    "source_files": item.source_files,
                    "max_score": item.max_score,
                    "scoring_criteria": item.content
                }]
            }, ensure_ascii=False)
        )
        db.add(rule)
        db.commit()
        db.refresh(rule)
        
        return rule.to_dict()
    finally:
        db.close()


@router.post("/{rule_id}/bind-files")
async def bind_files_to_rule(rule_id: int, request: dict):
    """为规则绑定源文件"""
    db = db_session()
    try:
        source_files = request.get("source_files", [])
        rule = db.query(EvaluationRule).filter(EvaluationRule.id == rule_id).first()
        if not rule:
            raise HTTPException(status_code=404, detail="规则不存在")
        
        # 更新规则配置
        config = json.loads(rule.config_json) if rule.config_json else {"items": []}
        
        # 如果 items 为空，创建一个
        if not config.get("items"):
            config["items"] = [{
                "item_name": rule.rule_name,
                "source_files": source_files,
                "max_score": 10,
                "scoring_criteria": rule.rule_content or ""
            }]
        else:
            config["items"][0]["source_files"] = source_files
        
        rule.config_json = json.dumps(config, ensure_ascii=False)
        db.commit()
        
        return {"message": "文件绑定成功"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.delete("/{rule_id}")
async def delete_rule(rule_id: int):
    """删除评审项/规则"""
    db = db_session()
    try:
        rule = db.query(EvaluationRule).filter(EvaluationRule.id == rule_id).first()
        if not rule:
            raise HTTPException(status_code=404, detail="规则不存在")
        
        # 删除关联的任务规则
        db.query(TaskRule).filter(TaskRule.rule_id == rule_id).delete()
        
        # 删除规则
        db.delete(rule)
        db.commit()
        
        return {"message": "规则已删除"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.post("/{rule_id}/associate")
async def associate_rule_to_task(rule_id: int, task_id: int):
    """将规则关联到任务"""
    db = db_session()
    try:
        # 检查规则是否存在
        rule = db.query(EvaluationRule).filter(EvaluationRule.id == rule_id).first()
        if not rule:
            raise HTTPException(status_code=404, detail="规则不存在")
        
        # 创建关联
        task_rule = TaskRule(task_id=task_id, rule_id=rule_id, is_active=True)
        db.add(task_rule)
        db.commit()
        
        return {"message": "规则已关联到任务"}
    finally:
        db.close()
