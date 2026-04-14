from fastapi import APIRouter, HTTPException
from typing import List, Dict
from pathlib import Path
import os
from loguru import logger

from models.evaluation_tasks import EvaluationTask
from models.company_bids import CompanyBid
from models.evaluation_results import EvaluationResult
from models.evaluation_rules import EvaluationRule, TaskRule
from models.database import db_session

router = APIRouter()


@router.get("/{company_id}")
async def get_company_detail(company_id: int):
    """获取公司详情"""
    db = db_session()
    try:
        company = db.query(CompanyBid).filter(CompanyBid.id == company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail="公司不存在")

        # 获取公司的评估结果
        result = db.query(EvaluationResult).filter(EvaluationResult.company_bid_id == company_id).first()

        return {
            "id": company.id,
            "company_name": company.company_name,
            "task_id": company.task_id,
            "bid_folder_path": company.bid_folder_path,
            "status": company.status,
            "total_score": company.total_score,
            "created_at": company.created_at,
            "evaluation_result": result.reason if result else None
        }
    finally:
        db.close()


@router.get("/{company_id}/evaluation")
async def get_company_results(company_id: int):
    """获取公司评估结果"""
    db = db_session()
    try:
        company = db.query(CompanyBid).filter(CompanyBid.id == company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail="公司不存在")

        logger.info(f"获取公司 {company_id} 的结果，task_id={company.task_id}")
        
        # 获取任务关联的所有规则
        task_rules = db.query(TaskRule).filter(TaskRule.task_id == company.task_id, TaskRule.is_active == True).all()
        logger.info(f"task_rules 数量：{len(task_rules)}")
        rule_ids = [tr.rule_id for tr in task_rules]
        logger.info(f"rule_ids: {rule_ids}")
        
        # 获取规则详情
        rules = db.query(EvaluationRule).filter(EvaluationRule.id.in_(rule_ids)).all() if rule_ids else []
        logger.info(f"规则数量：{len(rules)}")
        
        # 获取已完成的评估结果
        results = db.query(EvaluationResult).filter(EvaluationResult.company_bid_id == company_id).all()
        logger.info(f"评估结果数量：{len(results)}")
        
        # 构建结果映射
        result_map = {r.rule_id: r for r in results}
        
        # 为每个规则构建评分项（包括未完成的）
        import json
        rule_scores = []
        for rule in rules:
            if rule.id in result_map:
                result = result_map[rule.id]
                # 解析 evidence_details JSON 字符串
                evidence_details = []
                if result.evidence_details:
                    try:
                        evidence_details = json.loads(result.evidence_details)
                    except:
                        evidence_details = []
                
                rule_scores.append({
                    "rule_id": rule.id,
                    "rule_name": rule.rule_name,
                    "item_name": rule.rule_name,
                    "score": result.score,
                    "max_score": result.max_score,
                    "reason": result.reason,
                    "evidence": result.evidence,
                    "evidence_details": evidence_details,
                    "status": "completed"
                })
            else:
                # 未完成的评审项
                rule_scores.append({
                    "rule_id": rule.id,
                    "rule_name": rule.rule_name,
                    "item_name": rule.rule_name,
                    "score": 0,
                    "max_score": 100,  # 默认满分
                    "reason": "",
                    "evidence": "",
                    "evidence_details": [],
                    "status": "pending"
                })

        # 计算总分
        completed_scores = [r["score"] for r in rule_scores if r["status"] == "completed" and r["score"] is not None]
        total_score = sum(completed_scores) if completed_scores else None

        logger.info(f"返回 {len(rule_scores)} 个评审项")
        
        return {
            "id": company.id,
            "company_name": company.company_name,
            "task_id": company.task_id,
            "bid_folder_path": company.bid_folder_path,
            "status": company.status,
            "total_score": total_score,
            "rule_scores": rule_scores
        }
    except Exception as e:
        logger.error(f"获取公司结果失败：{e}", exc_info=True)
        raise
    finally:
        db.close()


