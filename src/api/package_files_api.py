"""包文件上传API"""
from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Dict, Optional
from loguru import logger
from datetime import datetime
import os
import json
import zipfile
import shutil
import threading
from pathlib import Path

from models.project_structure import Package, Bidder
from models.bidder_files import BidderFile, PackageFileUpload
from models.database import db_session, SessionLocal
from models.evaluation_items import PackageItem, EvaluationItem
from models.evaluation_results import EvaluationResult
from models.dify_workflow import DifyWorkflowRun
from services.dify_service import dify_service
from config import config

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
        db.close()


def find_company_folders(root_dir: Path) -> List[Path]:
    """递归查找所有公司文件夹（文件夹名包含"公司"字样）"""
    company_folders = []
    try:
        for item in root_dir.iterdir():
            if item.is_dir():
                if '公司' in item.name:
                    company_folders.append(item)
                else:
                    company_folders.extend(find_company_folders(item))
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


def process_package_files(package_id: int, upload_id: int, zip_path: str, stop_event: threading.Event):
    """后台处理包文件解析（两阶段：先扫描入库，再逐个转换PDF）"""
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
        
        # 解压ZIP文件
        src_dir = Path(__file__).parent.parent
        extract_dir = src_dir / "data" / "package_files" / f"pkg_{package_id}"
        extract_dir.mkdir(parents=True, exist_ok=True)
        
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
        
        # 修复文件名编码
        fix_filenames(extract_dir)
        
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
            del parse_threads[(package_id, upload_id)]
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
        db.close()
        # 清理线程记录
        del parse_threads[(package_id, upload_id)]


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
        ('cp437', 'gbk'),
        ('cp437', 'utf-8'),
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
        
        # 查找所有图片链接（完整匹配串 + 路径 + 扩展名）
        image_pattern = r'!\[.*?\]\(([^)]+\.(png|jpg|jpeg|gif))\)'
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
        
        # 如果有图片，进行 OCR 识别并替换
        if image_matches:
            ocr_service = OCRService()
            
            for full_match, image_rel_path, image_ext in image_matches:
                # 图片的完整路径
                image_full_path = temp_output_dir / image_rel_path
                
                if not image_full_path.exists():
                    logger.warning(f"图片文件不存在: {image_full_path}")
                    continue
                
                logger.info(f"正在 OCR 识别图片: {image_rel_path}")
                
                # OCR 识别
                ocr_text = ocr_service.ocr_image(str(image_full_path))
                
                if ocr_text and "OCR 识别失败" not in ocr_text:
                    # 清理 OCR 文本，移除多余空行
                    ocr_text = re.sub(r'\n{3,}', '\n\n', ocr_text.strip())
                    
                    # 在 markdown 中添加 OCR 内容标识
                    ocr_section = f"\n\n**[图片内容 OCR 识别]**\n\n{ocr_text}\n\n"
                    
                    # 用 str.replace 精确替换（避免 re.sub 中 OCR 文本含特殊字符时报错）
                    md_content = md_content.replace(full_match, ocr_section)
                    
                    completed_images += 1
                    
                    # 更新 OCR 进度（使用独立 session）
                    if md_file_id:
                        _update_ocr_status(md_file_id, ocr_completed_images=completed_images)
                    
                    logger.info(f"图片 OCR 识别成功: {image_rel_path}")
                else:
                    logger.warning(f"图片 OCR 识别失败: {image_rel_path}")
        
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
async def get_upload_status(package_id: int, upload_id: int):
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
        db.close()


@router.get("/{package_id}/bidders/{bidder_id}/files")
async def get_bidder_files(package_id: int, bidder_id: int):
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
        db.close()


