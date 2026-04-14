from fastapi import APIRouter, HTTPException, UploadFile, File, Body
from fastapi.background import BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Dict, Optional
from loguru import logger
from datetime import datetime
import threading
import os
import shutil
import json
import traceback
from pathlib import Path

from services.file_processor import FileProcessor
from services.ai_evaluator import AIEvaluator
from models.evaluation_tasks import EvaluationTask
from models.company_bids import CompanyBid
from models.evaluation_results import EvaluationResult
from models.evaluation_rules import EvaluationRule, TaskRule
from models.database import db_session

router = APIRouter()

# 使用基于src目录的绝对路径
src_dir = Path(__file__).parent.parent
file_processor = FileProcessor(str(src_dir / "data"))
evaluation_service = AIEvaluator()


# 请求模型
class CreateTaskRequest(BaseModel):
    task_name: str
    rule_ids: Optional[List[int]] = []  # 可选的规则模板 ID 列表


@router.post("")
async def create_task(request: CreateTaskRequest = Body(...)):
    """创建任务"""
    db = db_session()
    try:
        task = EvaluationTask(
            task_name=request.task_name,
            status="pending"
        )
        db.add(task)
        db.flush()  # 获取 task.id
        
        # 关联规则模板
        if request.rule_ids:
            rules = db.query(EvaluationRule).filter(EvaluationRule.id.in_(request.rule_ids)).all()
            # 插入关联表
            for rule in rules:
                task_rule = TaskRule(task_id=task.id, rule_id=rule.id, is_active=True)
                db.add(task_rule)
        
        db.commit()
        db.refresh(task)

        # 查询关联的规则
        rule_ids = db.query(TaskRule.rule_id).filter(TaskRule.task_id == task.id).all()
        rule_ids = [r[0] for r in rule_ids]

        return {
            "id": task.id,
            "task_name": task.task_name,
            "status": task.status,
            "created_at": task.created_at,
            "rule_ids": rule_ids
        }
    except Exception as e:
        db.rollback()
        logger.error(f"创建任务失败：{e}")
        raise HTTPException(status_code=500, detail="创建任务失败")
    finally:
        db.close()


@router.post("/{task_id}/upload")
async def upload_bid_file(task_id: int, file: UploadFile = File(...)):
    """上传标书 ZIP 文件（覆盖原有数据）"""
    import os
    from pathlib import Path
    
    db = db_session()
    try:
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        
        # 删除旧的 ZIP 文件
        if task.zip_file_path and os.path.exists(task.zip_file_path):
            os.remove(task.zip_file_path)
        
        # 删除旧的公司数据
        old_companies = db.query(CompanyBid).filter(CompanyBid.task_id == task_id).all()
        for company in old_companies:
            # 删除公司文件夹
            if company.bid_folder_path and os.path.exists(company.bid_folder_path):
                import shutil
                shutil.rmtree(company.bid_folder_path, ignore_errors=True)
        
        db.query(CompanyBid).filter(CompanyBid.task_id == task_id).delete()
        task.total_companies = 0
        db.commit()
        
        # 保存新文件
        src_dir = Path(__file__).parent.parent  # 向上两级到src目录
        upload_dir = src_dir / "data" / "uploads"
        upload_dir.mkdir(parents=True, exist_ok=True)
        file_path = upload_dir / f"{task_id}_{file.filename}"
        
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        task.zip_file_path = str(file_path)
        db.commit()
        
        # 解析新 ZIP 并识别公司
        companies = file_processor.process_bid_zip(task_id, str(file_path))
        
        # 保存新公司数据，ocr_status 默认为 pending
        for company_data in companies:
            company = CompanyBid(
                task_id=task_id,
                company_name=company_data["company_name"],
                bid_folder_path=company_data["folder_path"],
                ocr_status="pending"  # 初始状态为待解析
            )
            db.add(company)
        
        task.total_companies = len(companies)
        task.ocr_status = 'processing'  # 设置任务状态为处理中
        db.commit()
        
        # 异步触发 OCR 处理（使用线程）
        stop_event = threading.Event()
        ocr_threads[task_id] = stop_event
        
        thread = threading.Thread(target=process_documents_ocr, args=(task_id, stop_event), daemon=True)
        thread.start()
        logger.info(f"已启动后台 OCR 处理任务：task_id={task_id}")
        
        return {
            "message": "上传成功，已开始解析文档",
            "companies": [c["company_name"] for c in companies],
            "ocr_status": "processing"
        }
    except Exception as e:
        db.rollback()
        logger.error(f"上传文件失败：{e}")
        raise HTTPException(status_code=500, detail="上传文件失败")
    finally:
        db.close()


@router.post("/{task_id}/start")
async def start_task(task_id: int, background_tasks: BackgroundTasks):
    """启动任务评审（异步执行）"""
    db = db_session()
    try:
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        
        # 检查任务级别的 OCR 状态
        if task.ocr_status == 'processing':
            raise HTTPException(
                status_code=400, 
                detail="文档解析正在进行中，请先停止或等待解析完成"
            )
        
        # 检查是否有公司数据
        companies = db.query(CompanyBid).filter(CompanyBid.task_id == task_id).all()
        if not companies:
            raise HTTPException(status_code=400, detail="任务没有公司数据，请先上传标书")
        
        # 检查所有公司的 OCR 解析是否完成
        processing_companies = [c for c in companies if c.ocr_status == 'processing']
        if processing_companies:
            raise HTTPException(
                status_code=400, 
                detail=f"文档解析尚未完成（{len(processing_companies)} 家公司正在解析中），请等待解析完成后再启动评审"
            )
        
        failed_companies = [c for c in companies if c.ocr_status == 'failed']
        if failed_companies:
            raise HTTPException(
                status_code=400,
                detail=f"部分公司文档解析失败（{len(failed_companies)} 家），请检查后重试"
            )
        
        # 检查是否有规则
        task_rules = db.query(TaskRule).filter(TaskRule.task_id == task_id, TaskRule.is_active == True).all()
        if not task_rules:
            raise HTTPException(status_code=400, detail="任务没有关联评审规则，请先配置规则")
        
        # 检查任务状态
        if task.status == 'processing':
            raise HTTPException(
                status_code=400, 
                detail="任务正在评审中，请勿重复启动"
            )
        # 清除之前的评审结果并重置公司状态（无论任务状态如何）
        logger.info(f"[TASK:{task_id}] 清除之前的评审结果并重置公司状态")
        company_ids = [c.id for c in companies]
        if company_ids:
            db.query(EvaluationResult).filter(EvaluationResult.company_bid_id.in_(company_ids)).delete(synchronize_session=False)
            logger.info(f"[TASK:{task_id}] 已清除之前评审结果")
        # 重置公司状态
        for company in companies:
            company.status = 'pending'
            company.total_score = None
            company.processed_rules = 0
            company.total_rules = len(task_rules)
        logger.info(f"[TASK:{task_id}] 已重置公司状态")
        
        task.status = "processing"
        db.commit()
        
        logger.info(f"[TASK:{task_id}] 启动评审，共 {len(companies)} 家公司，{len(task_rules)} 个规则")
        
        # 异步执行 AI 评审
        background_tasks.add_task(run_ai_evaluation, task_id)
        
        logger.info(f"[TASK:{task_id}] 评审已启动，AI 评审正在后台执行")
        
        return {"message": f"任务{task_id}已启动，AI 评审正在进行中"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"[TASK:{task_id}] 启动任务失败：{e}")
        if task:
            task.status = "failed"
            db.commit()
        raise HTTPException(status_code=500, detail="启动任务失败")
    finally:
        db.close()


