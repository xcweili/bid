"""规则模板服务 - 评审规则模板管理"""
import json
from typing import List, Dict, Optional
from loguru import logger
from sqlalchemy.orm import Session
from datetime import datetime

from models.database import db_session
from models.extended_models import RuleTemplate, EvaluationRuleNew as EvaluationRule, ProjectType, User


class RuleTemplateService:
    """规则模板服务类"""

    def __init__(self):
        # 预定义的评审规则模板
        self.default_templates = {
            "service": {
                "template_name": "服务类评审模板",
                "description": "适用于服务类项目的评审规则",
                "items": [
                    {
                        "item_name": "技术方案",
                        "max_score": 30,
                        "scoring_criteria": "技术方案是否完整、科学、可行；对项目的理解是否透彻；技术路线是否先进合理",
                        "source_files": ["技术文件/技术方案.pdf"]
                    },
                    {
                        "item_name": "服务能力",
                        "max_score": 25,
                        "scoring_criteria": "服务团队配置、服务响应时间、服务保障措施",
                        "source_files": ["技术文件/服务团队.pdf", "技术文件/服务承诺.pdf"]
                    },
                    {
                        "item_name": "人员资质",
                        "max_score": 20,
                        "scoring_criteria": "项目团队成员资质证书、相关经验、专业配置",
                        "source_files": ["技术文件/人员资质.pdf"]
                    },
                    {
                        "item_name": "业绩案例",
                        "max_score": 15,
                        "scoring_criteria": "近三年同类项目业绩，需提供合同复印件",
                        "source_files": ["商务文件/业绩证明.pdf"]
                    },
                    {
                        "item_name": "商务报价",
                        "max_score": 10,
                        "scoring_criteria": "报价合理性、完整性",
                        "source_files": ["商务文件/报价单.pdf"]
                    }
                ]
            },
            "material": {
                "template_name": "物资类评审模板",
                "description": "适用于物资采购项目的评审规则",
                "items": [
                    {
                        "item_name": "产品参数",
                        "max_score": 35,
                        "scoring_criteria": "产品规格参数是否满足或优于招标要求；技术指标是否先进",
                        "source_files": ["技术文件/产品参数.pdf"]
                    },
                    {
                        "item_name": "质量保证",
                        "max_score": 20,
                        "scoring_criteria": "质量管理体系认证、产品质量检测报告、质保期承诺",
                        "source_files": ["技术文件/质量证明.pdf"]
                    },
                    {
                        "item_name": "供货能力",
                        "max_score": 15,
                        "scoring_criteria": "生产能力、供货周期、库存保障",
                        "source_files": ["技术文件/供货方案.pdf"]
                    },
                    {
                        "item_name": "售后服务",
                        "max_score": 15,
                        "scoring_criteria": "售后服务体系、响应时间、维修保障",
                        "source_files": ["技术文件/售后服务.pdf"]
                    },
                    {
                        "item_name": "商务报价",
                        "max_score": 15,
                        "scoring_criteria": "报价合理性、价格构成、付款方式",
                        "source_files": ["商务文件/报价单.pdf"]
                    }
                ]
            },
            "engineering": {
                "template_name": "工程类评审模板",
                "description": "适用于工程项目的评审规则",
                "items": [
                    {
                        "item_name": "施工方案",
                        "max_score": 30,
                        "scoring_criteria": "施工组织设计、施工方案科学性、进度计划合理性",
                        "source_files": ["技术文件/施工方案.pdf"]
                    },
                    {
                        "item_name": "工程质量",
                        "max_score": 20,
                        "scoring_criteria": "质量目标、质量保证措施、质量检测方案",
                        "source_files": ["技术文件/质量方案.pdf"]
                    },
                    {
                        "item_name": "安全措施",
                        "max_score": 15,
                        "scoring_criteria": "安全生产管理体系、安全措施、应急预案",
                        "source_files": ["技术文件/安全方案.pdf"]
                    },
                    {
                        "item_name": "企业资质",
                        "max_score": 15,
                        "scoring_criteria": "企业资质等级、类似项目业绩、项目经理资质",
                        "source_files": ["商务文件/企业资质.pdf", "商务文件/业绩证明.pdf"]
                    },
                    {
                        "item_name": "商务报价",
                        "max_score": 20,
                        "scoring_criteria": "投标报价、工程量清单、费用构成",
                        "source_files": ["商务文件/报价单.pdf"]
                    }
                ]
            }
        }

    def create_template(self, project_type: str, template_name: str, 
                       config: Dict, description: str = None,
                       created_by: int = None) -> Optional[RuleTemplate]:
        """创建规则模板
        
        Args:
            project_type: 项目类型 (service/material/engineering)
            template_name: 模板名称
            config: 配置内容 (items 列表)
            description: 描述
            created_by: 创建者 ID
        
        Returns:
            创建的模板
        """
        db = db_session()
        try:
            template = RuleTemplate(
                template_name=template_name,
                project_type=project_type,
                config_json=json.dumps(config, ensure_ascii=False, indent=2),
                description=description,
                is_active=True,
                created_by=created_by,
                created_at=datetime.now()
            )
            db.add(template)
            db.commit()
            db.refresh(template)
            
            logger.info(f"创建规则模板成功：{template_name}")
            return template

        except Exception as e:
            db.rollback()
            logger.error(f"创建规则模板失败：{e}")
            return None
        finally:
            db.close()

    def get_template_by_type(self, project_type: str) -> Optional[Dict]:
        """根据项目类型获取默认模板
        
        Args:
            project_type: 项目类型
        
        Returns:
            模板配置
        """
        return self.default_templates.get(project_type)

    def get_all_templates(self, project_type: str = None, 
                         is_active: bool = None) -> List[Dict]:
        """获取所有模板
        
        Args:
            project_type: 项目类型过滤
            is_active: 是否仅返回激活的模板
        
        Returns:
            模板列表
        """
        db = db_session()
        try:
            query = db.query(RuleTemplate)
            
            if project_type:
                query = query.filter(RuleTemplate.project_type == project_type)
            if is_active is not None:
                query = query.filter(RuleTemplate.is_active == is_active)
            
            templates = query.all()
            
            return [{
                "id": t.id,
                "template_name": t.template_name,
                "project_type": t.project_type,
                "description": t.description,
                "config": json.loads(t.config_json) if t.config_json else None,
                "created_at": t.created_at.isoformat() if t.created_at else None
            } for t in templates]

        finally:
            db.close()

    def get_template_by_id(self, template_id: int) -> Optional[Dict]:
        """根据 ID 获取模板
        
        Args:
            template_id: 模板 ID
        
        Returns:
            模板详情
        """
        db = db_session()
        try:
            template = db.query(RuleTemplate).filter(
                RuleTemplate.id == template_id
            ).first()
            
            if not template:
                return None
            
            return {
                "id": template.id,
                "template_name": template.template_name,
                "project_type": template.project_type,
                "description": template.description,
                "config": json.loads(template.config_json) if template.config_json else None,
                "created_at": template.created_at.isoformat() if template.created_at else None
            }

        finally:
            db.close()

    def update_template(self, template_id: int, 
                       template_name: str = None,
                       config: Dict = None,
                       description: str = None,
                       is_active: bool = None) -> bool:
        """更新模板
        
        Args:
            template_id: 模板 ID
            template_name: 模板名称
            config: 配置
            description: 描述
            is_active: 是否激活
        
        Returns:
            是否成功
        """
        db = db_session()
        try:
            template = db.query(RuleTemplate).filter(
                RuleTemplate.id == template_id
            ).first()
            
            if not template:
                return False
            
            if template_name:
                template.template_name = template_name
            if config:
                template.config_json = json.dumps(config, ensure_ascii=False, indent=2)
            if description:
                template.description = description
            if is_active is not None:
                template.is_active = is_active
            
            template.updated_at = datetime.now()
            db.commit()
            
            return True

        except Exception as e:
            db.rollback()
            logger.error(f"更新模板失败：{e}")
            return False
        finally:
            db.close()

    def delete_template(self, template_id: int) -> bool:
        """删除模板（软删除）
        
        Args:
            template_id: 模板 ID
        
        Returns:
            是否成功
        """
        db = db_session()
        try:
            template = db.query(RuleTemplate).filter(
                RuleTemplate.id == template_id
            ).first()
            
            if not template:
                return False
            
            template.is_active = False
            db.commit()
            
            return True

        except Exception as e:
            db.rollback()
            logger.error(f"删除模板失败：{e}")
            return False
        finally:
            db.close()

    def apply_template_to_project(self, template_id: int, project_id: int) -> bool:
        """将模板应用到项目
        
        Args:
            template_id: 模板 ID
            project_id: 项目 ID
        
        Returns:
            是否成功
        """
        db = db_session()
        try:
            template = db.query(RuleTemplate).filter(
                RuleTemplate.id == template_id
            ).first()
            
            if not template:
                logger.error(f"模板不存在：{template_id}")
                return False
            
            # 解析模板配置
            config = json.loads(template.config_json) if template.config_json else {}
            items = config.get("items", [])
            
            # 为每个评审项创建 EvaluationRule
            for item in items:
                rule = EvaluationRule(
                    rule_name=item.get("item_name", ""),
                    rule_content=item.get("scoring_criteria", ""),
                    config_json=json.dumps(item, ensure_ascii=False, indent=2),
                    template_id=template_id,
                    project_type=template.project_type,
                    is_active=True,
                    created_at=datetime.now()
                )
                db.add(rule)
            
            db.commit()
            logger.info(f"模板 {template_id} 已应用到项目 {project_id}")
            return True

        except Exception as e:
            db.rollback()
            logger.error(f"应用模板失败：{e}")
            return False
        finally:
            db.close()

    def init_default_templates(self):
        """初始化默认模板"""
        db = db_session()
        try:
            # 检查是否已有模板
            if db.query(RuleTemplate).count() > 0:
                logger.info("模板已存在，跳过初始化")
                return
            
            # 为每种项目类型创建模板
            for project_type, template_data in self.default_templates.items():
                template = RuleTemplate(
                    template_name=template_data["template_name"],
                    project_type=project_type,
                    config_json=json.dumps(template_data["items"], ensure_ascii=False, indent=2),
                    description=template_data["description"],
                    is_active=True,
                    created_at=datetime.now()
                )
                db.add(template)
            
            db.commit()
            logger.info("✅ 默认评审规则模板初始化完成")

        except Exception as e:
            db.rollback()
            logger.error(f"初始化模板失败：{e}")
        finally:
            db.close()


# 全局服务实例
rule_template_service = RuleTemplateService()