@router.get("/{company_id}/files")
async def get_company_files(company_id: int):
    """获取公司文件树"""
    db = db_session()
    try:
        company = db.query(CompanyBid).filter(CompanyBid.id == company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail="公司不存在")

        # 获取公司文件夹路径
        folder_path = company.bid_folder_path
        if not folder_path:
            return {"files": []}

        # 构建文件树
        from pathlib import Path
        import os
        
        def build_file_tree(folder: Path, parent_key: str = "") -> list:
            files = []
            try:
                # 打印当前处理的文件夹
                logger.info(f"构建文件树：处理文件夹 {folder}")
                
                # 获取目录内容
                items = list(folder.iterdir())
                logger.info(f"文件夹 {folder} 包含 {len(items)} 个项目")
                
                for item in sorted(items):
                    logger.info(f"处理项目：{item.name}, 类型：{'文件夹' if item.is_dir() else '文件'}")
                    
                    if item.is_dir():
                        dir_name = item.name
                        dir_key = f"{parent_key}/{dir_name}" if parent_key else dir_name
                        dir_files = build_file_tree(item, dir_key)
                        # 计算文件夹大小
                        total_size = sum(
                            f.stat().st_size for f in item.rglob('*') if f.is_file()
                        ) if dir_files else 0
                        files.append({
                            "key": dir_key,
                            "title": dir_name,
                            "type": "folder",
                            "size": total_size,
                            "children": dir_files,
                            "path": str(item)
                        })
                    else:
                        file_name = item.name
                        file_key = f"{parent_key}/{file_name}" if parent_key else file_name
                        try:
                            file_size = item.stat().st_size
                        except:
                            file_size = 0
                        # 根据扩展名判断文件类型
                        ext = item.suffix.lower()
                        if ext in ['.pdf']:
                            file_type = 'pdf'
                        elif ext in ['.doc', '.docx']:
                            file_type = 'doc'
                        elif ext in ['.xls', '.xlsx']:
                            file_type = 'xls'
                        elif ext in ['.txt']:
                            file_type = 'txt'
                        elif ext in ['.jpg', '.jpeg', '.png', '.gif']:
                            file_type = 'image'
                        else:
                            file_type = 'other'
                        
                        files.append({
                            "key": file_key,
                            "title": file_name,
                            "type": file_type,
                            "size": file_size,
                            "path": str(item)
                        })
                
                logger.info(f"文件夹 {folder} 处理完成，生成 {len(files)} 个文件/文件夹项")
            except Exception as e:
                logger.error(f"读取文件夹失败 {folder}: {e}", exc_info=True)
            return files

        # 处理文件夹路径，转换为绝对路径
        logger.info(f"原始文件夹路径: {folder_path}")
        
        # 检查是否是绝对路径
        if not Path(folder_path).is_absolute():
            # 如果是相对路径，基于src目录构建绝对路径
            src_dir = Path(__file__).parent.parent
            # 处理路径，确保正确拼接
            if folder_path.startswith('src/'):
                # 如果路径已经以src开头，去掉前缀后再拼接
                folder_path = str(src_dir.joinpath(folder_path.replace('src/', '')))
            else:
                # 否则直接拼接
                folder_path = str(src_dir.joinpath(folder_path))
            logger.info(f"转换为绝对路径: {folder_path}")
        
        # 规范化路径，处理空格和特殊字符
        folder = Path(folder_path).resolve()
        logger.info(f"公司文件夹路径: {folder}, exists={folder.exists()}")
        
        if not folder.exists():
            return {"files": []}
        
        file_tree = build_file_tree(folder)
        logger.info(f"构建文件树完成，文件数: {len(file_tree)}")
        return {"files": file_tree}
    finally:
        db.close()


