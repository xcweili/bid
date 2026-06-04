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
        self.default_api_key = config.DIFY_API_KEY
        self.default_base_url = config.DIFY_BASE_URL.rstrip("/")
        self.default_workflow_id = config.DIFY_WORKFLOW_ID
    
    def _get_headers(self, api_key: str = None) -> Dict[str, str]:
        """获取请求头"""
        key = api_key or self.default_api_key
        return {
            "Authorization": f"Bearer {key}"
        }
    
    def _get_base_url(self, base_url: str = None) -> str:
        """获取基础URL，支持配置或默认值"""
        if base_url:
            return base_url.rstrip("/")
        # 默认地址
        return "http://10.255.216.2:8083/v1"

    async def upload_file(self, file_path: str, user: str, api_key: str = None, base_url: str = None) -> Optional[Dict[str, Any]]:
        """上传文件到 Dify
        
        Args:
            file_path: 本地文件路径
            user: 用户标识
            api_key: 自定义 API Key（可选）
            base_url: 自定义基础地址（可选）
            
        Returns:
            Dify 返回的文件信息，包含 id
        """
        key = api_key or self.default_api_key
        if not key:
            logger.error("API Key 未配置")
            return None

        url = f"{self._get_base_url(base_url)}/files/upload"
        headers = self._get_headers(api_key)
        
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                with open(file_path, "rb") as f:
                    files = {"file": (os.path.basename(file_path), f, "application/octet-stream")}
                    data = {"user": user}
                    
                    response = await client.post(
                        url,
                        headers=headers,
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
        workflow_id: str = None,
        response_mode: str = "blocking",
        api_key: str = None,
        base_url: str = None
    ) -> Optional[Dict[str, Any]]:
        """执行 Dify 工作流
        
        Args:
            inputs: 工作流输入参数，包含文件 ID 等
            user: 用户标识
            workflow_id: Dify 工作流 ID（可选），配置后使用带 workflow_id 的调用方式
            response_mode: 响应模式 (blocking/streaming)
            api_key: 自定义 API Key（可选）
            base_url: 自定义基础地址（可选）
            
        Returns:
            工作流执行结果
        """
        key = api_key or self.default_api_key
        if not key:
            logger.error("API Key 未配置")
            return None

        url_base = self._get_base_url(base_url)
        headers = {**self._get_headers(api_key), "Content-Type": "application/json"}
        
        # 根据是否配置 workflow_id 选择调用方式
        if workflow_id:
            # 方式1: 配置了 workflow_id，使用 /v1/workflows/{workflow_id}/run
            url = f"{url_base}/workflows/{workflow_id}/run"
            payload = {
                "inputs": inputs,
                "user": user,
                "response_mode": response_mode,
                "files": []
            }
            logger.info(f"使用带 workflow_id 的调用方式: {url}")
        else:
            # 方式2: 未配置 workflow_id，使用 /v1/workflows/run
            url = f"{url_base}/workflows/run"
            payload = {
                "inputs": inputs,
                "user": user,
                "response_mode": response_mode,
                "files": []
            }
            logger.info(f"使用不带 workflow_id 的调用方式: {url}")

        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                response = await client.post(
                    url,
                    headers=headers,
                    json=payload
                )
                
                if response.status_code == 200:
                    result = response.json()
                    run_id = result.get('workflow_run_id')
                    status = result.get('status')
                    logger.info(f"Dify 工作流执行成功: run_id={run_id}")
                    logger.info(f"Dify 工作流返回详情: status={status}, run_id={run_id}")
                    logger.debug(f"Dify 工作流完整返回: {json.dumps(result, ensure_ascii=False, indent=2)}")
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
        package_no: str,
        api_key: str = None,
        base_url: str = None,
        workflow_id: str = None
    ) -> Optional[Dict[str, Any]]:
        """评估单个投标人文件：上传文件 + 执行工作流
        
        Args:
            file_path: 本地 MD 文件路径
            bidder_name: 投标人名称
            file_name: 文件名
            package_no: 包号
            api_key: 自定义 API Key（可选）
            base_url: 自定义基础地址（可选）
            workflow_id: 自定义工作流ID（可选）
            
        Returns:
            工作流执行结果
        """
        user = f"pkg_{package_no}"
        
        # 1. 上传文件
        file_info = await self.upload_file(file_path, user, api_key, base_url)
        if not file_info:
            return None
        
        file_id = file_info.get("id")
        
        # 2. 执行工作流
        inputs = {
            "bidder_name": bidder_name,
            "file_name": file_name,
            "file_id": file_id
        }
        
        result = await self.run_workflow(inputs, user, workflow_id, "blocking", api_key, base_url)
        return result


dify_service = DifyService()