def run_ai_evaluation(task_id: int):
    """后台执行 AI 评审 - 读取已生成的.md 文件进行评分"""
    import os
    import traceback
    from pathlib import Path
    from datetime import datetime
    from models.evaluation_tasks import EvaluationTask
    from models.company_bids import CompanyBid
    from models.evaluation_results import EvaluationResult
    import json
    import traceback
    from models.evaluation_rules import EvaluationRule, TaskRule
    from models.database import db_session
    
    db = db_session()
    task = None
    try:
        logger.info(f"[TASK:{task_id}] === 开始 AI 评审任务 ===")
        
        # 获取任务
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if not task:
            logger.error(f"[TASK:{task_id}] 任务不存在")
            return
        
        logger.info(f"[TASK:{task_id}] 找到任务：{task.task_name}")
        
        # 获取任务关联的规则
        logger.info(f"[TASK:{task_id}] 获取任务关联的规则...")
        task_rules = db.query(TaskRule).filter(TaskRule.task_id == task_id).all()
        rule_ids = [tr.rule_id for tr in task_rules]
        rules = db.query(EvaluationRule).filter(EvaluationRule.id.in_(rule_ids)).all() if rule_ids else []
        
        logger.info(f"[TASK:{task_id}] 找到 {len(rules)} 个评审规则")
        
        # 获取公司列表
        logger.info(f"[TASK:{task_id}] 获取公司列表...")
        companies = db.query(CompanyBid).filter(CompanyBid.task_id == task_id).all()
        
        # 检查是否有公司数据
        if not companies:
            logger.warning(f"[TASK:{task_id}] 没有公司数据，设置为失败状态")
            task.status = "failed"
            db.commit()
            return
        
        logger.info(f"[TASK:{task_id}] 开始评审任务，共 {len(companies)} 家公司，{len(rules)} 个评审规则")
        
        # 初始化任务的已处理规则数
        task.processed_rules = 0
        task.total_rules = len(rules)
        task.status = "processing"
        db.commit()
        
        for company_index, company in enumerate(companies):
            try:
                logger.info(f"[TASK:{task_id}] [{company_index + 1}/{len(companies)}] 开始评估公司：{company.company_name}")
                company.status = "processing"
                company.processed_rules = 0
                company.total_rules = len(rules)
                db.commit()
                
                # 获取公司文件夹路径
                folder_path = company.bid_folder_path
                logger.info(f"[TASK:{task_id}] 公司 {company.company_name} 的文件夹路径：{folder_path}")
                
                if not folder_path or not os.path.exists(folder_path):
                    logger.error(f"[TASK:{task_id}] 公司文件夹不存在：{folder_path}")
                    company.status = "failed"
                    db.commit()
                    logger.warning(f"[TASK:{task_id}] [{company_index + 1}/{len(companies)}] 跳过公司 {company.company_name}")
                    continue
                
                # 收集所有.md 文件（文档解析后生成的）
                md_files = []
                try:
                    for file_path in Path(folder_path).rglob('*.md'):
                        # 跳过临时目录
                        if '_images' not in str(file_path):
                            md_files.append(file_path)
                    
                    logger.info(f"[TASK:{task_id}] 为公司 {company.company_name} 找到 {len(md_files)} 个.md 文件")
                except Exception as e:
                    logger.error(f"[TASK:{task_id}] 收集.md 文件失败：{e}")
                    company.status = "failed"
                    db.commit()
                    continue
                
                if not md_files:
                    logger.error(f"[TASK:{task_id}] 公司 {company.company_name} 没有找到.md 文件")
                    company.status = "failed"
                    db.commit()
                    continue
                
                # 读取与评审规则绑定的.md 文件内容
                document_contents = []
                
                # 为每个规则读取绑定的文件
                for rule_index, rule in enumerate(rules):
                    try:
                        # 从规则配置中获取绑定的文件
                        rule_config = json.loads(rule.config_json) if rule.config_json else {}
                        rule_items = rule_config.get('items', [])
                        
                        if rule_items:
                            source_files = rule_items[0].get('source_files', [])
                            logger.info(f"[TASK:{task_id}] 规则 {rule.rule_name} 绑定了 {len(source_files)} 个文件")
                            
                            # 为每个绑定的文件找到对应的.md文件
                            for source_file in source_files:
                                # 找到对应的.md文件
                                for md_file in md_files:
                                    # 检查文件名是否匹配（去掉扩展名）
                                    source_file_base = Path(source_file).stem
                                    md_file_base = Path(md_file).stem
                                    
                                    if source_file_base == md_file_base:
                                        try:
                                            relative_path = str(md_file.relative_to(folder_path))
                                            content = md_file.read_text(encoding='utf-8')
                                            logger.info(f"[TASK:{task_id}] 读取规则 {rule.rule_name} 绑定的文件：{relative_path}")
                                            logger.debug(f"[TASK:{task_id}] 文件内容：{content[:200]}...")  # 只记录前200个字符
                                            document_contents.append(f"## {md_file.name}\n\n{content}")
                                            break
                                        except Exception as e:
                                            logger.error(f"[TASK:{task_id}] 读取绑定文件失败 {md_file}: {e}")
                                            logger.debug(traceback.format_exc())
                    except Exception as e:
                        logger.error(f"[TASK:{task_id}] 处理规则 {rule.rule_name} 的文件绑定失败: {e}")
                        logger.debug(traceback.format_exc())
                
                if not document_contents:
                    logger.error(f"[TASK:{task_id}] 公司 {company.company_name} 没有成功读取任何绑定的.md 文件")
                    company.status = "failed"
                    db.commit()
                    continue
                
                combined_documents = "\n\n---\n\n".join(document_contents)
                logger.info(f"[TASK:{task_id}] 公司 {company.company_name} 的文档内容准备完成，共 {len(document_contents)} 个文件")
                
                # 逐个规则进行评审
                for rule_index, rule in enumerate(rules):
                    try:
                        logger.info(f"[TASK:{task_id}] [{company_index + 1}/{len(companies)}] 开始评审规则：{rule.rule_name} ({rule_index + 1}/{len(rules)})")
                        
                        # 获取规则内容
                        rule_content = rule.rule_content or ""
                        
                        # 获取规则配置中的评分标准
                        rule_config = {}
                        if rule.config_json:
                            try:
                                rule_config = json.loads(rule.config_json)
                                logger.debug(f"[TASK:{task_id}] 成功解析规则配置")
                            except Exception as e:
                                logger.error(f"[TASK:{task_id}] 解析规则配置失败: {e}")
                        
                        # 提取评分标准
                        scoring_criteria = rule_content
                        if rule_config.get('items') and len(rule_config['items']) > 0:
                            item = rule_config['items'][0]
                            if item.get('scoring_criteria'):
                                scoring_criteria = item['scoring_criteria']
                            elif item.get('content'):
                                scoring_criteria = item['content']
                        
                        logger.debug(f"[TASK:{task_id}] 规则内容：{scoring_criteria[:200]}...")  # 只记录前200个字符
                        
                        # 构建 prompt
                        prompt = f"""
你是一位专业的投标评审专家。请根据以下投标文件内容和评审规则，对投标公司进行评分。

# 投标公司
{company.company_name}

# 投标文件内容
{combined_documents}

# 评审规则
# {rule.rule_name}
{scoring_criteria}

请按照以下 JSON 格式返回评审结果：
{{
    "score": 85.0,
    "max_score": 100.0,
    "reason": "评分理由...",
    "evidence": "依据说明...",
    "evidence_details": [
        {{"file": "文件名.md", "page": 1, "content": "原文引用..."}},
        {{"file": "文件名 2.md", "page": 2, "content": "原文引用..."}}
    ]
}}
"""
                        logger.info(f"[TASK:{task_id}] 构建 {rule.rule_name} 的 prompt 完成，准备调用 LLM")
                        logger.debug(f"[TASK:{task_id}] prompt 长度：{len(prompt)} 字符")
                        
                        # 调用 LLM
                        try:
                            from services.llm_service import LLMService
                            llm = LLMService()
                            logger.info(f"[TASK:{task_id}] 调用 LLM 开始...")
                            response = llm.generate_content(prompt)
                            logger.info(f"[TASK:{task_id}] {rule.rule_name} 的 LLM 调用完成")
                            logger.debug(f"[TASK:{task_id}] LLM 响应：{response[:200]}...")  # 只记录前200个字符
                        except Exception as e:
                            logger.error(f"[TASK:{task_id}] 调用 LLM 失败: {e}")
                            logger.debug(traceback.format_exc())
                            # 继续评审下一个规则
                            continue
                        
                        # 解析响应
                        evaluation_result = response or "评分失败"
                        score = None
                        reason = evaluation_result
                        
                        # 尝试从响应中解析JSON
                        try:
                            # 提取JSON部分（如果有的话）
                            import re
                            # 使用更精确的正则表达式，尝试匹配完整的JSON对象
                            # 查找第一个{开始，最后一个}结束的内容
                            json_start = evaluation_result.find('{')
                            json_end = evaluation_result.rfind('}')
                            if json_start != -1 and json_end != -1 and json_end > json_start:
                                json_str = evaluation_result[json_start:json_end+1]
                                # 清理JSON字符串，移除可能的多余字符
                                json_str = json_str.strip()
                                try:
                                    llm_response = json.loads(json_str)
                                    score = float(llm_response.get('score', 0.0))
                                    reason = llm_response.get('reason', evaluation_result)
                                    evidence = llm_response.get('evidence', '')
                                    evidence_details = llm_response.get('evidence_details', [])
                                    logger.info(f"[TASK:{task_id}] 解析到评分：{score}")
                                    logger.info(f"[TASK:{task_id}] 解析到依据：{evidence}")
                                    logger.info(f"[TASK:{task_id}] 解析到依据详情：{evidence_details}")
                                except json.JSONDecodeError as e:
                                    # 尝试修复JSON格式
                                    try:
                                        # 移除末尾可能的逗号
                                        json_str = re.sub(r',\s*}', '}', json_str)
                                        # 尝试再次解析
                                        llm_response = json.loads(json_str)
                                        score = float(llm_response.get('score', 0.0))
                                        reason = llm_response.get('reason', evaluation_result)
                                        evidence = llm_response.get('evidence', '')
                                        evidence_details = llm_response.get('evidence_details', [])
                                        logger.info(f"[TASK:{task_id}] 修复后解析到评分：{score}")
                                    except Exception as e2:
                                        # 解析失败，不保存分数
                                        score = None
                                        reason = "评分失败：解析LLM响应失败"
                                        logger.error(f"[TASK:{task_id}] 解析LLM响应失败: {e2}")
                                        logger.debug(traceback.format_exc())
                            else:
                                # 如果没有JSON，不保存分数
                                score = None
                                reason = "评分失败：无法解析LLM响应"
                                logger.warning(f"[TASK:{task_id}] 无法解析LLM响应，不保存评分")
                        except Exception as e:
                            # 解析失败，不保存分数
                            score = None
                            reason = "评分失败：解析LLM响应失败"
                            logger.error(f"[TASK:{task_id}] 解析LLM响应失败: {e}")
                            logger.debug(traceback.format_exc())
                        
                        # 保存评估结果
                        try:
                            import json
                            result = EvaluationResult(
                                company_bid_id=company.id,
                                rule_id=rule.id,
                                rule_name=rule.rule_name,
                                score=score,
                                max_score=100.0,
                                reason=reason,
                                evidence=evidence if 'evidence' in locals() else "",
                                evidence_details=json.dumps(evidence_details) if 'evidence_details' in locals() else "[]"
                            )
                            db.add(result)
                            
                            # 更新已处理规则数
                            company.processed_rules = rule_index + 1
                            task.processed_rules = (company_index * len(rules)) + (rule_index + 1)
                            db.commit()
                            
                            logger.info(f"[TASK:{task_id}] [{company_index + 1}/{len(companies)}] 规则 {rule.rule_name} 评审完成")
                        except Exception as e:
                            logger.error(f"[TASK:{task_id}] 保存评估结果失败: {e}")
                            logger.debug(traceback.format_exc())
                            db.rollback()
                            # 继续评审下一个规则
                            continue
                        
                    except Exception as e:
                        logger.error(f"[TASK:{task_id}] 评审规则 {rule.rule_name} 失败: {e}")
                        logger.debug(traceback.format_exc())
                        # 继续评审下一个规则
                        continue
                
                # 计算公司总评分
                try:
                    company_results = db.query(EvaluationResult).filter(
                        EvaluationResult.company_bid_id == company.id
                    ).all()
                    total_score = sum(r.score for r in company_results) if company_results else 0.0
                    avg_score = total_score / len(company_results) if company_results else 0.0
                    
                    company.status = "completed"
                    company.total_score = avg_score
                    db.commit()
                    
                    logger.info(f"[TASK:{task_id}] [{company_index + 1}/{len(companies)}] 公司 {company.company_name} 评估完成，得分：{avg_score:.1f}")
                except Exception as e:
                    logger.error(f"[TASK:{task_id}] 计算公司总评分失败: {e}")
                    logger.debug(traceback.format_exc())
                    company.status = "failed"
                    db.commit()
                
            except Exception as e:
                logger.error(f"[TASK:{task_id}] 评估公司 {company.company_name} 失败: {e}")
                logger.debug(traceback.format_exc())
                if company:
                    company.status = "failed"
                    db.commit()
        
        # 计算所有公司的平均评分
        try:
            completed_companies = db.query(CompanyBid).filter(
                CompanyBid.task_id == task_id,
                CompanyBid.status == "completed"
            ).all()
            
            logger.info(f"[TASK:{task_id}] 已完成评估的公司数：{len(completed_companies)}")
            
            if completed_companies:
                total_score = sum(c.total_score for c in completed_companies)
                avg_score = total_score / len(completed_companies)
                task.total_score_avg = avg_score
                logger.info(f"[TASK:{task_id}] 任务平均评分：{avg_score:.1f}")
            else:
                task.total_score_avg = 0.0
                logger.warning(f"[TASK:{task_id}] 没有公司完成评估，平均评分为0")
            
            # 更新任务状态
            task.status = "completed"
            task.completed_at = datetime.now()
            db.commit()
            
            logger.info(f"[TASK:{task_id}] 评审完成，共处理 {len(companies)} 家公司，{len(rules)} 个规则")
        except Exception as e:
            logger.error(f"[TASK:{task_id}] 计算任务平均评分失败: {e}")
            logger.debug(traceback.format_exc())
            task.status = "failed"
            db.commit()
        
    except Exception as e:
        logger.error(f"[TASK:{task_id}] AI 评审失败：{e}")
        logger.debug(traceback.format_exc())
        if task:
            try:
                task.status = "failed"
                db.commit()
            except Exception as commit_error:
                logger.error(f"[TASK:{task_id}] 更新任务状态失败: {commit_error}")
    finally:
        try:
            db.close()
            logger.info(f"[TASK:{task_id}] 数据库连接已关闭")
        except Exception as close_error:
            logger.error(f"[TASK:{task_id}] 关闭数据库连接失败: {close_error}")
        logger.info(f"[TASK:{task_id}] === AI 评审任务结束 ===")