@router.get("/{package_id}/bidders/{bidder_id}/file-tree")
async def get_bidder_file_tree(package_id: int, bidder_id: int):
    """获取投标人的文件树结构"""
    db = db_session()
    try:
        # 验证投标人属于该包
        bidder = db.query(Bidder).filter(
            Bidder.id == bidder_id,
            Bidder.package_id == package_id
        ).first()
        
        if not bidder:
            raise HTTPException(status_code=404, detail="投标人不存在")
        
        # 从文件系统直接读取文件树（使用绝对路径）
        src_dir = Path(__file__).parent.parent
        package_files_dir = src_dir / "data" / "package_files" / f"pkg_{package_id}" / "投标文件"
        
        # 由于数据库中公司名称可能是乱码，直接遍历文件系统找到匹配的文件夹
        company_folder = None
        if package_files_dir.exists():
            for item in package_files_dir.iterdir():
                if item.is_dir():
                    # 检查该文件夹下的文件是否属于该投标人
                    for sub_item in item.rglob('*'):
                        if sub_item.is_file():
                            file_name = sub_item.name
                            # 尝试匹配数据库中的文件记录
                            file_record = db.query(BidderFile).filter(
                                BidderFile.bidder_id == bidder_id,
                                BidderFile.file_name.like(f"%{file_name}%")
                            ).first()
                            if file_record:
                                company_folder = item
                                break
                    if company_folder:
                        break
        
        # 如果没找到匹配的文件夹，尝试使用乱码名称
        if company_folder is None:
            company_folder = package_files_dir / bidder.company_name
        
        # 构建文件树的辅助函数
        def build_tree(path: Path, parent_path: Path = None):
            tree = []
            if not path.exists():
                return tree
            
            # 获取所有子项并排序（文件夹在前，文件在后）
            items = sorted(path.iterdir(), key=lambda x: (x.is_file(), x.name))
            
            for item in items:
                rel_path = item.relative_to(parent_path) if parent_path else item
                key = str(rel_path).replace('\\', '/')
                title = item.name
                
                if item.is_dir():
                    children = build_tree(item, parent_path) if parent_path else build_tree(item, item)
                    tree.append({
                        "key": key,
                        "title": title,
                        "type": "folder",
                        "children": children if children else [],
                        "file_id": None,
                        "file_type": None,
                        "file_size": None,
                        "parse_status": None
                    })
                else:
                    # 查找对应的数据库记录
                    file_record = None
                    try:
                        # 尝试多种路径匹配
                        rel_to_package = item.relative_to(package_files_dir)
                        file_path_str = str(rel_to_package).replace('\\', '/')
                        file_record = db.query(BidderFile).filter(
                            BidderFile.bidder_id == bidder_id,
                            BidderFile.file_path.like(f"%{item.name}")
                        ).first()
                    except:
                        pass
                    
                    tree.append({
                        "key": key,
                        "title": title,
                        "type": "file",
                        "children": None,
                        "file_id": file_record.id if file_record else None,
                        "file_type": file_record.file_type if file_record else item.suffix.lower()[1:] if item.suffix else "other",
                        "file_size": item.stat().st_size,
                        "parse_status": file_record.parse_status if file_record else "completed"
                    })
            
            return tree
        
        # 直接从文件系统读取公司文件夹下的内容
        file_tree = []
        if company_folder.exists():
            file_tree = build_tree(company_folder, company_folder)
        
        return {
            "bidder_id": bidder_id,
            "company_name": bidder.company_name,
            "file_tree": file_tree
        }
    finally:
        db.close()


@router.delete("/{package_id}/bidders/{bidder_id}/files/{file_id}")
async def delete_bidder_file(package_id: int, bidder_id: int, file_id: int):
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
        db.close()


@router.get("/{package_id}/upload-history")
async def get_upload_history(package_id: int):
    """获取包的文件上传历史"""
    db = db_session()
    try:
        uploads = db.query(PackageFileUpload).filter(
            PackageFileUpload.package_id == package_id
        ).order_by(PackageFileUpload.created_at.desc()).all()
        
        return [u.to_dict() for u in uploads]
    finally:
        db.close()


@router.delete("/{package_id}/files")
async def delete_package_files(package_id: int):
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
        db.close()


@router.get("/{package_id}/files/{file_id}/preview")
async def preview_file(package_id: int, file_id: int):
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
        
        # 清理文件路径，移除可能包含的 pkg_N\ 前缀
        file_path_str = file.file_path
        if file_path_str.startswith(f"pkg_{package_id}\\"):
            file_path_str = file_path_str[len(f"pkg_{package_id}\\"):]
        elif file_path_str.startswith(f"pkg_{package_id}/"):
            file_path_str = file_path_str[len(f"pkg_{package_id}/"):]
        
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
        db.close()


@router.get("/{package_id}/files/{file_id}/content")
async def get_file_content(package_id: int, file_id: int):
    """获取文件内容（用于抽屉预览）"""
    db = db_session()
    try:
        # 获取文件记录
        file = db.query(BidderFile).filter(BidderFile.id == file_id).first()
        
        if not file:
            raise HTTPException(status_code=404, detail="文件不存在")
        
        # 获取完整文件路径
        src_dir = Path(__file__).parent.parent
        
        # 清理文件路径，移除可能包含的 pkg_N\ 前缀
        file_path_str = file.file_path
        if file_path_str.startswith(f"pkg_{package_id}\\"):
            file_path_str = file_path_str[len(f"pkg_{package_id}\\"):]
        elif file_path_str.startswith(f"pkg_{package_id}/"):
            file_path_str = file_path_str[len(f"pkg_{package_id}/"):]
        
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
        db.close()


