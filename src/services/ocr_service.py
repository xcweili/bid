"""OCR 服务 - 使用 GPUStack API 进行图片文字识别"""
import os
import base64
from io import BytesIO
from pathlib import Path
from typing import Optional
from loguru import logger
from PIL import Image
import openai


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
            # 读取图片并转换为 base64（外层已在线程中运行，直接操作）
            pil_img = Image.open(image_path)
            img_format = pil_img.format or 'png'
            buf = BytesIO()
            pil_img.save(buf, format=img_format)
            img_base64 = base64.b64encode(buf.getvalue()).decode()

            # 调用 GPUStack OCR API
            messages = [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/{img_format.lower()};base64,{img_base64}"
                            }
                        },
                        {
                            "type": "text",
                            "text": "OCR: 请识别图片中的所有文字内容，不要输出重复内容，模糊图片内容不要重复扫描输出"
                        }
                    ]
                }
            ]

            response = self.client.chat.completions.create(
                model=self.OCR_MODEL,
                messages=messages,
                temperature=0.0,
                timeout=30.0,
            )

            ocr_text = response.choices[0].message.content
            logger.info(f"OCR 识别成功：{image_path}")
            return ocr_text or ""

        except Exception as e:
            logger.error(f"OCR 识别失败 {image_path}: {e}")
            return f"[OCR 识别失败：{str(e)}]"

    def process_document_to_md(self, file_path: str, output_dir: str):
        """处理文档并生成同名.md 文件（仅支持 PDF）

        Args:
            file_path: 文档路径（仅支持 .pdf）
            output_dir: 输出目录（文档所在目录）
        """
        file_path = Path(file_path)
        suffix = file_path.suffix.lower()
        
        # 直接在原文件所在目录生成 MD 文件
        doc_output_dir = file_path.parent
        doc_output_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"开始处理文档：{file_path.name}, 输出目录：{doc_output_dir}")
        
        try:
            if suffix == '.pdf':
                # PDF 文件使用 opendataloader 处理
                logger.info(f"PDF 文件使用 opendataloader 处理: {file_path}")
                try:
                    from api.package_files_api import pdf_to_markdown
                    md_path = pdf_to_markdown(file_path, doc_output_dir)
                    if md_path and md_path.exists():
                        logger.info(f"PDF 转 MD 成功: {md_path}")
                    else:
                        logger.warning(f"PDF 转 MD 失败: {file_path}")
                except Exception as pdf_e:
                    logger.error(f"PDF 转 MD 异常 {file_path}: {pdf_e}")
            else:
                logger.warning(f"不支持的文档格式：{suffix}，仅支持 PDF 文件")
                
        except Exception as e:
            logger.error(f"处理文档失败 {file_path}: {e}")