@router.get("/files/content")
async def get_file_content(path: str = None):
    """获取文件内容（支持 txt, docx, pdf 等）"""
    from urllib.parse import unquote
    logger.info(f"收到文件内容请求：path={path}")
    
    try:
        if not path or path == "None" or path.strip() == "":
            logger.error("文件路径参数为空")
            return {
                "content": "❌ 文件路径为空，请提供 path 参数",
                "error": "missing_path_parameter"
            }
        
        # 解码 URL 编码的文件路径
        decoded_path = unquote(path)
        logger.info(f"解码后的文件路径：{decoded_path}")
        
        # 处理路径分隔符，确保跨平台兼容性
        decoded_path = decoded_path.replace('\\', '/')
        
        # 检查文件是否存在
        file_path = Path(decoded_path)
        logger.debug(f"检查文件：{file_path}, exists={file_path.exists()}")
        
        if not file_path.exists():
            logger.error(f"文件不存在：{decoded_path}")
            return {
                "content": f"❌ 文件不存在：{decoded_path}",
                "error": "file_not_found",
                "path": decoded_path
            }
        
        ext = file_path.suffix.lower()
        logger.info(f"文件扩展名：{ext}")
        
        if ext == '.txt':
            content = file_path.read_text(encoding='utf-8')
        elif ext in ['.doc', '.docx']:
            content = None
            # 先尝试 .docx 格式
            if ext == '.docx':
                try:
                    from docx import Document
                    doc = Document(file_path)
                    content = '\n'.join([para.text for para in doc.paragraphs if para.text.strip()])
                    if not content:
                        content = "[Word 文档中没有文本内容，可能包含图片或表格]"
                except Exception as e:
                    logger.error(f"读取 docx 文件失败：{e}")
                    content = f"[读取 docx 文件失败：{str(e)}]"
            
            # 如果是 .doc 格式，尝试多种方法
            if ext == '.doc' and not content:
                # 方法 1: 尝试直接作为 .docx 读取（有些 .doc 文件实际上是 .docx 格式但扩展名错误）
                try:
                    from docx import Document
                    doc = Document(file_path)
                    content = '\n'.join([para.text for para in doc.paragraphs if para.text.strip()])
                    if content:
                        logger.info(f"成功将 .doc 文件作为 .docx 读取")
                except Exception as e:
                    logger.debug(f"将 .doc 作为 .docx 读取失败：{e}")
                
                # 方法 2: 尝试使用 antiword 工具
                if not content:
                    try:
                        import subprocess
                        result = subprocess.run(
                            ['antiword', str(file_path)],
                            capture_output=True,
                            text=True,
                            timeout=30
                        )
                        if result.returncode == 0 and result.stdout.strip():
                            content = result.stdout.strip()
                            logger.info(f"使用 antiword 成功读取 .doc 文件")
                    except Exception as e:
                        logger.debug(f"使用 antiword 读取 .doc 文件失败：{e}")
                
                # 方法 3: 使用 olefile 尝试提取文本
                if not content:
                    try:
                        from olefile import OleFileIO
                        ole = OleFileIO(file_path)
                        
                        # 尝试读取 WordDocument 流
                        if 'WordDocument' in [ '/'.join(s) for s in ole.listdir()]:
                            stream = ole.openstream('WordDocument')
                            data = stream.read()
                            # 尝试查找 UTF-16 LE 编码的文本
                            import re
                            # 查找中文字符
                            chinese_pattern = re.compile(b'[\x4e-\x9f]{2,}')
                            matches = chinese_pattern.findall(data)
                            if matches:
                                text_parts = []
                                for m in matches:
                                    try:
                                        text = m.decode('utf-16-le', errors='ignore')
                                        if len(text) > 2:
                                            text_parts.append(text)
                                    except:
                                        pass
                                if text_parts:
                                    content = "📄 .doc 文件内容（部分提取）:\n\n" + " ".join(text_parts[:20])
                        
                        ole.close()
                    except Exception as e:
                        logger.debug(f"使用 olefile 读取 .doc 文件失败：{e}")
                
                # 如果所有方法都失败，提供友好的提示
                if not content:
                    content = (
                        "📄 .doc 文件（预览功能受限）\n\n"
                        "⚠️ 完整文本预览不可用\n\n"
                        "原因：.doc 是旧版 Word 二进制格式，需要特殊工具解析。\n\n"
                        "解决方案：\n"
                        "1. 用 Word/WPS 打开此文件\n"
                        "2. 另存为 .docx 格式\n"
                        "3. 重新上传 .docx 文件\n\n"
                        "或者下载文件后本地查看。"
                    )
        elif ext == '.pdf':
            # 使用 PyMuPDF 提取 PDF 文本
            try:
                import fitz
                doc = fitz.open(str(file_path))
                text_parts = []
                for page_num, page in enumerate(doc, start=1):
                    page_text = page.get_text()
                    if page_text.strip():
                        text_parts.append(f"第{page_num}页:\n{page_text}")
                doc.close()
                content = "\n---\n\n".join(text_parts) if text_parts else "[PDF 文件中没有可提取的文本]"
            except Exception as e:
                logger.error(f"读取 PDF 文件失败：{e}")
                content = f"[PDF 文件读取失败：{str(e)}]"
        elif ext in ['.md']:
            content = file_path.read_text(encoding='utf-8')
        elif ext in ['.jpg', '.jpeg', '.png', '.gif', '.bmp']:
            content = f"[图片文件 - 需要 OCR 识别：{file_path.name}]"
        else:
            content = f"[不支持的文件格式：{ext} - 文件路径：{path}]"
        
        return {"content": content, "path": str(file_path), "filename": file_path.name}
    except Exception as e:
        logger.error(f"读取文件失败 {path}: {e}", exc_info=True)
        return {"content": f"❌ 读取失败：{str(e)}", "error": str(e)}


