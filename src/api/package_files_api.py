from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Dict, Optional, Any
from loguru import logger
from datetime import datetime
import os
import json
import zipfile
import shutil
import threading
import traceback
import asyncio
from pathlib import Path

from models.project_structure import Package, Bidder, Section, Project
from models.bidder_files import BidderFile, PackageFileUpload
from models.database import db_session, SessionLocal
from models.evaluation_items import PackageItem, EvaluationItem
from models.evaluation_results import EvaluationResult
from models.dify_workflow import DifyWorkflowRun
from services.dify_service import dify_service
from config import config

try:
    from json_repair import repair_json
except ImportError:
    repair_json = None
    logger.warning("json_repair 未安装，将使用基础JSON解析")


def parse_dify_result(output: Any) -> Dict[str, Any]:
    """
    解析Dify返回的结果，支持多种格式并提供兜底逻辑
    
    Args:
        output: Dify返回的结果，可以是dict或str
        
    Returns:
        解析后的字典，包含score, reason, source_filename, source_page, source_quote
    """
    result = {
        "score": 0,
        "reason": "",
        "source_filename": "",
        "source_page": "",
        "source_quote": ""
    }
    
    if output is None:
        result["reason"] = "Dify返回结果为空"
        return result
    
    # 如果是字典，直接处理
    if isinstance(output, dict):
        return _parse_dict_result(output)
    
    # 如果是字符串，尝试解析为JSON
    if isinstance(output, str):
        cleaned = _clean_json_string(output)
        
        # 尝试直接解析
        try:
            parsed = json.loads(cleaned)
            if isinstance(parsed, dict):
                return _parse_dict_result(parsed)
            else:
                result["reason"] = f"解析结果不是字典类型: {type(parsed).__name__}"
                return result
        except json.JSONDecodeError as e:
            # 使用jsonrepair尝试修复
            if repair_json:
                try:
                    repaired = repair_json(cleaned)
                    parsed = json.loads(repaired)
                    if isinstance(parsed, dict):
                        logger.info(f"JSON修复成功: {cleaned[:50]}...")
                        return _parse_dict_result(parsed)
                except Exception as repair_e:
                    result["reason"] = f"JSON解析失败，修复也失败: {str(e)}, {str(repair_e)}"
            else:
                result["reason"] = f"JSON解析失败: {str(e)}"
            return result
    
    result["reason"] = f"不支持的返回类型: {type(output).__name__}"
    return result


def _clean_json_string(text: str) -> str:
    """
    移除首尾空白和可能的代码块标记，以及 <think> 思考标签
    
    Args:
        text: 原始字符串
        
    Returns:
        清理后的字符串
    """
    cleaned = text.strip()
    
    # 移除 <think> 思考标签及其内容
    if '<think>' in cleaned:
        import re
        cleaned = re.sub(r'<think>.*?</think>', '', cleaned, flags=re.DOTALL)
    
    # 移除代码块标记
    if cleaned.startswith('```json'):
        cleaned = cleaned[7:-3].strip()
    elif cleaned.startswith('```'):
        cleaned = cleaned[3:-3].strip()
    return cleaned


