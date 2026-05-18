"""包文件上传API"""
from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Dict, Optional
from loguru import logger
from datetime import datetime
import os
import zipfile
import shutil
import threading
from pathlib import Path

from models.project_structure import Package, Bidder
from models.bidder_files import BidderFile, PackageFileUpload
from models.database import db_session

try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False
    logger.warning("PyMuPDF 未安装，PDF 转 MD 功能不可用")

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


def process_package_files(package_id: int, upload_id: int, zip_path: str, stop_event: threading.Event):
    """后台处理包文件解析"""
    db = db_session()
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
        
        total_files = 0
        parsed_files = 0
        unmatched_folders = []
        
        for company_folder in company_folders:
            if stop_event.is_set():
                logger.info(f"解析任务已停止：package_id={package_id}, upload_id={upload_id}")
                break
            
            company_name = company_folder.name
            logger.info(f"处理公司文件夹：{company_name}")
            
            # 查找对应的投标人（支持多种匹配方式）
            bidder = None
            
            # 方法1: 精确匹配
            if company_name in bidder_name_map:
                bidder = bidder_name_map[company_name]
            else:
                # 方法2: 模糊匹配（公司名称包含文件夹名或反之）
                for name in bidder_name_map:
                    if company_name in name or name in company_name:
                        bidder = bidder_name_map[name]
                        break
                if not bidder:
                    # 方法3: 移除特殊字符后匹配
                    clean_company_name = ''.join(filter(str.isalnum, company_name))
                    for name in bidder_name_map:
                        clean_name = ''.join(filter(str.isalnum, name))
                        if clean_company_name in clean_name or clean_name in clean_company_name:
                            bidder = bidder_name_map[name]
                            break
            
            if not bidder:
                logger.warning(f"未找到对应的投标人，删除文件夹：{company_name}")
                unmatched_folders.append(company_name)
                try:
                    shutil.rmtree(company_folder)
                    logger.info(f"已删除不匹配的文件夹：{company_name}")
                except Exception as e:
                    logger.error(f"删除文件夹失败 {company_name}: {e}")
                continue
            
            # 扫描该公司的文件
            for file_path in company_folder.rglob('*'):
                if stop_event.is_set():
                    break
                
                if not file_path.is_file():
                    continue
                
                total_files += 1
                
                try:
                    file_type = file_path.suffix.lower()[1:] if file_path.suffix else "other"
                    relative_path = str(file_path.relative_to(extract_dir))
                    
                    bidder_file = BidderFile(
                        bidder_id=bidder.id,
                        file_name=file_path.name,
                        file_path=relative_path,
                        file_type=file_type,
                        file_size=file_path.stat().st_size,
                        parse_status="completed",
                        parsed=True
                    )
                    db.add(bidder_file)
                    parsed_files += 1
                    
                    # PDF 转 MD（与 PDF 同级目录）
                    if file_type == 'pdf' and PYMUPDF_AVAILABLE:
                        try:
                            md_path = pdf_to_markdown(file_path, file_path.parent)
                            if md_path and md_path.exists():
                                # 记录 MD 文件
                                md_relative_path = str(md_path.relative_to(extract_dir))
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
                                total_files += 1
                                parsed_files += 1
                                logger.info(f"PDF 转 MD 完成并记录: {md_path.name}")
                        except Exception as pdf_e:
                            logger.error(f"PDF 转 MD 失败 {file_path}: {pdf_e}")
                    
                    if parsed_files % 10 == 0:
                        db.commit()
                        upload_record.total_files = total_files
                        upload_record.parsed_files = parsed_files
                        db.commit()
                
                except Exception as e:
                    logger.error(f"处理文件失败 {file_path}: {e}")
                    bidder_file = BidderFile(
                        bidder_id=bidder.id,
                        file_name=file_path.name,
                        file_path=str(file_path),
                        file_type=file_path.suffix.lower()[1:] if file_path.suffix else "other",
                        file_size=file_path.stat().st_size,
                        parse_status="failed",
                        parsed=False,
                        parse_error=str(e)
                    )
                    db.add(bidder_file)
                    parsed_files += 1
            
            if stop_event.is_set():
                break
        
        upload_record = db.query(PackageFileUpload).filter(
            PackageFileUpload.id == upload_id
        ).first()
        if upload_record:
            upload_record.status = "completed" if not stop_event.is_set() else "cancelled"
            upload_record.total_files = total_files
            upload_record.parsed_files = parsed_files
            upload_record.completed_at = datetime.now()
            db.commit()
        
        summary = f"包文件解析完成：package_id={package_id}, upload_id={upload_id}"
        summary += f", total_files={total_files}, matched_bidders={len(company_folders) - len(unmatched_folders)}"
        if unmatched_folders:
            summary += f", deleted_unmatched={unmatched_folders}"
        logger.info(summary)
        
    except Exception as e:
        logger.error(f"解析包文件失败：{e}")
        upload_record = db.query(PackageFileUpload).filter(
            PackageFileUpload.id == upload_id
        ).first()
        if upload_record:
            upload_record.status = "failed"
            db.commit()
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


