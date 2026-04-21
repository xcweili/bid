"""任务分派服务 - 分包、团队分配、子任务生成"""
import json
from typing import List, Dict, Optional
from loguru import logger
from sqlalchemy.orm import Session
from datetime import datetime

from models.database import db_session
from models.extended_models import (
    Project, Package, SubTask, Team, User,
    ProjectType, TaskType, DispatchMode, CompanyBidNew as CompanyBid
)


class TaskDispatchService:
    """任务分派服务类"""

    def __init__(self):
        pass

    def split_packages(self, project_id: int, package_count: int, 
                      creator_id: int, package_names: List[str] = None) -> List[Package]:
        """分包操作
        
        Args:
            project_id: 项目 ID
            package_count: 分包数量
            creator_id: 创建者 ID（评标组长）
            package_names: 包名称列表（可选，不传则自动生成）
        
        Returns:
            创建的包列表
        """
        db = db_session()
        try:
            # 获取项目
            project = db.query(Project).filter(Project.id == project_id).first()
            if not project:
                raise ValueError(f"项目不存在：{project_id}")
            
            # 检查项目状态
            if project.status not in ["draft", "packaging"]:
                raise ValueError(f"项目状态不允许分包：{project.status}")
            
            # 创建包
            packages = []
            for i in range(package_count):
                package_name = package_names[i] if package_names else f"包{i+1}"
                
                package = Package(
                    project_id=project_id,
                    package_name=package_name,
                    package_order=i + 1,
                    status="pending",
                    assigned_by=creator_id,
                    created_at=datetime.now()
                )
                db.add(package)
                packages.append(package)
            
            # 更新项目状态和包数量
            project.total_packages = package_count
            project.status = "packaging"
            project.updated_at = datetime.now()
            
            db.commit()
            db.refresh(packages[0])  # 刷新获取 ID
            
            logger.info(f"项目 {project_id} 分包完成，共 {package_count} 个包")
            return packages

        except Exception as e:
            db.rollback()
            logger.error(f"分包失败：{e}")
            raise
        finally:
            db.close()

    def assign_package_to_team(self, package_id: int, team_id: int, 
                               assigned_by: int) -> Package:
        """将包分派给团队
        
        Args:
            package_id: 包 ID
            team_id: 团队 ID
            assigned_by: 分派人 ID
        
        Returns:
            更新后的包
        """
        db = db_session()
        try:
            package = db.query(Package).filter(Package.id == package_id).first()
            if not package:
                raise ValueError(f"包不存在：{package_id}")
            
            team = db.query(Team).filter(Team.id == team_id).first()
            if not team:
                raise ValueError(f"团队不存在：{team_id}")
            
            package.assigned_team_id = team_id
            package.assigned_by = assigned_by
            package.assigned_at = datetime.now()
            package.status = "assigned"
            
            db.commit()
            db.refresh(package)
            
            logger.info(f"包 {package_id} 已分派给团队 {team_id}")
            return package

        except Exception as e:
            db.rollback()
            logger.error(f"分派包失败：{e}")
            raise
        finally:
            db.close()

    def batch_assign_packages(self, project_id: int, 
                              package_team_mapping: Dict[int, int],
                              assigned_by: int) -> Dict:
        """批量分派包给团队
        
        Args:
            project_id: 项目 ID
            package_team_mapping: {package_id: team_id} 映射
            assigned_by: 分派人 ID
        
        Returns:
            分派结果统计
        """
        db = db_session()
        try:
            success_count = 0
            failed_count = 0
            errors = []
            
            for package_id, team_id in package_team_mapping.items():
                try:
                    self.assign_package_to_team(package_id, team_id, assigned_by)
                    success_count += 1
                except Exception as e:
                    failed_count += 1
                    errors.append(f"包 {package_id}: {str(e)}")
            
            # 更新项目状态
            project = db.query(Project).filter(Project.id == project_id).first()
            if project:
                project.status = "dispatching"
                project.updated_at = datetime.now()
                db.commit()
            
            return {
                "success_count": success_count,
                "failed_count": failed_count,
                "errors": errors
            }

        except Exception as e:
            db.rollback()
            logger.error(f"批量分派失败：{e}")
            raise
        finally:
            db.close()

    def create_subtasks_by_document(self, package_id: int, 
                                    evaluator_list: List[Dict],
                                    mode: str = "by_document") -> List[SubTask]:
        """按文档模式创建子任务
        
        Args:
            package_id: 包 ID
            evaluator_list: 评审员列表 [{"evaluator_id": int, "task_type": "technical|business", "documents": [...]}]
            mode: 分工模式
        
        Returns:
            创建的子任务列表
        """
        db = db_session()
        try:
            subtasks = []
            
            for eval_info in evaluator_list:
                subtask = SubTask(
                    package_id=package_id,
                    evaluator_id=eval_info.get("evaluator_id"),
                    task_type=eval_info.get("task_type", "technical"),
                    mode=mode,
                    assigned_documents=json.dumps(eval_info.get("documents", [])),
                    assigned_criteria=None,
                    status="pending",
                    created_at=datetime.now()
                )
                db.add(subtask)
                subtasks.append(subtask)
            
            # 更新包状态
            package = db.query(Package).filter(Package.id == package_id).first()
            if package:
                package.status = "in_progress"
            
            db.commit()
            
            logger.info(f"包 {package_id} 创建 {len(subtasks)} 个子任务（按文档模式）")
            return subtasks

        except Exception as e:
            db.rollback()
            logger.error(f"创建子任务失败：{e}")
            raise
        finally:
            db.close()

    def create_subtasks_by_criteria(self, package_id: int,
                                    evaluator_list: List[Dict],
                                    mode: str = "by_criteria") -> List[SubTask]:
        """按评审项模式创建子任务
        
        Args:
            package_id: 包 ID
            evaluator_list: 评审员列表 [{"evaluator_id": int, "task_type": "technical|business", "criteria": [...]}]
            mode: 分工模式
        
        Returns:
            创建的子任务列表
        """
        db = db_session()
        try:
            subtasks = []
            
            for eval_info in evaluator_list:
                subtask = SubTask(
                    package_id=package_id,
                    evaluator_id=eval_info.get("evaluator_id"),
                    task_type=eval_info.get("task_type", "technical"),
                    mode=mode,
                    assigned_documents=None,
                    assigned_criteria=json.dumps(eval_info.get("criteria", [])),
                    status="pending",
                    created_at=datetime.now()
                )
                db.add(subtask)
                subtasks.append(subtask)
            
            # 更新包状态
            package = db.query(Package).filter(Package.id == package_id).first()
            if package:
                package.status = "in_progress"
            
            db.commit()
            
            logger.info(f"包 {package_id} 创建 {len(subtasks)} 个子任务（按评审项模式）")
            return subtasks

        except Exception as e:
            db.rollback()
            logger.error(f"创建子任务失败：{e}")
            raise
        finally:
            db.close()

    def get_package_dispatch_plan(self, project_id: int, team_count: int) -> Dict:
        """生成分包建议方案
        
        Args:
            project_id: 项目 ID
            team_count: 团队数量
        
        Returns:
            建议的分包方案
        """
        db = db_session()
        try:
            # 获取项目的所有包
            packages = db.query(Package).filter(Package.id == project_id).all()
            if not packages:
                packages = db.query(Package).filter(Package.project_id == project_id).all()
            
            total_packages = len(packages)
            packages_per_team = total_packages // team_count
            remainder = total_packages % team_count
            
            plan = []
            start = 0
            for i in range(team_count):
                count = packages_per_team + (1 if i < remainder else 0)
                plan.append({
                    "team_index": i + 1,
                    "package_range": f"{start + 1}-{start + count}",
                    "package_count": count,
                    "package_ids": [p.id for p in packages[start:start + count]]
                })
                start += count
            
            return {
                "total_packages": total_packages,
                "team_count": team_count,
                "plan": plan
            }

        finally:
            db.close()


# 全局服务实例
dispatch_service = TaskDispatchService()