@router.get("/{package_id}/conversion-status")
async def get_package_conversion_status(package_id: int):
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
        db.close()


@router.post("/{package_id}/reconvert")
async def reconvert_package_pdfs(package_id: int):
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
        db.close()


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
                
                # 清理文件路径，移除可能包含的 pkg_N\ 前缀
                file_path_str = bidder_file.file_path
                if file_path_str.startswith(f"pkg_{package_id}\\"):
                    file_path_str = file_path_str[len(f"pkg_{package_id}\\"):]
                elif file_path_str.startswith(f"pkg_{package_id}/"):
                    file_path_str = file_path_str[len(f"pkg_{package_id}/"):]
                
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
        db.close()
        del parse_threads[(package_id, upload_id)]


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
        items_without_workflow = [i for i in items if not i.workflow_id]
        if items_without_workflow:
            names = ', '.join(i.item_name for i in items_without_workflow)
            raise HTTPException(status_code=400, detail=f"以下评审项未配置 Dify 工作流 ID：{names}")
        
        bidders = db.query(Bidder).filter(Bidder.package_id == package_id).all()
        if not bidders:
            raise HTTPException(status_code=400, detail="该包下没有投标人")
        
        conversion_status = await get_package_conversion_status(package_id)
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
        
        background_tasks.add_task(run_dify_evaluation, package_id)
        logger.info(f"包{package_id} Dify 评审已启动")
        return {"message": "评审已启动，正在通过 Dify 工作流进行评审"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"启动 Dify 评审失败: {e}")
        raise HTTPException(status_code=500, detail=f"启动失败：{str(e)}")
    finally:
        db.close()