def pdf_to_markdown(pdf_path: Path, output_dir: Path) -> Optional[Path]:
    """将 PDF 文件转换为 Markdown 文件
    
    支持两种模式：
    1. 纯文本 PDF：直接提取文本
    2. 扫描版 PDF（图片 PDF）：使用 OCR 识别图片内容
    
    Args:
        pdf_path: PDF 文件路径
        output_dir: 输出目录
        
    Returns:
        生成的 MD 文件路径，失败返回 None
    """
    if not PYMUPDF_AVAILABLE:
        logger.warning(f"PyMuPDF 未安装，无法转换 PDF: {pdf_path}")
        return None
    
    try:
        doc = fitz.open(str(pdf_path))
        md_content = []
        
        total_text_length = 0
        for page_num, page in enumerate(doc, start=1):
            # 提取文本
            text = page.get_text()
            total_text_length += len(text.strip())
            if text.strip():
                md_content.append(f"## 第{page_num}页\n\n{text}\n")
            else:
                md_content.append(f"## 第{page_num}页\n\n[该页无文本内容]\n")
        
        doc.close()
        
        # 判断是否为扫描版 PDF（文本内容很少可能是扫描版）
        is_scanned_pdf = total_text_length < 100
        
        # 如果是扫描版 PDF，尝试使用 OCR 识别
        if is_scanned_pdf:
            logger.info(f"检测到扫描版 PDF，尝试 OCR 识别: {pdf_path}")
            try:
                from services.ocr_service import OCRService
                
                ocr_service = OCRService()
                # 提取图片并进行 OCR
                temp_dir = output_dir / f"{pdf_path.stem}_ocr_temp"
                temp_dir.mkdir(parents=True, exist_ok=True)
                
                image_results = ocr_service.process_document_images(str(pdf_path), str(temp_dir))
                
                if image_results:
                    # 使用 OCR 结果生成 MD
                    md_content = [f"# {pdf_path.name}\n\n"]
                    md_content.append("## OCR 识别结果（扫描版 PDF）\n\n")
                    md_content.append("---\n\n")
                    
                    for result in image_results:
                        page_num = result.get("page_num", 1)
                        ocr_text = result.get("ocr_text", "")
                        md_content.append(f"## 第{page_num}页\n\n")
                        md_content.append(f"{ocr_text}\n\n")
                        md_content.append("---\n\n")
                    
                    # 清理临时目录
                    import shutil
                    shutil.rmtree(temp_dir, ignore_errors=True)
                    logger.info(f"OCR 识别完成: {pdf_path}")
                else:
                    logger.warning(f"扫描版 PDF 图片提取失败: {pdf_path}")
                    
            except Exception as ocr_e:
                logger.error(f"OCR 识别失败 {pdf_path}: {ocr_e}")
                # 继续使用原始文本内容
        
        # 生成 MD 文件路径（与 PDF 同级目录）
        md_filename = pdf_path.stem + ".md"
        md_path = output_dir / md_filename
        
        # 写入 MD 文件
        md_path.write_text("\n".join(md_content), encoding='utf-8')
        logger.info(f"PDF 转 MD 成功: {pdf_path} -> {md_path}")
        return md_path
        
    except Exception as e:
        logger.error(f"PDF 转 MD 失败 {pdf_path}: {e}")
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
        
        return upload_record.to_dict()
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
        
        # 获取包下所有投标人的文件记录
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
        
        # 删除数据库记录
        db.query(BidderFile).filter(BidderFile.bidder_id.in_(bidder_ids)).delete()
        db.query(PackageFileUpload).filter(PackageFileUpload.package_id == package_id).delete()
        
        db.commit()
        
        logger.info(f"已删除包 {package_id} 的所有文件")
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
                "conversion_ready": True,
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
            
            # 统计对应的MD文件
            md_files = db.query(BidderFile).filter(
                BidderFile.bidder_id == bidder.id,
                BidderFile.file_type == "md"
            ).all()
            
            # 统计转换失败的文件
            failed_files = db.query(BidderFile).filter(
                BidderFile.bidder_id == bidder.id,
                BidderFile.parse_status == "failed"
            ).all()
            
            # 统计处理中的文件
            processing_files = db.query(BidderFile).filter(
                BidderFile.bidder_id == bidder.id,
                BidderFile.parse_status == "processing"
            ).all()
            
            bidder_status = {
                "bidder_id": bidder.id,
                "company_name": bidder.company_name,
                "pdf_count": len(pdf_files),
                "md_count": len(md_files),
                "failed_count": len(failed_files),
                "processing_count": len(processing_files),
                "conversion_ready": len(pdf_files) == len(md_files) and len(failed_files) == 0
            }
            
            result["total_pdf_count"] += len(pdf_files)
            result["converted_count"] += len(md_files)
            result["failed_count"] += len(failed_files)
            result["processing_count"] += len(processing_files)
            result["bidders"].append(bidder_status)
        
        # 判断整个包是否可以启动评审
        result["conversion_ready"] = (
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