@router.get("/{task_id}/status")
async def get_task_status(task_id: int):
    """获取任务状态"""
    db = db_session()
    try:
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        
        companies = db.query(CompanyBid).filter(CompanyBid.task_id == task_id).all()
        
        return {
            "id": task.id,
            "task_name": task.task_name,
            "status": task.status,
            "progress": len(companies),
            "total_companies": len(companies)
        }
    finally:
        db.close()


@router.get("/{task_id}/progress")
async def get_task_progress(task_id: int):
    """获取任务详细进度
    
    返回任务执行的详细信息，包括：
    - 任务状态
    - 已处理/总公司数
    - 每个公司的处理状态
    - 已评审/总规则数
    - 当前正在处理的公司
    - 平均分等统计信息
    """
    db = db_session()
    try:
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        
        # 获取所有公司
        companies = db.query(CompanyBid).filter(CompanyBid.task_id == task_id).all()
        
        # 获取所有规则
        task_rules = db.query(TaskRule).filter(TaskRule.task_id == task_id, TaskRule.is_active == True).all()
        total_rules = len(task_rules)
        
        # 获取已完成的评审结果
        company_ids = [c.id for c in companies]
        completed_results = db.query(EvaluationResult).filter(
            EvaluationResult.company_bid_id.in_(company_ids)
        ).all()
        
        # 统计每个公司的评审进度
        company_progress = []
        completed_companies = 0
        processing_companies = 0
        pending_companies = 0
        
        for company in companies:
            # 计算该公司已完成的评审项数
            company_results = [r for r in completed_results if r.company_bid_id == company.id]
            completed_items = len(company_results)
            
            company_status = company.status or 'pending'
            if company_status == 'completed':
                completed_companies += 1
            elif company_status == 'processing':
                processing_companies += 1
            else:
                pending_companies += 1
            
            company_progress.append({
                "id": company.id,
                "company_name": company.company_name,
                "status": company_status,
                "completed_items": completed_items,
                "total_items": total_rules,
                "progress_percent": (completed_items / total_rules * 100) if total_rules > 0 else 0,
                "score": company.total_score
            })
        
        # 计算总体进度
        total_items = len(companies) * total_rules if total_rules > 0 else 0
        completed_items = len(completed_results)
        overall_progress = (completed_items / total_items * 100) if total_items > 0 else 0
        
        return {
            "task_id": task.id,
            "task_name": task.task_name,
            "status": task.status,
            "overall_progress": round(overall_progress, 1),
            "total_companies": len(companies),
            "completed_companies": completed_companies,
            "processing_companies": processing_companies,
            "pending_companies": pending_companies,
            "total_rules": total_rules,
            "completed_items": completed_items,
            "total_items": total_items,
            "avg_score": task.total_score_avg,
            "company_progress": company_progress,
            "created_at": task.created_at.isoformat() if task.created_at else None,
            "completed_at": task.completed_at.isoformat() if task.completed_at else None
        }
    finally:
        db.close()


