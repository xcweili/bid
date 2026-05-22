"""任务执行引擎 - 完整的评审流程"""
import asyncio
import json
import traceback
from typing import Dict, List, Optional
from loguru import logger
from datetime import datetime
from pathlib import Path

from models.database import db_session
from models.evaluation_tasks import EvaluationTask
from models.evaluation_rules import EvaluationRule, TaskRule
from models.company_bids import CompanyBid
from models.evaluation_results import EvaluationResult
from models.project_structure import Package, Section, Project, Bidder
from services.file_processor import FileProcessor
from services.rule_config import RuleConfigManager
from services.ai_evaluator import AIEvaluator
from config import config


class TaskExecutor:
    """任务执行引擎 - 完整的评审流程"""

    def __init__(self):
        self.file_processor = FileProcessor(config.TASKS_DIR)
        self.rule_config_manager = RuleConfigManager()
        self.ai_evaluator = AIEvaluator()

    async def execute_task(self, task_id: int) -> Dict:
        """执行评审任务
        
        完整流程：
        1. 获取任务关联的规则
        2. 获取任务下的所有公司
        3. 对每个公司，遍历每个评审项进行评分
        4. 聚合结果，更新任务状态
        5. 计算排名和平均分

        Returns:
            执行结果统计
        """
        db = db_session()
        execution_stats = {
            "task_id": task_id,
            "start_time": datetime.now().isoformat(),
            "companies_processed": 0,
            "rules_evaluated": 0,
            "errors": [],
            "avg_score": 0,
            "total_score": 0
        }

        try:
            # 更新任务状态为 processing
            self._update_task_status(db, task_id, "processing")

            # 获取任务信息
            task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
            if not task:
                raise ValueError(f"任务不存在：{task_id}")

            # 获取项目、标段、包信息
            project_info = {
                "project_code": "未知项目",
                "project_name": "未知项目名称",
                "section_code": "未知标段",
                "section_name": "未知标段名称",
                "package_no": "未知包号"
            }
            
            if task.package_id:
                package = db.query(Package).filter(Package.id == task.package_id).first()
                if package:
                    project_info["package_no"] = package.package_no
                    if package.section:
                        section = package.section
                        project_info["section_code"] = section.section_code
                        project_info["section_name"] = section.section_name
                        if section.project:
                            project_info["project_code"] = section.project.project_code
                            project_info["project_name"] = section.project.project_name

            logger.info(f"[TASK:{task_id}] === 开始执行评审任务 ===")
            logger.info(f"[TASK:{task_id}] 项目: {project_info['project_code']} - {project_info['project_name']}")
            logger.info(f"[TASK:{task_id}] 标段: {project_info['section_code']} - {project_info['section_name']}")
            logger.info(f"[TASK:{task_id}] 包号: {project_info['package_no']}")
            logger.info(f"[TASK:{task_id}] 任务名称: {task.task_name}")

            # 获取关联的规则
            task_rules = db.query(TaskRule).filter(
                TaskRule.task_id == task_id,
                TaskRule.is_active == True
            ).all()

            if not task_rules:
                raise ValueError(f"任务没有关联规则：{task_id}")

            rules = []
            for tr in task_rules:
                rule = db.query(EvaluationRule).filter(EvaluationRule.id == tr.rule_id).first()
                if rule:
                    rules.append(rule)

            logger.info(f"[TASK:{task_id}] 关联评审规则: {len(rules)} 个")
            for rule in rules:
                logger.info(f"[TASK:{task_id}]   - {rule.rule_name} (ID:{rule.id})")

            # 获取公司列表
            companies = db.query(CompanyBid).filter(CompanyBid.task_id == task_id).all()

            if not companies:
                raise ValueError(f"任务没有公司数据：{task_id}")

            logger.info(f"[TASK:{task_id}] 参与评审公司: {len(companies)} 家")
            for company in companies:
                logger.info(f"[TASK:{task_id}]   - {company.company_name} (ID:{company.id})")

            all_results = []
            total_score_sum = 0

            # 遍历每个公司
            for company in companies:
                logger.info(f"[TASK:{task_id}] --- 开始处理公司: {company.company_name} (ID:{company.id}) ---")
                
                try:
                    company_result = self._evaluate_company(db, company, rules, task_id, project_info)
                    all_results.append(company_result)
                    total_score_sum += company_result["total_score"]
                    execution_stats["companies_processed"] += 1

                    logger.info(f"[TASK:{task_id}] 公司 {company.company_name} 完成，得分：{company_result['total_score']}")
                    logger.info(f"[TASK:{task_id}] --- 公司 {company.company_name} 处理结束 ---")

                except Exception as e:
                    logger.error(f"[TASK:{task_id}] 公司 {company.company_name} 评估失败：{e}")
                    logger.error(f"[TASK:{task_id}] 异常详情: {traceback.format_exc()}")
                    execution_stats["errors"].append({
                        "company": company.company_name,
                        "error": str(e)
                    })
                    # 继续处理其他公司

            # 计算平均分
            avg_score = total_score_sum / len(companies) if companies else 0
            execution_stats["avg_score"] = avg_score
            execution_stats["total_score"] = total_score_sum

            # 计算排名
            self._calculate_rankings(db, all_results)

            # 更新任务状态为 completed
            self._update_task_status(
                db, task_id, "completed",
                total_companies=len(companies),
                total_score_avg=avg_score
            )

            execution_stats["end_time"] = datetime.now().isoformat()
            execution_stats["status"] = "success"

            logger.info(f"[TASK:{task_id}] === 任务执行完成 ===")
            logger.info(f"[TASK:{task_id}] 项目: {project_info['project_code']} - {project_info['project_name']}")
            logger.info(f"[TASK:{task_id}] 标段: {project_info['section_code']} - {project_info['section_name']}")
            logger.info(f"[TASK:{task_id}] 包号: {project_info['package_no']}")
            logger.info(f"[TASK:{task_id}] 平均分: {avg_score:.2f}")
            logger.info(f"[TASK:{task_id}] 处理公司数: {execution_stats['companies_processed']}")
            logger.info(f"[TASK:{task_id}] 错误数: {len(execution_stats['errors'])}")
            
            # 统计各公司得分
            logger.info(f"[TASK:{task_id}] 各公司评审结果统计:")
            for result in all_results:
                logger.info(f"[TASK:{task_id}]   - {result['company_name']}: 总分 = {result['total_score']}, 排名 = {result.get('ranking', 'N/A')}")

            return execution_stats

        except Exception as e:
            logger.error(f"[TASK:{task_id}] === 任务执行失败 ===")
            logger.error(f"[TASK:{task_id}] 项目: {project_info['project_code']} - {project_info['project_name']}")
            logger.error(f"[TASK:{task_id}] 标段: {project_info['section_code']} - {project_info['section_name']}")
            logger.error(f"[TASK:{task_id}] 包号: {project_info['package_no']}")
            logger.error(f"[TASK:{task_id}] 异常信息: {e}")
            logger.error(f"[TASK:{task_id}] 异常详情: {traceback.format_exc()}")
            execution_stats["status"] = "failed"
            execution_stats["error"] = str(e)
            self._update_task_status(db, task_id, "failed")
            raise
        finally:
            db.close()

    def _evaluate_company(self, db, company: CompanyBid, rules: List[EvaluationRule], task_id: int = None, project_info: dict = None) -> Dict:
        """评估单个公司

        Args:
            db: 数据库会话
            company: 公司记录
            rules: 评审规则列表
            task_id: 任务ID（用于日志）
            project_info: 项目信息（用于日志）

        Returns:
            公司评审结果
        """
        project_info = project_info or {}
        project_code = project_info.get("project_code", "未知项目")
        section_code = project_info.get("section_code", "未知标段")
        package_no = project_info.get("package_no", "未知包号")
        
        log_prefix = f"[TASK:{task_id}]" if task_id else "[TASK]"
        
        import json
        company_total_score = 0
        rule_scores = []
        rules_evaluated = 0

        # 遍历每个规则
        for rule in rules:
            logger.info(f"{log_prefix} 处理规则: {rule.rule_name} (ID:{rule.id})")
            
            # 从数据库读取规则配置
            rule_config = None
            if rule.config_json:
                try:
                    rule_config = json.loads(rule.config_json)
                except Exception as e:
                    logger.warning(f"{log_prefix} 规则 {rule.id} 配置 JSON 解析失败: {e}")
            
            # 获取评审项配置
            items = rule_config.get("items", []) if rule_config else []
            
            # 如果没有配置 items，使用规则本身作为一个评审项
            if not items:
                items = [{
                    "item_name": rule.rule_name,
                    "source_files": [],
                    "max_score": 10,
                    "scoring_criteria": rule.rule_content or ""
                }]

            for item_config in items:
                item_name = item_config.get("item_name", "未知评审项")
                
                logger.info(f"{log_prefix} 公司 {company.company_name} (ID:{company.id}) - 评审项: {item_name}")
                logger.debug(f"{log_prefix} 项目: {project_code} 标段: {section_code} 包: {package_no} 公司: {company.company_name} 评审项: {item_name}")
                
                # 获取绑定的文件名
                source_files = item_config.get("source_files", [])

                if not source_files:
                    logger.warning(f"{log_prefix} 评审项 {item_name} 未绑定文件，跳过")
                    # 未绑定文件的评审项给 0 分
                    self._save_evaluation_result(
                        db,
                        company_bid_id=company.id,
                        rule_id=rule.id,
                        rule_name=rule.rule_name,
                        item_config=item_config,
                        result={
                            "score": 0,
                            "max_score": item_config.get("max_score", 10),
                            "reason": "未绑定源文件，无法评审",
                            "evidence": "",
                            "strengths": [],
                            "weaknesses": [],
                            "confidence": 0
                        }
                    )
                    continue

                logger.debug(f"{log_prefix} 评审项 {item_name} 绑定文件: {source_files}")

                # 从公司文件夹读取文件内容
                logger.debug(f"{log_prefix} 读取公司文件: {company.bid_folder_path}")
                document_content = self.ai_evaluator.read_company_files(
                    company.bid_folder_path,
                    source_files
                )

                if not document_content:
                    logger.warning(f"{log_prefix} 评审项 {item_name} 未找到文件内容")
                    self._save_evaluation_result(
                        db,
                        company_bid_id=company.id,
                        rule_id=rule.id,
                        rule_name=rule.rule_name,
                        item_config=item_config,
                        result={
                            "score": 0,
                            "max_score": item_config.get("max_score", 10),
                            "reason": "未找到相关文件内容",
                            "evidence": "",
                            "strengths": [],
                            "weaknesses": [],
                            "confidence": 0
                        }
                    )
                    continue

                logger.debug(f"{log_prefix} 文件内容读取成功，长度: {len(document_content)} 字符")

                # AI 评分
                logger.info(f"{log_prefix} 开始 AI 评分: {item_name}")
                eval_result = self.ai_evaluator.evaluate_rule_item(
                    rule_content=rule.rule_content or "",
                    item_config=item_config,
                    document_content=document_content
                )

                score = eval_result.get("score", 0)
                reason = eval_result.get("reason", "")
                
                logger.info(f"{log_prefix} AI 评分完成 - 得分: {score}, 理由: {reason[:50]}...")

                # 保存结果
                self._save_evaluation_result(
                    db,
                    company_bid_id=company.id,
                    rule_id=rule.id,
                    rule_name=rule.rule_name,
                    item_config=item_config,
                    result=eval_result
                )

                company_total_score += score
                rules_evaluated += 1

                rule_scores.append({
                    "rule_name": rule.rule_name,
                    "item_name": item_name,
                    "score": score,
                    "max_score": item_config.get("max_score", 10),
                    "reason": reason,
                    "evidence": eval_result.get("evidence", "")
                })

        # 更新公司总分和状态
        self._update_company_score(db, company.id, company_total_score)

        return {
            "company_id": company.id,
            "company_name": company.company_name,
            "total_score": company_total_score,
            "rules_evaluated": rules_evaluated,
            "rule_scores": rule_scores
        }

    def _save_evaluation_result(self, db, company_bid_id: int, rule_id: int, 
                               rule_name: str, item_config: Dict, result: Dict):
        """保存评审结果到数据库"""
        eval_result = EvaluationResult(
            company_bid_id=company_bid_id,
            rule_id=rule_id,
            rule_name=rule_name,
            score=result["score"],
            max_score=result.get("max_score", 10),
            reason=result["reason"],
            evidence=result.get("evidence", ""),
            evidence_details=json.dumps({
                "strengths": result.get("strengths", []),
                "weaknesses": result.get("weaknesses", []),
                "confidence": result.get("confidence", 0)
            }),
            llm_response=result.get("raw_llm_response", "")
        )
        db.add(eval_result)
        db.commit()

    def _update_company_score(self, db, company_id: int, score: float):
        """更新公司总分"""
        company = db.query(CompanyBid).filter(CompanyBid.id == company_id).first()
        if company:
            company.total_score = score
            company.status = "completed"
            company.processed_rules = getattr(company, 'processed_rules', 0)
            db.commit()

    def _calculate_rankings(self, db, results: List[Dict]):
        """计算公司排名"""
        # 按分数排序
        sorted_results = sorted(results, key=lambda x: x["total_score"], reverse=True)

        for rank, result in enumerate(sorted_results, 1):
            company = db.query(CompanyBid).filter(CompanyBid.id == result["company_id"]).first()
            if company:
                company.ranking = rank
                db.commit()

    def _update_task_status(self, db, task_id: int, status: str, **kwargs):
        """更新任务状态"""
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if task:
            task.status = status
            if status == "completed":
                task.completed_at = datetime.now()
            for key, value in kwargs.items():
                setattr(task, key, value)
            db.commit()


# 辅助函数：启动任务评审
async def start_task_evaluation(task_id: int) -> Dict:
    """启动任务评审（外部调用接口）

    Args:
        task_id: 任务 ID

    Returns:
        执行结果
    """
    executor = TaskExecutor()
    return await executor.execute_task(task_id)
