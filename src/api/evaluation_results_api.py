"""评审结果API"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import List, Optional
from loguru import logger

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
    source_filename: Optional[str] = Field(None, description="引用来源文件名")
    source_page: Optional[str] = Field(None, description="引用来源页码")
    source_quote: Optional[str] = Field(None, description="原文引用")

class EvaluationResultUpdate(BaseModel):
    score: Optional[float] = Field(None, description="得分")
    score_reason: Optional[str] = Field(None, description="评分理由")
    evaluation_status: Optional[str] = Field(None, description="评审状态")
    evaluation_basis: Optional[str] = Field(None, description="评审依据")
    source_filename: Optional[str] = Field(None, description="引用来源文件名")
    source_page: Optional[str] = Field(None, description="引用来源页码")
    source_quote: Optional[str] = Field(None, description="原文引用")

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

def update_bidder_total_score(bidder_id: int, db: Session):
    """更新投标人的总分"""
    # 计算该投标人所有已完成评审的总分
    total_score = db.query(EvaluationResult)\
        .filter(EvaluationResult.bidder_id == bidder_id)\
        .filter(EvaluationResult.evaluation_status == 'completed')\
        .filter(EvaluationResult.score.isnot(None))\
        .with_entities(EvaluationResult.score)\
        .all()
    
    # 求和
    total = sum([r[0] for r in total_score])
    
    # 更新投标人总分
    bidder = db.query(Bidder).filter_by(id=bidder_id).first()
    if bidder:
        bidder.total_score = total
        db.commit()


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
        evaluation_basis=result.evaluation_basis,
        source_filename=result.source_filename,
        source_page=result.source_page,
        source_quote=result.source_quote,
        evaluation_status='completed' if result.score else 'pending'
    )
    
    db.add(new_result)
    db.commit()
    db.refresh(new_result)
    
    # 更新投标人总分
    update_bidder_total_score(result.bidder_id, db)
    
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
    if result.source_filename is not None:
        db_result.source_filename = result.source_filename
    if result.source_page is not None:
        db_result.source_page = result.source_page
    if result.source_quote is not None:
        db_result.source_quote = result.source_quote
    
    db.commit()
    db.refresh(db_result)
    
    # 更新投标人总分
    update_bidder_total_score(db_result.bidder_id, db)
    
    return db_result.to_dict()

@router.delete("/evaluation-results/{result_id}")
async def delete_evaluation_result(result_id: int, db: Session = Depends(get_db)):
    """删除评审结果"""
    result = db.query(EvaluationResult).filter_by(id=result_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="评审结果不存在")
    
    # 保存bidder_id用于更新总分
    bidder_id = result.bidder_id
    
    db.delete(result)
    db.commit()
    
    # 更新投标人总分
    update_bidder_total_score(bidder_id, db)
    
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

@router.get("/packages/{package_id}/evaluation-progress", response_model=dict)
async def get_package_evaluation_progress(package_id: int, db: Session = Depends(get_db)):
    """获取包的评审进度信息"""
    # 检查包是否存在
    package = db.query(Package).filter_by(id=package_id).first()
    if not package:
        raise HTTPException(status_code=404, detail="包不存在")
    
    # 获取该包的所有投标人
    bidders = db.query(Bidder).filter_by(package_id=package_id).all()
    
    # 获取该包配置的评审项数量
    from models.evaluation_items import PackageItem
    total_items = db.query(PackageItem).filter_by(package_id=package_id).count()
    
    bidder_progress = []
    completed_count = 0
    evaluating_count = 0
    failed_count = 0
    
    for bidder in bidders:
        # 获取该投标人的评审结果
        results = db.query(EvaluationResult)\
            .filter(EvaluationResult.package_id == package_id)\
            .filter(EvaluationResult.bidder_id == bidder.id)\
            .all()
        
        # 统计已完成和失败的评审项数量
        completed_items = sum(1 for r in results if r.evaluation_status == 'completed')
        failed_items = sum(1 for r in results if r.evaluation_status == 'failed')
        
        # 计算总得分（已完成项的总分）
        total_score = sum(r.score for r in results if r.evaluation_status == 'completed' and r.score is not None)
        
        # 计算进度百分比（失败也计入完成）
        progress_pct = 0
        if total_items > 0:
            progress_pct = round(((completed_items + failed_items) / total_items) * 100)
        
        bidder_progress.append({
            "bidder_id": bidder.id,
            "company_name": bidder.company_name,
            "completed_items": completed_items,
            "failed_items": failed_items,
            "total_items": total_items,
            "total_score": total_score,
            "progress_pct": progress_pct
        })
        
        # 更新状态计数
        if completed_items == total_items and failed_items == 0:
            # 全部完成且没有失败
            completed_count += 1
        elif failed_items > 0:
            # 有失败项
            failed_count += 1
        elif completed_items > 0 or len(results) > 0:
            # 有部分完成或有评审记录
            evaluating_count += 1
    
    # 确定整体评审状态
    # 优先使用后台设置的状态，只有在特定情况下才重新判断
    if package.evaluation_status == "evaluating":
        # 如果包状态是 evaluating，检查是否有评审结果
        if completed_count == len(bidders) and len(bidders) > 0:
            # 所有公司都完成了，更新为 completed
            evaluation_status = "completed"
            logger.info(f"[EVAL_PROGRESS]   -> 设置状态为 completed (所有公司完成)")
        elif failed_count > 0:
            # 有失败的公司，更新为 failed
            evaluation_status = "failed"
            logger.info(f"[EVAL_PROGRESS]   -> 设置状态为 failed ({failed_count} 家公司失败)")
        elif evaluating_count > 0 or completed_count > 0:
            # 有进行中的评审或部分完成，保持 evaluating
            evaluation_status = "evaluating"
            logger.info(f"[EVAL_PROGRESS]   -> 设置状态为 evaluating (进行中)")
        else:
            # 还没有任何评审结果，刚启动
            evaluation_status = "evaluating"
            logger.info(f"[EVAL_PROGRESS]   -> 设置状态为 evaluating (刚启动)")
    else:
        # 其他状态直接使用后台设置的值
        evaluation_status = package.evaluation_status
        logger.info(f"[EVAL_PROGRESS]   -> 使用后台状态: {evaluation_status}")
    
    return {
        "package_id": package_id,
        "evaluation_status": evaluation_status,
        "total_bidders": len(bidders),
        "total_items": total_items,
        "bidder_progress": bidder_progress
    }