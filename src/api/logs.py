"""日志 API"""
from fastapi import APIRouter, HTTPException, Query
from pathlib import Path
from typing import Optional
from loguru import logger
import os

router = APIRouter()

# 使用基于src目录的绝对路径
LOG_DIR = Path(__file__).parent.parent / "logs"
LOG_FILE = LOG_DIR / "bid.log"


@router.get("")
async def get_logs(
    lines: int = Query(100, ge=1, le=1000, description="返回多少行日志"),
    task_id: Optional[int] = Query(None, description="过滤特定任务的日志")
):
    """获取最新日志
    
    Args:
        lines: 返回多少行日志（1-1000）
        task_id: 可选，过滤特定任务的日志
    """
    if not LOG_FILE.exists():
        return {"logs": [], "message": "暂无日志"}
    
    try:
        with open(LOG_FILE, 'r', encoding='utf-8') as f:
            all_lines = f.readlines()
        
        # 取最后 N 行
        recent_lines = all_lines[-lines:] if len(all_lines) > lines else all_lines
        
        # 如果指定了 task_id，过滤日志
        if task_id is not None:
            # 根据 [TASK:{task_id}] 标志来过滤日志
            task_id_str = str(task_id)
            filtered_lines = [
                line for line in recent_lines 
                if f"[TASK:{task_id_str}]" in line
            ]
            # 如果没有过滤到任何日志，返回所有最近的日志
            if not filtered_lines:
                filtered_lines = recent_lines
            recent_lines = filtered_lines
        
        # 格式化日志
        logs = []
        for line in recent_lines:
            line = line.strip()
            if not line:
                continue
            
            # 解析日志格式：time | level | message
            parts = line.split(" | ")
            if len(parts) >= 3:
                # 确保级别是大写的
                level = parts[1].upper()
                logs.append({
                    "time": parts[0],
                    "level": level,
                    "message": " | ".join(parts[2:])
                })
            else:
                # 尝试从行首提取级别信息
                level = "INFO"
                if line.startswith("ERROR"):
                    level = "ERROR"
                elif line.startswith("WARNING"):
                    level = "WARNING"
                elif line.startswith("DEBUG"):
                    level = "DEBUG"
                elif line.startswith("SUCCESS"):
                    level = "SUCCESS"
                
                logs.append({
                    "time": "",
                    "level": level,
                    "message": line
                })
        
        return {
            "logs": logs,
            "total_lines": len(all_lines),
            "returned_lines": len(logs)
        }
    except Exception as e:
        logger.error(f"读取日志失败：{e}")
        raise HTTPException(status_code=500, detail=f"读取日志失败：{str(e)}")


@router.get("/file")
async def get_log_file(
    lines: int = Query(100, ge=1, le=1000, description="返回多少行日志"),
    start_line: int = Query(0, ge=0, description="从第几行开始读取")
):
    """获取日志文件内容（支持分页）
    
    Args:
        start_line: 从第几行开始（0-indexed）
        lines: 返回多少行
    """
    if not LOG_FILE.exists():
        return {"content": "", "total_lines": 0}
    
    try:
        with open(LOG_FILE, 'r', encoding='utf-8') as f:
            all_lines = f.readlines()
        
        total_lines = len(all_lines)
        
        # 计算实际读取范围
        end_line = min(start_line + lines, total_lines)
        selected_lines = all_lines[start_line:end_line]
        
        return {
            "content": "".join(selected_lines),
            "total_lines": total_lines,
            "start_line": start_line,
            "end_line": end_line,
            "has_more": end_line < total_lines
        }
    except Exception as e:
        logger.error(f"读取日志文件失败：{e}")
        raise HTTPException(status_code=500, detail=f"读取日志文件失败：{str(e)}")


@router.get("/tail")
async def tail_logs(
    lines: int = Query(50, ge=1, le=500, description="返回最后多少行")
):
    """实时查看最新日志（适合前端轮询）
    
    返回最后 N 行日志，前端可以定期调用此接口实现实时日志查看
    """
    return await get_logs(lines=lines)