@router.get("")
async def get_tasks():
    """获取任务列表"""
    db = db_session()
    try:
        tasks = db.query(EvaluationTask).all()
        return [
            {
                "id": task.id,
                "task_name": task.task_name,
                "status": task.status,
                "total_companies": task.total_companies,
                "total_score_avg": task.total_score_avg,
                "created_at": task.created_at,
                "rule_count": db.query(TaskRule).filter(TaskRule.task_id == task.id).count()
            }
            for task in tasks
        ]
    finally:
        db.close()


@router.get("/{task_id}")
async def get_task(task_id: int):
    """获取任务详情"""
    db = db_session()
    try:
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")

        # 查询关联的规则数量
        rule_count = db.query(TaskRule).filter(TaskRule.task_id == task_id).count()

        companies = db.query(CompanyBid).filter(CompanyBid.task_id == task_id).all()

        # 获取公司的评估结果数量
        company_data = []
        for company in companies:
            result_count = db.query(EvaluationResult).filter(EvaluationResult.company_bid_id == company.id).count()
            # 计算文件数（只统计实际文件，不统计文件夹）
            file_count = 0
            if company.bid_folder_path:
                import os
                from pathlib import Path
                try:
                    folder = Path(company.bid_folder_path)
                    if folder.exists():
                        # 只统计文件，不统计文件夹
                        file_count = len([f for f in folder.rglob('*') if f.is_file()])
                except:
                    pass
            
            company_data.append({
                "id": company.id,
                "company_name": company.company_name,
                "status": company.status,
                "total_score": company.total_score,
                "file_count": file_count,
                "processed_rules": result_count,
                "bid_folder_path": company.bid_folder_path,
                "ocr_status": company.ocr_status  # 添加 OCR 状态
            })

        return {
            "id": task.id,
            "task_name": task.task_name,
            "status": task.status,
            "total_companies": task.total_companies,
            "total_score_avg": task.total_score_avg,
            "created_at": task.created_at,
            "zip_file_path": task.zip_file_path,
            "rule_ids": [r[0] for r in db.query(TaskRule.rule_id).filter(TaskRule.task_id == task_id).all()],
            "companies": company_data,
            "ocr_status": task.ocr_status  # 添加任务级别的 OCR 状态
        }
    finally:
        db.close()


