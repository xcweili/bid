# -*- coding: utf-8 -*-
"""
LLM 和 OCR 服务 - 基于 openai_demo.py 封装
"""
import base64
from io import BytesIO
from pathlib import Path
from typing import Optional
from PIL import Image
from loguru import logger
import os
import openai
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# GPUStack API 配置
client = openai.Client(
    api_key=os.getenv("LLM_API_KEY", "gpustack_ddb0c780dd843b12_67fea5d3d141e2f75091b6ba6e495707"),
    base_url=os.getenv("LLM_BASE_URL", "http://10.255.216.2/v1"),
)

# 模型配置（仅保留两个模型）
OCR_MODEL = os.getenv("OCR_MODEL", "ocr")
QWEN_122B_MODEL = os.getenv("QWEN_122B_MODEL", "qwen3.5-122b")

logger.info(f"LLM 服务初始化：BASE_URL={client.base_url}")
logger.info(f"可用模型：OCR={OCR_MODEL}, QWEN_122B={QWEN_122B_MODEL}")


class LLMService:
    """LLM 服务类"""
    
    def __init__(self, model: str = QWEN_122B_MODEL):
        self.model = model
    
    def chat(self, system_content: str, user_content: str) -> str:
        """聊天对话"""
        try:
            response = client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_content},
                    {"role": "user", "content": user_content},
                ],
                temperature=0,
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"LLM 聊天失败：{e}")
            return ""
    
    def chat_with_img(self, img_path: str, user_text: str = "请描述这张图片") -> str:
        """带图片的聊天"""
        try:
            img = Image.open(img_path)
            buffered = BytesIO()
            img.save(buffered, format=img.format)
            img_base64 = base64.b64encode(buffered.getvalue()).decode()
            
            response = client.chat.completions.create(
                model=QWEN_122B_MODEL,
                messages=[
                    {"role": "system", "content": "你是一个多模态理解助手"},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": user_text},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/{img.format.lower()};base64,{img_base64}"
                                },
                            },
                        ],
                    },
                ],
                temperature=0,
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"图片聊天失败：{e}")
            return ""
    
    def ocr(self, img_path: str) -> str:
        """OCR 文字识别"""
        try:
            img = Image.open(img_path)
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
                            "text": "OCR:"
                        }
                    ]
                }
            ]
            
            response = client.chat.completions.create(
                model=OCR_MODEL,
                messages=messages,
                temperature=0,
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"OCR 识别失败：{e}")
            return ""
    
    def evaluate_bid(self, rule_content: str, document_content: str) -> str:
        """投标评审"""
        system_content = """你是一位专业的评标专家，精通根据规则以及文档内容进行评审。你的任务是：

                            1. 仔细阅读评分规则和投标人提交的证明材料
                            2. 根据规则的内容，查找原文内容并进行对比分析
                            3. 对每个评分项进行客观、公正的评价
                            4. 为每一条评分结果提供具体的原因，包括引用原文内容
                            5. 确保评审结果的准确性和公正性"""
        
        user_content = f"""请根据以下评分规则和投标人证明材料进行评审：

                            # 评分规则
                            {rule_content}

                            # 投标人证明材料
                            {document_content}

                            请输出：
                            1. 每个评分项的评分及原因
                            2. 最终得分和评审结论

                            每个评分项都需要具体说明引用的原文内容和评分依据。"""
        
        return self.chat(system_content, user_content)
    
    def generate_content(self, prompt: str) -> str:
        """生成内容"""
        system_prompt = """你是一位专业的评标专家，精通根据规则以及文档内容进行评审。你的任务是：

                        1. 仔细阅读评分规则和投标人提交的证明材料
                        2. 根据规则的内容，查找原文内容并进行对比分析
                        3. 对每个评分项进行客观、公正的评价
                        4. 为每一条评分结果提供具体的原因，包括引用原文内容
                        5. 确保评审结果的准确性和公正性"""
        
        return self.chat(system_prompt, prompt)


# 单例实例
llm_service = LLMService()
