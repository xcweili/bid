"""日志 API - 实时查看评审日志"""
from fastapi import APIRouter, HTTPException, Request
from loguru import logger
import os
from typing import Optional

router = APIRouter(tags=["日志"])


def get_current_user_from_request(request: Request):
    """从请求中获取当前用户"""
    from api.middleware import get_current_user_from_request as auth_get_user
    return auth_get_user(request)


def get_log_file_path():
    """获取日志文件路径"""
    log_paths = [
        "/home/xcweili/.openclaw/workspace/bid/src/logs/bid.log",
        "/tmp/bid-backend.log",
    ]
    for path in log_paths:
        if os.path.exists(path):
            return path
    return None


@router.get("/tail-logs")
async def tail_logs(request: Request, assignment_id: Optional[int] = None, lines: int = 20):
    """实时日志追踪（适合前端轮询）"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    try:
        log_file = get_log_file_path()
        if not log_file:
            return {"logs": [], "total_lines": 0, "has_more": False}
        
        with open(log_file, 'r', encoding='utf-8') as f:
            all_lines = f.readlines()
        
        # 过滤与 assignment_id 相关的日志
        if assignment_id:
            relevant_logs = [
                line.strip() for line in all_lines 
                if str(assignment_id) in line or 'evaluation' in line.lower() or '评审' in line
            ]
        else:
            relevant_logs = [line.strip() for line in all_lines]
        
        recent_logs = relevant_logs[-lines:] if len(relevant_logs) > lines else relevant_logs
        
        return {
            "logs": recent_logs,
            "total_lines": len(relevant_logs),
            "has_more": len(relevant_logs) > lines
        }
        
    except Exception as e:
        logger.error(f"读取日志失败：{e}")
        raise HTTPException(status_code=500, detail=f"读取日志失败：{str(e)}")


@router.get("/recent")
async def get_recent_logs(request: Request, lines: int = 50, keyword: Optional[str] = None):
    """获取最近的日志"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    try:
        log_file = get_log_file_path()
        if not log_file:
            return {"logs": [], "total_lines": 0}
        
        with open(log_file, 'r', encoding='utf-8') as f:
            all_lines = f.readlines()
        
        if keyword:
            all_lines = [line for line in all_lines if keyword in line]
        
        recent_logs = all_lines[-lines:] if len(all_lines) > lines else all_lines
        
        return {
            "total_lines": len(all_lines),
            "logs": [line.strip() for line in recent_logs]
        }
        
    except Exception as e:
        logger.error(f"读取日志失败：{e}")
        raise HTTPException(status_code=500, detail=f"读取日志失败：{str(e)}")


@router.get("/evaluation/{assignment_id}")
async def get_evaluation_logs(request: Request, assignment_id: int, lines: int = 100):
    """获取评审任务的日志"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    try:
        log_file = get_log_file_path()
        if not log_file:
            return {"assignment_id": assignment_id, "logs": [], "message": "日志文件不存在"}
        
        with open(log_file, 'r', encoding='utf-8') as f:
            all_lines = f.readlines()
        
        relevant_logs = []
        for line in all_lines:
            if (str(assignment_id) in line or 
                'evaluation' in line.lower() or 
                '评审' in line or
                'AI 评审' in line or
                '启动评审' in line):
                relevant_logs.append(line.strip())
        
        recent_logs = relevant_logs[-lines:] if len(relevant_logs) > lines else relevant_logs
        
        return {
            "assignment_id": assignment_id,
            "total_lines": len(relevant_logs),
            "logs": recent_logs
        }
        
    except Exception as e:
        logger.error(f"读取日志失败：{e}")
        raise HTTPException(status_code=500, detail=f"读取日志失败：{str(e)}")
