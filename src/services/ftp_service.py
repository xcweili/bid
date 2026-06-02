"""FTP 文件拉取服务"""
import os
import ftplib
import asyncio
from pathlib import Path
from typing import List, Dict, Optional, Callable
from loguru import logger
from config import config
from services.file_processor import FileProcessor


class FTPService:
    """FTP 文件拉取服务"""
    
    def __init__(self):
        # 文件存储目录（与 zip 上传文件存放的地方一致：src/data/package_files/）
        self.base_dir = Path(os.path.dirname(__file__)).parent / "data" / "package_files"
        self.base_dir.mkdir(parents=True, exist_ok=True)
        
        # 文件处理器
        self.file_processor: Optional[FileProcessor] = None
    
    def _get_ftp_config(self):
        """动态获取 FTP 配置（每次连接时读取，支持运行时修改）"""
        return {
            'host': os.getenv("FTP_HOST", config.FTP_HOST),
            'port': int(os.getenv("FTP_PORT", str(config.FTP_PORT))),
            'username': os.getenv("FTP_USERNAME", config.FTP_USERNAME),
            'password': os.getenv("FTP_PASSWORD", config.FTP_PASSWORD),
            'timeout': int(os.getenv("FTP_TIMEOUT", str(config.FTP_TIMEOUT))),
            'use_passive': os.getenv("FTP_USE_PASSIVE", str(config.FTP_USE_PASSIVE)).lower() == "true"
        }
    
    def connect(self) -> ftplib.FTP:
        """连接到 FTP 服务器"""
        try:
            # 动态获取配置
            ftp_config = self._get_ftp_config()
            
            ftp = ftplib.FTP()
            ftp.connect(ftp_config['host'], ftp_config['port'], timeout=ftp_config['timeout'])
            ftp.set_pasv(ftp_config['use_passive'])
            
            if ftp_config['username'] and ftp_config['password']:
                ftp.login(ftp_config['username'], ftp_config['password'])
                logger.info(f"FTP 登录成功：{ftp_config['username']}@{ftp_config['host']}:{ftp_config['port']}")
            else:
                ftp.login()  # 匿名登录
                logger.info(f"FTP 匿名登录成功：{ftp_config['host']}:{ftp_config['port']}")
            
            return ftp
        except Exception as e:
            logger.error(f"FTP 连接失败：{e}")
            raise
    
    def download_file(self, ftp: ftplib.FTP, remote_path: str, local_path: Path) -> bool:
        """下载单个文件
        
        Args:
            ftp: FTP 连接实例
            remote_path: 远端文件路径
            local_path: 本地保存路径
            
        Returns:
            是否下载成功
        """
        try:
            # 确保本地目录存在
            local_path.parent.mkdir(parents=True, exist_ok=True)
            
            # 下载文件
            with open(local_path, 'wb') as f:
                ftp.retrbinary(f'RETR {remote_path}', f.write)
            
            logger.info(f"FTP 文件下载成功：{remote_path} -> {local_path}")
            return True
        except Exception as e:
            logger.error(f"FTP 文件下载失败：{remote_path} - {e}")
            return False
    
    def download_files_async(
        self,
        files: List[Dict],
        project_code: str,
        section_code: str,
        package_no: str,
        on_file_downloaded: Optional[Callable[[str, Path], None]] = None
    ) -> asyncio.Future:
        """异步下载文件（支持边拉取边解析）
        
        Args:
            files: 文件列表，每个元素包含 {"file_path": [远端路径列表]}
            project_code: 项目编码
            section_code: 标段编码
            package_no: 包号
            on_file_downloaded: 文件下载完成后的回调函数，参数为 (远端路径，本地路径)
            
        Returns:
            asyncio.Future，表示下载任务
        """
        loop = asyncio.get_event_loop()
        
        async def download_task():
            """异步下载任务"""
            # 创建本地存储目录：uploads/{project_code}/{section_code}/{package_no}/
            local_base_dir = self.base_dir / project_code / section_code / package_no
            local_base_dir.mkdir(parents=True, exist_ok=True)
            
            logger.info(f"开始 FTP 文件下载，目标目录：{local_base_dir}")
            
            # 连接到 FTP 服务器
            ftp = self.connect()
            
            try:
                total_files = sum(len(f.get('file_path', [])) for f in files)
                downloaded_count = 0
                failed_files = []
                
                # 遍历所有文件
                for file_item in files:
                    remote_paths = file_item.get('file_path', [])
                    
                    for remote_path in remote_paths:
                        try:
                            # 提取文件名
                            file_name = os.path.basename(remote_path)
                            local_path = local_base_dir / file_name
                            
                            # 下载文件
                            success = await loop.run_in_executor(
                                None,
                                self.download_file,
                                ftp,
                                remote_path,
                                local_path
                            )
                            
                            if success:
                                downloaded_count += 1
                                
                                # 调用回调函数（用于边拉取边解析）
                                if on_file_downloaded:
                                    try:
                                        on_file_downloaded(remote_path, local_path)
                                    except Exception as e:
                                        logger.error(f"文件下载回调失败：{remote_path} - {e}")
                            else:
                                failed_files.append(remote_path)
                            
                            # 记录进度
                            if downloaded_count % 10 == 0 or downloaded_count == total_files:
                                logger.info(f"FTP 下载进度：{downloaded_count}/{total_files}")
                                
                        except Exception as e:
                            logger.error(f"FTP 文件下载异常：{remote_path} - {e}")
                            failed_files.append(remote_path)
                
                logger.info(f"FTP 文件下载完成：成功 {downloaded_count}/{total_files}, 失败 {len(failed_files)}")
                
                if failed_files:
                    logger.warning(f"失败的文件列表：{failed_files[:10]}...")  # 只显示前 10 个
                
                return {
                    "success": downloaded_count == total_files,
                    "total": total_files,
                    "downloaded": downloaded_count,
                    "failed": failed_files,
                    "local_dir": str(local_base_dir)
                }
                
            except Exception as e:
                logger.error(f"FTP 下载任务失败：{e}")
                return {
                    "success": False,
                    "total": total_files,
                    "downloaded": 0,
                    "failed": [str(e)],
                    "local_dir": str(local_base_dir)
                }
            finally:
                try:
                    ftp.quit()
                    logger.info("FTP 连接已关闭")
                except:
                    pass
        
        # 创建异步任务
        return loop.create_task(download_task())
    
    def download_files_sync(
        self,
        files: List[Dict],
        project_code: str,
        section_code: str,
        package_no: str
    ) -> Dict:
        """同步下载文件（阻塞方式）
        
        Args:
            files: 文件列表，每个元素包含 {"file_path": [远端路径列表]}
            project_code: 项目编码
            section_code: 标段编码
            package_no: 包号
            
        Returns:
            下载结果
        """
        import time
        
        # 创建本地存储目录
        local_base_dir = self.base_dir / project_code / section_code / package_no
        local_base_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"开始 FTP 文件下载（同步模式），目标目录：{local_base_dir}")
        
        # 连接到 FTP 服务器
        ftp = self.connect()
        
        try:
            total_files = sum(len(f.get('file_path', [])) for f in files)
            downloaded_count = 0
            failed_files = []
            
            # 遍历所有文件
            for file_item in files:
                remote_paths = file_item.get('file_path', [])
                
                for remote_path in remote_paths:
                    try:
                        # 提取文件名
                        file_name = os.path.basename(remote_path)
                        local_path = local_base_dir / file_name
                        
                        # 下载文件
                        success = self.download_file(ftp, remote_path, local_path)
                        
                        if success:
                            downloaded_count += 1
                        else:
                            failed_files.append(remote_path)
                        
                        # 记录进度
                        if downloaded_count % 10 == 0 or downloaded_count == total_files:
                            logger.info(f"FTP 下载进度：{downloaded_count}/{total_files}")
                            
                    except Exception as e:
                        logger.error(f"FTP 文件下载异常：{remote_path} - {e}")
                        failed_files.append(remote_path)
            
            logger.info(f"FTP 文件下载完成（同步模式）：成功 {downloaded_count}/{total_files}, 失败 {len(failed_files)}")
            
            return {
                "success": downloaded_count == total_files,
                "total": total_files,
                "downloaded": downloaded_count,
                "failed": failed_files,
                "local_dir": str(local_base_dir)
            }
            
        except Exception as e:
            logger.error(f"FTP 下载任务失败：{e}")
            return {
                "success": False,
                "total": sum(len(f.get('file_path', [])) for f in files),
                "downloaded": 0,
                "failed": [str(e)],
                "local_dir": str(local_base_dir)
            }
        finally:
            try:
                ftp.quit()
                logger.info("FTP 连接已关闭")
            except:
                pass


# 全局 FTP 服务实例
ftp_service = FTPService()
