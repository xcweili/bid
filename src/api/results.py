"""结果查询 API"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import io
import json

from models.database import db_session
from models.evaluation_tasks import EvaluationTask
from models.company_bids import CompanyBid
from models.evaluation_results import EvaluationResult

router = APIRouter()


class RuleScore(BaseModel):
    rule_name: str
    item_name: str
    score: float
    max_score: float
    reason: str
    evidence: Optional[str]
    evidence_details: Optional[List[dict]]


class CompanyResult(BaseModel):
    id: int
    company_name: str
    total_score: Optional[float]
    rule_scores: List[RuleScore]


class TaskResultsResponse(BaseModel):
    task_id: int
    task_name: str
    status: str
    total_score_avg: Optional[float]
    companies: List[CompanyResult]


@router.get("/tasks/{task_id}/results", response_model=TaskResultsResponse)
async def get_task_results(task_id: int):
    """获取任务汇总结果"""
    db = db_session()
    try:
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        
        companies = db.query(CompanyBid).filter(CompanyBid.task_id == task_id).all()
        
        company_results = []
        for company in companies:
            # 获取该公司的所有评审结果
            results = db.query(EvaluationResult).filter(
                EvaluationResult.company_bid_id == company.id
            ).all()
            
            rule_scores = []
            for r in results:
                import json
                rule_scores.append(RuleScore(
                    rule_name=r.rule_name,
                    item_name=r.rule_name,  # TODO: 从结果中提取具体评审项名称
                    score=r.score,
                    max_score=r.max_score,
                    reason=r.reason,
                    evidence=r.evidence,
                    evidence_details=json.loads(r.evidence_details) if r.evidence_details else []
                ))
            
            company_results.append(CompanyResult(
                id=company.id,
                company_name=company.company_name,
                total_score=company.total_score,
                rule_scores=rule_scores
            ))
        
        return TaskResultsResponse(
            task_id=task.id,
            task_name=task.task_name,
            status=task.status,
            total_score_avg=task.total_score_avg,
            companies=company_results
        )
    finally:
        db.close()


@router.get("/companies/{company_id}/results", response_model=CompanyResult)
async def get_company_results(company_id: int):
    """获取公司详细评分"""
    db = db_session()
    try:
        company = db.query(CompanyBid).filter(CompanyBid.id == company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail="公司不存在")
        
        results = db.query(EvaluationResult).filter(
            EvaluationResult.company_bid_id == company_id
        ).all()
        
        rule_scores = []
        for r in results:
            import json
            rule_scores.append(RuleScore(
                rule_name=r.rule_name,
                item_name=r.rule_name,
                score=r.score,
                max_score=r.max_score,
                reason=r.reason,
                evidence=r.evidence,
                evidence_details=json.loads(r.evidence_details) if r.evidence_details else []
            ))
        
        return CompanyResult(
            id=company.id,
            company_name=company.company_name,
            total_score=company.total_score,
            rule_scores=rule_scores
        )
    finally:
        db.close()


@router.get("/companies/{company_id}/rule/{rule_id}")
async def get_company_rule_result(company_id: int, rule_id: int):
    """获取公司某评审项详情"""
    db = db_session()
    try:
        result = db.query(EvaluationResult).filter(
            EvaluationResult.company_bid_id == company_id,
            EvaluationResult.rule_id == rule_id
        ).first()
        
        if not result:
            raise HTTPException(status_code=404, detail="评审结果不存在")
        
        return {
            "id": result.id,
            "company_id": company_id,
            "rule_id": rule_id,
            "rule_name": result.rule_name,
            "score": result.score,
            "max_score": result.max_score,
            "reason": result.reason,
            "evidence": result.evidence,
            "evidence_details": json.loads(result.evidence_details) if result.evidence_details else [],
            "llm_response": result.llm_response
        }
    finally:
        db.close()


@router.get("/tasks/{task_id}/export")
async def export_task_results(task_id: int, format: str = "csv"):
    """导出任务评审结果
    
    Args:
        task_id: 任务ID
        format: 导出格式 (csv, json)
    
    Returns:
        文件流
    """
    db = db_session()
    try:
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        
        companies = db.query(CompanyBid).filter(CompanyBid.task_id == task_id).all()
        
        results_data = []
        for company in companies:
            results = db.query(EvaluationResult).filter(
                EvaluationResult.company_bid_id == company.id
            ).all()
            
            for r in results:
                results_data.append({
                    "公司名称": company.company_name,
                    "评审项": r.rule_name,
                    "得分": r.score,
                    "满分": r.max_score,
                    "得分率": f"{(r.score / r.max_score * 100):.1f}%" if r.max_score > 0 else "0%",
                    "评分理由": r.reason or "",
                    "依据": r.evidence or "",
                    "公司总分": company.total_score or 0
                })
        
        if format == "json":
            export_data = {
                "task_name": task.task_name,
                "export_time": datetime.now().isoformat(),
                "total_companies": len(companies),
                "avg_score": task.total_score_avg,
                "results": results_data
            }
            
            json_str = json.dumps(export_data, ensure_ascii=False, indent=2)
            
            return StreamingResponse(
                io.BytesIO(json_str.encode('utf-8')),
                media_type="application/json",
                headers={
                    "Content-Disposition": f"attachment; filename=task_{task_id}_results.json"
                }
            )
        else:
            import csv
            
            output = io.StringIO()
            if results_data:
                writer = csv.DictWriter(output, fieldnames=results_data[0].keys())
                writer.writeheader()
                writer.writerows(results_data)
            
            csv_content = output.getvalue()
            output.close()
            
            return StreamingResponse(
                io.BytesIO(csv_content.encode('utf-8-sig')),
                media_type="text/csv",
                headers={
                    "Content-Disposition": f"attachment; filename=task_{task_id}_results.csv"
                }
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出失败：{str(e)}")
    finally:
        db.close()
