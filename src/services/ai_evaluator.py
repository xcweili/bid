"""AI 评审服务 - 增强版，支持 OCR 和图片处理"""
import os
import json
import zipfile
import shutil
import uuid
import tempfile
from pathlib import Path
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
from loguru import logger
from datetime import datetime

from services.llm_service import LLMService
from services.ocr_service import OCRService


@dataclass
class PageInfo:
    page_num: int
    page_type: str
    ocr_text: str = ""
    image_path: str = ""


@dataclass
class DocumentInfo:
    file_path: str
    total_pages: int = 0
    pages: List[PageInfo] = field(default_factory=list)
    raw_extracted_text: str = ""
    evaluation_result: str = ""
    
    def get_complete_content(self) -> str:
        """获取完整的文档内容，包括页码信息"""
        return self.raw_extracted_text
    
    def set_evaluation_result(self, result: str):
        """设置评分结果"""
        self.evaluation_result = result
    
    def get_evaluation_result(self) -> str:
        """获取评分结果"""
        return self.evaluation_result


class TempFileManager:
    def __init__(self, source_dir: str):
        self.base_dir = source_dir
        self.temp_files = []

    def create_temp_file(self, suffix: str = ".png") -> str:
        filename = f"{uuid.uuid4().hex}{suffix}"
        filepath = os.path.join(self.base_dir, filename)
        self.temp_files.append(filepath)
        return filepath

    def cleanup(self):
        for filepath in self.temp_files:
            try:
                if os.path.exists(filepath):
                    os.remove(filepath)
                    logger.debug(f"已删除临时文件：{filepath}")
            except Exception as e:
                logger.warning(f"删除临时文件失败 {filepath}: {e}")
        logger.info(f"共清理 {len(self.temp_files)} 个临时文件")


class DocumentParser:
    @staticmethod
    def _convert_doc_to_docx(doc_path: str, temp_manager: TempFileManager) -> Optional[str]:
        """使用 win32com 将 .doc 转换为 .docx"""
        try:
            import win32com.client as win32

            # 使用系统临时目录保存转换后的文件
            temp_dir = tempfile.gettempdir()
            temp_docx_name = f"{uuid.uuid4().hex}.docx"
            temp_docx_path = os.path.join(temp_dir, temp_docx_name)

            # 尝试使用 WPS 或 Word
            try:
                # 优先使用 WPS
                app = win32.Dispatch("Kwps.Application")
                logger.debug("使用 WPS Office")
            except Exception:
                try:
                    # fallback 到 Word
                    app = win32.Dispatch("Word.Application")
                    logger.debug("使用 Microsoft Word")
                except Exception as e:
                    logger.error(f"无法启动 Office 应用：{e}")
                    return None

            app.Visible = False

            # 打开文档
            doc = app.Documents.Open(doc_path)

            # 保存为 docx 格式
            try:
                # WPS 使用 SaveAs2
                doc.SaveAs2(temp_docx_path, FileFormat=12)  # 12 = wdFormatDocumentDefault
            except AttributeError:
                # Word 使用 SaveAs
                doc.SaveAs(temp_docx_path, FileFormat=12)

            doc.Close()
            app.Quit()

            # 将转换后的文件移动到目标位置
            final_docx_path = temp_manager.create_temp_file(".docx")
            shutil.move(temp_docx_path, final_docx_path)

            logger.info(f"已将 .doc 转换为 .docx: {final_docx_path}")
            return final_docx_path

        except Exception as e:
            logger.error(f"转换 .doc 到 .docx 失败：{e}")
            return None

    @staticmethod
    def _extract_images_from_docx(docx_path: str, temp_manager: TempFileManager) -> List[str]:
        """从 docx 文件中提取图片"""
        image_paths = []

        try:
            with zipfile.ZipFile(docx_path, 'r') as zip_ref:
                media_files = [f for f in zip_ref.namelist() if f.startswith('word/media/') and not f.endswith('/')]

                for idx, media_file in enumerate(media_files):
                    ext = os.path.splitext(media_file)[1]
                    if not ext:
                        ext = '.png'
                    img_path = temp_manager.create_temp_file(ext)

                    with zip_ref.open(media_file) as source:
                        with open(img_path, 'wb') as target:
                            target.write(source.read())

                    image_paths.append(img_path)
                    logger.info(f"提取图片：{img_path}")
        except zipfile.BadZipFile as e:
            logger.error(f"文件不是有效的 zip/docx 格式：{e}")
        except Exception as e:
            logger.error(f"提取图片失败：{e}")

        return image_paths

    @staticmethod
    def extract_images(doc_path: str, temp_manager: TempFileManager) -> List[str]:
        """从文档中提取所有图片"""
        image_paths = []
        doc_path = Path(doc_path).absolute()
        suffix = doc_path.suffix.lower()

        try:
            if suffix == '.docx':
                # 直接处理 docx 文件
                image_paths = DocumentParser._extract_images_from_docx(str(doc_path), temp_manager)

            elif suffix == '.doc':
                # 尝试转换 .doc 到 .docx
                docx_path = DocumentParser._convert_doc_to_docx(str(doc_path), temp_manager)
                if docx_path:
                    image_paths = DocumentParser._extract_images_from_docx(docx_path, temp_manager)
                else:
                    logger.warning("无法转换 .doc 文件，请手动转换为 .docx 格式")

            else:
                logger.error(f"不支持的文件格式：{suffix}")

        except Exception as e:
            logger.error(f"提取图片失败：{e}")

        return image_paths


