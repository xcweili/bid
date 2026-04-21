"""文件处理服务"""
import os
import zipfile
from pathlib import Path
from typing import List, Dict
from loguru import logger


class FileProcessor:
    """文件处理服务"""

    def __init__(self, base_dir: str):
        self.base_dir = Path(base_dir)

    def process_bid_zip(self, task_id: int, zip_path: str) -> List[Dict]:       
        """处理投标 ZIP 文件，智能识别公司文件夹

        Args:
            task_id: 任务 ID
            zip_path: ZIP 文件路径

        Returns:
            公司列表 [{"company_name": "xxx", "folder_path": "xxx", "files": [...]}]
        """
        try:
            logger.info(f"=== 开始处理 ZIP 文件 ===")
            logger.info(f"task_id: {task_id}, zip_path: {zip_path}")
            
            task_dir = self.base_dir / "tasks" / str(task_id)
            task_dir.mkdir(parents=True, exist_ok=True)
            logger.info(f"任务目录: {task_dir}")

            # 解压 ZIP
            extract_dir = task_dir / "bids"
            extract_dir.mkdir(parents=True, exist_ok=True)
            logger.info(f"解压目录: {extract_dir}")

            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                logger.info(f"ZIP 包含 {len(zip_ref.infolist())} 个文件")
                
                # 先直接解压，不管文件名
                zip_ref.extractall(extract_dir)
                logger.info(f"ZIP 解压完成（初步）")
                
                # 现在处理解压后的文件名编码问题
                logger.info(f"开始修正文件名编码...")
                self._fix_filenames(extract_dir)
                logger.info(f"文件名编码修正完成")

            # 智能识别公司文件夹
            logger.info(f"开始识别公司文件夹...")
            companies = self._find_company_folders(extract_dir)
            logger.info(f"识别到 {len(companies)} 个公司")
            
            return companies
        except Exception as e:
            logger.error(f"处理 ZIP 文件失败：{e}", exc_info=True)
            return []

    def _fix_filenames(self, root_dir: Path):
        """递归修复解压后的文件名编码问题"""
        try:
            for item in root_dir.iterdir():
                if item.is_dir():
                    # 先修复子目录
                    self._fix_filenames(item)
                    
                    # 然后修复当前目录名
                    old_name = item.name
                    new_name = self._decode_filename(old_name)
                    if new_name != old_name:
                        try:
                            new_path = item.parent / new_name
                            if not new_path.exists():
                                item.rename(new_path)
                                logger.debug(f"重命名目录: {old_name} -> {new_name}")
                        except Exception as e:
                            logger.warning(f"无法重命名目录 {old_name}: {e}")
                else:
                    # 修复文件名
                    old_name = item.name
                    new_name = self._decode_filename(old_name)
                    if new_name != old_name:
                        try:
                            new_path = item.parent / new_name
                            if not new_path.exists():
                                item.rename(new_path)
                                logger.debug(f"重命名文件: {old_name} -> {new_name}")
                        except Exception as e:
                            logger.warning(f"无法重命名文件 {old_name}: {e}")
        except Exception as e:
            logger.error(f"修复文件名时出错: {e}")
    
    def _decode_filename(self, name: str) -> str:
        """尝试多种编码来解码文件名"""
        if not name:
            return name
        
        # 尝试用 cp437 编码，然后用 gbk 解码（Windows zip 常见）
        try:
            decoded = name.encode('cp437').decode('gbk')
            if decoded != name and any('\u4e00' <= c <= '\u9fff' for c in decoded):
                return decoded
        except:
            pass
        
        # 尝试用 cp437 -> utf-8
        try:
            decoded = name.encode('cp437').decode('utf-8')
            if decoded != name and any('\u4e00' <= c <= '\u9fff' for c in decoded):
                return decoded
        except:
            pass
        
        # 尝试用 cp437 -> gb2312
        try:
            decoded = name.encode('cp437').decode('gb2312')
            if decoded != name and any('\u4e00' <= c <= '\u9fff' for c in decoded):
                return decoded
        except:
            pass
        
        # 尝试用 utf-8 编码后再解码（处理可能的双重编码）
        try:
            decoded = name.encode('utf-8').decode('utf-8')
            if decoded != name and any('\u4e00' <= c <= '\u9fff' for c in decoded):
                return decoded
        except:
            pass
        
        # 尝试用 gbk 编码后再解码（处理可能的双重编码）
        try:
            decoded = name.encode('gbk').decode('gbk')
            if decoded != name and any('\u4e00' <= c <= '\u9fff' for c in decoded):
                return decoded
        except:
            pass
        
        return name

    def _find_company_folders(self, root_dir: Path, depth: int = 0, max_depth: int = 10) -> List[Dict]:
        """递归查找公司文件夹

        检测规则：
        1. 如果文件夹名包含"公司"字样，认为是公司文件夹
        2. 如果文件夹内包含支持的文件类型，认为是公司文件夹
        3. 否则继续递归查找子目录
        """
        companies = []
        supported_ext = {'.pdf', '.doc', '.docx', '.txt', '.xls', '.xlsx'}

        logger.info(f"[DEBUG] 扫描目录: {root_dir} (深度={depth})")

        try:
            items = list(root_dir.iterdir())
        except Exception as e:
            logger.error(f"[DEBUG] 无法列出目录: {root_dir}, 错误: {e}")
            return companies

        if not items or depth >= max_depth:
            logger.info(f"[DEBUG] 目录为空或超过最大深度: {root_dir}")
            return companies

        for item in items:
            if not item.is_dir():
                logger.debug(f"[DEBUG] 跳过文件: {item.name}")
                continue

            logger.info(f"[DEBUG] 检查文件夹: {item.name}")

            if '公司' in item.name:
                files = self._collect_files(item)
                logger.info(f"[DEBUG] 文件夹名含'公司': {item.name}, 文件数: {len(files)}")
                if files:
                    # 计算相对路径，相对于base_dir
                    relative_path = str(item.relative_to(self.base_dir))
                    # 确保路径以src/data开头
                    if not relative_path.startswith('src/data'):
                        relative_path = 'src/data/' + relative_path
                    companies.append({
                        "company_name": item.name,
                        "folder_path": relative_path,
                        "files": files
                    })
                    logger.info(f"✅ 识别公司：{item.name}, 文件数：{len(files)}")
                # 不再递归检查子目录，避免重复识别
                continue

            sub_items = list(item.iterdir())
            has_company_files = any(
                f.is_file() and f.suffix.lower() in supported_ext
                for f in sub_items
            )
            logger.info(f"[DEBUG] 子文件夹 {item.name} 包含支持的文件: {has_company_files}")
            if has_company_files:
                files = self._collect_files(item)
                logger.info(f"[DEBUG] 文件夹含支持文件: {item.name}, 文件数: {len(files)}")
                if files:
                    # 计算相对路径，相对于base_dir
                    relative_path = str(item.relative_to(self.base_dir))
                    # 确保路径以src/data开头
                    if not relative_path.startswith('src/data'):
                        relative_path = 'src/data/' + relative_path
                    companies.append({
                        "company_name": item.name,
                        "folder_path": relative_path,
                        "files": files
                    })
                    logger.info(f"✅ 识别公司：{item.name}, 文件数：{len(files)}")
                # 不再递归检查子目录，避免重复识别
                continue

            logger.info(f"[DEBUG] 递归检查子目录: {item.name}")
            sub_companies = self._find_company_folders(item, depth + 1, max_depth)
            companies.extend(sub_companies)

        logger.info(f"[DEBUG] 目录 {root_dir} 识别到 {len(companies)} 个公司")
        return companies

    def _collect_files(self, folder: Path) -> List[Dict]:
        """递归收集文件夹中的所有文件"""
        files = []
        supported_ext = {'.pdf', '.doc', '.docx', '.txt', '.xls', '.xlsx'}

        try:
            for file_path in folder.rglob('*'):
                if file_path.is_file() and file_path.suffix.lower() in supported_ext:
                    files.append({
                        "file_name": file_path.name,
                        "file_path": str(file_path),
                        "relative_path": str(file_path.relative_to(folder))
                    })
        except Exception as e:
            logger.error(f"收集文件失败 {folder}: {e}")

        return files

    def parse_rule_md(self, md_path: str) -> Dict:
        """解析规则 MD 文件

        Args:
            md_path: MD 文件路径

        Returns:
            规则结构 {"rule_name": "xxx", "content": "xxx", "file_path": "xxx"}
        """
        try:
            with open(md_path, 'r', encoding='utf-8') as f:
                content = f.read()

            rule_name = Path(md_path).stem

            return {
                "rule_name": rule_name,
                "content": content,
                "file_path": md_path
            }
        except Exception as e:
            logger.error(f"解析 MD 文件失败 {md_path}: {e}")
            return {
                "rule_name": "",
                "content": "",
                "file_path": md_path
            }

    def read_file_content(self, file_path: str) -> str:
        """读取文件内容（支持 txt, docx）"""
        path = Path(file_path)
        suffix = path.suffix.lower()

        try:
            if suffix == '.txt':
                return path.read_text(encoding='utf-8')
            elif suffix == '.docx':
                try:
                    from docx import Document
                    doc = Document(path)
                    return '\n'.join([para.text for para in doc.paragraphs])        
                except Exception as e:
                    # 处理docx文件不是有效Word文档的情况
                    logger.warning(f"读取docx文件失败 {file_path}: {e}")
                    return f"[读取失败：{str(e)}]"
            elif suffix == '.pdf':
                # PDF 文件需要使用 OCR 处理
                return "[PDF 文件格式 - 请使用 OCR 服务提取图片内容]"
            elif suffix == '.doc':
                # .doc 文件格式暂不支持直接读取
                return "[.doc 文件格式暂不支持直接读取，请转换为.docx 格式或使用 OCR 服务处理]"
            else:
                return f"[不支持的文件格式：{suffix}]"
        except Exception as e:
            logger.error(f"读取文件失败 {file_path}: {e}")
            return f"[读取失败：{str(e)}]"
