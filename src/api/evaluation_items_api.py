"""评审项管理 API"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional
from models.evaluation_items import EvaluationItem, PackageItem, File
from models.project_structure import Package
from sqlalchemy.orm import Session, joinedload
from models.database import get_db

router = APIRouter(prefix="/api", tags=["评审项管理"])


class EvaluationItemCreate(BaseModel):
    item_code: str = Field(..., description="评审项编号")
    item_name: str = Field(..., description="评审项名称")
    item_content: Optional[str] = Field(None, description="评审项内容（markdown格式）")
    material_category: Optional[str] = Field(None, description="物资品类")
    is_active: bool = Field(True, description="是否启用")
    workflow_id: Optional[str] = Field(None, description="工作流ID")
    api_key: Optional[str] = Field(None, description="Dify API Key")
    base_url: Optional[str] = Field(None, description="Dify API 基础地址")


class EvaluationItemUpdate(BaseModel):
    item_code: Optional[str] = Field(None, description="评审项编号")
    item_name: Optional[str] = Field(None, description="评审项名称")
    item_content: Optional[str] = Field(None, description="评审项内容（markdown格式）")
    material_category: Optional[str] = Field(None, description="物资品类")
    is_active: Optional[bool] = Field(None, description="是否启用")
    workflow_id: Optional[str] = Field(None, description="工作流ID")
    api_key: Optional[str] = Field(None, description="Dify API Key")
    base_url: Optional[str] = Field(None, description="Dify API 基础地址")
    files_to_add: Optional[List[str]] = Field(None, description="要添加的文件名列表")
    files_to_remove: Optional[List[int]] = Field(None, description="要删除的文件ID列表")


class PackageItemsSet(BaseModel):
    item_ids: List[int] = Field(..., description="评审项ID列表")


class PackageItemUpdate(BaseModel):
    is_required: Optional[bool] = Field(None, description="是否必填")


class FileCreate(BaseModel):
    file_name: str = Field(..., description="文件名")
    file_path: str = Field(..., description="文件路径")
    file_type: Optional[str] = Field(None, description="文件类型")
    file_size: Optional[int] = Field(None, description="文件大小")
    description: Optional[str] = Field(None, description="文件描述")


@router.get("/evaluation-items", response_model=List[dict])
def get_evaluation_items(db: Session = Depends(get_db)):
    """获取所有评审项（包含文件列表）"""
    items = db.query(EvaluationItem).options(joinedload(EvaluationItem.files)).all()
    return [item.to_dict_with_files() for item in items]


@router.get("/evaluation-items/{item_id}", response_model=dict)
def get_evaluation_item(item_id: int, db: Session = Depends(get_db)):
    """获取单个评审项（包含文件列表）"""
    item = db.query(EvaluationItem).options(joinedload(EvaluationItem.files)).filter_by(id=item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="评审项不存在")
    return item.to_dict_with_files()


@router.post("/evaluation-items", response_model=dict, status_code=201)
def create_evaluation_item(item: EvaluationItemCreate, db: Session = Depends(get_db)):
    """创建评审项"""
    if not item.item_code or not item.item_name:
        raise HTTPException(status_code=400, detail="评审项编号和名称不能为空")
    
    existing = db.query(EvaluationItem).filter_by(item_code=item.item_code).first()
    if existing:
        raise HTTPException(status_code=400, detail="评审项编号已存在")
    
    new_item = EvaluationItem(
        item_code=item.item_code,
        item_name=item.item_name,
        item_content=item.item_content,
        material_category=item.material_category,
        is_active=item.is_active,
        workflow_id=item.workflow_id,
        api_key=item.api_key,
        base_url=item.base_url
    )
    
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    
    return new_item.to_dict()


@router.put("/evaluation-items/{item_id}", response_model=dict)
def update_evaluation_item(item_id: int, item: EvaluationItemUpdate, db: Session = Depends(get_db)):
    """更新评审项"""
    db_item = db.query(EvaluationItem).options(joinedload(EvaluationItem.files)).filter_by(id=item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="评审项不存在")
    
    if item.item_code is not None:
        existing = db.query(EvaluationItem).filter_by(item_code=item.item_code).first()
        if existing and existing.id != item_id:
            raise HTTPException(status_code=400, detail="评审项编号已存在")
        db_item.item_code = item.item_code
    
    if item.item_name is not None:
        db_item.item_name = item.item_name
    if item.item_content is not None:
        db_item.item_content = item.item_content
    if item.material_category is not None:
        db_item.material_category = item.material_category
    if item.is_active is not None:
        db_item.is_active = item.is_active
    if item.workflow_id is not None:
        db_item.workflow_id = item.workflow_id
    if item.api_key is not None:
        db_item.api_key = item.api_key
    if item.base_url is not None:
        db_item.base_url = item.base_url
    
    if item.files_to_remove is not None:
        for file_id in item.files_to_remove:
            file_to_remove = next((f for f in db_item.files if f.id == file_id), None)
            if file_to_remove:
                db_item.files.remove(file_to_remove)
                db.delete(file_to_remove)
    
    if item.files_to_add is not None:
        for file_name in item.files_to_add:
            new_file = File(
                file_name=file_name,
                file_path='',
                file_type='md',
                file_size=0,
                description=''
            )
            db_item.files.append(new_file)
    
    db.commit()
    db.refresh(db_item)
    
    return db_item.to_dict_with_files()


@router.delete("/evaluation-items/{item_id}")
def delete_evaluation_item(item_id: int, db: Session = Depends(get_db)):
    """删除评审项"""
    item = db.query(EvaluationItem).filter_by(id=item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="评审项不存在")
    
    db.delete(item)
    db.commit()
    
    return {"message": "评审项已删除"}


@router.get("/packages/{package_id}/items", response_model=List[dict])
def get_package_items(package_id: int, db: Session = Depends(get_db)):
    """获取包已配置的评审项"""
    package = db.query(Package).options(
        joinedload(Package.package_items).joinedload(PackageItem.item)
    ).filter_by(id=package_id).first()
    
    if not package:
        raise HTTPException(status_code=404, detail="包不存在")
    
    items = []
    for pi in package.package_items:
        item_dict = pi.item.to_dict()
        item_dict['is_required'] = pi.is_required
        item_dict['package_item_id'] = pi.id
        items.append(item_dict)
    
    return items


@router.post("/packages/{package_id}/items")
def set_package_items(package_id: int, data: PackageItemsSet, db: Session = Depends(get_db)):
    """配置包的评审项"""
    package = db.query(Package).filter_by(id=package_id).first()
    if not package:
        raise HTTPException(status_code=404, detail="包不存在")
    
    # 先删除现有配置
    db.query(PackageItem).filter_by(package_id=package_id).delete()
    
    # 添加新配置
    for item_id in data.item_ids:
        item = db.query(EvaluationItem).filter_by(id=item_id).first()
        if item:
            pi = PackageItem(package_id=package_id, item_id=item_id)
            db.add(pi)
    
    db.commit()
    
    return {"message": "评审项配置成功"}


@router.put("/packages/{package_id}/items/{item_id}", response_model=dict)
def update_package_item(package_id: int, item_id: int, config: PackageItemUpdate, db: Session = Depends(get_db)):
    """更新包的评审项配置"""
    pi = db.query(PackageItem).filter_by(package_id=package_id, item_id=item_id).first()
    if not pi:
        raise HTTPException(status_code=404, detail="配置不存在")
    
    if config.is_required is not None:
        pi.is_required = config.is_required
    
    db.commit()
    db.refresh(pi)
    
    return pi.to_dict()


@router.delete("/packages/{package_id}/items/{item_id}")
def remove_package_item(package_id: int, item_id: int, db: Session = Depends(get_db)):
    """移除包的评审项配置"""
    pi = db.query(PackageItem).filter_by(package_id=package_id, item_id=item_id).first()
    if not pi:
        raise HTTPException(status_code=404, detail="配置不存在")
    
    db.delete(pi)
    db.commit()
    
    return {"message": "评审项已移除"}


@router.post("/evaluation-items/{item_id}/files", response_model=dict)
def add_file_to_item(item_id: int, file: FileCreate, db: Session = Depends(get_db)):
    """为评审项添加文件"""
    item = db.query(EvaluationItem).filter_by(id=item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="评审项不存在")
    
    new_file = File(
        file_name=file.file_name,
        file_path=file.file_path,
        file_type=file.file_type,
        file_size=file.file_size,
        description=file.description
    )
    
    item.files.append(new_file)
    db.commit()
    db.refresh(item)
    
    return item.to_dict_with_files()


@router.delete("/evaluation-items/{item_id}/files/{file_id}", response_model=dict)
def remove_file_from_item(item_id: int, file_id: int, db: Session = Depends(get_db)):
    """从评审项移除文件"""
    item = db.query(EvaluationItem).options(joinedload(EvaluationItem.files)).filter_by(id=item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="评审项不存在")
    
    file_to_remove = next((f for f in item.files if f.id == file_id), None)
    if not file_to_remove:
        raise HTTPException(status_code=404, detail="文件不存在")
    
    item.files.remove(file_to_remove)
    db.delete(file_to_remove)
    db.commit()
    db.refresh(item)
    
    return item.to_dict_with_files()


@router.get("/evaluation-items/{item_id}/files", response_model=List[dict])
def get_item_files(item_id: int, db: Session = Depends(get_db)):
    """获取评审项绑定的文件列表"""
    item = db.query(EvaluationItem).options(joinedload(EvaluationItem.files)).filter_by(id=item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="评审项不存在")
    
    return [file.to_dict() for file in item.files]
