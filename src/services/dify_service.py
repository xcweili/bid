"""Dify API 服务 - 文件上传和工作流执行"""
import os
import json
import httpx
from pathlib import Path
from typing import List, Dict, Optional, Any
from loguru import logger
from config import config


class DifyService:
    """Dify API 封装"""

    def __init__(self):
        self.api_key = config.DIFY_API_KEY
        self.base_url = config.DIFY_BASE_URL.rstrip("/")
        self.workflow_id = config.DIFY_WORKFLOW_ID
        self.headers = {
            "Authorization": f"Bearer {self.api_key}"
        }

    async def upload_file(self, file_path: str, user: str) -> Optional[Dict[str, Any]]:
        """上传文件到 Dify
        
        Args:
            file_path: 本地文件路径
            user: 用户标识
            
        Returns:
            Dify 返回的文件信息，包含 id
        """
        if not self.api_key:
            logger.error("DIFY_API_KEY 未配置")
            return None

        url = f"{self.base_url}/files/upload"
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                with open(file_path, "rb") as f:
                    files = {"file": (os.path.basename(file_path), f, "application/octet-stream")}
                    data = {"user": user}
                    
                    response = await client.post(
                        url,
                        headers=self.headers,
                        files=files,
                        data=data
                    )
                    
                    if response.status_code == 201:
                        result = response.json()
                        logger.info(f"Dify 文件上传成功: {file_path} -> id={result.get('id')}")
                        return result
                    else:
                        logger.error(f"Dify 文件上传失败: status={response.status_code}, body={response.text}")
                        return None
        except Exception as e:
            logger.error(f"Dify 文件上传异常: {e}")
            return None

    async def run_workflow(
        self,
        inputs: Dict[str, Any],
        user: str,
        response_mode: str = "blocking"
    ) -> Optional[Dict[str, Any]]:
        """执行 Dify 工作流
        
        Args:
            inputs: 工作流输入参数，包含文件 ID 等
            user: 用户标识
            response_mode: 响应模式 (blocking/streaming)
            
        Returns:
            工作流执行结果
        """
        if not self.api_key or not self.workflow_id:
            logger.error("DIFY_API_KEY 或 DIFY_WORKFLOW_ID 未配置")
            return None

        url = f"{self.base_url}/workflows/run"
        
        payload = {
            "inputs": inputs,
            "user": user,
            "response_mode": response_mode
        }

        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(
                    url,
                    headers={**self.headers, "Content-Type": "application/json"},
                    json=payload
                )
                
                if response.status_code == 200:
                    result = response.json()
                    logger.info(f"Dify 工作流执行成功: run_id={result.get('workflow_run_id')}")
                    return result
                else:
                    logger.error(f"Dify 工作流执行失败: status={response.status_code}, body={response.text}")
                    return None
        except Exception as e:
            logger.error(f"Dify 工作流执行异常: {e}")
            return None

    async def evaluate_bidder_file(
        self,
        file_path: str,
        bidder_name: str,
        file_name: str,
        package_no: str
    ) -> Optional[Dict[str, Any]]:
        """评估单个投标人文件：上传文件 + 执行工作流
        
        Args:
            file_path: 本地 MD 文件路径
            bidder_name: 投标人名称
            file_name: 文件名
            package_no: 包号
            
        Returns:
            工作流执行结果
        """
        user = f"pkg_{package_no}"
        
        # 1. 上传文件
        file_info = await self.upload_file(file_path, user)
        if not file_info:
            return None
        
        file_id = file_info.get("id")
        
        # 2. 执行工作流
        inputs = {
            "bidder_name": bidder_name,
            "file_name": file_name,
            "file_id": file_id
        }
        
        result = await self.run_workflow(inputs, user)
        return result


dify_service = DifyService()