@router.get("/{task_id}/files")
async def get_task_files(task_id: int):
    """获取任务的文件树"""
    db = db_session()
    try:
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        
        from services.file_processor import FileProcessor
        
        # 使用基于src目录的绝对路径
        src_dir = Path(__file__).parent.parent
        file_processor = FileProcessor(str(src_dir / "data"))
        
        # 构建文件树
        task_dir = src_dir / "data" / "tasks" / str(task_id) / "bids"
        if not task_dir.exists():
            return {"files": []}
        
        # 递归构建文件树
        def build_file_tree(root: Path, base: Path):
            files = []
            try:
                for item in root.iterdir():
                    relative_path = str(item.relative_to(base))
                    if item.is_dir():
                        files.append({
                            "key": relative_path,
                            "title": item.name,
                            "type": "folder",
                            "children": build_file_tree(item, base)
                        })
                    else:
                        suffix = item.suffix.lower()
                        file_type = "other"
                        if suffix == ".pdf":
                            file_type = "pdf"
                        elif suffix in [".doc", ".docx"]:
                            file_type = suffix[1:]
                        elif suffix == ".txt":
                            file_type = "txt"
                        elif suffix in [".xls", ".xlsx"]:
                            file_type = suffix[1:]
                        elif suffix in [".jpg", ".jpeg", ".png", ".gif"]:
                            file_type = "image"
                        
                        files.append({
                            "key": relative_path,
                            "title": item.name,
                            "type": file_type,
                            "size": item.stat().st_size if item.exists() else 0,
                            "path": str(item)
                        })
            except Exception as e:
                logger.error(f"构建文件树失败：{e}")
            return files
        
        file_tree = build_file_tree(task_dir, task_dir)
        return {"files": file_tree}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取任务文件失败：{e}")
        raise HTTPException(status_code=500, detail="获取任务文件失败")
    finally:
        db.close()


