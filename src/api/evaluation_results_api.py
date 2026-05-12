"""评审结果API"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import List, Optional

from models.evaluation_results import EvaluationResult
from models.project_structure import Package, Bidder, Section
from models.evaluation_items import EvaluationItem
from models.database import get_db

router = APIRouter()

class EvaluationResultCreate(BaseModel):
    package_id: int = Field(..., description="包ID")
    bidder_id: int = Field(..., description="投标人ID")
    item_id: int = Field(..., description="评审项ID")
    score: Optional[float] = Field(None, description="得分")
    score_reason: Optional[str] = Field(None, description="评分理由")
    evaluation_basis: Optional[str] = Field(None, description="评审依据")

class EvaluationResultUpdate(BaseModel):
    score: Optional[float] = Field(None, description="得分")
    score_reason: Optional[str] = Field(None, description="评分理由")
    evaluation_status: Optional[str] = Field(None, description="评审状态")
    evaluation_basis: Optional[str] = Field(None, description="评审依据")

@router.get("/evaluation-results", response_model=List[dict])
async def get_evaluation_results(
    package_id: Optional[int] = None,
    bidder_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """获取评审结果列表"""
    query = db.query(EvaluationResult)
    
    if package_id:
        query = query.filter(EvaluationResult.package_id == package_id)
    if bidder_id:
        query = query.filter(EvaluationResult.bidder_id == bidder_id)
    
    results = query.all()
    result_list = []
    for result in results:
        result_dict = result.to_dict()
        # 获取包信息以获取项目ID和标段ID
        package = db.query(Package).filter_by(id=result.package_id).first()
        if package:
            result_dict['section_id'] = package.section_id
            # 通过标段获取项目ID
            section = db.query(Section).filter_by(id=package.section_id).first()
            if section:
                result_dict['project_id'] = section.project_id
        result_list.append(result_dict)
    return result_list

@router.get("/evaluation-results/{result_id}", response_model=dict)
async def get_evaluation_result(result_id: int, db: Session = Depends(get_db)):
    """获取单个评审结果"""
    result = db.query(EvaluationResult).filter_by(id=result_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="评审结果不存在")
    return result.to_dict()

@router.post("/evaluation-results", response_model=dict)
async def create_evaluation_result(
    result: EvaluationResultCreate,
    db: Session = Depends(get_db)
):
    """创建评审结果"""
    # 检查包是否存在
    if not db.query(Package).filter_by(id=result.package_id).first():
        raise HTTPException(status_code=400, detail="包不存在")
    
    # 检查投标人是否存在
    if not db.query(Bidder).filter_by(id=result.bidder_id).first():
        raise HTTPException(status_code=400, detail="投标人不存在")
    
    # 检查评审项是否存在
    if not db.query(EvaluationItem).filter_by(id=result.item_id).first():
        raise HTTPException(status_code=400, detail="评审项不存在")
    
    new_result = EvaluationResult(
        package_id=result.package_id,
        bidder_id=result.bidder_id,
        item_id=result.item_id,
        score=result.score,
        score_reason=result.score_reason,
        evaluation_basis=result.evaluation_basis
    )
    
    db.add(new_result)
    db.commit()
    db.refresh(new_result)
    
    return new_result.to_dict()

@router.put("/evaluation-results/{result_id}", response_model=dict)
async def update_evaluation_result(
    result_id: int,
    result: EvaluationResultUpdate,
    db: Session = Depends(get_db)
):
    """更新评审结果"""
    db_result = db.query(EvaluationResult).filter_by(id=result_id).first()
    if not db_result:
        raise HTTPException(status_code=404, detail="评审结果不存在")
    
    if result.score is not None:
        db_result.score = result.score
    if result.score_reason is not None:
        db_result.score_reason = result.score_reason
    if result.evaluation_status is not None:
        db_result.evaluation_status = result.evaluation_status
    if result.evaluation_basis is not None:
        db_result.evaluation_basis = result.evaluation_basis
    
    db.commit()
    db.refresh(db_result)
    
    return db_result.to_dict()

@router.delete("/evaluation-results/{result_id}")
async def delete_evaluation_result(result_id: int, db: Session = Depends(get_db)):
    """删除评审结果"""
    result = db.query(EvaluationResult).filter_by(id=result_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="评审结果不存在")
    
    db.delete(result)
    db.commit()
    
    return {"message": "删除成功"}

@router.get("/packages/{package_id}/results", response_model=List[dict])
async def get_package_results(package_id: int, db: Session = Depends(get_db)):
    """获取指定包的评审结果"""
    # 检查包是否存在
    package = db.query(Package).filter_by(id=package_id).first()
    if not package:
        raise HTTPException(status_code=404, detail="包不存在")
    
    results = db.query(EvaluationResult).filter_by(package_id=package_id).all()
    return [result.to_dict() for result in results]