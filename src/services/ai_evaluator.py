"""AI 评审服务 - 支持 PDF 处理和 OCR"""
import os
import json
import uuid
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
        """获取完整的文档内容,包括页码信息"""
        return self.raw_extracted_text
    
    def set_evaluation_result(self, result: str):
        """设置评分结果"""
        self.evaluation_result = result
    
    def get_evaluation_result(self) -> str:
        """获取评分结果"""
        return self.evaluation_result


class AIEvaluator:
    """AI 评审服务"""
    
    def __init__(self):
        self.llm_service = LLMService()
        self.ocr_service = OCRService()
    
    def analyze_document(self, file_path: str) -> DocumentInfo:
        """分析文档内容"""
        doc_info = DocumentInfo(file_path=file_path)
        
        try:
            # 读取 MD 文件内容（PDF 已经通过 opendataloader 转换）
            if file_path.lower().endswith('.md'):
                with open(file_path, 'r', encoding='utf-8') as f:
                    doc_info.raw_extracted_text = f.read()
                    doc_info.total_pages = doc_info.raw_extracted_text.count('第 ')
            
            logger.info(f"文档分析完成: {file_path}")
            
        except Exception as e:
            logger.error(f"分析文档失败 {file_path}: {e}")
        
        return doc_info
    
    def evaluate_with_rules(self, document_info: DocumentInfo, rules: List[Dict]) -> str:
        """使用规则评估文档"""
        try:
            # 调用 LLM 服务进行评估
            result = self.llm_service.evaluate(
                document_info.raw_extracted_text,
                rules
            )
            document_info.set_evaluation_result(result)
            return result
        except Exception as e:
            logger.error(f"评估文档失败: {e}")
            return f"评估失败: {str(e)}"
    
    def evaluate_bid(self, company_bid) -> Dict[str, Any]:
        """评估单个投标文件"""
        result = {
            "company_id": company_bid.id,
            "company_name": company_bid.company_name,
            "scores": [],
            "total_score": 0,
            "evaluation_details": []
        }
        
        try:
            # 获取投标文件路径
            bid_folder_path = company_bid.bid_folder_path
            
            # 查找所有 MD 文件
            md_files = []
            if os.path.exists(bid_folder_path):
                for root, dirs, files in os.walk(bid_folder_path):
                    for file in files:
                        if file.lower().endswith('.md'):
                            md_files.append(os.path.join(root, file))
            
            logger.info(f"找到 {len(md_files)} 个 MD 文件")
            
            # 分析所有文档
            all_content = []
            for md_file in md_files:
                doc_info = self.analyze_document(md_file)
                all_content.append(doc_info.raw_extracted_text)
            
            result["total_score"] = len(md_files) * 20  # 简单评分
            result["status"] = "completed"
            
        except Exception as e:
            logger.error(f"评估投标文件失败 {company_bid.company_name}: {e}")
            result["status"] = "failed"
            result["error"] = str(e)
        
        return result