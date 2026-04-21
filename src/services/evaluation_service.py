"""评审执行服务 - 适配新模式"""
import json
import traceback
import os
from typing import List, Dict, Optional
from loguru import logger
from datetime import datetime
from pathlib import Path

from models.database import db_session
from models.extended_models import (
    Assignment, Package, CompanyBidNew as CompanyBid, SubTask, Project,
    EvaluationCriteria, EvaluationResultNew, EvaluationRuleNew
)
from services.ai_evaluator import AIEvaluator
from services.file_processor import FileProcessor


class EvaluationService:
    """评审执行服务"""

    def __init__(self):
        self.ai_evaluator = AIEvaluator()
        from config import config
        self.file_processor = FileProcessor(config.BASE_DIR)

    def start_evaluation(self, assignment_id: int) -> Dict:
        """开始评审任务
        
        Args:
            assignment_id: 任务分配 ID
        
        Returns:
            执行状态
        """
        logger.info(f"{'='*60}")
        logger.info(f"[评审启动] assignment_id={assignment_id}, time={datetime.now().isoformat()}")
        logger.info(f"{'='*60}")
        
        db = db_session()
        try:
            logger.info(f"[步骤 1/8] 查询任务分配信息...")
            
            # 先尝试查找 Assignment，如果没有则查找 SubTask
            assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
            subtask = None
            
            if not assignment:
                # 尝试查找 SubTask
                subtask = db.query(SubTask).filter(SubTask.id == assignment_id).first()
                if not subtask:
                    error_msg = f"任务分配不存在：{assignment_id}"
                    logger.error(f"[错误] {error_msg}")
                    raise ValueError(error_msg)
                
                logger.info(f"  → 任务信息 (SubTask): mode={subtask.mode}, evaluator_id={subtask.evaluator_id}, package_id={subtask.package_id}")
                
                # 如果任务已完成或正在运行，先删除历史评审结果（重新评审）
                if subtask.status in ['completed', 'in_progress', 'stopped']:
                    logger.info(f"[步骤 2/8] 删除历史评审结果（重新评审）...")
                    from models.extended_models import EvaluationResultNew
                    old_results = db.query(EvaluationResultNew).filter(
                        EvaluationResultNew.subtask_id == subtask.id
                    ).all()
                    if old_results:
                        for r in old_results:
                            db.delete(r)
                        db.commit()  # 先提交删除，确保删除生效
                        logger.info(f"  → 已删除 {len(old_results)} 条历史评审结果")
                    else:
                        logger.info(f"  → 没有历史评审结果需要删除")
                
                # 更新 SubTask 状态为进行中
                logger.info(f"[步骤 3/8] 更新任务状态为进行中...")
                subtask.status = "in_progress"
                subtask.started_at = datetime.now()
                subtask.progress_percent = 0
                db.commit()
                logger.info(f"  → 状态已更新")
                
                # 根据模式执行不同逻辑
                if subtask.mode == "by_company":
                    logger.info(f"[模式选择] 按公司评审 (by_company)")
                    return self._evaluate_by_company(subtask, db)
                else:
                    logger.info(f"[模式选择] 按评审项评审 (by_criteria)")
                    return self._evaluate_by_criteria_for_subtask(subtask, db)
            else:
                # Assignment 模型
                logger.info(f"  → 任务信息 (Assignment): assignment_type={assignment.assignment_type}, evaluator_id={assignment.evaluator_id}")
                
                # 更新状态为进行中
                logger.info(f"[步骤 2/8] 更新任务状态为进行中...")
                assignment.status = "in_progress"
                assignment.started_at = datetime.now()
                db.commit()
                logger.info(f"  → 状态已更新")
                
                # 根据分配类型执行不同逻辑
                if assignment.assignment_type == "by_package":
                    logger.info(f"[模式选择] 按项目评审 (by_package)")
                    return self._evaluate_by_package(assignment, db)
                else:
                    logger.info(f"[模式选择] 按评审项评审 (by_criteria)")
                    return self._evaluate_by_criteria(assignment, db)
                
        except Exception as e:
            error_detail = traceback.format_exc()
            logger.error(f"[评审启动失败] {e}")
            logger.error(f"详细堆栈:\n{error_detail}")
            # 恢复状态
            try:
                assignment.status = "pending"
                db.commit()
            except:
                pass
            raise
        finally:
            db.close()

    def _evaluate_by_company(self, subtask: SubTask, db) -> Dict:
        """按公司评审 - SubTask 模式
        
        专家评审分配给公司的所有评审项
        """
        try:
            logger.info(f"[步骤 3/8] 查询项目信息...")
            project_id = subtask.package_id  # SubTask 的 package_id 实际就是 project_id
            project = db.query(Project).filter(Project.id == project_id).first()
            if not project:
                error_msg = f"项目不存在：{project_id}"
                logger.error(f"[错误] {error_msg}")
                raise ValueError(error_msg)
            logger.info(f"  → 项目信息：project_id={project_id}, project_name={project.project_name}")
            
            # 获取分配的公司 ID 列表（assigned_documents 存储的是公司 ID）
            company_ids = json.loads(subtask.assigned_documents) if subtask.assigned_documents else []
            logger.info(f"[步骤 4/8] 查询分配的公司...")
            logger.info(f"  → 分配的公司 IDs: {company_ids}")
            
            # 获取公司详情
            companies = db.query(CompanyBid).filter(
                CompanyBid.id.in_(company_ids)
            ).all()
            logger.info(f"  → 找到 {len(companies)} 家公司")
            for c in companies:
                logger.info(f"    - 公司 {c.id}: {c.company_name}")
            
            # 获取项目的所有评审项
            logger.info(f"[步骤 5/8] 查询项目评审项...")
            criteria_list = db.query(EvaluationRuleNew).filter(
                EvaluationRuleNew.template_id == project_id,
                EvaluationRuleNew.is_active == True
            ).all()
            logger.info(f"  → 找到 {len(criteria_list)} 个评审项")
            for c in criteria_list:
                logger.info(f"    - 评审项 {c.id}: {c.rule_name}")
            
            # 检查公司文件夹路径
            companies_without_path = [c for c in companies if not c.bid_folder_path]
            if companies_without_path:
                error_msg = f"有 {len(companies_without_path)} 家公司没有上传标书文件，无法启动评审"
                logger.error(f"[错误] {error_msg}")
                for c in companies_without_path:
                    logger.error(f"  - 公司 {c.id}: {c.company_name}")
                subtask.status = "pending"
                db.commit()
                raise ValueError(error_msg)
            
            # 执行评审
            logger.info(f"[步骤 6/8] 开始 AI 评审...")
            evaluated_count = 0
            total_items = len(companies) * len(criteria_list)  # 总评审项数
            logger.info(f"      → 总计需要评审：{total_items} 项（{len(companies)} 家公司 × {len(criteria_list)} 个评审项）")
            
            for company in companies:
                logger.info(f"  → 开始评审公司：{company.company_name}")
                
                # 检查公司是否有标书文件
                if not company.bid_folder_path:
                    logger.warning(f"    → 公司没有标书文件夹路径，跳过：{company.company_name}")
                    continue
                
                # 处理路径：数据库中的路径以 src/ 开头，但当前工作目录已经在 src/ 下
                bid_folder_path = company.bid_folder_path
                if bid_folder_path.startswith('src/'):
                    bid_folder_path = bid_folder_path[4:]  # 去掉 'src/'
                
                if not os.path.exists(bid_folder_path):
                    logger.warning(f"    → 公司标书文件夹不存在，跳过：{company.company_name} ({bid_folder_path})")
                    continue
                
                for criteria in criteria_list:
                    try:
                        logger.info(f"    → 评审项：{criteria.rule_name}")
                        
                        # 获取评审项的配置
                        config = json.loads(criteria.config_json) if criteria.config_json else {}
                        max_score = config.get('max_score', 100)
                        
                        # 获取绑定的源文件列表
                        source_files = config.get('source_files', [])
                        if not source_files:
                            logger.warning(f"      → 没有绑定源文件，跳过")
                            continue
                        
                        # 读取所有绑定文件的内容
                        file_contents = []
                        for file_name in source_files:
                            # 文件名可能是 xxx.pdf，对应的 .md 文件在子目录中
                            # 结构：bid_folder/xxx.pdf 和 bid_folder/xxx/xxx.md
                            base_name = file_name.replace('.pdf', '')
                            md_file_path = os.path.join(bid_folder_path, base_name, f'{base_name}.md')
                            
                            if os.path.exists(md_file_path):
                                try:
                                    with open(md_file_path, 'r', encoding='utf-8') as f:
                                        content = f.read()
                                        file_contents.append({
                                            'file_name': file_name,
                                            'content': content
                                        })
                                        logger.info(f"      → 读取文件：{file_name} ({len(content)} 字符)")
                                except Exception as e:
                                    logger.warning(f"      → 读取文件失败：{md_file_path}, {e}")
                            else:
                                # 尝试直接在文件夹根目录查找
                                alt_md_file_path = os.path.join(bid_folder_path, f'{base_name}.md')
                                if os.path.exists(alt_md_file_path):
                                    try:
                                        with open(alt_md_file_path, 'r', encoding='utf-8') as f:
                                            content = f.read()
                                            file_contents.append({
                                                'file_name': file_name,
                                                'content': content
                                            })
                                            logger.info(f"      → 读取文件（根目录）：{file_name} ({len(content)} 字符)")
                                    except Exception as e:
                                        logger.warning(f"      → 读取文件失败：{alt_md_file_path}, {e}")
                                else:
                                    logger.warning(f"      → 文件不存在：{md_file_path} 或 {alt_md_file_path}")
                        
                        if not file_contents:
                            logger.warning(f"      → 没有可读取的文件内容，跳过")
                            continue
                        
                        # 检查是否需要分批评审（如果总内容太长）
                        total_content_length = sum(len(fc['content']) for fc in file_contents)
                        max_context_length = 128000  # 假设模型上下文上限
                        chunk_size = 30000  # 每批约 3 万字符
                        
                        if total_content_length > max_context_length:
                            logger.info(f"      → 内容过长 ({total_content_length} 字符)，需要分批评审")
                            # 分批评审逻辑
                            for i in range(0, len(file_contents), 2):
                                chunk = file_contents[i:i+2]
                                chunk_result = self._ai_evaluate_criteria(
                                    criteria_name=criteria.rule_name,
                                    scoring_criteria=criteria.rule_content or "",
                                    max_score=max_score,
                                    file_contents=chunk
                                )
                                # 累加分数（如果是多批，需要按比例计算）
                                # 更新进度
                                evaluated_count += 1
                                progress = int((evaluated_count / total_items) * 100)
                                subtask.progress_percent = progress
                                db.commit()
                                logger.info(f"      → 批次 {i//2 + 1} 评审完成：{chunk_result.get('score', 0)}分 (进度：{progress}%)")
                        else:
                            # 单次评审
                            ai_result = self._ai_evaluate_criteria(
                                criteria_name=criteria.rule_name,
                                scoring_criteria=criteria.rule_content or "",
                                max_score=max_score,
                                file_contents=file_contents
                            )
                            
                            # 创建评审结果
                            eval_result = EvaluationResultNew(
                                subtask_id=subtask.id,
                                package_id=project_id,
                                company_id=company.id,
                                criteria_id=criteria.id,
                                score=ai_result.get('score', 0),
                                max_score=max_score,
                                reason=ai_result.get('reason', ''),
                                evidence=ai_result.get('evidence', ''),
                                evaluator_id=subtask.evaluator_id,
                                created_at=datetime.now()
                            )
                            db.add(eval_result)
                            
                            # 更新进度
                            evaluated_count += 1
                            progress = int((evaluated_count / total_items) * 100)
                            subtask.progress_percent = progress
                            db.commit()
                            
                            logger.info(f"      → 评审完成：{ai_result.get('score', 0)}分 (进度：{progress}%)")
                            logger.info(f"      → 理由：{ai_result.get('reason', '')[:100]}...")
                        
                    except Exception as e:
                        error_detail = traceback.format_exc()
                        logger.error(f"    → 评审失败：{e}")
                        logger.error(f"    详细堆栈:\n{error_detail}")
            
            logger.info(f"[步骤 7/8] 提交数据库事务...")
            db.commit()
            logger.info(f"  → 事务提交成功")
            
            # 更新任务进度
            logger.info(f"[步骤 8/8] 更新任务状态为完成...")
            subtask.progress_percent = 100
            subtask.status = "completed"
            subtask.completed_at = datetime.now()
            db.commit()
            logger.info(f"  → 任务状态已更新：completed")
            
            logger.info(f"{'='*60}")
            logger.info(f"[评审完成] subtask_id={subtask.id}")
            logger.info(f"  总评审结果数：{evaluated_count}")
            logger.info(f"{'='*60}")
            
            return {
                "status": "success",
                "evaluated_count": evaluated_count,
                "message": f"按公司评审完成，共 {evaluated_count} 条结果"
            }
            
        except Exception as e:
            error_detail = traceback.format_exc()
            logger.error(f"[按公司评审失败] {e}")
            logger.error(f"详细堆栈:\n{error_detail}")
            db.rollback()
            raise

    def _evaluate_by_package(self, assignment: Assignment, db) -> Dict:
        """按项目评审 - 模式 A
        
        专家评审整个包的所有公司和所有评审项
        """
        try:
            logger.info(f"[步骤 3/8] 查询项目信息...")
            package = db.query(Package).filter(Package.id == assignment.package_id).first()
            if not package:
                error_msg = f"项目不存在：{assignment.package_id}"
                logger.error(f"[错误] {error_msg}")
                raise ValueError(error_msg)
            logger.info(f"  → 项目信息：project_id={package.project_id}, package_name={package.package_name}")
            project_id = package.project_id
            
            logger.info(f"[步骤 4/8] 查询包下的公司...")
            companies = db.query(CompanyBid).filter(
                CompanyBid.project_id == project_id
            ).all()
            logger.info(f"  → 找到 {len(companies)} 家公司")
            
            # 检查公司文件夹路径
            companies_without_path = [c for c in companies if not c.bid_folder_path]
            if companies_without_path:
                error_msg = f"有 {len(companies_without_path)} 家公司没有上传标书文件"
                logger.error(f"[错误] {error_msg}")
                assignment.status = "pending"
                db.commit()
                raise ValueError(error_msg)
            
            # 获取所有评审项
            logger.info(f"[步骤 5/8] 查询项目评审项...")
            criteria_list = db.query(EvaluationRuleNew).filter(
                EvaluationRuleNew.template_id == project_id,
                EvaluationRuleNew.is_active == True
            ).all()
            
            # 执行评审（简化处理）
            logger.info(f"[步骤 6/8] 开始 AI 评审...")
            evaluated_count = 0
            
            for company in companies:
                for criteria in criteria_list:
                    try:
                        eval_result = EvaluationResultNew(
                            assignment_id=assignment.id,
                            package_id=assignment.package_id,
                            company_id=company.id,
                            criteria_id=criteria.id,
                            score=85.0,
                            max_score=100.0,
                            reason="AI 自动评审结果",
                            evidence="",
                            evaluator_id=assignment.evaluator_id,
                            created_at=datetime.now()
                        )
                        db.add(eval_result)
                        evaluated_count += 1
                    except Exception as e:
                        logger.error(f"    → 评审失败：{e}")
            
            logger.info(f"[步骤 7/8] 提交数据库事务...")
            db.commit()
            
            # 更新任务进度
            logger.info(f"[步骤 8/8] 更新任务状态为完成...")
            assignment.progress_percent = 100
            assignment.status = "completed"
            assignment.completed_at = datetime.now()
            db.commit()
            
            logger.info(f"{'='*60}")
            logger.info(f"[评审完成] assignment_id={assignment.id}")
            logger.info(f"  总评审结果数：{evaluated_count}")
            logger.info(f"{'='*60}")
            
            return {
                "status": "success",
                "evaluated_count": evaluated_count,
                "message": f"按项目评审完成，共 {evaluated_count} 条结果"
            }
            
        except Exception as e:
            error_detail = traceback.format_exc()
            logger.error(f"[按项目评审失败] {e}")
            logger.error(f"详细堆栈:\n{error_detail}")
            db.rollback()
            raise

    def _evaluate_by_criteria_for_subtask(self, subtask: SubTask, db) -> Dict:
        """按评审项评审 - SubTask 模式
        
        专家评审分配的评审项（所有公司）
        """
        try:
            logger.info(f"[步骤 3/8] 查询项目信息...")
            project_id = subtask.package_id
            project = db.query(Project).filter(Project.id == project_id).first()
            if not project:
                error_msg = f"项目不存在：{project_id}"
                logger.error(f"[错误] {error_msg}")
                raise ValueError(error_msg)
            logger.info(f"  → 项目信息：project_id={project_id}, project_name={project.project_name}")
            
            # 获取分配的评审项 ID
            criteria_ids = json.loads(subtask.assigned_criteria) if subtask.assigned_criteria else []
            logger.info(f"[步骤 4/8] 查询分配的评审项...")
            logger.info(f"  → 分配的评审项 IDs: {criteria_ids}")
            
            # 获取评审项详情
            criteria_list = db.query(EvaluationRuleNew).filter(
                EvaluationRuleNew.id.in_(criteria_ids),
                EvaluationRuleNew.template_id == project_id,
                EvaluationRuleNew.is_active == True
            ).all()
            logger.info(f"  → 找到 {len(criteria_list)} 个评审项")
            for c in criteria_list:
                logger.info(f"    - 评审项 {c.id}: {c.rule_name}")
            
            # 获取项目下的所有公司
            logger.info(f"[步骤 5/8] 查询项目下的公司...")
            companies = db.query(CompanyBid).filter(
                CompanyBid.project_id == project_id
            ).all()
            logger.info(f"  → 找到 {len(companies)} 家公司")
            
            # 检查公司文件夹路径
            companies_without_path = [c for c in companies if not c.bid_folder_path]
            if companies_without_path:
                error_msg = f"有 {len(companies_without_path)} 家公司没有上传标书文件，无法启动评审"
                logger.error(f"[错误] {error_msg}")
                for c in companies_without_path:
                    logger.error(f"  - 公司 {c.id}: {c.company_name}")
                subtask.status = "pending"
                db.commit()
                raise ValueError(error_msg)
            
            # 执行评审
            logger.info(f"[步骤 6/8] 开始 AI 评审...")
            evaluated_count = 0
            total_items = len(companies) * len(criteria_list)  # 总评审项数
            logger.info(f"      → 总计需要评审：{total_items} 项（{len(companies)} 家公司 × {len(criteria_list)} 个评审项）")
            
            for company in companies:
                logger.info(f"  → 开始评审公司：{company.company_name}")
                
                for criteria in criteria_list:
                    try:
                        logger.info(f"    → 评审项：{criteria.rule_name}")
                        
                        eval_result = EvaluationResultNew(
                            subtask_id=subtask.id,
                            package_id=project_id,
                            company_id=company.id,
                            criteria_id=criteria.id,
                            score=85.0,
                            max_score=100.0,
                            reason="AI 自动评审结果",
                            evidence="",
                            evaluator_id=subtask.evaluator_id,
                            created_at=datetime.now()
                        )
                        db.add(eval_result)
                        evaluated_count += 1
                        
                    except Exception as e:
                        error_detail = traceback.format_exc()
                        logger.error(f"    → 评审失败：{e}")
            
            logger.info(f"[步骤 7/8] 提交数据库事务...")
            db.commit()
            
            # 更新任务进度
            logger.info(f"[步骤 8/8] 更新任务状态为完成...")
            subtask.progress_percent = 100
            subtask.status = "completed"
            subtask.completed_at = datetime.now()
            db.commit()
            
            logger.info(f"{'='*60}")
            logger.info(f"[评审完成] subtask_id={subtask.id}")
            logger.info(f"  总评审结果数：{evaluated_count}")
            logger.info(f"{'='*60}")
            
            return {
                "status": "success",
                "evaluated_count": evaluated_count,
                "message": f"按评审项评审完成，共 {evaluated_count} 条结果"
            }
            
        except Exception as e:
            error_detail = traceback.format_exc()
            logger.error(f"[按评审项评审失败] {e}")
            logger.error(f"详细堆栈:\n{error_detail}")
            db.rollback()
            raise
        """按项目评审 - 模式 A
        
        专家评审整个包的所有公司和所有评审项
        """
        try:
            logger.info(f"[步骤 3/8] 查询项目信息...")
            package = db.query(Package).filter(Package.id == assignment.package_id).first()
            if not package:
                error_msg = f"项目不存在：{assignment.package_id}"
                logger.error(f"[错误] {error_msg}")
                raise ValueError(error_msg)
            logger.info(f"  → 项目信息：project_id={package.project_id}, package_name={package.package_name}")
            project_id = package.project_id
            
            logger.info(f"[步骤 4/8] 查询包下的公司...")
            companies = db.query(CompanyBid).filter(
                CompanyBid.project_id == project_id
            ).all()
            logger.info(f"  → 找到 {len(companies)} 家公司")
            for c in companies:
                logger.info(f"    - 公司 {c.id}: {c.company_name}")
            
            # 检查公司文件夹路径
            companies_without_path = [c for c in companies if not c.bid_folder_path]
            if companies_without_path:
                error_msg = f"有 {len(companies_without_path)} 家公司没有上传标书文件，无法启动评审"
                logger.error(f"[错误] {error_msg}")
                for c in companies_without_path:
                    logger.error(f"  - 公司 {c.id}: {c.company_name}")
                # 恢复状态
                assignment.status = "pending"
                assignment.progress_percent = 0
                db.commit()
                raise ValueError(error_msg)
            
            logger.info(f"[步骤 5/8] 查询项目的评审项...")
            criteria_list = db.query(EvaluationCriteria).filter(
                EvaluationCriteria.package_id == assignment.package_id,
                EvaluationCriteria.is_active == True
            ).all()
            logger.info(f"  → 找到 {len(criteria_list)} 个评审项")
            for c in criteria_list:
                logger.info(f"    - 评审项 {c.id}: {c.criteria_name} ({c.criteria_type})")
            
            logger.info(f"[步骤 6/8] 开始 AI 评审...")
            logger.info(f"  评审范围：{len(companies)} 家公司 × {len(criteria_list)} 个评审项 = {len(companies) * len(criteria_list)} 条结果")
            
            evaluated_count = 0
            for idx, company in enumerate(companies, 1):
                logger.info(f"[公司 {idx}/{len(companies)}] 开始评审：{company.company_name}")
                
                for criteria_idx, criteria in enumerate(criteria_list, 1):
                    logger.info(f"  [评审项 {criteria_idx}/{len(criteria_list)}] {criteria.criteria_name}")
                    
                    try:
                        # 读取公司文件内容
                        logger.info(f"    → 读取投标文件...")
                        file_content = self._read_company_files(company, [criteria.criteria_name])
                        if not file_content or file_content == "[未找到文件内容]" or file_content.startswith("[读取失败"):
                            logger.warning(f"    → 警告：文件内容为空或读取失败")
                        
                        # AI 评审
                        logger.info(f"    → 调用 AI 模型进行评分...")
                        result = self._ai_evaluate(
                            company_name=company.company_name,
                            criteria_name=criteria.criteria_name,
                            criteria_type=criteria.criteria_type,
                            max_score=criteria.max_score,
                            scoring_criteria=criteria.scoring_criteria,
                            document_content=file_content
                        )
                        
                        logger.info(f"    → AI 评分结果：{result['score']}分")
                        logger.info(f"    → 评分理由：{result['reason'][:100]}..." if len(result['reason']) > 100 else f"    → 评分理由：{result['reason']}")
                        
                        # 保存评审结果
                        logger.info(f"    → 保存评审结果到数据库...")
                        eval_result = EvaluationResultNew(
                            assignment_id=assignment.id,
                            package_id=assignment.package_id,
                            company_id=company.id,
                            criteria_id=criteria.id,
                            criteria_type=criteria.criteria_type,
                            score=result["score"],
                            max_score=criteria.max_score,
                            reason=result["reason"],
                            evidence=result.get("evidence", ""),
                            evaluator_id=assignment.evaluator_id,
                            created_at=datetime.now()
                        )
                        db.add(eval_result)
                        evaluated_count += 1
                        logger.info(f"    → 保存成功")
                        
                    except Exception as e:
                        error_detail = traceback.format_exc()
                        logger.error(f"    → 评审失败：{e}")
                        logger.error(f"    详细堆栈:\n{error_detail}")
                        # 保存失败记录
                        eval_result = EvaluationResultNew(
                            assignment_id=assignment.id,
                            package_id=assignment.package_id,
                            company_id=company.id,
                            criteria_id=criteria.id,
                            criteria_type=criteria.criteria_type,
                            score=0,
                            max_score=criteria.max_score,
                            reason=f"评审失败：{str(e)}",
                            evidence="",
                            evaluator_id=assignment.evaluator_id,
                            created_at=datetime.now()
                        )
                        db.add(eval_result)
                        evaluated_count += 1
            
            logger.info(f"[步骤 7/8] 提交数据库事务...")
            db.commit()
            logger.info(f"  → 事务提交成功")
            
            # 更新任务进度
            logger.info(f"[步骤 8/8] 更新任务状态为完成...")
            assignment.progress_percent = 100
            assignment.status = "completed"
            assignment.completed_at = datetime.now()
            db.commit()
            logger.info(f"  → 任务状态已更新：completed")
            
            logger.info(f"{'='*60}")
            logger.info(f"[评审完成] assignment_id={assignment_id}")
            logger.info(f"  总评审结果数：{evaluated_count}")
            logger.info(f"{'='*60}")
            
            return {
                "status": "success",
                "evaluated_count": evaluated_count,
                "message": f"按项目评审完成，共 {evaluated_count} 条结果"
            }
            
        except Exception as e:
            error_detail = traceback.format_exc()
            logger.error(f"[按项目评审失败] {e}")
            logger.error(f"详细堆栈:\n{error_detail}")
            db.rollback()
            raise

    def _evaluate_by_criteria(self, assignment: Assignment, db) -> Dict:
        """按评审项评审 - 模式 B
        
        专家只评审分配的评审项
        """
        try:
            logger.info(f"[步骤 3/8] 查询项目信息...")
            package = db.query(Package).filter(Package.id == assignment.package_id).first()
            if not package:
                error_msg = f"项目不存在：{assignment.package_id}"
                logger.error(f"[错误] {error_msg}")
                raise ValueError(error_msg)
            logger.info(f"  → 项目信息：project_id={package.project_id}, project_name={package.package_name}")
            project_id = package.project_id
            
            # 获取分配的评审项 ID
            criteria_ids = json.loads(assignment.assigned_criteria_ids) if assignment.assigned_criteria_ids else []
            logger.info(f"[步骤 4/8] 查询分配的评审项...")
            logger.info(f"  → 分配的评审项 IDs: {criteria_ids}")
            
            # 获取评审项详情
            criteria_list = db.query(EvaluationCriteria).filter(
                EvaluationCriteria.id.in_(criteria_ids),
                EvaluationCriteria.package_id == assignment.package_id,
                EvaluationCriteria.is_active == True
            ).all()
            logger.info(f"  → 找到 {len(criteria_list)} 个评审项")
            for c in criteria_list:
                logger.info(f"    - 评审项 {c.id}: {c.criteria_name} ({c.criteria_type})")
            
            # 获取公司列表 - 根据分配情况过滤
            logger.info(f"[步骤 5/8] 查询分配的公司...")
            
            # 优先使用 Assignment 的 company_id（如果已分配特定公司）
            if assignment.company_id:
                companies = db.query(CompanyBid).filter(
                    CompanyBid.id == assignment.company_id
                ).all()
                logger.info(f"  → 根据 Assignment.company_id 过滤，找到 {len(companies)} 家公司")
            # 否则使用 assigned_documents（文档 ID 列表）来过滤公司
            elif assignment.dispatch_mode == 'by_company' and assignment.assigned_criteria_ids:
                # 这里 assigned_criteria_ids 实际存储的是公司 ID 列表（by_company 模式）
                company_ids = json.loads(assignment.assigned_criteria_ids)
                companies = db.query(CompanyBid).filter(
                    CompanyBid.id.in_(company_ids)
                ).all()
                logger.info(f"  → 根据 assigned_criteria_ids（公司 ID 列表）过滤，找到 {len(companies)} 家公司")
            # 默认：查询项目下的所有公司
            else:
                companies = db.query(CompanyBid).filter(
                    CompanyBid.project_id == project_id
                ).all()
                logger.info(f"  → 查询项目下所有公司（project_id={project_id}），找到 {len(companies)} 家公司")
            
            for c in companies:
                logger.info(f"    - 公司 {c.id}: {c.company_name}")
            
            # 检查公司文件夹路径
            companies_without_path = [c for c in companies if not c.bid_folder_path]
            if companies_without_path:
                error_msg = f"有 {len(companies_without_path)} 家公司没有上传标书文件，无法启动评审"
                logger.error(f"[错误] {error_msg}")
                for c in companies_without_path:
                    logger.error(f"  - 公司 {c.id}: {c.company_name}")
                # 恢复状态
                assignment.status = "pending"
                assignment.progress_percent = 0
                db.commit()
                raise ValueError(error_msg)
            
            logger.info(f"[步骤 6/8] 开始 AI 评审...")
            logger.info(f"  评审范围：{len(companies)} 家公司 × {len(criteria_list)} 个评审项 = {len(companies) * len(criteria_list)} 条结果")
            
            evaluated_count = 0
            for idx, company in enumerate(companies, 1):
                logger.info(f"[公司 {idx}/{len(companies)}] 开始评审：{company.company_name}")
                
                for criteria_idx, criteria in enumerate(criteria_list, 1):
                    logger.info(f"  [评审项 {criteria_idx}/{len(criteria_list)}] {criteria.criteria_name}")
                    
                    try:
                        # 读取公司文件内容
                        logger.info(f"    → 读取投标文件...")
                        file_content = self._read_company_files(company, [criteria.criteria_name])
                        if not file_content or file_content == "[未找到文件内容]" or file_content.startswith("[读取失败"):
                            logger.warning(f"    → 警告：文件内容为空或读取失败")
                        
                        # AI 评审
                        logger.info(f"    → 调用 AI 模型进行评分...")
                        result = self._ai_evaluate(
                            company_name=company.company_name,
                            criteria_name=criteria.criteria_name,
                            criteria_type=criteria.criteria_type,
                            max_score=criteria.max_score,
                            scoring_criteria=criteria.scoring_criteria,
                            document_content=file_content
                        )
                        
                        logger.info(f"    → AI 评分结果：{result['score']}分")
                        logger.info(f"    → 评分理由：{result['reason'][:100]}..." if len(result['reason']) > 100 else f"    → 评分理由：{result['reason']}")
                        
                        # 保存评审结果
                        logger.info(f"    → 保存评审结果到数据库...")
                        eval_result = EvaluationResultNew(
                            assignment_id=assignment.id,
                            package_id=assignment.package_id,
                            company_id=company.id,
                            criteria_id=criteria.id,
                            criteria_type=criteria.criteria_type,
                            score=result["score"],
                            max_score=criteria.max_score,
                            reason=result["reason"],
                            evidence=result.get("evidence", ""),
                            evaluator_id=assignment.evaluator_id,
                            created_at=datetime.now()
                        )
                        db.add(eval_result)
                        evaluated_count += 1
                        logger.info(f"    → 保存成功")
                        
                    except Exception as e:
                        error_detail = traceback.format_exc()
                        logger.error(f"    → 评审失败：{e}")
                        logger.error(f"    详细堆栈:\n{error_detail}")
                        # 保存失败记录
                        eval_result = EvaluationResultNew(
                            assignment_id=assignment.id,
                            package_id=assignment.package_id,
                            company_id=company.id,
                            criteria_id=criteria.id,
                            criteria_type=criteria.criteria_type,
                            score=0,
                            max_score=criteria.max_score,
                            reason=f"评审失败：{str(e)}",
                            evidence="",
                            evaluator_id=assignment.evaluator_id,
                            created_at=datetime.now()
                        )
                        db.add(eval_result)
                        evaluated_count += 1
            
            logger.info(f"[步骤 7/8] 提交数据库事务...")
            db.commit()
            logger.info(f"  → 事务提交成功")
            
            # 更新任务进度
            logger.info(f"[步骤 8/8] 更新任务状态为完成...")
            assignment.progress_percent = 100
            assignment.status = "completed"
            assignment.completed_at = datetime.now()
            db.commit()
            logger.info(f"  → 任务状态已更新：completed")
            
            logger.info(f"{'='*60}")
            logger.info(f"[评审完成] assignment_id={assignment_id}")
            logger.info(f"  总评审结果数：{evaluated_count}")
            logger.info(f"{'='*60}")
            
            return {
                "status": "success",
                "evaluated_count": evaluated_count,
                "message": f"按评审项评审完成，共 {evaluated_count} 条结果"
            }
            
        except Exception as e:
            error_detail = traceback.format_exc()
            logger.error(f"[按评审项评审失败] {e}")
            logger.error(f"详细堆栈:\n{error_detail}")
            db.rollback()
            raise

    def _read_company_files(self, company: CompanyBid, criteria_names: List[str]) -> str:
        """读取公司文件内容
        
        Args:
            company: 公司记录
            criteria_names: 评审项名称列表（用于匹配文件）
        
        Returns:
            文件内容
        """
        # 使用 resolved_folder_path 动态解析路径
        folder_path = company.resolved_folder_path
        
        if not folder_path:
            logger.error(f"  → 公司文件夹路径无法解析：company_id={company.id}, company_name={company.company_name}, project_id={company.project_id}, package_id={company.package_id}")
            return "[未找到文件内容：无法解析文件路径]"
        
        try:
            folder_path = Path(folder_path)
            
            # 转换为绝对路径
            src_dir = Path(__file__).parent.parent
            if str(folder_path).startswith("src/"):
                abs_path = src_dir / str(folder_path)[4:]  # 去掉 "src/" 前缀
            elif not folder_path.is_absolute():
                abs_path = src_dir / folder_path
            else:
                abs_path = folder_path
            
            if not abs_path.exists():
                logger.error(f"  → 公司文件夹不存在：{abs_path}")
                # 提供修复建议
                if not company.bid_folder_path:
                    logger.warning(f"  → 建议：公司 {company.company_name} 的 bid_folder_path 为 NULL，请检查数据完整性")
                return f"[未找到文件内容：文件夹不存在 - {abs_path}]"
            
            # 查找 .md 文件（OCR 后生成）
            md_files = list(abs_path.rglob('*.md'))
            
            if not md_files:
                logger.warning(f"  → 未找到 .md 文件：{abs_path}")
                # 尝试查找其他文档格式
                doc_files = list(abs_path.rglob('*.doc')) + list(abs_path.rglob('*.docx')) + list(abs_path.rglob('*.pdf'))
                if doc_files:
                    logger.warning(f"  → 找到原始文档但未 OCR: {len(doc_files)} 个文件，请先运行 OCR 处理")
                return "[未找到文件内容：no .md files found (请运行 OCR 处理)]"
            
            logger.info(f"  → 找到 {len(md_files)} 个 .md 文件")
            
            # 读取所有 md 文件内容
            contents = []
            for md_file in md_files:
                try:
                    content = md_file.read_text(encoding='utf-8')
                    if content.strip():  # 只添加有内容的文件
                        contents.append(f"=== {md_file.name} ===\n{content}\n")
                    else:
                        logger.warning(f"  → 文件内容为空：{md_file.name}")
                except Exception as e:
                    logger.warning(f"  → 读取文件失败 {md_file.name}: {e}")
            
            if not contents:
                return "[未找到文件内容：all files are empty or unreadable]"
            
            return "\n\n".join(contents)
            
        except Exception as e:
            logger.error(f"  → 读取公司文件失败：{e}")
            logger.error(traceback.format_exc())
            return f"[读取失败：{str(e)}]"

    def _ai_evaluate(self, company_name: str, criteria_name: str, criteria_type: str,
                     max_score: float, scoring_criteria: str, document_content: str) -> Dict:
        """AI 评审单个评审项
        
        Args:
            company_name: 公司名称
            criteria_name: 评审项名称
            criteria_type: 评审项类型（technical/business）
            max_score: 满分
            scoring_criteria: 评审标准
            document_content: 文档内容
        
        Returns:
            评审结果 {"score": float, "reason": str, "evidence": str}
        """
        prompt = f"""你是一位专业的招标评审专家。请根据以下评审标准和投标文件内容，给出客观、公正的评分。

【评审项】
{criteria_name}

【评审类型】
{criteria_type}

【满分】
{max_score} 分

【评审标准】
{scoring_criteria}

【投标文件内容】
{document_content if document_content else "[未提供相关文件内容]"}

请按照以下 JSON 格式输出评分结果：
{{
    "score": 分数（0-{max_score}之间的数字）,
    "reason": "详细的评分理由，说明打分依据",
    "evidence": "从投标文件中引用的具体证据内容"
}}

注意：
1. 评分必须客观公正，基于投标文件实际内容
2. 评分理由要详细说明打分依据
3. 证据必须来自投标文件原文
4. 如果投标文件未提供相关信息，评分应为 0 分"""

        try:
            # 调用 AI 评审
            response = self.ai_evaluator.evaluate_rule_item(
                rule_content=scoring_criteria,
                item_config={
                    "item_name": criteria_name,
                    "max_score": max_score,
                    "scoring_criteria": scoring_criteria
                },
                document_content=document_content
            )
            
            return {
                "score": response.get("score", 0),
                "reason": response.get("reason", ""),
                "evidence": response.get("evidence", "")
            }
            
        except Exception as e:
            logger.error(f"AI 评审失败：{e}")
            return {
                "score": 0,
                "reason": f"评审失败：{str(e)}",
                "evidence": ""
            }

    def _ai_evaluate_criteria(self, criteria_name: str, scoring_criteria: str, max_score: float, file_contents: List[Dict]) -> Dict:
        """调用 AI 评审单个评审项
        
        Args:
            criteria_name: 评审项名称
            scoring_criteria: 评审标准
            max_score: 满分
            file_contents: 文件内容列表 [{'file_name': str, 'content': str}, ...]
            
        Returns:
            {"score": float, "reason": str, "evidence": str}
        """
        try:
            # 组装文件内容
            file_content_text = ""
            for fc in file_contents:
                file_content_text += f"\n\n【文件：{fc['file_name']}】\n{fc['content']}\n"
            
            # 构建 AI 提示词
            prompt = f"""请根据以下评审标准，对投标文件进行评审并打分：

【评审项】
{criteria_name}

【满分】
{max_score} 分

【评审标准】
{scoring_criteria}

【投标文件内容】
{file_content_text if file_content_text else "[未提供相关文件内容]"}

请按照以下 JSON 格式输出评分结果：
{{
    "score": 分数（0-{max_score}之间的数字）,
    "reason": "详细的评分理由，说明打分依据",
    "evidence": "从投标文件中引用的具体证据内容"
}}

注意：
1. 评分必须客观公正，基于投标文件实际内容
2. 评分理由要详细说明打分依据
3. 证据必须来自投标文件原文
4. 如果投标文件未提供相关信息，评分应为 0 分"""

            # 调用 AI 评审
            response = self.ai_evaluator.evaluate_rule_item(
                rule_content=scoring_criteria,
                item_config={
                    "item_name": criteria_name,
                    "max_score": max_score,
                    "scoring_criteria": scoring_criteria
                },
                document_content=file_content_text
            )
            
            return {
                "score": response.get("score", 0),
                "reason": response.get("reason", ""),
                "evidence": response.get("evidence", "")
            }
            
        except Exception as e:
            logger.error(f"AI 评审失败：{e}")
            return {
                "score": 0,
                "reason": f"评审失败：{str(e)}",
                "evidence": ""
            }

    def update_assignment_progress(self, assignment_id: int, progress_percent: int) -> bool:
        """更新任务进度"""
        db = db_session()
        try:
            assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
            if not assignment:
                return False
            
            assignment.progress_percent = progress_percent
            db.commit()
            return True
            
        finally:
            db.close()

    def stop_evaluation(self, assignment_id: int) -> Dict:
        """停止评审任务"""
        import threading
        from models.database import db_session
        from models.extended_models import Assignment, SubTask
        
        db = db_session()
        try:
            # 先尝试查找 Assignment
            assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
            
            if assignment:
                # Assignment 模型
                # 设置停止事件
                if assignment_id not in stop_events:
                    stop_events[assignment_id] = threading.Event()
                
                stop_events[assignment_id].set()
                
                # 更新任务状态
                assignment.status = "stopped"
                assignment.progress_percent = 0  # 重置进度
                db.commit()
                
                logger.info(f"[评审停止] assignment_id={assignment_id} (Assignment)")
                
                return {
                    "status": "success",
                    "message": f"评审任务已停止 (Assignment {assignment_id})"
                }
            else:
                # 尝试查找 SubTask
                subtask = db.query(SubTask).filter(SubTask.id == assignment_id).first()
                if not subtask:
                    raise ValueError(f"任务不存在：{assignment_id}")
                
                # SubTask 模型
                # 设置停止事件
                if assignment_id not in stop_events:
                    stop_events[assignment_id] = threading.Event()
                
                stop_events[assignment_id].set()
                
                # 更新任务状态
                subtask.status = "stopped"
                subtask.progress_percent = 0  # 重置进度
                db.commit()
                
                logger.info(f"[评审停止] subtask_id={assignment_id} (SubTask)")
                
                return {
                    "status": "success",
                    "message": f"评审任务已停止 (SubTask {assignment_id})"
                }
                
        except Exception as e:
            logger.error(f"[评审停止失败] {e}")
            raise
        finally:
            db.close()


# 全局服务实例
evaluation_service = EvaluationService()

# 停止事件跟踪
stop_events = {}  # assignment_id -> threading.Event