@router.get("/files/download")
async def download_file(file_path: str = None, path: str = None, attachment: bool = True):
    """下载文件"""
    from fastapi.responses import FileResponse
    from urllib.parse import unquote
    try:
        # 检查路径参数
        actual_path = file_path or path
        if actual_path is None or actual_path == "None" or not actual_path.strip():
            logger.error("文件路径参数为空")
            raise HTTPException(status_code=404, detail="文件路径为空")
        
        # 解码 URL 编码的路径
        decoded_path = unquote(actual_path)
        logger.info(f"下载文件请求：{decoded_path[:100]}...")
        
        # 处理路径分隔符，确保跨平台兼容性
        decoded_path = decoded_path.replace('\\', '/')
        
        # 转换为绝对路径
        path = Path(decoded_path)
        if not path.is_absolute():
            # 假设路径相对于src目录
            src_dir = Path(__file__).parent.parent
            if decoded_path.startswith('src/'):
                # 如果路径已经以src开头，去掉前缀后再拼接
                path = src_dir / decoded_path.replace('src/', '')
            else:
                # 否则直接拼接
                path = src_dir / decoded_path
        
        # 规范化路径
        path = path.resolve()
        
        logger.info(f"完整文件路径：{path}")
        
        if not path.exists():
            logger.error(f"文件不存在：{path}")
            raise HTTPException(status_code=404, detail=f"文件不存在")
        
        if not path.is_file():
            logger.error(f"不是文件：{path}")
            raise HTTPException(status_code=404, detail=f"不是文件")
        
        # 根据文件扩展名设置正确的Content-Type
        media_type_map = {
            '.pdf': 'application/pdf',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.txt': 'text/plain',
            '.md': 'text/markdown',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
        
        ext = path.suffix.lower()
        media_type = media_type_map.get(ext, 'application/octet-stream')
        
        logger.info(f"返回文件：{path.name}, 媒体类型：{media_type}, 附件模式：{attachment}")
        
        # 根据attachment参数决定是否作为附件下载
        if attachment:
            return FileResponse(
                path=str(path),
                filename=path.name,
                media_type=media_type
            )
        else:
            # 不作为附件，让浏览器在页面中显示
            return FileResponse(
                path=str(path),
                media_type=media_type
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"下载文件失败：{e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"下载失败：{str(e)}")
