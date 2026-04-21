"""评审规则模板 API"""
from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel
from typing import List, Optional
from loguru import logger

from services.rule_template_service import rule_template_service
from api.middleware import get_current_user_from_request

router = APIRouter(prefix="/api/rule-templates", tags=["规则模板管理"])


# 请求模型
class CreateTemplateRequest(BaseModel):
    template_name: str
    project_type: str  # service, material, engineering
    config: dict  # 必须是字典格式：{"items": [...]}
    description: Optional[str] = None


class UpdateTemplateRequest(BaseModel):
    template_name: Optional[str] = None
    config: Optional[dict] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class ImportCriteriaRequest(BaseModel):
    """导入评审项请求"""
    criteria_list: List[dict]  # 评审项列表


@router.get("")
async def get_templates(request: Request, project_type: Optional[str] = None):
    """获取规则模板列表"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    templates = rule_template_service.get_all_templates(project_type=project_type, is_active=True)
    
    # 统一字段名并添加默认值
    result = []
    for t in templates:
        # t 可能是 dict 或对象
        if isinstance(t, dict):
            template_dict = t
        else:
            template_dict = t.to_dict()
        
        if template_dict.get('config') and isinstance(template_dict['config'], dict) and template_dict['config'].get('items'):
            for item in template_dict['config']['items']:
                if 'item_name' in item and 'criteria_name' not in item:
                    item['criteria_name'] = item['item_name']
                if 'source_files' in item and 'attached_files' not in item:
                    item['attached_files'] = item['source_files']
                if 'criteria_type' not in item:
                    name = item.get('criteria_name', item.get('item_name', '')).lower()
                    if any(kw in name for kw in ['商务', 'business', '价格', '报价', '业绩']):
                        item['criteria_type'] = 'business'
                    else:
                        item['criteria_type'] = 'technical'
        result.append(template_dict)
    
    return result


@router.get("/{template_id}")
async def get_template(request: Request, template_id: int):
    """获取模板详情"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    template = rule_template_service.get_template_by_id(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    
    # template 可能是 dict 或对象
    if isinstance(template, dict):
        result = template
    else:
        result = template.to_dict()
    
    # 统一字段名并添加默认值
    if result.get('config') and isinstance(result['config'], dict) and result['config'].get('items'):
        for item in result['config']['items']:
            # item_name -> criteria_name
            if 'item_name' in item and 'criteria_name' not in item:
                item['criteria_name'] = item['item_name']
            # source_files -> attached_files
            if 'source_files' in item and 'attached_files' not in item:
                item['attached_files'] = item['source_files']
            # 添加默认 criteria_type
            if 'criteria_type' not in item:
                # 根据名称判断类型
                name = item.get('criteria_name', item.get('item_name', '')).lower()
                if any(kw in name for kw in ['商务', 'business', '价格', '报价', '业绩']):
                    item['criteria_type'] = 'business'
                else:
                    item['criteria_type'] = 'technical'
    
    return result


@router.post("")
async def create_template(request: Request, template_req: CreateTemplateRequest):
    """创建规则模板"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    template = rule_template_service.create_template(
        project_type=template_req.project_type,
        template_name=template_req.template_name,
        config=template_req.config,
        description=template_req.description,
        created_by=current_user.id
    )
    
    if not template:
        raise HTTPException(status_code=500, detail="创建失败")
    
    return {
        "message": "模板创建成功",
        "template": {
            "id": template.id,
            "template_name": template.template_name,
            "project_type": template.project_type
        }
    }


@router.put("/{template_id}")
async def update_template(request: Request, template_id: int, template_req: UpdateTemplateRequest):
    """更新模板"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    success = rule_template_service.update_template(
        template_id=template_id,
        template_name=template_req.template_name,
        config=template_req.config,
        description=template_req.description,
        is_active=template_req.is_active
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="模板不存在或更新失败")
    
    return {"message": "模板更新成功"}


@router.delete("/{template_id}")
async def delete_template(request: Request, template_id: int):
    """删除模板（软删除）"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    success = rule_template_service.delete_template(template_id)
    if not success:
        raise HTTPException(status_code=404, detail="模板不存在")
    
    return {"message": "模板已删除"}


@router.post("/{template_id}/apply-to-project/{project_id}")
async def apply_template_to_project(request: Request, template_id: int, project_id: int):
    """将模板应用到项目"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    success = rule_template_service.apply_template_to_project(template_id, project_id)
    if not success:
        raise HTTPException(status_code=500, detail="应用失败")
    
    return {"message": "模板已应用到项目"}


@router.post("/{template_id}/import")
async def import_criteria_from_template(
    request: Request, 
    template_id: int,
    source_type: str = Query(..., description="源模板类型：service/material/engineering")
):
    """从其他模板导入评审项"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    try:
        # 获取源模板
        source_template = rule_template_service.get_template_by_type(source_type)
        if not source_template:
            raise HTTPException(status_code=404, detail=f"源模板类型 {source_type} 不存在")
        
        # 获取目标模板
        target_template = rule_template_service.get_template_by_id(template_id)
        if not target_template:
            raise HTTPException(status_code=404, detail="目标模板不存在")
        
        # 获取源评审项列表
        source_items = source_template.get("items", [])
        
        # 转换字段名（item_name -> criteria_name, source_files -> attached_files）
        converted_items = []
        for item in source_items:
            converted_item = {
                "criteria_name": item.get("item_name", ""),
                "criteria_type": "technical",  # 默认技术评审
                "scoring_criteria": item.get("scoring_criteria", ""),
                "attached_files": item.get("source_files", []),
                "max_score": item.get("max_score", 100)
            }
            
            # 根据名称判断类型
            name = converted_item["criteria_name"].lower()
            if any(kw in name for kw in ['商务', 'business', '价格', '报价', '业绩']):
                converted_item["criteria_type"] = "business"
            
            converted_items.append(converted_item)
        
        # 合并到目标模板
        current_items = target_template.get("config", {}).get("items", [])
        updated_items = current_items + converted_items
        
        # 更新目标模板
        success = rule_template_service.update_template(
            template_id=template_id,
            config={"items": updated_items}
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="更新模板失败")
        
        return {
            "message": f"成功导入 {len(converted_items)} 个评审项",
            "imported_count": len(converted_items)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"导入评审项失败：{e}")
        raise HTTPException(status_code=500, detail=f"导入失败：{str(e)}")


@router.post("/{template_id}/add-criteria")
async def add_criteria_batch(
    request: Request,
    template_id: int,
    criteria_req: ImportCriteriaRequest
):
    """批量添加评审项到模板（用于文件导入）"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    try:
        # 获取目标模板
        target_template = rule_template_service.get_template_by_id(template_id)
        if not target_template:
            raise HTTPException(status_code=404, detail="模板不存在")
        
        # 获取当前评审项列表
        current_items = target_template.get("config", {}).get("items", [])
        
        # 合并新评审项
        new_items = criteria_req.criteria_list
        updated_items = current_items + new_items
        
        # 更新模板
        success = rule_template_service.update_template(
            template_id=template_id,
            config={"items": updated_items}
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="更新模板失败")
        
        return {
            "message": f"成功添加 {len(new_items)} 个评审项",
            "added_count": len(new_items)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"批量添加评审项失败：{e}")
        raise HTTPException(status_code=500, detail=f"添加失败：{str(e)}")
