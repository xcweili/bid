"""OCR 服务 - 使用 GPUStack API 进行图片识别"""
import os
import base64
from io import BytesIO
from pathlib import Path
from typing import List, Dict, Optional
from loguru import logger
import uuid
import shutil
from PIL import Image
import openai
import zipfile


class OCRService:
    """OCR 服务 - 使用 GPUStack API 进行图片文字识别"""
    
    # GPUStack API 配置
    API_KEY = "gpustack_ddb0c780dd843b12_67fea5d3d141e2f75091b6ba6e495707"
    BASE_URL = "http://10.255.216.2/v1"
    OCR_MODEL = "ocr"

    def __init__(self):
        # 初始化 OpenAI 客户端
        self.client = openai.Client(
            api_key=self.API_KEY,
            base_url=self.BASE_URL,
        )

    def ocr_image(self, image_path: str) -> str:
        """对单张图片进行 OCR 识别

        Args:
            image_path: 图片路径

        Returns:
            OCR 识别结果文本
        """
        if not os.path.exists(image_path):
            logger.error(f"图片文件不存在：{image_path}")
            return ""

        try:
            # 读取图片并转换为 base64
            img = Image.open(image_path)
            buffered = BytesIO()
            img.save(buffered, format=img.format)
            img_base64 = base64.b64encode(buffered.getvalue()).decode()
            
            # 调用 GPUStack OCR API
            messages = [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/{img.format.lower()};base64,{img_base64}"
                            }
                        },
                        {
                            "type": "text",
                            "text": "OCR: 请识别图片中的所有文字内容"
                        }
                    ]
                }
            ]
            
            response = self.client.chat.completions.create(
                model=self.OCR_MODEL,
                messages=messages,
                temperature=0.0,
            )
            
            ocr_text = response.choices[0].message.content
            logger.info(f"OCR 识别成功：{image_path}")
            return ocr_text or ""
            
        except Exception as e:
            logger.error(f"OCR 识别失败 {image_path}: {e}")
            return f"[OCR 识别失败：{str(e)}]"

    def extract_images_from_docx(self, docx_path: str, output_dir: str) -> List[str]:
        """从 docx 文件中提取图片

        Args:
            docx_path: docx 文件路径
            output_dir: 输出目录

        Returns:
            提取的图片路径列表
        """
        image_paths = []
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        try:
            with zipfile.ZipFile(docx_path, 'r') as zip_ref:
                media_files = [f for f in zip_ref.namelist() 
                              if f.startswith('word/media/') and not f.endswith('/')]

                for idx, media_file in enumerate(media_files):
                    ext = os.path.splitext(media_file)[1]
                    if not ext:
                        ext = '.png'
                    
                    img_filename = f"{Path(docx_path).stem}_img_{idx+1}{ext}"
                    img_path = str(output_dir / img_filename)

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

    def extract_images_from_doc(self, doc_path: str, output_dir: str) -> List[str]:
        """将 .doc 转换为 .docx 后提取图片

        Args:
            doc_path: .doc 文件路径
            output_dir: 输出目录

        Returns:
            提取的图片路径列表
        """
        image_paths = []
        try:
            # 尝试使用 win32com 转换（仅 Windows 环境）
            try:
                import win32com.client as win32
                
                output_dir = Path(output_dir)
                temp_docx_path = str(output_dir / f"{uuid.uuid4().hex}.docx")
                
                # 启动 Word
                app = win32.Dispatch("Word.Application")
                app.Visible = False
                
                # 打开文档并另存为 docx
                doc = app.Documents.Open(str(doc_path))
                doc.SaveAs2(temp_docx_path, FileFormat=12)
                doc.Close()
                app.Quit()
                
                # 从转换后的 docx 提取图片
                image_paths = self.extract_images_from_docx(temp_docx_path, str(output_dir))
                
                # 清理临时 docx 文件
                if os.path.exists(temp_docx_path):
                    os.remove(temp_docx_path)
                
                logger.info(f"使用 win32com 成功转换 .doc 文件：{doc_path}")
                return image_paths
            except ImportError:
                # win32com 不可用（Linux 环境）
                logger.warning(f"win32com 不可用，无法转换 .doc 文件：{doc_path}")
                # 尝试其他方法
                
                # 方法 1: 尝试使用 antiword 工具
                try:
                    import subprocess
                    result = subprocess.run(
                        ['antiword', str(doc_path)],
                        capture_output=True,
                        text=True,
                        timeout=30
                    )
                    if result.returncode == 0 and result.stdout.strip():
                        # 保存文本内容到临时文件
                        text_content = result.stdout.strip()
                        temp_txt_path = str(Path(output_dir) / f"{Path(doc_path).stem}_text.txt")
                        with open(temp_txt_path, 'w', encoding='utf-8') as f:
                            f.write(text_content)
                        logger.info(f"使用 antiword 成功提取 .doc 文件文本：{doc_path}")
                except Exception as e:
                    logger.debug(f"使用 antiword 失败：{e}")
                
                # 方法 2: 尝试使用 olefile 提取文本
                try:
                    from olefile import OleFileIO
                    ole = OleFileIO(doc_path)
                    
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
                                text_content = " ".join(text_parts[:20])
                                temp_txt_path = str(Path(output_dir) / f"{Path(doc_path).stem}_text.txt")
                                with open(temp_txt_path, 'w', encoding='utf-8') as f:
                                    f.write(text_content)
                                logger.info(f"使用 olefile 成功提取 .doc 文件文本：{doc_path}")
                        
                        ole.close()
                except Exception as e:
                    logger.debug(f"使用 olefile 失败：{e}")
                
                # 返回空列表，因为无法提取图片
                return []
            except Exception as e:
                # 其他 win32com 错误
                logger.error(f"win32com 转换失败：{e}")
                return []
            
        except Exception as e:
            logger.error(f"提取 .doc 图片失败：{e}")
            return []

    def extract_images_from_pdf(self, pdf_path: str, output_dir: str) -> List[Dict]:
        """从 PDF 文件中提取图片

        Args:
            pdf_path: PDF 文件路径
            output_dir: 输出目录

        Returns:
            [{"image_path": "...", "page_num": 1}, ...]
        """
        import fitz  # PyMuPDF
        
        image_list = []
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            # 打开 PDF
            pdf_document = fitz.open(pdf_path)
            
            for page_num, page in enumerate(pdf_document, start=1):
                # 获取页面中的图片列表
                image_list_page = page.get_images(full=True)
                
                for img_index, img in enumerate(image_list_page):
                    xref = img[0]  # 图片的 XREF
                    
                    # 提取图片数据
                    base_image = pdf_document.extract_image(xref)
                    image_bytes = base_image["image"]
                    image_ext = base_image["ext"]
                    
                    # 保存图片
                    img_filename = f"page{page_num}_img{img_index + 1}.{image_ext}"
                    img_path = str(output_dir / img_filename)
                    
                    with open(img_path, "wb") as f:
                        f.write(image_bytes)
                    
                    image_list.append({
                        "image_path": img_path,
                        "page_num": page_num,
                        "file_name": img_filename
                    })
                    
                    logger.info(f"提取 PDF 图片：{img_filename} (第{page_num}页)")
            
            pdf_document.close()
            logger.info(f"PDF {pdf_path} 共提取 {len(image_list)} 张图片")
            
            # 如果没有提取到图片，尝试将PDF页面渲染为图片（处理扫描版PDF）
            if len(image_list) == 0:
                logger.info(f"未提取到图片，尝试将PDF页面渲染为图片：{pdf_path}")
                pdf_document = fitz.open(pdf_path)
                
                for page_num, page in enumerate(pdf_document, start=1):
                    # 将页面渲染为图片
                    pix = page.get_pixmap(dpi=300)
                    img_filename = f"page{page_num}_render.png"
                    img_path = str(output_dir / img_filename)
                    
                    pix.save(img_path)
                    
                    image_list.append({
                        "image_path": img_path,
                        "page_num": page_num,
                        "file_name": img_filename
                    })
                    
                    logger.info(f"渲染PDF页面为图片：{img_filename} (第{page_num}页)")
                
                pdf_document.close()
                logger.info(f"PDF {pdf_path} 共渲染 {len(image_list)} 张页面图片")
            
        except Exception as e:
            logger.error(f"提取 PDF 图片失败：{e}")
        
        return image_list

    def process_document_images(self, file_path: str, output_dir: str) -> List[Dict]:
        """处理文档中的图片并进行 OCR

        Args:
            file_path: 文档路径（支持 .doc, .docx, .pdf）
            output_dir: 输出目录

        Returns:
            [{"image_path": "...", "ocr_text": "...", "page_num": 1}, ...]
        """
        file_path = Path(file_path)
        suffix = file_path.suffix.lower()
        output_path = Path(output_dir)
        
        # 创建临时目录
        temp_dir = output_path / f"{file_path.stem}_images"
        temp_dir.mkdir(parents=True, exist_ok=True)
        
        image_results = []
        
        try:
            # 提取图片
            if suffix == '.docx':
                image_paths = self.extract_images_from_docx(str(file_path), str(temp_dir))
                # 转换为标准格式
                image_info_list = [{"image_path": p, "page_num": i+1} for i, p in enumerate(image_paths)]
            elif suffix == '.doc':
                image_info_list = self.extract_images_from_doc(str(file_path), str(temp_dir))
            elif suffix == '.pdf':
                image_info_list = self.extract_images_from_pdf(str(file_path), str(temp_dir))
            else:
                logger.warning(f"不支持的文档格式：{suffix}")
                return []
            
            # 对每张图片进行 OCR
            for img_info in image_info_list:
                img_path = img_info["image_path"]
                page_num = img_info.get("page_num", 1)
                
                if not os.path.exists(img_path):
                    logger.warning(f"图片文件不存在：{img_path}")
                    continue
                
                ocr_text = self.ocr_image(img_path)
                image_results.append({
                    "image_path": img_path,
                    "ocr_text": ocr_text,
                    "page_num": page_num
                })
                
                # 清理临时图片
                if os.path.exists(img_path):
                    os.remove(img_path)
                    logger.debug(f"已删除临时图片：{img_path}")
            
            logger.info(f"文档 {file_path.name} 处理完成，共 {len(image_results)} 张图片")
            
        except Exception as e:
            logger.error(f"处理文档图片失败：{e}")
        
        return image_results

    def get_document_text_with_ocr(self, file_path: str, output_dir: str = "temp") -> str:
        """获取文档完整文本（包含 OCR 识别的图片内容）

        Args:
            file_path: 文档路径
            output_dir: 临时输出目录

        Returns:
            完整文本内容
        """
        from services.file_processor import FileProcessor
        
        file_path = Path(file_path)
        suffix = file_path.suffix.lower()
        
        # 先尝试直接提取文本
        processor = FileProcessor(str(Path(output_dir).parent))
        text_content = processor.read_file_content(str(file_path))
        
        # 如果有图片，进行 OCR
        image_results = self.process_document_images(str(file_path), output_dir)
        
        if image_results:
            # 将 OCR 结果附加到文本内容
            ocr_parts = []
            for img_result in image_results:
                ocr_parts.append(f"\n--- 图片 {img_result['page_num']} ---\n{img_result['ocr_text']}\n")
            
            ocr_content = "\n".join(ocr_parts)
            return f"{text_content}\n\n[图片 OCR 内容]\n{ocr_content}"
        
        return text_content

    def process_document_to_md(self, file_path: str, output_dir: str):
        """处理文档中的图片并生成同名.md 文件

        Args:
            file_path: 文档路径 (.doc, .docx, .pdf)
            output_dir: 输出目录（文档所在目录）
        """
        import zipfile
        file_path = Path(file_path)
        suffix = file_path.suffix.lower()
        
        # 直接在原文件所在目录生成 MD 文件
        doc_output_dir = file_path.parent
        doc_output_dir.mkdir(parents=True, exist_ok=True)
        
        # 创建临时目录用于存放图片
        temp_dir = doc_output_dir / f"{file_path.stem}_images"
        temp_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"开始处理文档：{file_path.name}, 输出目录：{doc_output_dir}")
        
        md_content = []
        
        try:
            # 提取图片
            if suffix == '.docx':
                md_content.append(f"# {file_path.name}\n\n")
                md_content.append("## 文件说明\n\n")
                md_content.append("[DOCX 文件格式 - 提取文本和图片进行 OCR 识别]\n\n")
                md_content.append("---\n\n")
                
                # 尝试提取文本内容
                try:
                    from services.file_processor import FileProcessor
                    processor = FileProcessor(str(Path(output_dir).parent))
                    text_content = processor.read_file_content(str(file_path))
                    if text_content and text_content.strip():
                        md_content.append("## 文本内容\n\n")
                        md_content.append(f"{text_content}\n\n")
                        md_content.append("---\n\n")
                except Exception as e:
                    logger.debug(f"提取 .docx 文本失败：{e}")
                
                # 提取图片
                image_paths = self.extract_images_from_docx(str(file_path), str(temp_dir))
                logger.info(f"docx 提取到 {len(image_paths)} 张图片")
                # 转换为标准格式
                image_info_list = [{"image_path": p, "page_num": i+1, "file_name": Path(p).name} 
                                   for i, p in enumerate(image_paths)]
            elif suffix == '.doc':
                # .doc 文件处理
                md_content.append(f"# {file_path.name}\n\n")
                md_content.append("## 文件说明\n\n")
                
                # 检查是否在 Linux 环境
                import platform
                is_linux = platform.system() == 'Linux'
                
                if is_linux:
                    md_content.append("[.doc 文件格式在 Linux 环境下暂不支持直接读取]\n\n")
                    md_content.append("**原因**：.doc 是旧版 Word 二进制格式，需要 Microsoft Word 或兼容工具进行转换\n\n")
                    md_content.append("**解决方案**：\n")
                    md_content.append("1. 在 Windows 环境中打开此文件\n")
                    md_content.append("2. 另存为 .docx 格式\n")
                    md_content.append("3. 重新上传 .docx 文件\n\n")
                else:
                    md_content.append("[.doc 文件格式处理中...]\n\n")
                    
                    # 尝试提取图片
                    image_paths = self.extract_images_from_doc(str(file_path), str(temp_dir))
                    logger.info(f".doc 提取到 {len(image_paths)} 张图片")
                    # 转换为标准格式
                    image_info_list = [{"image_path": p, "page_num": i+1, "file_name": Path(p).name} 
                                       for i, p in enumerate(image_paths)]
                    
                    if image_paths:
                        md_content.append("---\n\n")
                        # 对每张图片进行 OCR 并添加到 MD 内容
                        success_count = 0
                        for img_info in image_info_list:
                            img_path = img_info["image_path"]
                            page_num = img_info.get("page_num", 1)
                            img_filename = img_info.get("file_name", Path(img_path).name)
                            
                            if not os.path.exists(img_path):
                                logger.warning(f"图片文件不存在，跳过：{img_path}")
                                md_content.append(f"### 图片 {page_num} - {img_filename}\n\n")
                                md_content.append(f"**来源**: 第{page_num}页\n\n")
                                md_content.append(f"❌ 图片文件不存在\n\n")
                                md_content.append("---\n\n")
                                continue
                            
                            logger.info(f"正在 OCR 识别：{img_filename} (第{page_num}页)")
                            ocr_text = self.ocr_image(img_path)
                            
                            if ocr_text and "OCR 识别失败" not in ocr_text:
                                success_count += 1
                            
                            md_content.append(f"### 图片 {page_num} - {img_filename}\n\n")
                            md_content.append(f"**来源**: 第{page_num}页\n\n")
                            md_content.append(f"## OCR 识别结果\n\n{ocr_text}\n\n")
                            md_content.append("---\n\n")
                            
                            # 清理临时图片
                            if os.path.exists(img_path):
                                os.remove(img_path)
                                logger.debug(f"已删除临时图片：{img_path}")
                        
                        logger.info(f"OCR 处理完成，成功 {success_count}/{len(image_info_list)} 张")
                
                md_content.append(f"原始文件：{file_path.name}\n")
                
                # 尝试提取文本内容
                try:
                    from services.file_processor import FileProcessor
                    processor = FileProcessor(str(Path(output_dir).parent))
                    text_content = processor.read_file_content(str(file_path))
                    if text_content and text_content.strip():
                        md_content.append("\n## 文本内容\n\n")
                        md_content.append(f"{text_content}\n\n")
                except Exception as e:
                    logger.debug(f"提取 .doc 文本失败：{e}")
                
                md_path = doc_output_dir / f"{file_path.stem}.md"
                with open(md_path, 'w', encoding='utf-8') as f:
                    f.write(''.join(md_content))
                logger.info(f"已生成说明文件：{md_path}")
                return
            elif suffix == '.pdf':
                # 使用原有的 OCR 处理逻辑
                md_content.append(f"# {file_path.name}\n\n")
                md_content.append("## 文件说明\n\n")
                md_content.append("[PDF 文件格式 - 正在提取图片进行 OCR 识别]\n\n")
                md_content.append("---\n\n")
                image_info_list = self.extract_images_from_pdf(str(file_path), str(temp_dir))
                
                # 检查是否提取到图片
                if not image_info_list:
                    md_content.append("**未提取到任何图片**\n\n")
                    md_content.append("可能的原因：\n")
                    md_content.append("- PDF 文件只包含文本，没有嵌入图片\n")
                    md_content.append("- PDF 是扫描版但图片提取失败\n\n")
                    
                    logger.warning(f"PDF {file_path.name} 未提取到图片")
            else:
                logger.warning(f"不支持的文档格式：{suffix}")
                return
            
            # 只有非 PDF 文件或 PDF 处理失败时才执行 OCR 处理
            logger.info(f"准备 OCR 处理 {len(image_info_list)} 张图片")
            
            # 对每张图片进行 OCR 并添加到 MD 内容
            success_count = 0
            for img_info in image_info_list:
                img_path = img_info["image_path"]
                page_num = img_info.get("page_num", 1)
                img_filename = img_info.get("file_name", Path(img_path).name)
                
                if not os.path.exists(img_path):
                    logger.warning(f"图片文件不存在，跳过：{img_path}")
                    md_content.append(f"### 图片 {page_num} - {img_filename}\n\n")
                    md_content.append(f"**来源**: 第{page_num}页\n\n")
                    md_content.append(f"❌ 图片文件不存在\n\n")
                    md_content.append("---\n\n")
                    continue
                
                logger.info(f"正在 OCR 识别：{img_filename} (第{page_num}页)")
                ocr_text = self.ocr_image(img_path)
                
                if ocr_text and "OCR 识别失败" not in ocr_text:
                    success_count += 1
                
                md_content.append(f"### 图片 {page_num} - {img_filename}\n\n")
                md_content.append(f"**来源**: 第{page_num}页\n\n")
                md_content.append(f"## OCR 识别结果\n\n{ocr_text}\n\n")
                md_content.append("---\n\n")
                
                # 清理临时图片
                if os.path.exists(img_path):
                    os.remove(img_path)
                    logger.debug(f"已删除临时图片：{img_path}")
            
            logger.info(f"OCR 处理完成，成功 {success_count}/{len(image_info_list)} 张")
            
            # 写入 MD 文件（先删除已存在的）
            md_path = doc_output_dir / f"{file_path.stem}.md"
            if md_path.exists():
                md_path.unlink()
                logger.info(f"已删除旧 MD 文件：{md_path}")
            
            # 添加统计信息
            md_content.append(f"\n## 处理统计\n\n")
            md_content.append(f"- **总图片数**: {len(image_info_list)} 张\n\n")
            if 'success_count' in locals():
                md_content.append(f"- **成功识别**: {success_count} 张\n\n")
            
            with open(md_path, 'w', encoding='utf-8') as f:
                f.write(''.join(md_content))
            
            logger.info(f"已生成 MD 文件：{md_path}，共 {len(image_info_list)} 张图片")
            
        except Exception as e:
            logger.error(f"处理文档图片失败 {file_path}: {e}")
        finally:
            # 清理临时目录
            if temp_dir.exists():
                import shutil
                shutil.rmtree(temp_dir, ignore_errors=True)
