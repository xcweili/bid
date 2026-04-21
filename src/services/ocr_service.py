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
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()


class OCRService:
    """OCR 服务 - 使用 GPUStack API 进行图片文字识别"""
    
    # GPUStack API 配置
    API_KEY = os.getenv("LLM_API_KEY", "gpustack_ddb0c780dd843b12_67fea5d3d141e2f75091b6ba6e495707")
    BASE_URL = os.getenv("LLM_BASE_URL", "http://10.255.216.2/v1")
    
    # 模型配置（仅保留两个模型）
    OCR_MODEL = os.getenv("OCR_MODEL", "ocr")
    QWEN_122B_MODEL = os.getenv("QWEN_122B_MODEL", "qwen3.5-122b")

    def __init__(self):
        # 初始化 OpenAI 客户端
        self.client = openai.Client(
            api_key=self.API_KEY,
            base_url=self.BASE_URL,
        )
        logger.info(f"OCR 服务初始化：BASE_URL={self.BASE_URL}, OCR_MODEL={self.OCR_MODEL}, QWEN_122B={self.QWEN_122B_MODEL}")

    def ocr_image(self, image_path: str) -> str:
        """对单张图片进行 OCR 识别"""
        if not os.path.exists(image_path):
            logger.error(f"图片文件不存在：{image_path}")
            return ""

        try:
            img = Image.open(image_path)
            buffered = BytesIO()
            img.save(buffered, format=img.format)
            img_base64 = base64.b64encode(buffered.getvalue()).decode()
            
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
        """从 docx 文件中提取图片"""
        import zipfile as zf
        image_paths = []
        
        try:
            with zf.ZipFile(docx_path, 'r') as zip_ref:
                for name in zip_ref.namelist():
                    if name.startswith('word/media/'):
                        ext = os.path.splitext(name)[1].lower()
                        if ext in ['.png', '.jpg', '.jpeg', '.bmp', '.gif']:
                            img_name = f"{uuid.uuid4()}{ext}"
                            img_path = os.path.join(output_dir, img_name)
                            with open(img_path, 'wb') as f:
                                f.write(zip_ref.read(name))
                            image_paths.append(img_path)
        except Exception as e:
            logger.error(f"提取图片失败 {docx_path}: {e}")
        
        return image_paths

    def process_document_to_md(self, doc_path: str, output_dir: str) -> str:
        """处理文档（doc/docx/pdf）为 Markdown
        
        1. 提取文档中的文本内容
        2. 提取图片并进行 OCR 识别
        3. 组合成 Markdown 格式
        """
        from pathlib import Path
        
        doc_path = Path(doc_path)
        ext = doc_path.suffix.lower()
        md_content = []
        
        try:
            if ext == '.docx':
                # 提取文本
                try:
                    from docx import Document
                    doc = Document(doc_path)
                    for para in doc.paragraphs:
                        if para.text.strip():
                            md_content.append(para.text)
                except Exception as e:
                    logger.error(f"读取 docx 文本失败 {doc_path}: {e}")
                
                # 提取并 OCR 图片
                temp_img_dir = os.path.join(output_dir, f"{doc_path.stem}_images")
                os.makedirs(temp_img_dir, exist_ok=True)
                images = self.extract_images_from_docx(str(doc_path), temp_img_dir)
                
                for img_path in images:
                    ocr_text = self.ocr_image(img_path)
                    if ocr_text and "[OCR 识别失败" not in ocr_text:
                        md_content.append(f"\n![OCR]({os.path.basename(img_path)})\n{ocr_text}\n")
                    # 清理临时图片
                    try:
                        os.remove(img_path)
                    except:
                        pass
                
                if temp_img_dir and os.path.exists(temp_img_dir):
                    try:
                        shutil.rmtree(temp_img_dir)
                    except:
                        pass
                        
            elif ext == '.doc':
                md_content.append(f"[DOC 文件需要转换：{doc_path.name}]")
                
            elif ext == '.pdf':
                try:
                    import fitz
                    doc = fitz.open(str(doc_path))
                    for page_num, page in enumerate(doc, 1):
                        text = page.get_text()
                        if text.strip():
                            md_content.append(f"### 第{page_num}页\n{text}")
                        
                        # 提取并 OCR 图片 - 修复 PyMuPDF 版本兼容性问题
                        image_list = page.get_images(full=True)
                        for img_index, img in enumerate(image_list):
                            xref = img[0]
                            try:
                                # 新版本的 PyMuPDF 使用 doc.extract_image
                                base_image = doc.extract_image(xref)
                                img_bytes = base_image["image"]
                                img_ext = base_image["ext"]
                            except (AttributeError, KeyError):
                                # 旧版本使用 page.extract_image
                                try:
                                    img_data = page.extract_image(xref)
                                    img_bytes = img_data["image"]
                                    img_ext = img_data["ext"]
                                except Exception as e2:
                                    logger.warning(f"无法提取 PDF 图片 {xref}: {e2}")
                                    continue
                            
                            img_path = os.path.join(output_dir, f"{doc_path.stem}_page{page_num}_img{img_index}.{img_ext}")
                            
                            with open(img_path, "wb") as f:
                                f.write(img_bytes)
                            
                            ocr_text = self.ocr_image(img_path)
                            if ocr_text and "[OCR 识别失败" not in ocr_text:
                                md_content.append(f"\n![OCR]({os.path.basename(img_path)})\n{ocr_text}\n")
                            
                            try:
                                os.remove(img_path)
                            except:
                                pass
                    doc.close()
                except Exception as e:
                    logger.error(f"读取 PDF 失败 {doc_path}: {e}")
                    md_content.append(f"[PDF 读取失败：{str(e)}]")
            
            md_text = "\n\n".join(md_content) if md_content else "[文档中没有可提取的内容]"
            
            # 保存 MD 文件
            md_path = doc_path.with_suffix('.md')
            with open(md_path, 'w', encoding='utf-8') as f:
                f.write(f"# {doc_path.name}\n\n")
                f.write(md_text)
            
            logger.info(f"文档处理完成：{doc_path} -> {md_path}")
            return str(md_path)
            
        except Exception as e:
            logger.error(f"文档处理失败 {doc_path}: {e}", exc_info=True)
            return ""
