"""投标人API"""
from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from pathlib import Path
from loguru import logger

from models.project_structure import Bidder, Package, Section, Project
from models.database import db_session

router = APIRouter()


@router.get("/bidders/{bidder_id}/files", response_model=List[dict])
async def get_bidder_files(bidder_id: int):
    """获取投标人文件树"""
    db = db_session()
    try:
        bidder = db.query(Bidder).filter(Bidder.id == bidder_id).first()
        
        # 测试数据：河北信高真空开关电器有限公司
        test_company_name = "河北信高真空开关电器有限公司"
        if bidder and bidder.company_name == test_company_name:
            # 使用测试数据路径
            test_path = Path(__file__).parent.parent / "data/tasks/1/bids/投标文件" / test_company_name
            logger.info(f"使用测试数据路径: {test_path}")
            folder_path = str(test_path)
        elif bidder:
            # 获取投标人所属的包
            pkg = db.query(Package).filter(Package.id == bidder.package_id).first()
            if not pkg:
                return []
            folder_path = pkg.zip_file_path or ""
        else:
            raise HTTPException(status_code=404, detail="投标人不存在")
        
        if not folder_path:
            return []

        # 构建文件树
        def build_file_tree(folder: Path, parent_key: str = "") -> list:
            files = []
            try:
                items = list(folder.iterdir())
                for item in sorted(items):
                    if item.is_dir():
                        dir_name = item.name
                        dir_key = f"{parent_key}/{dir_name}" if parent_key else dir_name
                        dir_files = build_file_tree(item, dir_key)
                        files.append({
                            "key": dir_key,
                            "title": dir_name,
                            "isLeaf": False,
                            "children": dir_files
                        })
                    else:
                        file_name = item.name
                        file_key = f"{parent_key}/{file_name}" if parent_key else file_name
                        files.append({
                            "key": file_key,
                            "title": file_name,
                            "isLeaf": True
                        })
            except Exception as e:
                logger.error(f"读取文件夹失败 {folder}: {e}")
            return files

        folder = Path(folder_path).resolve()
        if not folder.exists():
            logger.warning(f"文件夹不存在: {folder}")
            return []

        file_tree = build_file_tree(folder)
        logger.info(f"文件树构建完成，共 {len(file_tree)} 个项目")
        return file_tree
    finally:
        db.close()


@router.post("/bidders/{bidder_id}/reparse")
async def reparse_bidder_files(bidder_id: int):
    """重新解析投标人文件"""
    db = db_session()
    try:
        bidder = db.query(Bidder).filter(Bidder.id == bidder_id).first()
        if not bidder:
            raise HTTPException(status_code=404, detail="投标人不存在")

        # 获取投标人所属的包
        pkg = db.query(Package).filter(Package.id == bidder.package_id).first()
        if not pkg:
            raise HTTPException(status_code=404, detail="包不存在")

        # 获取标段和项目信息
        section = db.query(Section).filter(Section.id == pkg.section_id).first()
        project = db.query(Project).filter(Project.id == section.project_id).first() if section else None

        logger.info(f"重新解析投标人文件: bidder_id={bidder_id}, company={bidder.company_name}, package={pkg.package_no}")

        # TODO: 这里应该调用文件解析的逻辑
        # 目前只是模拟解析过程
        # 在实际应用中，这里应该：
        # 1. 根据路径拉取远端文件到本地
        # 2. 启动文件解析任务

        # 更新投标人的解析状态为处理中
        # 注意：Bidder模型目前没有parse_status字段，需要添加

        return {"message": "重新解析任务已下发"}
    finally:
        db.close()


@router.get("/bidders", response_model=List[dict])
async def get_bidders(
    project_id: int = None,
    section_id: int = None,
    package_id: int = None
):
    """获取投标人列表"""
    db = db_session()
    try:
        query = db.query(Bidder)

        if package_id:
            query = query.filter(Bidder.package_id == package_id)
        elif section_id:
            packages = db.query(Package).filter(Package.section_id == section_id).all()
            package_ids = [p.id for p in packages]
            query = query.filter(Bidder.package_id.in_(package_ids))
        elif project_id:
            sections = db.query(Section).filter(Section.project_id == project_id).all()
            section_ids = [s.id for s in sections]
            packages = db.query(Package).filter(Package.section_id.in_(section_ids)).all()
            package_ids = [p.id for p in packages]
            query = query.filter(Bidder.package_id.in_(package_ids))

        bidders = query.all()
        
        result = []
        for bidder in bidders:
            bidder_dict = bidder.to_dict()
            # 添加解析状态（默认未解析）
            bidder_dict['parse_status'] = 'pending'
            result.append(bidder_dict)

        return result
    finally:
        db.close()