def _parse_dict_result(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    解析字典格式的结果
    
    Args:
        data: 字典数据
        
    Returns:
        解析后的字典
    """
    result = {
        "score": 0,
        "reason": "",
        "source_filename": "",
        "source_page": "",
        "source_quote": ""
    }
    
    # 解析得分
    score = data.get("score")
    if isinstance(score, (int, float)):
        result["score"] = score
    else:
        result["score"] = 0
    
    # 解析理由
    reason = data.get("reason", "")
    if isinstance(reason, str):
        result["reason"] = reason
    else:
        result["reason"] = str(reason) if reason else ""
    
    # 解析source
    source = data.get("source", {})
    if isinstance(source, dict):
        result["source_filename"] = str(source.get("filename", "")).strip()
        result["source_page"] = str(source.get("page", "")).strip()
        result["source_quote"] = str(source.get("quote", "")).strip()
    elif isinstance(source, str):
        # 如果source是字符串，作为原文引用
        result["source_quote"] = source.strip()
    
    return result

router = APIRouter(prefix="/api/packages", tags=["包文件管理"])

# 存储解析线程的停止事件
parse_threads = {}


@router.post("/{package_id}/upload-files")
async def upload_package_files(
    package_id: int,
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None
):
    """
    为包上传投标人文件的ZIP包
    
    ZIP包结构要求：
    - 根目录下为公司文件夹（文件夹名包含"公司"字样）
    - 每个公司文件夹下包含该公司的所有投标文件
    
    返回上传记录ID，用于查询解析状态
    """
    db = db_session()
    try:
        # 检查包是否存在
        package = db.query(Package).filter(Package.id == package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")
        
        # 创建上传记录
        upload_record = PackageFileUpload(
            package_id=package_id,
            status="pending",
            total_files=0,
            parsed_files=0
        )
        db.add(upload_record)
        db.flush()
        upload_id = upload_record.id
        
        # 保存上传的ZIP文件
        src_dir = Path(__file__).parent.parent
        upload_dir = src_dir / "data" / "package_uploads"
        upload_dir.mkdir(parents=True, exist_ok=True)
        zip_path = upload_dir / f"pkg_{package_id}_{upload_id}_{file.filename}"
        
        with open(zip_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        upload_record.zip_file_path = str(zip_path)
        db.commit()
        
        # 启动后台解析
        stop_event = threading.Event()
        parse_threads[(package_id, upload_id)] = stop_event
        
        thread = threading.Thread(
            target=process_package_files,
            args=(package_id, upload_id, str(zip_path), stop_event),
            daemon=True
        )
        thread.start()
        
        logger.info(f"已启动包文件解析任务：package_id={package_id}, upload_id={upload_id}")
        
        return {
            "message": "文件上传成功，开始解析",
            "upload_id": upload_id,
            "status": "processing"
        }
    
    except Exception as e:
        db.rollback()
        logger.error(f"上传文件失败：{e}")
        raise HTTPException(status_code=500, detail=f"上传失败：{str(e)}")
    finally:
        db_session.remove()


def find_company_folders(root_dir: Path) -> List[Path]:
    """递归查找所有公司文件夹（文件夹名包含"公司"字样），优先取最深层的匹配"""
    company_folders = []
    try:
        for item in root_dir.iterdir():
            if item.is_dir():
                sub_folders = find_company_folders(item)
                if sub_folders:
                    company_folders.extend(sub_folders)
                elif '公司' in item.name:
                    company_folders.append(item)
    except Exception as e:
        logger.error(f"查找公司文件夹失败 {root_dir}: {e}")
    return company_folders


def _match_bidder(company_name: str, bidder_name_map: dict):
    """根据文件夹名称匹配投标人"""
    if company_name in bidder_name_map:
        return bidder_name_map[company_name]
    for name in bidder_name_map:
        if company_name in name or name in company_name:
            return bidder_name_map[name]
    clean_company_name = ''.join(filter(str.isalnum, company_name))
    for name in bidder_name_map:
        clean_name = ''.join(filter(str.isalnum, name))
        if clean_company_name in clean_name or clean_name in clean_company_name:
            return bidder_name_map[name]
    return None


def _scan_files_to_db(db, company_folder: Path, extract_dir: Path, bidder, total_files, parsed_files):
    """第一阶段：扫描公司文件夹下所有文件入库"""
    scanned_pdfs = 0
    for file_path in company_folder.rglob('*'):
        if not file_path.is_file():
            continue
        if '_temp' in str(file_path):
            continue

        file_type = file_path.suffix.lower()[1:] if file_path.suffix else "other"
        relative_path = str(file_path.relative_to(extract_dir))

        bidder_file = BidderFile(
            bidder_id=bidder.id,
            file_name=file_path.name,
            file_path=relative_path,
            file_type=file_type,
            file_size=file_path.stat().st_size,
            parse_status="pending" if file_type == 'pdf' else "completed",
            parsed=(file_type != 'pdf')
        )
        db.add(bidder_file)
        total_files += 1
        parsed_files += 1

        if file_type == 'pdf':
            scanned_pdfs += 1

    return total_files, parsed_files, scanned_pdfs


def process_package_files(package_id: int, upload_id: int, source_path: str, stop_event: threading.Event):
    """后台处理包文件解析（两阶段：先扫描入库，再逐个转换PDF）
    
    Args:
        package_id: 包ID
        upload_id: 上传记录ID
        source_path: ZIP文件路径或已解压的目录路径
        stop_event: 停止事件
    """
    db = db_session()
    total_files = 0
    parsed_files = 0
    unmatched_folders = []
    
    try:
        logger.info(f"开始解析包文件：package_id={package_id}, upload_id={upload_id}")
        
        # 更新状态为处理中
        upload_record = db.query(PackageFileUpload).filter(
            PackageFileUpload.id == upload_id
        ).first()
        if upload_record:
            upload_record.status = "processing"
            db.commit()
        
        # 确定提取目录
        src_dir = Path(__file__).parent.parent
        extract_dir = src_dir / "data" / "package_files" / f"pkg_{package_id}"
        extract_dir.mkdir(parents=True, exist_ok=True)
        
        # 判断 source_path 是 ZIP 文件还是目录
        source_path_obj = Path(source_path)
        if source_path_obj.is_file() and source_path.lower().endswith('.zip'):
            # 解压ZIP文件
            with zipfile.ZipFile(source_path, 'r') as zip_ref:
                zip_ref.extractall(extract_dir)
            
            # 修复文件名编码
            fix_filenames(extract_dir)
        elif source_path_obj.is_dir():
            # 已经是目录，直接使用（用于 FTP 下载场景）
            logger.info(f"source_path 已是目录，直接使用：{source_path}")
            # 如果 source_path 就是目标目录，不需要复制
            if source_path_obj != extract_dir:
                # 复制文件到目标目录
                import shutil
                for item in source_path_obj.iterdir():
                    dest_item = extract_dir / item.name
                    if item.is_dir():
                        shutil.copytree(item, dest_item, dirs_exist_ok=True)
                    else:
                        shutil.copy2(item, dest_item)
        else:
            raise ValueError(f"无效的 source_path: {source_path}")
        
        # 获取包下的所有投标人
        bidders = db.query(Bidder).filter(Bidder.package_id == package_id).all()
        bidder_name_map = {b.company_name: b for b in bidders}
        
        # 递归查找所有公司文件夹
        company_folders = find_company_folders(extract_dir)
        logger.info(f"找到 {len(company_folders)} 个公司文件夹")
        
        # ========== 第一阶段：扫描所有文件入库 ==========
        logger.info("第一阶段：扫描所有文件入库")
        total_pdf_count = 0
        folder_bidder_map = {}  # 记录每个文件夹匹配到的投标人
        
        for company_folder in company_folders:
            if stop_event.is_set():
                break
            
            company_name = company_folder.name
            bidder = _match_bidder(company_name, bidder_name_map)
            
            if not bidder:
                logger.warning(f"未找到对应的投标人，删除文件夹：{company_name}")
                unmatched_folders.append(company_name)
                try:
                    shutil.rmtree(company_folder)
                except Exception as e:
                    logger.error(f"删除文件夹失败 {company_name}: {e}")
                continue
            
            folder_bidder_map[company_name] = bidder
            logger.info(f"扫描公司文件夹：{company_name}")
            
            total_files, parsed_files, scanned_pdfs = _scan_files_to_db(
                db, company_folder, extract_dir, bidder, total_files, parsed_files
            )
            total_pdf_count += scanned_pdfs
            
            # 更新进度
            db.commit()
            upload_record.total_files = total_files
            upload_record.parsed_files = parsed_files
            db.commit()
        
        if stop_event.is_set():
            logger.info(f"解析任务已停止：package_id={package_id}, upload_id={upload_id}")
            upload_record.status = "cancelled"
            upload_record.completed_at = datetime.now()
            db.commit()
            db.close()
            parse_threads.pop((package_id, upload_id), None)
            return
        
        logger.info(f"第一阶段完成：共扫描 {total_files} 个文件（含 {total_pdf_count} 个PDF）")
        
        # 上传解压状态已完成（PDF转换单独由 conversion-status 跟踪）
        upload_record.status = "completed"
        upload_record.total_files = total_files
        upload_record.parsed_files = parsed_files
        upload_record.completed_at = datetime.now()
        db.commit()
        logger.info(f"文件扫描入库完成，upload_record 标记为 completed")
        
        # ========== 第二阶段：逐个转换PDF为MD ==========
        # 注意：此阶段不再修改 upload_record.status，只更新 BidderFile 记录
        logger.info("第二阶段：逐个转换PDF为MD")
        converted_pdfs = 0
        
        for company_folder in company_folders:
            if company_folder.name in unmatched_folders:
                continue
            if stop_event.is_set():
                break
            
            bidder = folder_bidder_map.get(company_folder.name)
            if not bidder:
                continue
            
            # 查询该投标人下所有 PDF 文件（按文件名排序保持稳定顺序）
            pdf_files = db.query(BidderFile).filter(
                BidderFile.bidder_id == bidder.id,
                BidderFile.file_type == "pdf"
            ).order_by(BidderFile.file_name).all()
            
            for pdf_file in pdf_files:
                if stop_event.is_set():
                    break
                
                # 获取完整文件路径
                pdf_path = extract_dir / pdf_file.file_path
                if not pdf_path.exists():
                    logger.warning(f"PDF文件不存在，跳过: {pdf_path}")
                    pdf_file.parse_status = "failed"
                    pdf_file.parse_error = "文件不存在"
                    db.commit()
                    continue
                
                try:
                    # 创建 MD 文件记录
                    md_relative_path = pdf_file.file_path.replace('.pdf', '.md')
                    md_file = BidderFile(
                        bidder_id=bidder.id,
                        file_name=pdf_path.stem + ".md",
                        file_path=md_relative_path,
                        file_type='md',
                        file_size=0,
                        parse_status="processing",
                        parsed=False,
                        ocr_status="pending"
                    )
                    db.add(md_file)
                    db.commit()
                    
                    logger.info(f"开始转换PDF: {pdf_path.name}")
                    md_path = pdf_to_markdown(pdf_path, pdf_path.parent, md_file.id)
                    
                    # 重新查询 md_file
                    md_file = db.query(BidderFile).filter(BidderFile.id == md_file.id).first()
                    
                    if md_path and md_path.exists():
                        md_file.file_size = md_path.stat().st_size
                        md_file.parse_status = "completed"
                        md_file.parsed = True
                        pdf_file.parse_status = "completed"
                        pdf_file.parsed = True
                        db.commit()
                        converted_pdfs += 1
                        parsed_files += 1
                        logger.info(f"PDF 转 MD 完成: {pdf_path.name}")
                    else:
                        pdf_file.parse_status = "failed"
                        pdf_file.parse_error = "转换失败"
                        md_file.parse_status = "failed"
                        md_file.ocr_status = "failed"
                        db.commit()
                        logger.warning(f"PDF 转 MD 失败: {pdf_path.name}")
                        
                except Exception as pdf_e:
                    logger.error(f"PDF 转 MD 异常 {pdf_path}: {pdf_e}")
                    # 标记当前PDF为失败（不调用 db.rollback() 以免 detached 其他对象）
                    try:
                        db.query(BidderFile).filter(BidderFile.id == pdf_file.id).update(
                            {"parse_status": "failed", "parse_error": str(pdf_e)}
                        )
                        db.commit()
                    except:
                        pass
        
        # ========== 完成 ==========
        summary = f"包文件解析完成：package_id={package_id}, upload_id={upload_id}"
        summary += f", total_files={total_files}, pdf_count={total_pdf_count}, converted={converted_pdfs}"
        summary += f", matched_bidders={len(company_folders) - len(unmatched_folders)}"
        if unmatched_folders:
            summary += f", deleted_unmatched={unmatched_folders}"
        logger.info(summary)
        
    except Exception as e:
        logger.error(f"解析包文件失败：{e}", exc_info=True)
        try:
            upload_record = db.query(PackageFileUpload).filter(
                PackageFileUpload.id == upload_id
            ).first()
            if upload_record:
                upload_record.status = "failed"
                upload_record.total_files = total_files
                upload_record.parsed_files = parsed_files
                upload_record.completed_at = datetime.now()
                db.commit()
        except:
            pass
    finally:
        db_session.remove()
        # 清理线程记录（FTP 下载场景可能没有这个 key）
        parse_threads.pop((package_id, upload_id), None)


def fix_filenames(root_dir: Path):
    """修复解压后的文件名编码问题"""
    try:
        # 先处理所有文件（不递归）
        for item in root_dir.iterdir():
            if item.is_file():
                old_name = item.name
                new_name = decode_filename(old_name)
                if new_name != old_name:
                    try:
                        new_path = item.parent / new_name
                        if not new_path.exists():
                            item.rename(new_path)
                    except Exception:
                        pass
        
        # 然后处理子文件夹（递归调用会处理子文件夹内的内容）
        for item in list(root_dir.iterdir()):  # 使用list()避免迭代时目录结构变化
            if item.is_dir():
                old_name = item.name
                new_name = decode_filename(old_name)
                if new_name != old_name:
                    try:
                        new_path = item.parent / new_name
                        if not new_path.exists():
                            # 先递归修复子文件夹内容，然后重命名父文件夹
                            fix_filenames(item)
                            item.rename(new_path)
                            # 继续处理重命名后的文件夹内容
                            fix_filenames(new_path)
                    except Exception:
                        pass
                else:
                    # 名称不需要变化，直接递归处理子文件夹
                    fix_filenames(item)
    except Exception:
        pass


def decode_filename(name: str) -> str:
    """尝试多种编码来解码文件名"""
    if not name:
        return name
    
    # 已经是中文则无需解码
    if any('\u4e00' <= c <= '\u9fff' for c in name):
        return name
    
    decode_attempts = [
        ('latin-1', 'utf-8'),  # 新增：处理 UTF-8 字节被当作 latin-1 的情况
        ('cp437', 'utf-8'),    # 处理常见的 ZIP 编码问题
        ('cp437', 'gbk'),
        ('cp437', 'gb2312'),
        ('utf-8', 'gbk'),
        ('latin-1', 'gbk'),
        ('gbk', 'utf-8'),
    ]
    
    for enc_from, enc_to in decode_attempts:
        try:
            decoded = name.encode(enc_from).decode(enc_to)
            if decoded != name and any('\u4e00' <= c <= '\u9fff' for c in decoded):
                return decoded
        except:
            pass
    
    return name


def _update_ocr_status(md_file_id: int, **kwargs):
    """在独立 session 中更新 MD 文件的 OCR 状态"""
    try:
        inner_db = SessionLocal()
        try:
            record = inner_db.query(BidderFile).filter(BidderFile.id == md_file_id).first()
            if record:
                for key, value in kwargs.items():
                    setattr(record, key, value)
                inner_db.commit()
        finally:
            inner_db.close()
    except Exception as e:
        logger.error(f"更新 OCR 状态失败 md_file_id={md_file_id}: {e}")


def _ocr_single_image(ocr_service, image_full_path: str, image_rel_path: str) -> str:
    """对单张图片进行 OCR 识别，返回清理后的文本，失败返回空字符串"""
    try:
        if not os.path.exists(image_full_path):
            logger.warning(f"图片文件不存在: {image_full_path}")
            return ""
        logger.info(f"正在 OCR 识别图片: {image_rel_path}")
        ocr_text = ocr_service.ocr_image(image_full_path)
        if ocr_text and "OCR 识别失败" not in ocr_text:
            ocr_text = clean_ocr_text(ocr_text)
            logger.info(f"图片 OCR 识别成功: {image_rel_path}")
            return ocr_text
        else:
            logger.warning(f"图片 OCR 识别失败: {image_rel_path}")
            return ""
    except Exception as e:
        logger.error(f"图片 OCR 识别异常 {image_rel_path}: {e}")
        return ""


def clean_ocr_text(text: str) -> str:
    """
    1. 截取前 1000 个字符（生产级兜底）。
    2. 去除连续重复行（解决风暴）。
    """
    # 1. 硬性截断（最核心的一步）
    MAX_CHARS = 1000
    text = text[:MAX_CHARS]

    # 2. 简单去重（防止截断后还剩少量重复）
    lines = text.splitlines()
    result = []
    prev = None
    for line in lines:
        line_strip = line.strip()
        if not line_strip:
            continue
        if line_strip != prev:
            result.append(line_strip)
            prev = line_strip

    return "\n".join(result)


def pdf_to_markdown(pdf_path: Path, output_dir: Path, md_file_id: int = None) -> Optional[Path]:
    """将 PDF 文件转换为 Markdown 文件（使用 OpenDataLoader）
    
    转换流程：
    1. 使用 opendataloader_pdf 转换 PDF 为 Markdown
    2. 提取 PDF 中的图片
    3. 使用 OCR 识别图片内容
    4. 将图片链接替换为 OCR 识别的文本内容
    
    Args:
        pdf_path: PDF 文件路径
        output_dir: 输出目录（PDF 同级目录）
        md_file_id: MD 文件的数据库记录 ID（用于更新 OCR 状态）
        
    Returns:
        生成的 MD 文件路径，失败返回 None
    """
    try:
        import opendataloader_pdf
        import re
        import shutil
        from services.ocr_service import OCRService
        
        logger.info(f"开始使用 OpenDataLoader 转换 PDF: {pdf_path}")
        
        # 更新 OCR 状态为处理中（使用独立 session）
        if md_file_id:
            _update_ocr_status(md_file_id, ocr_status="processing")
        
        # 创建临时输出目录
        temp_output_dir = output_dir / f"{pdf_path.stem}_temp"
        temp_output_dir.mkdir(parents=True, exist_ok=True)
        
        # 使用 opendataloader 转换 PDF
        try:
            opendataloader_pdf.convert(
                input_path=[str(pdf_path)],
                output_dir=str(temp_output_dir),
                format="markdown",
                image_output="external",
                image_format="png",
                markdown_page_separator="\n\n---\n\n## 第 %page-number% 页\n\n",
                quiet=True
            )
        except Exception as convert_e:
            logger.error(f"opendataloader 转换失败 {pdf_path}: {convert_e}")
            if md_file_id:
                _update_ocr_status(md_file_id, ocr_status="failed")
            shutil.rmtree(temp_output_dir, ignore_errors=True)
            return None
        
        # 查找生成的 markdown 文件
        md_files = list(temp_output_dir.rglob("*.md"))
        if not md_files:
            logger.error(f"未找到生成的 Markdown 文件: {pdf_path}")
            if md_file_id:
                _update_ocr_status(md_file_id, ocr_status="failed")
            shutil.rmtree(temp_output_dir, ignore_errors=True)
            return None
        
        temp_md_path = md_files[0]
        logger.info(f"临时 Markdown 文件: {temp_md_path}")
        
        # 读取 markdown 内容
        md_content = temp_md_path.read_text(encoding='utf-8')
        
        # 查找所有图片链接（支持带尖括号和不带尖括号两种格式）
        image_pattern = r'!\[.*?\]\(<?([^)>]+\.(png|jpg|jpeg|gif))>?\)'
        image_iter = list(re.finditer(image_pattern, md_content))
        image_matches = [(m.group(0), m.group(1), m.group(2)) for m in image_iter]
        
        total_images = len(image_matches)
        completed_images = 0
        
        logger.info(f"Markdown 中找到 {total_images} 个图片链接")
        
        # 更新总图片数（使用独立 session）
        if md_file_id:
            if total_images == 0:
                _update_ocr_status(md_file_id, ocr_status="no_images",
                                   ocr_total_images=0, ocr_completed_images=0)
            else:
                _update_ocr_status(md_file_id, ocr_total_images=total_images)
        
        # 如果有图片，并发进行 OCR 识别（并发数 8），收集结果后一次性替换
        if image_matches:
            ocr_service = OCRService()
            ocr_concurrency = min(8, len(image_matches))
            logger.info(f"开始并发 OCR 识别 {len(image_matches)} 张图片，并发数: {ocr_concurrency}")
            
            # 第一步：并发识别所有图片
            ocr_replacements = {}
            import concurrent.futures
            
            ocr_executor = concurrent.futures.ThreadPoolExecutor(max_workers=ocr_concurrency)
            future_to_image = {}
            for full_match, image_rel_path, _ in image_matches:
                image_full_path = temp_output_dir / image_rel_path
                future = ocr_executor.submit(
                    _ocr_single_image, ocr_service, str(image_full_path), image_rel_path
                )
                future_to_image[future] = (full_match, image_rel_path)
            
            try:
                for future in concurrent.futures.as_completed(future_to_image):
                    full_match, image_rel_path = future_to_image[future]
                    try:
                        ocr_text = future.result()
                        if ocr_text:
                            ocr_replacements[full_match] = ocr_text
                            completed_images += 1
                    except Exception as e:
                        logger.error(f"图片 OCR 识别异常 {image_rel_path}: {e}")
            finally:
                ocr_executor.shutdown(wait=False)
            
            # 第二步：一次性全部替换
            if ocr_replacements:
                for full_match, ocr_text in ocr_replacements.items():
                    md_content = md_content.replace(
                        full_match,
                        f"\n\n**[图片内容 OCR 识别]**\n\n{ocr_text}\n\n"
                    )
        
        # 更新 OCR 状态为完成（使用独立 session）
        if md_file_id:
            if total_images == 0:
                final_status = "no_images"
            elif completed_images == total_images:
                final_status = "completed"
            else:
                final_status = "partial"
            _update_ocr_status(md_file_id, ocr_status=final_status,
                               ocr_completed_images=completed_images)
        
        # 添加文件标题（包含完整文件名和分页标识）
        final_md_content = f"# 文件：{pdf_path.name}\n\n{md_content}"
        
        # 生成最终的 MD 文件路径（与 PDF 同级目录）
        md_filename = pdf_path.stem + ".md"
        md_path = output_dir / md_filename
        
        # 写入 MD 文件
        md_path.write_text(final_md_content, encoding='utf-8')
        logger.info(f"PDF 转 MD 成功: {pdf_path} -> {md_path}")
        
        # 清理临时目录（包括所有图片）
        shutil.rmtree(temp_output_dir, ignore_errors=True)
        logger.info(f"已清理临时目录: {temp_output_dir}")
        
        return md_path
        
    except ImportError:
        logger.error(f"opendataloader_pdf 未安装，请先安装: pip install opendataloader-pdf")
        if md_file_id:
            _update_ocr_status(md_file_id, ocr_status="failed")
        return None
    except Exception as e:
        logger.error(f"PDF 转 MD 失败 {pdf_path}: {e}", exc_info=True)
        if md_file_id:
            _update_ocr_status(md_file_id, ocr_status="failed")
        return None


@router.get("/{package_id}/upload-status/{upload_id}")
def get_upload_status(package_id: int, upload_id: int):
    """获取文件上传解析状态"""
    db = db_session()
    try:
        upload_record = db.query(PackageFileUpload).filter(
            PackageFileUpload.id == upload_id,
            PackageFileUpload.package_id == package_id
        ).first()
        
        if not upload_record:
            raise HTTPException(status_code=404, detail="上传记录不存在")
        
        result = upload_record.to_dict()
        
        # 获取所有 MD 文件的 OCR 状态
        md_files = db.query(BidderFile).filter(
            BidderFile.file_type == 'md'
        ).all()
        
        ocr_stats = {
            "total_md_files": len(md_files),
            "completed": 0,
            "processing": 0,
            "pending": 0,
            "failed": 0,
            "no_images": 0,
            "partial": 0,
            "total_images": 0,
            "completed_images": 0
        }
        
        for md_file in md_files:
            status = md_file.ocr_status or "pending"
            ocr_stats[status] = ocr_stats.get(status, 0) + 1
            ocr_stats["total_images"] += md_file.ocr_total_images or 0
            ocr_stats["completed_images"] += md_file.ocr_completed_images or 0
        
        result["ocr_stats"] = ocr_stats
        
        # 计算整体进度（考虑 OCR 状态）
        # 只有当所有 MD 文件的 OCR 都完成（completed 或 no_images）时，才算完全完成
        if ocr_stats["total_md_files"] > 0:
            ocr_completed = ocr_stats["completed"] + ocr_stats["no_images"]
            ocr_progress = (ocr_completed / ocr_stats["total_md_files"]) * 100
            result["ocr_progress"] = ocr_progress
            
            # 如果 OCR 还在进行中，整体状态应该是 processing
            if upload_record.status == "completed" and ocr_progress < 100:
                result["status"] = "processing"
        else:
            result["ocr_progress"] = 100
        
        return result
    finally:
        db_session.remove()


@router.get("/{package_id}/bidders/{bidder_id}/files")
def get_bidder_files(package_id: int, bidder_id: int):
    """获取投标人的文件列表"""
    db = db_session()
    try:
        # 验证投标人属于该包
        bidder = db.query(Bidder).filter(
            Bidder.id == bidder_id,
            Bidder.package_id == package_id
        ).first()
        
        if not bidder:
            raise HTTPException(status_code=404, detail="投标人不存在")
        
        files = db.query(BidderFile).filter(BidderFile.bidder_id == bidder_id).all()
        
        return {
            "bidder_id": bidder_id,
            "company_name": bidder.company_name,
            "files": [f.to_dict() for f in files]
        }
    finally:
        db_session.remove()


@router.get("/{package_id}/bidders/{bidder_id}/file-tree")
def get_bidder_file_tree(package_id: int, bidder_id: int):
    """获取投标人的文件树结构（从DB记录构建，不依赖文件系统目录名）"""
    db = db_session()
    try:
        bidder = db.query(Bidder).filter(
            Bidder.id == bidder_id,
            Bidder.package_id == package_id
        ).first()
        
        if not bidder:
            raise HTTPException(status_code=404, detail="投标人不存在")
        
        files = db.query(BidderFile).filter(
            BidderFile.bidder_id == bidder_id
        ).all()
        
        # 从 file_path 构建树结构
        # file_path 格式: "投标文件-技术\公司名\子文件夹\文件名.pdf"
        # 跳过前两层（根目录层 + 公司层），从子文件夹开始
        tree_root = {}  # {folder_name: {children...}} 或 "__files__": [file_nodes]
        
        for f in files:
            if not f.file_path:
                continue
            parts = f.file_path.replace('\\', '/').split('/')
            if len(parts) < 2:
                continue
            # 计算相对于公司目录的路径层级
            # ZIP 上传：投标文件/A公司/子文件夹/文件.pdf → parts[2:] = ['子文件夹', '文件.pdf']
            # FTP 下载：A公司/文件.pdf → len(parts)==2，直接取文件名
            if len(parts) == 2:
                relevant = [parts[-1]]
            else:
                relevant = parts[2:]
            if not relevant:
                continue
            
            current = tree_root
            for i, part in enumerate(relevant[:-1]):
                if part not in current:
                    current[part] = {}
                current = current[part]
            
            file_node = {
                "key": f.file_path.replace('\\', '/'),
                "title": f.file_name,
                "type": "file",
                "children": None,
                "file_id": f.id,
                "file_type": f.file_type or (f.file_name.split('.')[-1] if '.' in f.file_name else "other"),
                "file_size": f.file_size or 0,
                "parse_status": f.parse_status or "pending"
            }
            if "__files__" not in current:
                current["__files__"] = []
            current["__files__"].append(file_node)
        
        def dict_to_tree(d: dict) -> list:
            """将嵌套字典转换为文件树列表"""
            result = []
            for key, value in d.items():
                if key == "__files__":
                    result.extend(value)
                else:
                    children = dict_to_tree(value) if isinstance(value, dict) else []
                    result.append({
                        "key": key,
                        "title": key,
                        "type": "folder",
                        "children": children,
                        "file_id": None,
                        "file_type": None,
                        "file_size": None,
                        "parse_status": None
                    })
            # 文件夹在前，文件在后
            result.sort(key=lambda x: (x["type"] == "file", x["title"]))
            return result
        
        file_tree = dict_to_tree(tree_root)
        
        return {
            "bidder_id": bidder_id,
            "company_name": bidder.company_name,
            "file_tree": file_tree
        }
    finally:
        db_session.remove()


@router.delete("/{package_id}/bidders/{bidder_id}/files/{file_id}")
def delete_bidder_file(package_id: int, bidder_id: int, file_id: int):
    """删除投标人的文件记录"""
    db = db_session()
    try:
        # 验证投标人属于该包
        bidder = db.query(Bidder).filter(
            Bidder.id == bidder_id,
            Bidder.package_id == package_id
        ).first()
        
        if not bidder:
            raise HTTPException(status_code=404, detail="投标人不存在")
        
        file = db.query(BidderFile).filter(BidderFile.id == file_id, BidderFile.bidder_id == bidder_id).first()
        
        if not file:
            raise HTTPException(status_code=404, detail="文件不存在")
        
        db.delete(file)
        db.commit()
        
        return {"message": "文件已删除"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"删除失败：{str(e)}")
    finally:
        db_session.remove()


@router.get("/{package_id}/upload-history")
def get_upload_history(package_id: int):
    """获取包的文件上传历史"""
    db = db_session()
    try:
        uploads = db.query(PackageFileUpload).filter(
            PackageFileUpload.package_id == package_id
        ).order_by(PackageFileUpload.created_at.desc()).all()
        
        return [u.to_dict() for u in uploads]
    finally:
        db_session.remove()


@router.delete("/{package_id}/files")
def delete_package_files(package_id: int):
    """删除包下所有文件记录和上传的ZIP文件"""
    db = db_session()
    try:
        # 获取包的所有上传记录
        uploads = db.query(PackageFileUpload).filter(
            PackageFileUpload.package_id == package_id
        ).all()
        
        # 删除上传的ZIP文件
        for upload in uploads:
            if upload.zip_file_path and os.path.exists(upload.zip_file_path):
                try:
                    os.remove(upload.zip_file_path)
                    logger.info(f"已删除ZIP文件: {upload.zip_file_path}")
                except Exception as e:
                    logger.error(f"删除ZIP文件失败 {upload.zip_file_path}: {e}")
        
        # 获取包下所有投标人
        bidders = db.query(Bidder).filter(Bidder.package_id == package_id).all()
        bidder_ids = [b.id for b in bidders]
        
        # 删除文件记录
        files = db.query(BidderFile).filter(BidderFile.bidder_id.in_(bidder_ids)).all()
        
        # 删除实际文件
        src_dir = Path(__file__).parent.parent
        extract_dir = src_dir / "data" / "package_files" / f"pkg_{package_id}"
        
        if extract_dir.exists():
            try:
                shutil.rmtree(extract_dir)
                logger.info(f"已删除文件目录: {extract_dir}")
            except Exception as e:
                logger.error(f"删除文件目录失败 {extract_dir}: {e}")
        
        # 删除数据库记录（只删除文件记录，保留投标人记录）
        db.query(BidderFile).filter(BidderFile.bidder_id.in_(bidder_ids)).delete()
        db.query(PackageFileUpload).filter(PackageFileUpload.package_id == package_id).delete()
        
        db.commit()
        
        logger.info(f"已删除包 {package_id} 的所有文件记录")
        return {"message": "文件删除成功"}
        
    except Exception as e:
        db.rollback()
        logger.error(f"删除包文件失败: {e}")
        raise HTTPException(status_code=500, detail=f"删除失败：{str(e)}")
    finally:
        db_session.remove()


@router.get("/{package_id}/files/{file_id}/preview")
def preview_file(package_id: int, file_id: int):
    """预览文件内容"""
    from fastapi.responses import FileResponse
    from urllib.parse import quote
    
    db = db_session()
    try:
        # 获取文件记录
        file = db.query(BidderFile).filter(BidderFile.id == file_id).first()
        
        if not file:
            raise HTTPException(status_code=404, detail="文件不存在")
        
        # 获取完整文件路径
        src_dir = Path(__file__).parent.parent
        
        # 数据库中存储的是相对于 pkg_{package_id} 目录的相对路径
        # 例如：投标文件/河北国绿新能源科技有限公司/产品碳足迹证书佐证材料/产品碳足迹证书佐证材料.md
        file_path_str = file.file_path
        
        # 构建完整文件路径
        file_path = src_dir / "data" / "package_files" / f"pkg_{package_id}" / file_path_str
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="文件不存在")
        
        # 根据文件类型返回
        file_type = file.file_type.lower()
        media_types = {
            'pdf': 'application/pdf',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'doc': 'application/msword',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'xls': 'application/vnd.ms-excel',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'txt': 'text/plain; charset=utf-8',
            'md': 'text/markdown; charset=utf-8',
        }
        
        media_type = media_types.get(file_type, 'application/octet-stream')
        
        # 对中文文件名进行URL编码
        encoded_filename = quote(file.file_name, safe='')
        
        return FileResponse(
            path=str(file_path),
            media_type=media_type,
            filename=encoded_filename,
            headers={
                'Content-Disposition': f'inline; filename="{encoded_filename}"; filename*=UTF-8\'\'{encoded_filename}'
            }
        )
        
    except Exception as e:
        logger.error(f"预览文件失败: {e}")
        raise HTTPException(status_code=500, detail=f"预览失败：{str(e)}")
    finally:
        db_session.remove()


@router.get("/{package_id}/files/{file_id}/content")
def get_file_content(package_id: int, file_id: int):
    """获取文件内容（用于抽屉预览）"""
    db = db_session()
    try:
        # 获取文件记录
        file = db.query(BidderFile).filter(BidderFile.id == file_id).first()
        
        if not file:
            raise HTTPException(status_code=404, detail="文件不存在")
        
        # 获取完整文件路径
        src_dir = Path(__file__).parent.parent
        
        # 数据库中存储的是相对于 pkg_{package_id} 目录的相对路径
        file_path_str = file.file_path
        
        # 构建完整文件路径
        file_path = src_dir / "data" / "package_files" / f"pkg_{package_id}" / file_path_str
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="文件不存在")
        
        # 根据文件类型返回内容
        file_type = file.file_type.lower()
        
        # 文本类型文件直接读取内容
        text_types = ['txt', 'md']
        if file_type in text_types:
            content = file_path.read_text(encoding='utf-8', errors='replace')
            return {
                "success": True,
                "file_name": file.file_name,
                "file_type": file_type,
                "content": content,
                "file_size": file.file_size
            }
        
        # 对于其他类型，返回预览URL
        return {
            "success": True,
            "file_name": file.file_name,
            "file_type": file_type,
            "preview_url": f"/api/packages/{package_id}/files/{file_id}/preview",
            "file_size": file.file_size
        }
        
    except Exception as e:
        logger.error(f"获取文件内容失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取文件内容失败：{str(e)}")
    finally:
        db_session.remove()


@router.get("/{package_id}/conversion-status")
def get_package_conversion_status(package_id: int):
    """获取包的PDF转换状态"""
    db = db_session()
    try:
        # 获取包下所有投标人
        bidders = db.query(Bidder).filter(Bidder.package_id == package_id).all()
        
        if not bidders:
            return {
                "package_id": package_id,
                "conversion_ready": False,
                "total_pdf_count": 0,
                "converted_count": 0,
                "failed_count": 0,
                "processing_count": 0,
                "bidders": []
            }
        
        result = {
            "package_id": package_id,
            "total_pdf_count": 0,
            "converted_count": 0,
            "failed_count": 0,
            "processing_count": 0,
            "bidders": []
        }
        
        for bidder in bidders:
            # 统计该投标人的PDF文件
            pdf_files = db.query(BidderFile).filter(
                BidderFile.bidder_id == bidder.id,
                BidderFile.file_type == "pdf"
            ).all()
            
            # 统计已成功转换的PDF（parse_status == "completed"）
            completed_pdfs = [f for f in pdf_files if f.parse_status == "completed"]
            
            # 统计对应的MD文件（用于展示）
            md_files = db.query(BidderFile).filter(
                BidderFile.bidder_id == bidder.id,
                BidderFile.file_type == "md"
            ).all()
            
            # 统计转换失败的文件（只统计PDF的失败）
            failed_files = [f for f in pdf_files if f.parse_status == "failed"]
            
            # 统计处理/待处理中的文件（pending 也归为处理中）
            processing_files = [f for f in pdf_files if f.parse_status in ("processing", "pending")]
            
            bidder_status = {
                "bidder_id": bidder.id,
                "company_name": bidder.company_name,
                "pdf_count": len(pdf_files),
                "md_count": len(md_files),
                "failed_count": len(failed_files),
                "processing_count": len(processing_files),
                "conversion_ready": len(pdf_files) > 0 and len(completed_pdfs) == len(pdf_files)
            }
            
            result["total_pdf_count"] += len(pdf_files)
            result["converted_count"] += len(completed_pdfs)
            result["failed_count"] += len(failed_files)
            result["processing_count"] += len(processing_files)
            result["bidders"].append(bidder_status)
        
        # 判断整个包是否可以启动评审（总PDF数为0时不认为ready）
        result["conversion_ready"] = (
            result["total_pdf_count"] > 0 and
            result["total_pdf_count"] == result["converted_count"] and 
            result["failed_count"] == 0 and 
            result["processing_count"] == 0
        )
        
        return result
        
    finally:
        db_session.remove()


@router.post("/{package_id}/reconvert")
def reconvert_package_pdfs(package_id: int):
    """重新转换包下所有PDF文件为MD"""
    import threading
    
    db = db_session()
    try:
        # 获取包下所有投标人
        bidders = db.query(Bidder).filter(Bidder.package_id == package_id).all()
        
        if not bidders:
            raise HTTPException(status_code=404, detail="该包下没有投标人")
        
        # 创建转换任务记录
        from models.package_files import PackageFileUpload
        upload_record = PackageFileUpload(
            package_id=package_id,
            status="processing",
            total_files=0,
            parsed_files=0
        )
        db.add(upload_record)
        db.flush()
        upload_id = upload_record.id
        db.commit()
        
        # 启动后台转换
        stop_event = threading.Event()
        parse_threads[(package_id, upload_id)] = stop_event
        
        thread = threading.Thread(
            target=reconvert_pdfs_for_package,
            args=(package_id, upload_id, stop_event),
            daemon=True
        )
        thread.start()
        
        return {
            "message": "PDF重新转换任务已启动",
            "upload_id": upload_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"重新转换PDF失败：{e}")
        raise HTTPException(status_code=500, detail=f"重新转换失败：{str(e)}")
    finally:
        db_session.remove()


def reconvert_pdfs_for_package(package_id: int, upload_id: int, stop_event):
    """后台重新转换包下所有PDF文件"""
    db = db_session()
    try:
        bidders = db.query(Bidder).filter(Bidder.package_id == package_id).all()
        total_pdfs = 0
        converted_count = 0
        
        for bidder in bidders:
            pdf_files = db.query(BidderFile).filter(
                BidderFile.bidder_id == bidder.id,
                BidderFile.file_type == "pdf"
            ).all()
            
            total_pdfs += len(pdf_files)
            
            for bidder_file in pdf_files:
                if stop_event.is_set():
                    break
                
                # 获取完整文件路径
                src_dir = Path(__file__).parent.parent
                
                # 数据库中存储的是相对于 pkg_{package_id} 目录的相对路径
                file_path_str = bidder_file.file_path
                
                # 构建完整文件路径
                file_path = src_dir / "data" / "package_files" / f"pkg_{package_id}" / file_path_str
                
                if file_path.exists():
                    try:
                        # 更新状态为处理中
                        bidder_file.parse_status = "processing"
                        db.commit()
                        
                        # 重新转换
                        md_path = pdf_to_markdown(file_path, file_path.parent)
                        
                        if md_path and md_path.exists():
                            # 检查是否已存在MD记录
                            existing_md = db.query(BidderFile).filter(
                                BidderFile.bidder_id == bidder.id,
                                BidderFile.file_name == md_path.name
                            ).first()
                            
                            if existing_md:
                                # 更新现有记录
                                existing_md.file_size = md_path.stat().st_size
                                existing_md.parse_status = "completed"
                            else:
                                # 创建新记录
                                md_relative_path = str(md_path.relative_to(src_dir / "data" / "package_files"))
                                md_file = BidderFile(
                                    bidder_id=bidder.id,
                                    file_name=md_path.name,
                                    file_path=md_relative_path,
                                    file_type='md',
                                    file_size=md_path.stat().st_size,
                                    parse_status="completed",
                                    parsed=True
                                )
                                db.add(md_file)
                            
                            bidder_file.parse_status = "completed"
                            converted_count += 1
                        else:
                            bidder_file.parse_status = "failed"
                            bidder_file.parse_error = "PDF转换失败"
                            
                        db.commit()
                        
                    except Exception as e:
                        logger.error(f"重新转换PDF失败 {file_path}: {e}")
                        bidder_file.parse_status = "failed"
                        bidder_file.parse_error = str(e)
                        db.commit()
        
        # 更新上传记录状态
        upload_record = db.query(PackageFileUpload).filter(
            PackageFileUpload.id == upload_id
        ).first()
        if upload_record:
            upload_record.status = "completed" if not stop_event.is_set() else "cancelled"
            upload_record.total_files = total_pdfs
            upload_record.parsed_files = converted_count
            db.commit()
        
        logger.info(f"包{package_id} PDF重新转换完成：{converted_count}/{total_pdfs}")
        
    except Exception as e:
        logger.error(f"重新转换包PDF失败：{e}")
    finally:
        db_session.remove()
        parse_threads.pop((package_id, upload_id), None)


@router.put("/{package_id}/concurrency")
def update_package_concurrency(package_id: int, concurrency: int):
    """设置包评审时的最大并发数"""
    db = db_session()
    try:
        package = db.query(Package).filter(Package.id == package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")

        if concurrency < 1:
            raise HTTPException(status_code=400, detail="并发数不能小于 1")

        package.max_concurrency = concurrency
        db.commit()
        logger.info(f"[PKG:{package_id}] 并发上限已更新为: {concurrency}")

        return {"message": "并发数已更新", "max_concurrency": concurrency}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新并发数失败: {e}")
        raise HTTPException(status_code=500, detail=f"更新失败：{str(e)}")
    finally:
        db_session.remove()


@router.post("/{package_id}/start-evaluation")
async def start_dify_evaluation(package_id: int, background_tasks: BackgroundTasks):
    """通过 Dify 工作流启动评审（按评审项分组，每家公司的文件一起发送）"""
    db = db_session()
    try:
        package = db.query(Package).filter(Package.id == package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")
        
        if not config.DIFY_API_KEY:
            raise HTTPException(status_code=400, detail="Dify API 未配置，请先设置 DIFY_API_KEY")
        
        package_items = db.query(PackageItem).filter(PackageItem.package_id == package_id).all()
        if not package_items:
            raise HTTPException(status_code=400, detail="请先配置评审项")
        
        item_ids = [pi.item_id for pi in package_items]
        items = db.query(EvaluationItem).filter(EvaluationItem.id.in_(item_ids)).all()
        items_without_api_key = [i for i in items if not (i.api_key or config.DIFY_API_KEY)]
        if items_without_api_key:
            names = ', '.join(i.item_name for i in items_without_api_key)
            raise HTTPException(status_code=400, detail=f"以下评审项未配置 Dify API Key：{names}")
        
        bidders = db.query(Bidder).filter(Bidder.package_id == package_id).all()
        if not bidders:
            raise HTTPException(status_code=400, detail="该包下没有投标人")
        
        conversion_status = get_package_conversion_status(package_id)
        if not conversion_status["conversion_ready"]:
            if conversion_status["total_pdf_count"] == 0:
                raise HTTPException(status_code=400, detail="请先上传并解析文件")
            if conversion_status["processing_count"] > 0:
                raise HTTPException(status_code=400, detail="文件正在转换中，请等待完成")
            raise HTTPException(status_code=400, detail="存在未转换或转换失败的文件")
        
        # 清除旧记录
        db.query(DifyWorkflowRun).filter(DifyWorkflowRun.package_id == package_id).delete()
        db.query(EvaluationResult).filter(EvaluationResult.package_id == package_id).delete()
        package.evaluation_status = "evaluating"
        db.commit()
        logger.info(f"[START_EVAL] 包 {package_id} 状态已设置为 evaluating")
        
        background_tasks.add_task(run_dify_evaluation, package_id)
        logger.info(f"包{package_id} Dify 评审已启动")
        return {"message": "评审已启动，正在通过 Dify 工作流进行评审"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"启动 Dify 评审失败: {e}")
        raise HTTPException(status_code=500, detail=f"启动失败：{str(e)}")
    finally:
        db_session.remove()


async def run_dify_evaluation(package_id: int):
    """后台执行 Dify 评审

    全量并发池模式：
    N家公司 × M个评审项 → 扁平化为 N×M 个独立任务 → 全量并发发出
    通过每个评审项配置的 max_concurrency 控制并发上限
    """
    db = db_session()
    try:
        # 获取项目、标段、包的完整信息
        package = db.query(Package).filter(Package.id == package_id).first()
        if not package:
            logger.error(f"[DIFY:{package_id}] 包不存在")
            return

        section = db.query(Section).filter(Section.id == package.section_id).first()
        project = db.query(Project).filter(Project.id == section.project_id).first() if section else None

        package_no = package.package_no
        section_code = section.section_code if section else "未知标段"
        section_name = section.section_name if section else "未知标段名称"
        project_code = project.project_code if project else "未知项目"
        project_name = project.project_name if project else "未知项目名称"

        logger.info(f"[DIFY:{package_id}] === 开始 Dify 评审 ===")
        logger.info(f"[DIFY:{package_id}] 项目: {project_code} - {project_name}")
        logger.info(f"[DIFY:{package_id}] 标段: {section_code} - {section_name}")
        logger.info(f"[DIFY:{package_id}] 包号: {package_no}")

        bidders = db.query(Bidder).filter(Bidder.package_id == package_id).all()
        package_items = db.query(PackageItem).filter(PackageItem.package_id == package_id).all()
        item_ids = [pi.item_id for pi in package_items]
        items = db.query(EvaluationItem).filter(EvaluationItem.id.in_(item_ids)).all() if item_ids else []

        logger.info(f"[DIFY:{package_id}] 参与评审公司: {len(bidders)} 家")
        for bidder in bidders:
            logger.info(f"[DIFY:{package_id}]   - {bidder.company_name} (ID:{bidder.id})")

        logger.info(f"[DIFY:{package_id}] 评审项数量: {len(items)} 个")
        for item in items:
            logger.info(f"[DIFY:{package_id}]   - {item.item_code} - {item.item_name} (ID:{item.id})")

        # 公司级并发上限从包配置读取，0 或 1=串行，>1=同时最多 N 个 Dify 请求
        max_concurrency = package.max_concurrency or 1
        logger.info(f"[DIFY:{package_id}] 公司级并发上限: {max_concurrency}")

        src_dir = Path(__file__).parent.parent

        async def evaluate_company_item(pi, item, bidder, bound_filenames, api_key, base_url, workflow_id, company_semaphore):
            """评估单个 (公司 × 评审项) 组合

            Args:
                pi: PackageItem 关联记录
                item: EvaluationItem 评审项
                bidder: Bidder 投标人
                bound_filenames: 评审项绑定的文件名列表（用于筛选）
                api_key: Dify API Key
                base_url: Dify API 基础地址
                workflow_id: Dify 工作流 ID
                company_semaphore: 公司级并发信号量
            """
            item_code = item.item_code
            item_name = item.item_name
            bidder_name = bidder.company_name
            bidder_id = bidder.id

            # ====== 整个流程受信号量控制，包括数据库连接创建 ======
            async with company_semaphore:
                logger.debug(f"[DIFY:{package_id}] 准备 (公司×评审项): {bidder_name} × {item_name}")
                # 使用 SessionLocal() 而不是 db_session()，确保每个协程有独立连接
                db = SessionLocal()

                try:
                    # ====== 1. 查找并上传文件到 Dify ======
                    md_files_query = db.query(BidderFile).filter(
                        BidderFile.bidder_id == bidder_id,
                        BidderFile.file_type == "md",
                        BidderFile.parse_status == "completed"
                    )

                    if bound_filenames:
                        import fnmatch
                        matched_files = []
                        for md_file in md_files_query.all():
                            for bound_name in bound_filenames:
                                pattern = bound_name if ('*' in bound_name or '?' in bound_name) else f"*{bound_name}*"
                                if fnmatch.fnmatch(md_file.file_name, pattern):
                                    matched_files.append(md_file)
                                    break
                        md_files = matched_files
                    else:
                        md_files = md_files_query.all()

                    if not md_files:
                        logger.warning(f"[DIFY:{package_id}] 公司 {bidder_name} × 评审项 {item_name} 无匹配文件，跳过")
                        _save_evaluation_failed(db, package_id, bidder_id, pi.item_id, "无匹配文件")
                        return

                    upload_file_ids = []
                    for md_file in md_files:
                        file_path_str = md_file.file_path
                        file_path = src_dir / "data" / "package_files" / f"pkg_{package_id}" / file_path_str
                        if not file_path.exists():
                            logger.warning(f"[DIFY:{package_id}] 文件不存在：{file_path}")
                            continue

                        file_info = await dify_service.upload_file(
                            str(file_path), f"pkg_{package_no}", api_key, base_url
                        )
                        if file_info:
                            upload_file_ids.append(file_info.get("id"))
                            logger.debug(f"[DIFY:{package_id}] 文件上传成功: {md_file.file_name} -> {file_info.get('id')}")

                    if not upload_file_ids:
                        logger.warning(f"[DIFY:{package_id}] 公司 {bidder_name} × 评审项 {item_name} 文件上传全部失败")
                        _save_evaluation_failed(db, package_id, bidder_id, pi.item_id, "文件上传失败")
                        return

                    # ====== 2. 调用 Dify 工作流 ======
                    call_type = "带 workflow_id" if workflow_id else "不带 workflow_id"
                    logger.info(f"[DIFY:{package_id}] ({call_type}) 公司: {bidder_name}, 评审项: {item_name}, 文件数: {len(upload_file_ids)}")

                    upload_files = [
                        {
                            "type": "document",
                            "transfer_method": "local_file",
                            "url": "",
                            "upload_file_id": fid
                        }
                        for fid in upload_file_ids
                    ]
                    inputs = {
                        "upload_files": upload_files,
                        "input": bidder_name
                    }

                    result = await dify_service.run_workflow(
                        inputs, f"pkg_{package_no}", workflow_id, "blocking", api_key, base_url
                    )

                    if not result:
                        logger.error(f"[DIFY:{package_id}] 公司 {bidder_name} × 评审项 {item_name} 工作流执行失败，无返回结果")
                        _save_evaluation_failed(db, package_id, bidder_id, pi.item_id, "工作流执行失败")
                        return

                    # ====== 3. 解析并保存结果 ======
                    data = result.get("data", {})
                    outputs = data.get("outputs", {})
                    run_id = result.get("workflow_run_id")
                    status = data.get("status")
                    elapsed_time = data.get("elapsed_time")
                    total_tokens = data.get("total_tokens")

                    logger.info(f"[DIFY:{package_id}] 工作流完成 - Run ID: {run_id}, 状态: {status}, 公司: {bidder_name}, 评审项: {item_name}, 耗时: {elapsed_time}ms, 令牌数: {total_tokens}")

                    if outputs:
                        bidder_output = outputs.get("text") or {}
                        parsed_result = parse_dify_result(bidder_output)

                        score = parsed_result["score"]
                        reason = parsed_result["reason"]

                        logger.info(f"[DIFY:{package_id}] 公司 {bidder_name} (ID:{bidder_id}) × 评审项 {item_name} - 得分: {score}")

                        result_record = EvaluationResult(
                            package_id=package_id,
                            bidder_id=bidder_id,
                            item_id=pi.item_id,
                            score=score,
                            score_reason=reason,
                            evaluation_basis="",
                            source_filename=parsed_result["source_filename"],
                            source_page=parsed_result["source_page"],
                            source_quote=parsed_result["source_quote"],
                            evaluation_status="completed"
                        )
                        db.add(result_record)

                        wf_run = DifyWorkflowRun(
                            package_id=package_id,
                            bidder_id=bidder_id,
                            file_id=0,
                            dify_workflow_run_id=run_id,
                            status=data.get("status", "completed"),
                            outputs=json.dumps(outputs, ensure_ascii=False) if outputs else None,
                            error=data.get("error"),
                            elapsed_time=elapsed_time,
                            total_tokens=total_tokens,
                            total_steps=data.get("total_steps"),
                            finished_at=datetime.now()
                        )
                        db.add(wf_run)
                        db.commit()
                    else:
                        logger.warning(f"[DIFY:{package_id}] 公司 {bidder_name} × 评审项 {item_name} 工作流返回无输出")
                        _save_evaluation_failed(db, package_id, bidder_id, pi.item_id, "工作流无输出")

                except Exception as e:
                    logger.error(f"[DIFY:{package_id}] 公司 {bidder_name} × 评审项 {item_name} 异常: {e}")
                    logger.error(f"[DIFY:{package_id}] 异常详情: {traceback.format_exc()}")
                    _save_evaluation_failed(db, package_id, bidder_id, pi.item_id, str(e))
                finally:
                    db.close()

        # ====== 构建按评审项分组的并发任务：先按评审项并发，再按公司并发 ======
        async def evaluate_item_group(pi, item, bidders, bound_filenames, api_key, base_url, workflow_id):
            """单个评审项下所有公司的评估（受公司级信号量控制）"""
            company_semaphore = asyncio.Semaphore(max_concurrency)
            tasks = [
                evaluate_company_item(pi, item, bidder, bound_filenames, api_key, base_url, workflow_id, company_semaphore)
                for bidder in bidders
            ]
            await asyncio.gather(*tasks)

        item_tasks = []
        for pi in package_items:
            for item in items:
                if item.id != pi.item_id:
                    continue

                api_key = item.api_key or config.DIFY_API_KEY
                base_url = item.base_url or config.DIFY_BASE_URL
                workflow_id = item.workflow_id

                if not api_key:
                    logger.warning(f"[DIFY:{package_id}] 评审项 {item.item_name} 未配置 API Key，跳过该评审项")
                    for bidder in bidders:
                        _save_evaluation_failed(db, package_id, bidder.id, pi.item_id, "API Key 未配置")
                    continue

                bound_filenames = [f.file_name for f in item.files] if item.files else []
                logger.info(f"[DIFY:{package_id}] 评审项 [{item.item_code}] {item.item_name} 绑定文件: {bound_filenames or '无'}")

                item_tasks.append(
                    evaluate_item_group(pi, item, bidders, bound_filenames, api_key, base_url, workflow_id)
                )

        # ====== 按评审项并发执行（默认全部评审项同时发起） ======
        logger.info(f"[DIFY:{package_id}] 按评审项分组并发 - {len(items)} 个评审项同时发起，单个评审项内公司并发上限: {max_concurrency}")
        await asyncio.gather(*item_tasks)

        # ====== 统计结果 ======
        package = db.query(Package).filter(Package.id == package_id).first()
        total_items = len(package_items)
        expected_total = len(bidders) * total_items  # 公司 × 评审项 = 期望的总结果数

        actual_total = db.query(EvaluationResult).filter(
            EvaluationResult.package_id == package_id
        ).count()

        failed_count = db.query(EvaluationResult).filter(
            EvaluationResult.package_id == package_id,
            EvaluationResult.evaluation_status == "failed"
        ).count()

        completed_count = db.query(EvaluationResult).filter(
            EvaluationResult.package_id == package_id,
            EvaluationResult.evaluation_status == "completed"
        ).count()

        # 所有 (公司×评审项) 都已执行完 → 包已完成（单个任务失败不影响包状态）
        package.evaluation_status = "completed"
        db.commit()

        logger.info(f"[DIFY:{package_id}] === Dify 评审完成 ===")
        logger.info(f"[DIFY:{package_id}] 项目: {project_code} - {project_name}")
        logger.info(f"[DIFY:{package_id}] 标段: {section_code} - {section_name}")
        logger.info(f"[DIFY:{package_id}] 包号: {package_no}")
        logger.info(f"[DIFY:{package_id}] 并发上限: {max_concurrency}")
        logger.info(f"[DIFY:{package_id}] 评审状态: {package.evaluation_status}")
        logger.info(f"[DIFY:{package_id}] 期望 {expected_total} 条，实际 {actual_total} 条，完成 {completed_count}，失败 {failed_count}")

        for bidder in bidders:
            total_score = db.query(EvaluationResult).filter(
                EvaluationResult.package_id == package_id,
                EvaluationResult.bidder_id == bidder.id,
                EvaluationResult.evaluation_status == "completed"
            ).with_entities(EvaluationResult.score).all()
            bidder_total = sum(s[0] or 0 for s in total_score)
            logger.info(f"[DIFY:{package_id}]   - {bidder.company_name} (ID:{bidder.id}): 总分 = {bidder_total}")

        logger.info(f"[DIFY:{package_id}] === Dify 评审流程结束 ===")

    except Exception as e:
        logger.error(f"[DIFY:{package_id}] === Dify 评审异常 ===")
        logger.error(f"[DIFY:{package_id}] 项目: {project_code} - {project_name}")
        logger.error(f"[DIFY:{package_id}] 标段: {section_code} - {section_name}")
        logger.error(f"[DIFY:{package_id}] 包号: {package_no}")
        logger.error(f"[DIFY:{package_id}] 异常信息: {e}")
        logger.error(f"[DIFY:{package_id}] 异常详情: {traceback.format_exc()}")
        try:
            pkg = db.query(Package).filter(Package.id == package_id).first()
            if pkg:
                pkg.evaluation_status = "completed"
                db.commit()
        except Exception as commit_e:
            logger.error(f"[DIFY:{package_id}] 更新状态失败: {commit_e}")
    finally:
        db_session.remove()


def _save_evaluation_failed(db, package_id, bidder_id, item_id, error_message="Dify 工作流执行失败"):
    """标记单个 (公司 × 评审项) 组合评估为失败"""
    try:
        result = EvaluationResult(
            package_id=package_id,
            bidder_id=bidder_id,
            item_id=item_id,
            score=0,
            score_reason=error_message,
            evaluation_status="failed"
        )
        db.add(result)
        db.commit()
    except Exception as e:
        logger.error(f"标记评审失败异常: {e}")


@router.get("/evaluation-progress-summary")
def get_all_packages_evaluation_progress():
    """批量获取所有包的评审进度摘要（一次查询，避免 N+1 请求）"""
    db = db_session()
    try:
        # 获取所有包及其关联的项目/标段信息
        packages = db.query(Package).all()

        # 获取所有评审项配置（package_id → 评审项数）
        all_package_items = db.query(PackageItem).all()
        items_count_map: Dict[int, int] = {}
        for pi in all_package_items:
            items_count_map[pi.package_id] = items_count_map.get(pi.package_id, 0) + 1

        # 获取所有评审结果，一次性按 package_id + bidder_id 聚合
        all_results = db.query(EvaluationResult).all()
        
        # 聚合结构: {package_id: {bidder_id: {completed: n, failed: n, total_score: float}}}
        from collections import defaultdict
        pkg_bidder_stats: Dict[int, Dict[int, Dict[str, Any]]] = defaultdict(lambda: defaultdict(lambda: {
            "completed": 0, "failed": 0, "total_score": 0.0
        }))
        
        for r in all_results:
            stats = pkg_bidder_stats[r.package_id][r.bidder_id]
            if r.evaluation_status == "completed":
                stats["completed"] += 1
                stats["total_score"] += (r.score or 0)
            elif r.evaluation_status == "failed":
                stats["failed"] += 1

        # 构建返回结果
        result = []
        for package in packages:
            bidder_list = db.query(Bidder).filter(Bidder.package_id == package.id).all()
            total_items = items_count_map.get(package.id, 0)
            bidder_stats = pkg_bidder_stats.get(package.id, {})

            bidder_progress_list = []
            for bidder in bidder_list:
                stats = bidder_stats.get(bidder.id, {"completed": 0, "failed": 0, "total_score": 0.0})
                progress_pct = round((stats["completed"] + stats["failed"]) / total_items * 100, 1) if total_items > 0 else 0
                bidder_progress_list.append({
                    "bidder_id": bidder.id,
                    "company_name": bidder.company_name,
                    "completed_items": stats["completed"],
                    "failed_items": stats["failed"],
                    "total_items": total_items,
                    "progress_pct": progress_pct,
                    "total_score": round(stats["total_score"], 2)
                })

            result.append({
                "package_id": package.id,
                "package_no": package.package_no,
                "evaluation_status": package.evaluation_status or "pending",
                "total_bidders": len(bidder_list),
                "total_items": total_items,
                "bidder_progress": bidder_progress_list
            })

        return result
    finally:
        db_session.remove()


@router.get("/{package_id}/evaluation-progress")
def get_evaluation_progress(package_id: int):
    """获取包评审进度"""
    db = db_session()
    try:
        package = db.query(Package).filter(Package.id == package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")
        
        bidders = db.query(Bidder).filter(Bidder.package_id == package_id).all()
        package_items = db.query(PackageItem).filter(PackageItem.package_id == package_id).all()
        
        total_bidders = len(bidders)
        total_items = len(package_items)
        
        # 每个投标人的评审项完成情况
        bidder_progress = []
        for bidder in bidders:
            completed = db.query(EvaluationResult).filter(
                EvaluationResult.package_id == package_id,
                EvaluationResult.bidder_id == bidder.id,
                EvaluationResult.evaluation_status == "completed"
            ).count()
            
            failed = db.query(EvaluationResult).filter(
                EvaluationResult.package_id == package_id,
                EvaluationResult.bidder_id == bidder.id,
                EvaluationResult.evaluation_status == "failed"
            ).count()
            
            for pi in package_items:
                has_result = db.query(EvaluationResult).filter(
                    EvaluationResult.package_id == package_id,
                    EvaluationResult.bidder_id == bidder.id,
                    EvaluationResult.item_id == pi.item_id
                ).first()
                break
            
            bidder_progress.append({
                "bidder_id": bidder.id,
                "company_name": bidder.company_name,
                "completed_items": completed,
                "failed_items": failed,
                "total_items": total_items,
                "progress_pct": round(completed / total_items * 100, 1) if total_items > 0 else 0,
                "total_score": bidder.total_score or 0.0
            })
        
        return {
            "package_id": package_id,
            "package_no": package.package_no,
            "evaluation_status": package.evaluation_status or "pending",
            "total_bidders": total_bidders,
            "total_items": total_items,
            "bidder_progress": bidder_progress
        }
    finally:
        db_session.remove()


@router.get("/{package_id}/evaluation-detail/{bidder_id}")
def get_bidder_evaluation_detail(package_id: int, bidder_id: int):
    """获取某个投标人的评审详情（每个评审项的得分、理由、依据）"""
    db = db_session()
    try:
        results = db.query(EvaluationResult).filter(
            EvaluationResult.package_id == package_id,
            EvaluationResult.bidder_id == bidder_id
        ).all()
        
        items_list = []
        for r in results:
            items_list.append(r.to_dict())
        
        bidder = db.query(Bidder).filter(Bidder.id == bidder_id).first()
        
        return {
            "bidder_id": bidder_id,
            "company_name": bidder.company_name if bidder else "",
            "items": items_list
        }
    finally:
        db_session.remove()


@router.post("/{package_id}/rerun-failed")
async def rerun_failed_evaluations(package_id: int, background_tasks: BackgroundTasks):
    """批量重跑包下所有失败的评审项
    
    找出所有 evaluation_status='failed' 的评审结果，重新调用 Dify 工作流进行评审。
    """
    db = db_session()
    try:
        package = db.query(Package).filter(Package.id == package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")
        
        # 防止并发：如果正在评审中，不允许触发重跑
        if package.evaluation_status == "evaluating":
            raise HTTPException(
                status_code=400,
                detail="评审正在进行中，请等待当前评审完成后再重跑失败项"
            )
        
        # 查找所有失败的评审结果
        failed_results = db.query(EvaluationResult).filter(
            EvaluationResult.package_id == package_id,
            EvaluationResult.evaluation_status == "failed"
        ).all()
        
        if not failed_results:
            raise HTTPException(status_code=400, detail="当前没有失败的评审项需要重跑")
        
        # 按 (bidder_id, item_id) 去重得到需要重跑的组合
        rerun_items = []
        seen = set()
        for fr in failed_results:
            key = (fr.bidder_id, fr.item_id)
            if key not in seen:
                seen.add(key)
                rerun_items.append({
                    "bidder_id": fr.bidder_id,
                    "item_id": fr.item_id
                })
        
        logger.info(f"[RERUN:{package_id}] 找到 {len(failed_results)} 条失败记录，去重后 {len(rerun_items)} 个需要重跑的组合")
        
        # 先清除旧的失败记录
        db.query(EvaluationResult).filter(
            EvaluationResult.package_id == package_id,
            EvaluationResult.evaluation_status == "failed"
        ).delete(synchronize_session=False)
        db.commit()
        logger.info(f"[RERUN:{package_id}] 已清除旧失败记录")
        
        # 更新包状态为 evaluating
        package.evaluation_status = "evaluating"
        db.commit()
        
        # 后台执行重跑
        background_tasks.add_task(run_rerun_failed_evaluation, package_id, rerun_items)
        
        return {
            "message": f"已开始重跑 {len(rerun_items)} 个失败评审项",
            "rerun_count": len(rerun_items)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[RERUN:{package_id}] 启动重跑失败: {e}")
        raise HTTPException(status_code=500, detail=f"重跑启动失败：{str(e)}")
    finally:
        db_session.remove()


async def run_rerun_failed_evaluation(package_id: int, rerun_items: list):
    """后台执行失败项重跑

    并发模型与正常启动评审一致：
    - 按评审项分组，所有评审项同时发起（asyncio.gather）
    - 单个评审项内的多家公司，按包配置的 max_concurrency 控制并发上限

    Args:
        package_id: 包ID
        rerun_items: 需要重跑的项列表，每项包含 bidder_id 和 item_id
    """
    db = db_session()
    try:
        package = db.query(Package).filter(Package.id == package_id).first()
        if not package:
            logger.error(f"[RERUN:{package_id}] 包不存在")
            return

        max_concurrency = package.max_concurrency or 1
        src_dir = Path(__file__).parent.parent

        logger.info(f"[RERUN:{package_id}] === 开始重跑失败评审项 ===")
        logger.info(f"[RERUN:{package_id}] 待重跑项数: {len(rerun_items)}, 公司级并发上限: {max_concurrency}")

        async def rerun_company_item(bidder_id: int, item_id: int, company_semaphore: asyncio.Semaphore):
            """重跑单个 (投标人 × 评审项) 组合，受公司级信号量控制"""
            async with company_semaphore:
                db_local = SessionLocal()
                try:
                    bidder = db_local.query(Bidder).filter(Bidder.id == bidder_id).first()
                    if not bidder:
                        logger.warning(f"[RERUN:{package_id}] 投标人 {bidder_id} 不存在，跳过")
                        _save_evaluation_failed(db_local, package_id, bidder_id, item_id, "投标人不存在")
                        return

                    item = db_local.query(EvaluationItem).filter(EvaluationItem.id == item_id).first()
                    if not item:
                        logger.warning(f"[RERUN:{package_id}] 评审项 {item_id} 不存在，跳过")
                        _save_evaluation_failed(db_local, package_id, bidder_id, item_id, "评审项不存在")
                        return

                    api_key = item.api_key or config.DIFY_API_KEY
                    base_url = item.base_url or config.DIFY_BASE_URL
                    workflow_id = item.workflow_id

                    if not api_key:
                        logger.warning(f"[RERUN:{package_id}] 评审项 {item.item_name} 未配置 API Key")
                        _save_evaluation_failed(db_local, package_id, bidder_id, item_id, "API Key 未配置")
                        return

                    logger.info(f"[RERUN:{package_id}] 重跑: 投标人={bidder.company_name}, 评审项={item.item_name}")

                    bound_filenames = [f.file_name for f in item.files] if item.files else []

                    # 查找匹配的 MD 文件
                    md_files_query = db_local.query(BidderFile).filter(
                        BidderFile.bidder_id == bidder_id,
                        BidderFile.file_type == "md",
                        BidderFile.parse_status == "completed"
                    )

                    if bound_filenames:
                        import fnmatch
                        matched_files = []
                        for md_file in md_files_query.all():
                            for bound_name in bound_filenames:
                                pattern = bound_name if ('*' in bound_name or '?' in bound_name) else f"*{bound_name}*"
                                if fnmatch.fnmatch(md_file.file_name, pattern):
                                    matched_files.append(md_file)
                                    break
                        md_files = matched_files
                    else:
                        md_files = md_files_query.all()

                    if not md_files:
                        logger.warning(f"[RERUN:{package_id}] 投标人 {bidder.company_name} 无匹配文件")
                        _save_evaluation_failed(db_local, package_id, bidder_id, item_id, "无匹配文件")
                        return

                    upload_file_ids = []
                    for md_file in md_files:
                        file_path = src_dir / "data" / "package_files" / f"pkg_{package_id}" / md_file.file_path
                        if not file_path.exists():
                            logger.warning(f"[RERUN:{package_id}] 文件不存在：{file_path}")
                            continue
                        file_info = await dify_service.upload_file(
                            str(file_path), f"pkg_{package.package_no}", api_key, base_url
                        )
                        if file_info:
                            upload_file_ids.append(file_info.get("id"))

                    if not upload_file_ids:
                        logger.warning(f"[RERUN:{package_id}] 投标人 {bidder.company_name} 文件上传全部失败")
                        _save_evaluation_failed(db_local, package_id, bidder_id, item_id, "文件上传失败")
                        return

                    # 调用 Dify 工作流
                    upload_files = [
                        {"type": "document", "transfer_method": "local_file", "url": "", "upload_file_id": fid}
                        for fid in upload_file_ids
                    ]
                    inputs = {"upload_files": upload_files, "input": bidder.company_name}

                    result = await dify_service.run_workflow(
                        inputs, f"pkg_{package.package_no}", workflow_id, "blocking", api_key, base_url
                    )

                    if not result:
                        logger.error(f"[RERUN:{package_id}] 投标人 {bidder.company_name} × {item.item_name} 工作流执行失败")
                        _save_evaluation_failed(db_local, package_id, bidder_id, item_id, "工作流执行失败")
                        return

                    data = result.get("data", {})
                    outputs = data.get("outputs", {})
                    run_id = result.get("workflow_run_id")
                    status = data.get("status")
                    elapsed_time = data.get("elapsed_time")
                    total_tokens = data.get("total_tokens")

                    logger.info(f"[RERUN:{package_id}] 工作流完成 - Run ID: {run_id}, 状态: {status}, 投标人: {bidder.company_name}, 评审项: {item.item_name}")

                    if outputs:
                        bidder_output = outputs.get("text") or {}
                        parsed_result = parse_dify_result(bidder_output)

                        result_record = EvaluationResult(
                            package_id=package_id,
                            bidder_id=bidder_id,
                            item_id=item_id,
                            score=parsed_result["score"],
                            score_reason=parsed_result["reason"],
                            evaluation_basis="",
                            source_filename=parsed_result["source_filename"],
                            source_page=parsed_result["source_page"],
                            source_quote=parsed_result["source_quote"],
                            evaluation_status="completed"
                        )
                        db_local.add(result_record)
                        db_local.add(DifyWorkflowRun(
                            package_id=package_id,
                            bidder_id=bidder_id,
                            file_id=0,
                            dify_workflow_run_id=run_id,
                            status=data.get("status", "completed"),
                            outputs=json.dumps(outputs, ensure_ascii=False) if outputs else None,
                            error=data.get("error"),
                            elapsed_time=elapsed_time,
                            total_tokens=total_tokens,
                            total_steps=data.get("total_steps"),
                            finished_at=datetime.now()
                        ))
                        db_local.commit()
                        logger.info(f"[RERUN:{package_id}] 投标人 {bidder.company_name} × {item.item_name} 重跑成功，得分: {parsed_result['score']}")
                    else:
                        logger.warning(f"[RERUN:{package_id}] 投标人 {bidder.company_name} × {item.item_name} 工作流返回无输出")
                        _save_evaluation_failed(db_local, package_id, bidder_id, item_id, "工作流无输出")

                except Exception as e:
                    logger.error(f"[RERUN:{package_id}] 重跑异常: 投标人 {bidder_id} × 评审项 {item_id}: {e}")
                    logger.error(f"[RERUN:{package_id}] 异常详情: {traceback.format_exc()}")
                    try:
                        _save_evaluation_failed(db_local, package_id, bidder_id, item_id, str(e))
                    except:
                        pass
                finally:
                    db_local.close()

        async def rerun_item_group(item_id: int, bidder_ids: list):
            """单个评审项下所有公司的重跑（受公司级信号量控制）"""
            company_semaphore = asyncio.Semaphore(max_concurrency)
            tasks = [
                rerun_company_item(bidder_id, item_id, company_semaphore)
                for bidder_id in bidder_ids
            ]
            await asyncio.gather(*tasks)

        # ====== 按评审项分组 ======
        from collections import defaultdict
        item_groups = defaultdict(list)
        for ri in rerun_items:
            item_groups[ri["item_id"]].append(ri["bidder_id"])

        logger.info(f"[RERUN:{package_id}] 按评审项分组并发 - {len(item_groups)} 个评审项同时发起，单个评审项内公司并发上限: {max_concurrency}")
        for item_id, bidder_ids in item_groups.items():
            logger.info(f"[RERUN:{package_id}]   评审项 {item_id}: {len(bidder_ids)} 家公司")

        item_tasks = [
            rerun_item_group(item_id, bidder_ids)
            for item_id, bidder_ids in item_groups.items()
        ]
        await asyncio.gather(*item_tasks)

        # ====== 更新包状态 ======
        db = db_session()
        try:
            package = db.query(Package).filter(Package.id == package_id).first()
            if package:
                bidders = db.query(Bidder).filter(Bidder.package_id == package_id).all()
                package_items = db.query(PackageItem).filter(PackageItem.package_id == package_id).all()
                expected_total = len(bidders) * len(package_items)

                actual_total = db.query(EvaluationResult).filter(
                    EvaluationResult.package_id == package_id
                ).count()

                failed_count = db.query(EvaluationResult).filter(
                    EvaluationResult.package_id == package_id,
                    EvaluationResult.evaluation_status == "failed"
                ).count()

                completed_count = db.query(EvaluationResult).filter(
                    EvaluationResult.package_id == package_id,
                    EvaluationResult.evaluation_status == "completed"
                ).count()

                package.evaluation_status = "completed"
                db.commit()

                logger.info(f"[RERUN:{package_id}] === 重跑完成 ===")
                logger.info(f"[RERUN:{package_id}] 期望 {expected_total} 条，实际 {actual_total} 条，完成 {completed_count}，失败 {failed_count}")
                logger.info(f"[RERUN:{package_id}] 最终状态: {package.evaluation_status}")
        finally:
            db_session.remove()

    except Exception as e:
        logger.error(f"[RERUN:{package_id}] === 重跑异常 ===")
        logger.error(f"[RERUN:{package_id}] 异常信息: {e}")
        logger.error(f"[RERUN:{package_id}] 异常详情: {traceback.format_exc()}")
        try:
            db2 = db_session()
            pkg = db2.query(Package).filter(Package.id == package_id).first()
            if pkg:
                pkg.evaluation_status = "completed"
                db2.commit()
            db_session.remove()
        except:
            pass
    finally:
        db_session.remove()


class RerunItemRequest(BaseModel):
    bidder_id: int
    item_id: int


@router.post("/{package_id}/rerun-item")
async def rerun_single_item(
    package_id: int,
    request: RerunItemRequest,
    background_tasks: BackgroundTasks
):
    """重跑单个评审项 (投标人 × 评审项) - 支持任意状态的评审结果

    删除该组合的旧记录（无论状态），重新调用 Dify 工作流。
    """
    db = db_session()
    try:
        package = db.query(Package).filter(Package.id == package_id).first()
        if not package:
            raise HTTPException(status_code=404, detail="包不存在")

        if package.evaluation_status == "evaluating":
            raise HTTPException(
                status_code=400,
                detail="评审正在进行中，请等待当前评审完成后再重跑"
            )

        # 删除该组合的旧记录（不限状态）
        deleted_count = db.query(EvaluationResult).filter(
            EvaluationResult.package_id == package_id,
            EvaluationResult.bidder_id == request.bidder_id,
            EvaluationResult.item_id == request.item_id,
        ).delete(synchronize_session=False)

        if deleted_count == 0:
            raise HTTPException(status_code=400, detail="未找到该组合的评审记录")

        db.query(DifyWorkflowRun).filter(
            DifyWorkflowRun.package_id == package_id,
            DifyWorkflowRun.bidder_id == request.bidder_id,
        ).filter(
            DifyWorkflowRun.file_id == 0
        ).delete(synchronize_session=False)

        package.evaluation_status = "evaluating"
        db.commit()
        logger.info(f"[RERUN:{package_id}] 单个重跑: bidder={request.bidder_id}, item={request.item_id}")

        rerun_items = [{"bidder_id": request.bidder_id, "item_id": request.item_id}]
        background_tasks.add_task(run_rerun_failed_evaluation, package_id, rerun_items)

        bidder = db.query(Bidder).filter(Bidder.id == request.bidder_id).first()
        item = db.query(EvaluationItem).filter(EvaluationItem.id == request.item_id).first()

        return {
            "message": f"已开始重跑：{bidder.company_name if bidder else '未知'} × {item.item_name if item else '未知'}",
            "rerun_count": 1
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[RERUN:{package_id}] 单个重跑失败: {e}")
        raise HTTPException(status_code=500, detail=f"重跑失败：{str(e)}")
    finally:
        db_session.remove()