@router.delete("/{task_id}")
async def delete_task(task_id: int):
    """删除任务"""
    import os
    import shutil
    from pathlib import Path
    
    db = db_session()
    try:
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")

        companies = db.query(CompanyBid).filter(CompanyBid.task_id == task_id).all()
        company_ids = [c.id for c in companies]
        
        # 保存所有公司的文件夹路径，以便后续删除
        company_folders = [c.bid_folder_path for c in companies if c.bid_folder_path]
        
        logger.info(f"删除任务 {task_id}: 找到 {len(companies)} 家公司")

        # 获取项目根目录的绝对路径
        project_root = Path(__file__).parent.parent.parent  # 向上三级到bid目录
        logger.info(f"项目根目录：{project_root}")

        # 删除评估结果
        if company_ids:
            db.query(EvaluationResult).filter(EvaluationResult.company_bid_id.in_(company_ids)).delete(synchronize_session=False)

        # 删除公司记录
        db.query(CompanyBid).filter(CompanyBid.task_id == task_id).delete(synchronize_session=False)
        
        # 删除任务规则关联
        db.query(TaskRule).filter(TaskRule.task_id == task_id).delete(synchronize_session=False)
        
        db.delete(task)
        db.commit()

        # 删除文件系统上的文件
        # 1. 删除 ZIP 文件
        if task.zip_file_path:
            # 确保使用绝对路径
            zip_path = Path(task.zip_file_path)
            if not zip_path.is_absolute():
                zip_path = project_root / zip_path
            
            if zip_path.exists():
                try:
                    os.remove(zip_path)
                    logger.info(f"已删除 ZIP 文件：{zip_path}")
                except Exception as e:
                    logger.error(f"删除 ZIP 文件失败 {zip_path}: {e}")
            else:
                logger.warning(f"ZIP 文件不存在：{zip_path}")
        
        # 2. 删除所有公司文件夹
        deleted_count = 0
        failed_count = 0
        for folder_path in company_folders:
            logger.info(f"准备删除公司文件夹：{folder_path}")
            if folder_path:
                # 确保使用绝对路径
                abs_folder_path = Path(folder_path)
                if not abs_folder_path.is_absolute():
                    abs_folder_path = project_root / abs_folder_path
                
                if abs_folder_path.exists():
                    try:
                        shutil.rmtree(abs_folder_path, ignore_errors=False)
                        logger.info(f"✓ 已删除公司文件夹：{abs_folder_path}")
                        deleted_count += 1
                    except Exception as e:
                        logger.error(f"✗ 删除公司文件夹失败 {abs_folder_path}: {e}")
                        failed_count += 1
                else:
                    logger.warning(f"公司文件夹不存在：{abs_folder_path}")
        
        # 3. 删除任务目录（如果有）
        # 实际文件存储在src/data目录下
        src_dir = Path(__file__).parent.parent  # 向上两级到src目录
        task_dir = src_dir / "data" / "tasks" / str(task_id)
        if task_dir.exists():
            try:
                shutil.rmtree(task_dir, ignore_errors=False)
                logger.info(f"✓ 已删除任务目录：{task_dir}")
            except Exception as e:
                logger.error(f"✗ 删除任务目录失败 {task_dir}: {e}")
        
        # 4. 检查并删除上传的ZIP文件
        upload_dir = src_dir / "data" / "uploads"
        zip_files = list(upload_dir.glob(f"{task_id}_*.zip"))
        for zip_file in zip_files:
            try:
                os.remove(zip_file)
                logger.info(f"已删除上传的ZIP文件：{zip_file}")
            except Exception as e:
                logger.error(f"删除上传的ZIP文件失败 {zip_file}: {e}")
        
        logger.info(f"任务 {task_id} 删除完成：删除{deleted_count}个公司文件夹，失败{failed_count}个")

        return {"message": f"任务删除成功，已清理 {deleted_count} 个公司文件夹"}
    except Exception as e:
        db.rollback()
        logger.error(f"删除任务失败：{e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"删除任务失败：{str(e)}")
    finally:
        db.close()


@router.delete("/{task_id}/zip")
async def delete_task_zip(task_id: int):
    """删除任务的 zip 标书文件，同时删除所有公司数据"""
    import os
    import shutil
    from pathlib import Path
    
    db = db_session()
    try:
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")

        # 获取src目录的绝对路径
        src_dir = Path(__file__).parent.parent  # 向上两级到src目录
        logger.info(f"src目录：{src_dir}")

        # 删除 ZIP 文件
        if task.zip_file_path:
            # 确保使用绝对路径
            zip_path = Path(task.zip_file_path)
            if not zip_path.is_absolute():
                zip_path = src_dir / zip_path
            
            if zip_path.exists():
                try:
                    os.remove(zip_path)
                    logger.info(f"已删除 ZIP 文件：{zip_path}")
                except Exception as e:
                    logger.error(f"删除 ZIP 文件失败 {zip_path}: {e}")

        # 删除所有公司记录和文件夹
        companies = db.query(CompanyBid).filter(CompanyBid.task_id == task_id).all()
        deleted_count = 0
        
        for company in companies:
            # 删除公司文件夹
            if company.bid_folder_path:
                # 确保使用绝对路径
                folder_path = Path(company.bid_folder_path)
                if not folder_path.is_absolute():
                    folder_path = src_dir / folder_path
                
                if folder_path.exists():
                    try:
                        shutil.rmtree(folder_path, ignore_errors=False)
                        logger.info(f"已删除公司文件夹：{folder_path}")
                        deleted_count += 1
                    except Exception as e:
                        logger.error(f"删除公司文件夹失败 {folder_path}: {e}")

        # 删除公司数据库记录
        db.query(CompanyBid).filter(CompanyBid.task_id == task_id).delete()
        
        # 删除评估结果
        company_ids = [c.id for c in companies]
        if company_ids:
            db.query(EvaluationResult).filter(EvaluationResult.company_bid_id.in_(company_ids)).delete(synchronize_session=False)
        
        # 重置任务状态
        task.zip_file_path = None
        task.total_companies = 0
        task.ocr_status = 'idle'
        db.commit()
        
        # 删除任务目录（如果有）
        task_dir = src_dir / "data" / "tasks" / str(task_id)
        if task_dir.exists():
            try:
                shutil.rmtree(task_dir, ignore_errors=False)
                logger.info(f"✓ 已删除任务目录：{task_dir}")
            except Exception as e:
                logger.error(f"✗ 删除任务目录失败 {task_dir}: {e}")
        
        # 检查并删除上传的ZIP文件
        upload_dir = src_dir / "data" / "uploads"
        zip_files = list(upload_dir.glob(f"{task_id}_*.zip"))
        for zip_file in zip_files:
            try:
                os.remove(zip_file)
                logger.info(f"已删除上传的ZIP文件：{zip_file}")
            except Exception as e:
                logger.error(f"删除上传的ZIP文件失败 {zip_file}: {e}")
        
        logger.info(f"已删除 {deleted_count} 个公司文件夹和所有相关数据，包括任务目录")
        return {"message": f"原文件已删除，已清理 {deleted_count} 个公司文件夹和任务目录"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"删除 zip 标书文件失败：{e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"删除失败：{str(e)}")
    finally:
        db.close()


@router.post("/{task_id}/evaluate")
async def evaluate_task(task_id: int):
    """评估任务"""
    db = db_session()
    try:
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")

        rule_data = file_processor.parse_rule_md("./data/rules/规则文件.md")
        companies = db.query(CompanyBid).filter(CompanyBid.task_id == task_id).all()

        results = []
        for company in companies:
            try:
                folder_path = company.bid_folder_path
                files = file_processor._collect_files(Path(folder_path) if folder_path else Path('.'))
                evaluation_result = evaluation_service.evaluate_company(
                    company.company_name,
                    files,
                    rule_data["content"]
                )

                result = EvaluationResult(
                    company_bid_id=company.id,
                    rule_id=1,
                    rule_name="规则 1",
                    score=85.5,
                    max_score=100.0,
                    reason=evaluation_result,
                    evidence="",
                    evidence_details=""
                )
                db.add(result)
                results.append({
                    "company_name": company.company_name,
                    "result": evaluation_result
                })
            except Exception as e:
                logger.error(f"评估公司失败 {company.company_name}: {e}")
                results.append({
                    "company_name": company.company_name,
                    "result": f"评估失败：{str(e)}"
                })

        db.commit()
        return {"results": results}
    finally:
        db.close()


@router.get("/{task_id}/results")
async def get_task_results(task_id: int):
    """获取任务评估结果"""
    db = db_session()
    try:
        companies = db.query(CompanyBid).filter(CompanyBid.task_id == task_id).all()
        company_ids = [c.id for c in companies]
        
        results = db.query(EvaluationResult).filter(EvaluationResult.company_bid_id.in_(company_ids)).all()
        
        return [
            {
                "company_name": db.query(CompanyBid).filter(CompanyBid.id == r.company_bid_id).first().company_name,
                "result": r.reason,
                "created_at": r.created_at
            }
            for r in results
        ]
    finally:
        db.close()


@router.put("/{task_id}/rules")
async def update_task_rules(task_id: int, rule_ids: List[int] = Body(...)):
    """更新任务关联的规则模板"""
    db = db_session()
    try:
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        
        # 清空原有规则
        db.query(TaskRule).filter(TaskRule.task_id == task_id).delete()
        
        # 添加新规则
        if rule_ids:
            rules = db.query(EvaluationRule).filter(EvaluationRule.id.in_(rule_ids)).all()
            for rule in rules:
                task_rule = TaskRule(task_id=task_id, rule_id=rule.id, is_active=True)
                db.add(task_rule)
        
        db.commit()
        
        return {
            "message": "规则更新成功",
            "rule_ids": rule_ids
        }
    except Exception as e:
        db.rollback()
        logger.error(f"更新规则失败：{e}")
        raise HTTPException(status_code=500, detail="更新规则失败")
    finally:
        db.close()


@router.post("/{task_id}/ocr-documents")
async def trigger_ocr_documents(task_id: int):
    """手动触发文档 OCR 处理"""
    db = db_session()
    try:
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        
        # 检查是否已经在处理中
        if task.ocr_status == 'processing':
            raise HTTPException(status_code=400, detail="文档解析正在进行中，请先停止当前任务")
        
        # 设置任务状态为处理中
        task.ocr_status = 'processing'
        db.commit()
        
        # 异步执行 OCR 处理
        stop_event = threading.Event()
        ocr_threads[task_id] = stop_event
        
        thread = threading.Thread(target=process_documents_ocr, args=(task_id, stop_event), daemon=True)
        thread.start()
        
        return {
            "message": "OCR 处理已启动，将在后台执行",
            "task_id": task_id
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"启动 OCR 处理失败：{e}")
        raise HTTPException(status_code=500, detail="启动 OCR 处理失败")
    finally:
        db.close()


@router.post("/{task_id}/ocr-files")
async def ocr_selected_files(task_id: int, files: List[str] = Body(...)):
    """手动批量选择文件进行 OCR 解析"""
    db = db_session()
    try:
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        
        # 检查是否已经在处理中
        if task.ocr_status == 'processing':
            raise HTTPException(status_code=400, detail="文档解析正在进行中，请先停止当前任务")
        
        # 验证文件路径
        valid_files = []
        for file_path in files:
            if os.path.exists(file_path) and os.path.isfile(file_path):
                valid_files.append(file_path)
            else:
                logger.warning(f"文件不存在或不是文件：{file_path}")
        
        if not valid_files:
            raise HTTPException(status_code=400, detail="没有有效的文件路径")
        
        # 设置任务状态为处理中
        task.ocr_status = 'processing'
        db.commit()
        
        # 异步执行 OCR 处理
        stop_event = threading.Event()
        ocr_threads[task_id] = stop_event
        
        thread = threading.Thread(target=process_selected_files_ocr, args=(task_id, valid_files, stop_event), daemon=True)
        thread.start()
        
        return {
            "message": f"OCR 处理已启动，将处理 {len(valid_files)} 个文件",
            "task_id": task_id,
            "file_count": len(valid_files)
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"启动文件 OCR 处理失败：{e}")
        raise HTTPException(status_code=500, detail="启动文件 OCR 处理失败")
    finally:
        db.close()


@router.post("/{task_id}/stop-ocr")
async def stop_ocr_documents(task_id: int):
    """停止文档 OCR 处理"""
    db = db_session()
    try:
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        
        # 检查是否在处理中
        if task.ocr_status != 'processing':
            raise HTTPException(status_code=400, detail="当前没有正在进行的 OCR 任务")
        
        # 设置停止事件
        if task_id in ocr_threads:
            ocr_threads[task_id].set()
            del ocr_threads[task_id]
            logger.info(f"已发送停止信号：task_id={task_id}")
        
        return {
            "message": "已发送停止信号，OCR 处理将尽快停止",
            "task_id": task_id
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"停止 OCR 处理失败：{e}")
        raise HTTPException(status_code=500, detail="停止 OCR 处理失败")
    finally:
        db.close()


@router.post("/{task_id}/stop")
async def stop_task(task_id: int):
    """停止评审任务"""
    db = db_session()
    try:
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        
        # 检查是否在处理中
        if task.status != 'processing':
            raise HTTPException(status_code=400, detail="当前没有正在进行的评审任务")
        
        # 设置任务状态为失败
        task.status = "failed"
        db.commit()
        
        # 同时更新所有公司状态为失败
        companies = db.query(CompanyBid).filter(CompanyBid.task_id == task_id).all()
        for company in companies:
            if company.status == 'processing':
                company.status = 'failed'
        db.commit()
        
        logger.info(f"任务 {task_id} 已停止")
        
        return {
            "message": "评审任务已停止",
            "task_id": task_id
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"停止评审任务失败：{e}")
        raise HTTPException(status_code=500, detail="停止评审任务失败")
    finally:
        db.close()


# 全局变量：存储 OCR 任务线程
ocr_threads = {}

def process_documents_ocr(task_id: int, stop_event: threading.Event = None):
    """处理任务中所有文档的 OCR"""
    from models.company_bids import CompanyBid
    from models.database import db_session
    from services.ocr_service import OCRService
    
    logger.info(f"=== 开始 OCR 处理任务：task_id={task_id} ===")
    
    db = db_session()
    try:
        # 更新任务状态为处理中
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if task:
            task.ocr_status = 'processing'
            db.commit()
            logger.info(f"任务 {task_id} OCR 状态：processing")
        
        companies = db.query(CompanyBid).filter(CompanyBid.task_id == task_id).all()
        logger.info(f"找到 {len(companies)} 家公司需要处理")
        
        if not companies:
            logger.warning(f"任务 {task_id} 没有公司数据")
            if task:
                task.ocr_status = 'idle'
                db.commit()
            return
            
        ocr_service = OCRService()
        
        for company in companies:
            # 检查停止事件
            if stop_event and stop_event.is_set():
                logger.info(f"OCR 处理被用户停止：task_id={task_id}")
                company.ocr_status = 'pending'  # 重置为待处理
                db.commit()
                continue
            
            try:
                company.ocr_status = 'processing'
                db.commit()
                logger.info(f"开始处理公司：{company.company_name} (id={company.id})")
                
                folder_path = company.bid_folder_path
                if not folder_path or not os.path.exists(folder_path):
                    logger.error(f"公司文件夹不存在：{folder_path}")
                    company.ocr_status = 'failed'
                    db.commit()
                    continue
                
                files = file_processor._collect_files(Path(folder_path))
                logger.info(f"找到 {len(files)} 个文件")
                
                doc_count = 0
                for file_info in files:
                    # 检查停止事件
                    if stop_event and stop_event.is_set():
                        logger.info(f"OCR 处理被用户停止：task_id={task_id}")
                        break
                    
                    file_path = file_info["file_path"]
                    suffix = Path(file_path).suffix.lower()
                    
                    if suffix not in ['.doc', '.docx', '.pdf']:
                        continue
                    
                    try:
                        logger.info(f"正在 OCR: {file_path}")
                        ocr_service.process_document_to_md(file_path, folder_path)
                        doc_count += 1
                        logger.info(f"✓ OCR 处理完成：{file_path}")
                    except Exception as e:
                        logger.error(f"✗ OCR 处理失败 {file_path}: {e}")
                
                if stop_event and stop_event.is_set():
                    break
                
                if doc_count > 0:
                    company.ocr_status = 'completed'
                    logger.info(f"✓ 公司 {company.company_name} OCR 完成，处理了 {doc_count} 个文档")
                else:
                    company.ocr_status = 'failed'
                    logger.warning(f"⚠ 公司 {company.company_name} 没有可处理的文档")
                db.commit()
                
            except Exception as e:
                logger.error(f"处理公司文档失败 {company.company_name}: {e}", exc_info=True)
                company.ocr_status = 'failed'
                db.commit()
        
        # 完成所有处理
        if not (stop_event and stop_event.is_set()):
            logger.info(f"=== 任务 {task_id} OCR 处理完成 ===")
            if task:
                task.ocr_status = 'idle'
                db.commit()
        else:
            logger.info(f"=== 任务 {task_id} OCR 处理被停止 ===")
            if task:
                task.ocr_status = 'idle'
                db.commit()
        
    except Exception as e:
        logger.error(f"OCR 处理任务失败：{e}", exc_info=True)
        if task:
            task.ocr_status = 'idle'
            db.commit()
    finally:
        db.close()


def process_selected_files_ocr(task_id: int, files: List[str], stop_event: threading.Event = None):
    """处理手动选择的文件 OCR"""
    from models.database import db_session
    from services.ocr_service import OCRService
    
    logger.info(f"=== 开始处理手动选择的文件 OCR：task_id={task_id}, 文件数={len(files)} ===")
    
    db = db_session()
    try:
        # 更新任务状态为处理中
        task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
        if task:
            task.ocr_status = 'processing'
            db.commit()
            logger.info(f"任务 {task_id} OCR 状态：processing")
        
        ocr_service = OCRService()
        processed_count = 0
        failed_count = 0
        
        for file_path in files:
            # 检查停止事件
            if stop_event and stop_event.is_set():
                logger.info(f"OCR 处理被用户停止：task_id={task_id}")
                break
            
            try:
                logger.info(f"正在 OCR: {file_path}")
                # 输出目录为文件所在目录
                output_dir = os.path.dirname(file_path)
                ocr_service.process_document_to_md(file_path, output_dir)
                processed_count += 1
                logger.info(f"✓ OCR 处理完成：{file_path}")
            except Exception as e:
                logger.error(f"✗ OCR 处理失败 {file_path}: {e}")
                failed_count += 1
        
        # 完成所有处理
        if not (stop_event and stop_event.is_set()):
            logger.info(f"=== 手动选择文件 OCR 处理完成 ===")
            logger.info(f"处理结果：成功 {processed_count}，失败 {failed_count}")
            if task:
                task.ocr_status = 'idle'
                db.commit()
        else:
            logger.info(f"=== 手动选择文件 OCR 处理被停止 ===")
            if task:
                task.ocr_status = 'idle'
                db.commit()
        
    except Exception as e:
        logger.error(f"手动选择文件 OCR 处理失败：{e}", exc_info=True)
        if task:
            task.ocr_status = 'idle'
            db.commit()
    finally:
        db.close()