class AIEvaluator:
    """AI 评审器 - 支持文档解析、OCR 和智能评分"""

    def __init__(self):
        self.llm = LLMService()
        self.ocr = OCRService()
        self.temp_base = Path("temp/ocr")
        self.temp_base.mkdir(parents=True, exist_ok=True)

    def read_company_files(self, company_folder: str, source_files: List[str]) -> Dict[str, Any]:
        """读取公司文件夹中的指定文件内容，支持 OCR 和 md 文档"""
        company_path = Path(company_folder)
        if not company_path.exists():
            logger.warning(f"公司文件夹不存在：{company_folder}")
            return {
                "content": "",
                "errors": [f"公司文件夹不存在：{company_folder}"],
                "missing_files": source_files.copy()
            }

        all_content = []
        errors = []
        missing_files = []

        for file_pattern in source_files:
            # 查找匹配的文件
            matched_files = list(company_path.rglob(file_pattern))
            
            if not matched_files:
                # 尝试模糊匹配
                matched_files = [f for f in company_path.rglob('*') 
                                if file_pattern in f.name or f.name in file_pattern]

            if not matched_files:
                # 文件不存在，记录缺失
                missing_files.append(file_pattern)
                errors.append(f"文件不存在：{file_pattern}")
                continue

            for file_path in matched_files:
                # 先尝试查找同名的 md 文档
                md_path = file_path.with_suffix('.md')
                if md_path.exists():
                    try:
                        content = md_path.read_text(encoding='utf-8')
                        # 检查 md 文档中是否有错误信息
                        if '[读取失败：' in content or 'OCR 识别失败' in content:
                            errors.append(f"文件解析有误：{file_path.name}")
                        all_content.append(f"=== 文件：{md_path.name} ===\n{content}\n")
                        logger.info(f"读取 md 文档：{md_path}")
                    except Exception as e:
                        logger.error(f"读取 md 文档失败 {md_path}: {e}")
                        errors.append(f"读取 md 文档失败：{md_path.name}")
                        # 回退到原文件
                        content = self._read_file_with_ocr(str(file_path))
                        if content:
                            all_content.append(f"=== 文件：{file_path.name} ===\n{content}\n")
                else:
                    # 没有 md 文档，使用原文件
                    content = self._read_file_with_ocr(str(file_path))
                    if content:
                        all_content.append(f"=== 文件：{file_path.name} ===\n{content}\n")

        return {
            "content": "\n\n".join(all_content) if all_content else "",
            "errors": errors,
            "missing_files": missing_files
        }

    def _read_file_with_ocr(self, file_path: str) -> str:
        """读取文件内容，支持文档图片 OCR"""
        file_path = Path(file_path)
        suffix = file_path.suffix.lower()
        source_dir = str(file_path.parent)

        try:
            if suffix == '.txt':
                return file_path.read_text(encoding='utf-8')

            elif suffix in ['.doc', '.docx']:
                return self._read_doc_with_ocr(str(file_path), source_dir)

            elif suffix == '.pdf':
                return self._read_pdf_with_ocr(file_path)

            elif suffix in ['.xls', '.xlsx']:
                return self._read_excel_file(file_path)

            elif suffix in ['.jpg', '.jpeg', '.png', '.gif', '.bmp']:
                # 直接对图片进行 OCR
                return self.ocr.ocr_image(str(file_path))

            else:
                logger.warning(f"不支持的文件格式：{suffix}")
                return ""

        except Exception as e:
            logger.error(f"读取文件失败 {file_path}: {e}")
            return f"[读取失败：{str(e)}]"

    def _read_doc_with_ocr(self, doc_path: str, source_dir: str) -> str:
        """读取 Word 文档内容，包括图片 OCR"""
        temp_manager = TempFileManager(source_dir)
        doc_info = DocumentInfo(file_path=doc_path)

        try:
            # 提取图片
            image_paths = DocumentParser.extract_images(doc_path, temp_manager)
            
            doc_info.total_pages = len(image_paths)
            logger.info(f"文档 {Path(doc_path).name} 共 {len(image_paths)} 张图片")

            # 对每张图片进行 OCR
            for idx, img_path in enumerate(image_paths):
                try:
                    ocr_text = self.ocr.ocr_image(img_path)
                    page_type = self._classify_page_type(ocr_text, idx + 1, len(image_paths))

                    doc_info.pages.append(PageInfo(
                        page_num=idx + 1,
                        page_type=page_type,
                        ocr_text=ocr_text,
                        image_path=img_path
                    ))

                    doc_info.raw_extracted_text += f"\n--- 第 {idx + 1} 页 ({page_type}) ---\n{ocr_text}\n"

                    # 清理临时图片
                    if os.path.exists(img_path):
                        os.remove(img_path)

                except Exception as e:
                    logger.error(f"处理第 {idx + 1} 页失败：{e}")
                    if os.path.exists(img_path):
                        os.remove(img_path)

            # 清理临时文件
            temp_manager.cleanup()

            return doc_info.raw_extracted_text

        except Exception as e:
            logger.error(f"处理文档失败：{e}")
            temp_manager.cleanup()
            return f"[文档处理失败：{str(e)}]"

    def _classify_page_type(self, ocr_text: str, page_num: int, total_pages: int) -> str:
        """根据 OCR 内容分类页面类型"""
        if page_num == 1:
            return "title"
        if "目录" in ocr_text or "contents" in ocr_text.lower():
            return "toc"
        if "证书" in ocr_text or "certificate" in ocr_text.lower():
            return "certificate"
        if page_num == total_pages:
            return "end"
        return "content"

    def _read_pdf_with_ocr(self, file_path: Path) -> str:
        """读取 PDF 文件，支持 OCR"""
        try:
            from pdf2image import convert_from_path
            import tempfile
            
            with tempfile.TemporaryDirectory() as temp_dir:
                images = convert_from_path(str(file_path), dpi=200)
                
                all_text = []
                for idx, image in enumerate(images):
                    temp_img_path = Path(temp_dir) / f"page_{idx+1}.png"
                    image.save(str(temp_img_path), "PNG")
                    
                    ocr_text = self.ocr.ocr_image(str(temp_img_path))
                    if ocr_text:
                        all_text.append(f"--- 第 {idx+1} 页 ---\n{ocr_text}")
                
                return "\n\n".join(all_text)
                
        except ImportError:
            logger.warning("pdf2image 未安装，PDF OCR 不可用")
            return "[PDF OCR: 需要安装 pdf2image 依赖]"
        except Exception as e:
            logger.error(f"PDF OCR 失败：{e}")
            return f"[PDF OCR 失败：{str(e)}]"

    def _read_excel_file(self, file_path: Path) -> str:
        """读取 Excel 文件内容"""
        try:
            import pandas as pd
            df = pd.read_excel(file_path)
            return df.to_string()
        except Exception as e:
            logger.error(f"解析 Excel 失败：{e}")
            return ""

    def evaluate_rule_item(self, rule_content: str, item_config: Dict, 
                          document_content: str) -> Dict:
        """评估单个评审项"""
        item_name = item_config.get('item_name', '未知评审项')
        max_score = item_config.get('max_score', 10)
        scoring_criteria = item_config.get('scoring_criteria', rule_content)

        prompt = f"""你是一位专业的招标评审专家。请根据以下评审标准和投标文件内容，给出客观、公正的评分。

【评审项】
{item_name}

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
    "strengths": ["优势点 1", "优势点 2"],
    "weaknesses": ["不足点 1", "不足点 2"],
    "evidence": "从投标文件中引用的具体证据内容",
    "confidence": 置信度（0.0-1.0）
}}

注意：
1. 评分必须客观公正，基于投标文件实际内容
2. 评分理由要详细说明打分依据
3. 证据必须来自投标文件原文
4. 如果投标文件未提供相关信息，评分应为 0 分
5. 如果文件存在错误或缺失，请在评分理由中说明对评分的影响"""

        try:
            # 调用 LLM 进行评审
            response = self.llm.chat(
                system_content="你是一位专业的招标评审专家，需要客观、公正地评估投标文件。",
                user_content=prompt
            )

            # 解析结果
            result = self._parse_evaluation_response(response, max_score)
            result['item_name'] = item_name
            result['raw_llm_response'] = response

            return result

        except Exception as e:
            logger.error(f"评审项评估失败：{e}")
            return {
                "score": 0,
                "max_score": max_score,
                "reason": f"评估失败：{str(e)}",
                "evidence": "",
                "strengths": [],
                "weaknesses": [],
                "confidence": 0,
                "item_name": item_name,
                "raw_llm_response": ""
            }

    def _parse_evaluation_response(self, response: str, max_score: float) -> Dict:
        """解析 AI 评审响应"""
        try:
            content = response.get('content', response) if isinstance(response, dict) else response
            
            try:
                result = json.loads(content)
            except json.JSONDecodeError:
                import re
                json_match = re.search(r'\{[\s\S]*\}', content)
                if json_match:
                    result = json.loads(json_match.group(0))
                else:
                    raise ValueError("无法解析 JSON")

            score = float(result.get('score', 0))
            score = max(0, min(score, max_score))

            return {
                "score": score,
                "max_score": max_score,
                "reason": result.get('reason', ''),
                "strengths": result.get('strengths', []),
                "weaknesses": result.get('weaknesses', []),
                "evidence": result.get('evidence', ''),
                "confidence": float(result.get('confidence', 0.8))
            }

        except Exception as e:
            logger.error(f"解析评审结果失败：{e}")
            return {
                "score": 0,
                "max_score": max_score,
                "reason": f"解析失败：{str(e)}",
                "strengths": [],
                "weaknesses": [],
                "evidence": "",
                "confidence": 0
            }

    def evaluate_company(self, company_name: str, company_folder: str, 
                        rules: List[Dict]) -> Dict[str, Dict]:
        """对公司的所有评审项进行评分"""
        logger.info(f"开始评估公司：{company_name}")
        results = {}

        for rule in rules:
            rule_id = rule.get('id')
            item_config = rule.get('item_config', {})
            source_files = item_config.get('source_files', [])

            file_info = self.read_company_files(company_folder, source_files)
            document_content = file_info.get('content', '')
            errors = file_info.get('errors', [])
            missing_files = file_info.get('missing_files', [])

            # 构建提示信息，包含错误和缺失文件
            prompt_errors = []
            if missing_files:
                prompt_errors.append(f"⚠️ 以下文件未找到：{', '.join(missing_files)}")
            if errors:
                prompt_errors.append(f"⚠️ 文件处理错误：{', '.join(errors[:3])}")  # 只显示前3个错误

            if prompt_errors:
                document_content = "\n".join(prompt_errors) + "\n\n" + document_content

            eval_result = self.evaluate_rule_item(
                rule_content=rule.get('rule_content', ''),
                item_config=item_config,
                document_content=document_content
            )

            # 添加错误信息到评估结果
            eval_result['errors'] = errors
            eval_result['missing_files'] = missing_files

            results[rule_id] = eval_result
            logger.info(f"规则 {rule.get('rule_name')} 评分：{eval_result['score']}/{eval_result['max_score']}")

        return results