async def run_dify_evaluation(package_id: int):
    """后台执行 Dify 评审
    按评审项分组，每个评审项对应一个 Dify 工作流，
    所有公司的文件一起上传，并发执行不同评审项的工作流
    """
    db = db_session()
    try:
        logger.info(f"[DIFY:{package_id}] 开始 Dify 评审")
        
        package = db.query(Package).filter(Package.id == package_id).first()
        if not package:
            return
        package_no = package.package_no
        
        bidders = db.query(Bidder).filter(Bidder.package_id == package_id).all()
        package_items = db.query(PackageItem).filter(PackageItem.package_id == package_id).all()
        item_ids = [pi.item_id for pi in package_items]
        items = db.query(EvaluationItem).filter(EvaluationItem.id.in_(item_ids)).all() if item_ids else []
        
        src_dir = Path(__file__).parent.parent
        
        async def evaluate_item(pi, item):
            """评估单个评审项下的所有公司"""
            workflow_id = item.workflow_id
            if not workflow_id:
                logger.warning(f"[DIFY:{package_id}] 评审项 {item.item_name} 未配置 workflow_id，跳过")
                return
            
            try:
                # 构建公司+文件列表
                company_files = []
                for bidder in bidders:
                    md_files = db.query(BidderFile).filter(
                        BidderFile.bidder_id == bidder.id,
                        BidderFile.file_type == "md",
                        BidderFile.parse_status == "completed"
                    ).all()
                    
                    if not md_files:
                        continue
                    
                    file_infos = []
                    for md_file in md_files:
                        file_path_str = md_file.file_path
                        if file_path_str.startswith(f"pkg_{package_id}\\"):
                            file_path_str = file_path_str[len(f"pkg_{package_id}\\"):]
                        elif file_path_str.startswith(f"pkg_{package_id}/"):
                            file_path_str = file_path_str[len(f"pkg_{package_id}/"):]
                        
                        file_path = src_dir / "data" / "package_files" / f"pkg_{package_id}" / file_path_str
                        if not file_path.exists():
                            continue
                        
                        # 上传文件到 Dify
                        file_info = await dify_service.upload_file(str(file_path), f"pkg_{package_no}")
                        if file_info:
                            file_infos.append({
                                "file_name": md_file.file_name,
                                "upload_file_id": file_info.get("id"),
                                "bidder_id": bidder.id,
                                "bidder_name": bidder.company_name
                            })
                    
                    if file_infos:
                        company_files.append({
                            "bidder_id": bidder.id,
                            "bidder_name": bidder.company_name,
                            "files": file_infos
                        })
                
                if not company_files:
                    logger.warning(f"[DIFY:{package_id}] 评审项 {item.item_name} 无有效文件")
                    return
                
                # 调用 Dify 工作流
                logger.info(f"[DIFY:{package_id}] 执行评审项 {item.item_name} (workflow={workflow_id})，{len(company_files)} 家公司")
                
                inputs = {
                    "evaluation_item": item.item_name,
                    "item_code": item.item_code,
                    "company_files": json.dumps(company_files, ensure_ascii=False)
                }
                
                result = await dify_service.run_workflow(inputs, f"pkg_{package_no}", workflow_id)
                
                if not result:
                    logger.error(f"[DIFY:{package_id}] 评审项 {item.item_name} 工作流执行失败")
                    _mark_item_evaluation_failed(db, package_id, bidders, item)
                    return
                
                data = result.get("data", {})
                outputs = data.get("outputs", {})
                run_id = result.get("workflow_run_id")
                
                # 解析结果并存储
                if outputs:
                    for bidder in bidders:
                        # 从 outputs 中查找该公司的得分
                        bidder_output = outputs.get(str(bidder.id)) or outputs.get(bidder.company_name) or outputs.get("result", {})
                        
                        if isinstance(bidder_output, dict):
                            score = bidder_output.get("score")
                            reason = bidder_output.get("reason", "")
                            basis = bidder_output.get("basis", "")
                        elif isinstance(bidder_output, str):
                            score = 0
                            reason = bidder_output
                            basis = ""
                        else:
                            continue
                        
                        result_record = EvaluationResult(
                            package_id=package_id,
                            bidder_id=bidder.id,
                            item_id=pi.item_id,
                            score=score if score is not None else 0,
                            score_reason=str(reason),
                            evaluation_basis=str(basis),
                            evaluation_status="completed"
                        )
                        db.add(result_record)
                    
                    db.commit()
                    logger.info(f"[DIFY:{package_id}] 评审项 {item.item_name} 完成")
                else:
                    logger.warning(f"[DIFY:{package_id}] 评审项 {item.item_name} 无输出")
                
                # 记录工作流运行
                wf_run = DifyWorkflowRun(
                    package_id=package_id,
                    bidder_id=bidders[0].id if bidders else 0,
                    file_id=0,
                    dify_workflow_run_id=run_id,
                    status=data.get("status", "completed"),
                    outputs=json.dumps(outputs, ensure_ascii=False) if outputs else None,
                    error=data.get("error"),
                    elapsed_time=data.get("elapsed_time"),
                    total_tokens=data.get("total_tokens"),
                    total_steps=data.get("total_steps"),
                    finished_at=datetime.now()
                )
                db.add(wf_run)
                db.commit()
                
            except Exception as e:
                logger.error(f"[DIFY:{package_id}] 评审项 {item.item_name} 异常: {e}")
                _mark_item_evaluation_failed(db, package_id, bidders, item)
        
        # 并发执行所有评审项
        import asyncio
        tasks = [evaluate_item(pi, item) for pi in package_items for item in items if item.id == pi.item_id]
        await asyncio.gather(*tasks)
        
        # 更新包评审状态
        package = db.query(Package).filter(Package.id == package_id).first()
        total_items = len(package_items)
        completed_items = db.query(EvaluationResult).filter(
            EvaluationResult.package_id == package_id,
            EvaluationResult.evaluation_status == "completed"
        ).distinct(EvaluationResult.item_id).count()
        
        package.evaluation_status = "completed" if completed_items >= total_items else "failed"
        db.commit()
        logger.info(f"[DIFY:{package_id}] Dify 评审完成，状态：{package.evaluation_status}")
        
    except Exception as e:
        logger.error(f"[DIFY:{package_id}] Dify 评审异常: {e}")
        try:
            pkg = db.query(Package).filter(Package.id == package_id).first()
            if pkg:
                pkg.evaluation_status = "failed"
                db.commit()
        except:
            pass
    finally:
        db.close()


def _mark_item_evaluation_failed(db, package_id, bidders, item):
    """标记某个评审项下所有公司的评估为失败"""
    try:
        for bidder in bidders:
            result = EvaluationResult(
                package_id=package_id,
                bidder_id=bidder.id,
                item_id=item.id,
                score=0,
                score_reason="Dify 工作流执行失败",
                evaluation_status="failed"
            )
            db.add(result)
        db.commit()
    except Exception as e:
        logger.error(f"标记评审失败异常: {e}")


@router.get("/{package_id}/evaluation-progress")
async def get_evaluation_progress(package_id: int):
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
                "progress_pct": round(completed / total_items * 100, 1) if total_items > 0 else 0
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
        db.close()


@router.get("/{package_id}/evaluation-detail/{bidder_id}")
async def get_bidder_evaluation_detail(package_id: int, bidder_id: int):
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
        db.close()
