"""结果汇总服务 - 模式 B 专用"""
import json
from typing import List, Dict, Optional
from loguru import logger
from datetime import datetime

from models.database import db_session
from models.extended_models import (
    Package, CompanyBidNew as CompanyBid, EvaluationCriteria,
    EvaluationResultNew as EvaluationResult, Assignment
)


class SummaryService:
    """结果汇总服务"""

    def __init__(self):
        pass

    def summarize_package(self, package_id: int) -> Dict:
        """汇总包的评审结果
        
        适用于模式 B（按评审项分配）
        将所有专家的评分按公司汇总
        
        Args:
            package_id: 包 ID
        
        Returns:
            汇总结果
        """
        db = db_session()
        try:
            # 检查包是否存在
            package = db.query(Package).filter(Package.id == package_id).first()
            if not package:
                raise ValueError(f"包不存在：{package_id}")
            
            # 获取包下的所有公司
            companies = db.query(CompanyBid).filter(
                CompanyBid.package_id == package_id
            ).all()
            
            if not companies:
                return {
                    "status": "warning",
                    "message": "包下没有公司数据"
                }
            
            # 获取包的所有评审项
            criteria_list = db.query(EvaluationCriteria).filter(
                EvaluationCriteria.package_id == package_id,
                EvaluationCriteria.is_active == True
            ).all()
            
            logger.info(f"开始汇总包 {package_id}: 公司数={len(companies)}, 评审项数={len(criteria_list)}")
            
            # 检查是否所有评审项都已完成
            for criteria in criteria_list:
                completed = self._check_criteria_completed(db, package_id, criteria.id)
                if not completed:
                    logger.warning(f"评审项 {criteria.id} 未完成，跳过汇总")
                    return {
                        "status": "pending",
                        "message": f"评审项 {criteria.criteria_name} 尚未完成评审"
                    }
            
            # 汇总每个公司的得分
            company_results = []
            for company in companies:
                total_score = 0
                detail_results = []
                
                for criteria in criteria_list:
                    # 获取该评审项的评分
                    results = db.query(EvaluationResult).filter(
                        EvaluationResult.company_id == company.id,
                        EvaluationResult.package_id == package_id,
                        EvaluationResult.criteria_id == criteria.id
                    ).all()
                    
                    if results:
                        # 直接相加所有专家的评分
                        criteria_score = sum(r.score for r in results)
                        total_score += criteria_score
                        
                        detail_results.append({
                            "criteria_id": criteria.id,
                            "criteria_name": criteria.criteria_name,
                            "criteria_type": criteria.criteria_type,
                            "score": criteria_score,
                            "max_score": criteria.max_score,
                            "evaluator_count": len(results)
                        })
                    else:
                        detail_results.append({
                            "criteria_id": criteria.id,
                            "criteria_name": criteria.criteria_name,
                            "criteria_type": criteria.criteria_type,
                            "score": 0,
                            "max_score": criteria.max_score,
                            "evaluator_count": 0
                        })
                
                # 更新公司总分
                company.total_score = total_score
                company.status = "completed"
                db.commit()
                
                company_results.append({
                    "company_id": company.id,
                    "company_name": company.company_name,
                    "total_score": total_score,
                    "details": detail_results
                })
            
            # 计算排名
            company_results.sort(key=lambda x: x["total_score"], reverse=True)
            for rank, result in enumerate(company_results, 1):
                company = db.query(CompanyBid).filter(CompanyBid.id == result["company_id"]).first()
                if company:
                    company.ranking = rank
                db.commit()
            
            # 计算平均分
            avg_score = sum(r["total_score"] for r in company_results) / len(company_results) if company_results else 0
            
            # 更新包状态
            package.status = "completed"
            db.commit()
            
            logger.info(f"包 {package_id} 汇总完成，平均分={avg_score:.2f}")
            
            return {
                "status": "success",
                "package_id": package_id,
                "company_count": len(companies),
                "criteria_count": len(criteria_list),
                "avg_score": round(avg_score, 2),
                "rankings": company_results
            }
            
        except Exception as e:
            logger.error(f"汇总失败：{e}")
            db.rollback()
            raise
        finally:
            db.close()

    def summarize_project(self, project_id: int) -> Dict:
        """汇总项目的所有包
        
        Args:
            project_id: 项目 ID
        
        Returns:
            项目汇总结果
        """
        db = db_session()
        try:
            # 获取项目的所有包
            packages = db.query(Package).filter(Package.project_id == project_id).all()
            
            if not packages:
                return {
                    "status": "warning",
                    "message": "项目下没有包数据"
                }
            
            # 汇总每个包
            package_results = []
            for package in packages:
                if package.status == "completed":
                    # 获取包的公司结果
                    companies = db.query(CompanyBid).filter(
                        CompanyBid.package_id == package.id
                    ).all()
                    
                    package_results.append({
                        "package_id": package.id,
                        "package_name": package.package_name,
                        "company_count": len(companies),
                        "status": package.status
                    })
            
            return {
                "status": "success",
                "project_id": project_id,
                "package_count": len(packages),
                "completed_packages": len([p for p in packages if p.status == "completed"]),
                "packages": package_results
            }
            
        finally:
            db.close()

    def _check_criteria_completed(self, db, package_id: int, criteria_id: int) -> bool:
        """检查评审项是否已完成
        
        检查所有公司的该评审项是否都有评分
        """
        # 获取包下的所有公司
        companies = db.query(CompanyBid).filter(
            CompanyBid.package_id == package_id
        ).all()
        
        if not companies:
            return False
        
        # 检查每个公司是否有该评审项的评分
        for company in companies:
            result_count = db.query(EvaluationResult).filter(
                EvaluationResult.company_id == company.id,
                EvaluationResult.package_id == package_id,
                EvaluationResult.criteria_id == criteria_id
            ).count()
            
            if result_count == 0:
                return False
        
        return True

    def check_package_readiness(self, package_id: int) -> Dict:
        """检查包的评审完成度
        
        Args:
            package_id: 包 ID
        
        Returns:
            完成度信息
        """
        db = db_session()
        try:
            # 获取包的所有评审项
            criteria_list = db.query(EvaluationCriteria).filter(
                EvaluationCriteria.package_id == package_id,
                EvaluationCriteria.is_active == True
            ).all()
            
            # 获取包下的所有公司
            companies = db.query(CompanyBid).filter(
                CompanyBid.package_id == package_id
            ).all()
            
            # 检查每个评审项的完成度
            criteria_status = []
            for criteria in criteria_list:
                total_evaluations = len(companies)
                completed_evaluations = 0
                
                for company in companies:
                    result_count = db.query(EvaluationResult).filter(
                        EvaluationResult.company_id == company.id,
                        EvaluationResult.package_id == package_id,
                        EvaluationResult.criteria_id == criteria.id
                    ).count()
                    
                    if result_count > 0:
                        completed_evaluations += 1
                
                criteria_status.append({
                    "criteria_id": criteria.id,
                    "criteria_name": criteria.criteria_name,
                    "criteria_type": criteria.criteria_type,
                    "total_companies": total_evaluations,
                    "completed_companies": completed_evaluations,
                    "progress_percent": int(completed_evaluations / total_evaluations * 100) if total_evaluations > 0 else 0
                })
            
            # 计算总体完成度
            total_criteria = len(criteria_list)
            completed_criteria = len([c for c in criteria_status if c["progress_percent"] == 100])
            overall_progress = int(completed_criteria / total_criteria * 100) if total_criteria > 0 else 0
            
            return {
                "package_id": package_id,
                "criteria_count": total_criteria,
                "completed_criteria": completed_criteria,
                "overall_progress": overall_progress,
                "criteria_status": criteria_status
            }
            
        finally:
            db.close()


# 全局服务实例
summary_service = SummaryService()
