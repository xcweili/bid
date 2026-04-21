"""扩展数据库模型 - 角色与任务分发"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Float, Boolean, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declared_attr
import enum
from datetime import datetime
from .database import Base, engine


# 枚举类型
class UserRole(enum.Enum):
    ADMIN = "admin"
    TEAM_LEADER = "team_leader"  # 评标组长
    TEAM_MANAGER = "team_manager"  # 团队负责人
    TECHNICAL_EVALUATOR = "technical_evaluator"  # 技术专家
    BUSINESS_EVALUATOR = "business_evaluator"  # 商务专家


class ProjectType(enum.Enum):
    SERVICE = "service"  # 服务类
    MATERIAL = "material"  # 物资类
    ENGINEERING = "engineering"  # 工程类


class TaskType(enum.Enum):
    TECHNICAL = "technical"
    BUSINESS = "business"


class DispatchMode(enum.Enum):
    BY_PACKAGE = "by_package"  # 按包分配
    BY_CRITERIA = "by_criteria"  # 按评审项分配


class CriteriaType(enum.Enum):
    TECHNICAL = "technical"
    BUSINESS = "business"


# ==================== 用户与团队模型 ====================

class User(Base):
    """用户表"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    real_name = Column(String(50), nullable=False)
    role = Column(String(20), nullable=False, default=UserRole.TECHNICAL_EVALUATOR.value)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    phone = Column(String(20), nullable=True)
    email = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    # 关系
    # team = relationship("Team", back_populates="members", foreign_keys=[team_id])  # 已废弃，使用 TeamMember 表
    created_projects = relationship("Project", back_populates="creator", foreign_keys="Project.created_by")
    assigned_subtasks = relationship("SubTask", back_populates="evaluator", foreign_keys="SubTask.evaluator_id")
    assignments = relationship("Assignment", back_populates="evaluator", foreign_keys="Assignment.evaluator_id")


class Team(Base):
    """团队表"""
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, autoincrement=True)
    team_name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    # 关系
    members = relationship("TeamMember", back_populates="team", cascade="all, delete-orphan")


# ==================== 团队关联表 ====================

class TeamMember(Base):
    """团队关联表 - 记录团队成员及其在团队中的角色"""
    __tablename__ = "team_members"

    id = Column(Integer, primary_key=True, autoincrement=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String(20), nullable=False)  # technical_evaluator/business_evaluator
    is_active = Column(Boolean, default=True)
    joined_at = Column(DateTime, default=datetime.now)

    # 关系
    team = relationship("Team", back_populates="members")
    user = relationship("User", backref="team_members")


# ==================== 项目与包模型 ====================

class Project(Base):
    """项目表（替代原任务表）"""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True)
    project_name = Column(String(200), nullable=False)
    project_type = Column(String(20), nullable=False)  # service, material, engineering
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(20), default="draft")  # draft: 未配置完成，dispatching: 配置完成（包含标书和规则）
    total_packages = Column(Integer, default=0)
    zip_file_path = Column(String(500), nullable=True)
    ocr_status = Column(String(20), default="idle")  # idle, processing, completed, failed
    total_score_avg = Column(Float, default=0.0)
    processed_rules = Column(Integer, default=0)
    total_rules = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    completed_at = Column(DateTime, nullable=True)
    assigned_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)  # 新增：项目分派团队
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # 新增：分派人
    assigned_at = Column(DateTime, nullable=True)  # 新增：分派时间

    # 关系
    creator = relationship("User", back_populates="created_projects", foreign_keys=[created_by])
    packages = relationship("Package", back_populates="project", cascade="all, delete-orphan")
    # companies = relationship("CompanyBidNew", back_populates="project", cascade="all, delete-orphan", primaryjoin="CompanyBidNew.project_id==Project.id")


class Package(Base):
    """包表（分包）"""
    __tablename__ = "packages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    package_name = Column(String(100), nullable=False)
    package_order = Column(Integer, default=0)
    status = Column(String(20), default="pending")  # pending, assigned, in_progress, completed
    assigned_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_at = Column(DateTime, nullable=True)
    dispatch_mode = Column(String(20), nullable=True)  # by_package/by_criteria
    created_at = Column(DateTime, default=datetime.now)

    # 关系
    project = relationship("Project", back_populates="packages")
    # assigned_team = relationship("Team", back_populates="packages")  # 已废弃，使用 Assignment 表
    subtasks = relationship("SubTask", back_populates="package", cascade="all, delete-orphan")
    assignments = relationship("Assignment", back_populates="package", cascade="all, delete-orphan")
    # companies = relationship("CompanyBidNew", back_populates="package", cascade="all, delete-orphan", primaryjoin="CompanyBidNew.package_id==Package.id")


# ==================== 评审项表（新增） ====================

class EvaluationCriteria(Base):
    """评审项表 - 绑定到包"""
    __tablename__ = "evaluation_criteria"

    id = Column(Integer, primary_key=True, autoincrement=True)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=False)
    criteria_name = Column(String(100), nullable=False)
    criteria_type = Column(String(20), nullable=False)  # technical/business
    max_score = Column(Float, default=100.0)
    scoring_criteria = Column(Text, nullable=True)
    config_json = Column(Text, nullable=True)  # 额外配置
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


# ==================== 任务分配表（新增） ====================

class Assignment(Base):
    """任务分配表 - 支持三种分配模式"""
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("company_bids_new.id"), nullable=True)  # 新增
    evaluator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    team_leader_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # 分配模式：by_package（按包）/ by_criteria（按评审项）/ by_company（按公司）
    assignment_type = Column(String(20), nullable=False)  # 新增

    # 如果是 by_criteria 模式，存储分配的评审项 IDs（JSON 格式）
    assigned_criteria_ids = Column(Text, nullable=True)  # 新增，JSON: [1,2,3]

    # 任务状态
    status = Column(String(20), default="pending")  # pending/in_progress/completed 新增
    progress_percent = Column(Integer, default=0)  # 新增

    # 时间戳
    created_at = Column(DateTime, default=datetime.now)
    started_at = Column(DateTime, nullable=True)  # 新增
    completed_at = Column(DateTime, nullable=True)  # 新增
    
    # 分发模式：by_package/by_criteria/by_company（与 assignment_type 保持一致）
    dispatch_mode = Column(String(20), nullable=True)  # 新增

    # 关系
    package = relationship("Package", back_populates="assignments")
    company = relationship("CompanyBidNew", back_populates="assignments", foreign_keys=[company_id])
    evaluator = relationship("User", back_populates="assignments", foreign_keys=[evaluator_id])


# ==================== 子任务模型（保留兼容） ====================

class SubTask(Base):
    """子任务表（具体评审任务）"""
    __tablename__ = "subtasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=False)
    evaluator_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    task_type = Column(String(20), nullable=False)  # technical, business
    mode = Column(String(20), nullable=False)  # by_document, by_criteria
    assigned_documents = Column(Text, nullable=True)  # JSON: ["doc1.pdf", "doc2.pdf"]
    assigned_criteria = Column(Text, nullable=True)  # JSON: ["criteria1", "criteria2"]
    status = Column(String(20), default="pending")  # pending, in_progress, completed
    progress_percent = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.now)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # 关系
    package = relationship("Package", back_populates="subtasks")
    evaluator = relationship("User", back_populates="assigned_subtasks", foreign_keys=[evaluator_id])
    # evaluation_results = relationship("EvaluationResultNew", back_populates="subtask", cascade="all, delete-orphan")


# ==================== 评审规则模板模型 ====================

class RuleTemplate(Base):
    """规则模板表"""
    __tablename__ = "rule_templates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    template_name = Column(String(100), nullable=False)
    project_type = Column(String(20), nullable=False)  # service, material, engineering
    config_json = Column(Text, nullable=True)  # 评审项配置 JSON
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    # 关系
    creator = relationship("User", foreign_keys=[created_by])
    # rules = relationship("EvaluationRuleNew", back_populates="template", cascade="all, delete-orphan")


# ==================== 扩展原有模型 ====================

class EvaluationRuleNew(Base):
    """扩展评审规则表"""
    __tablename__ = "evaluation_rules_new"

    id = Column(Integer, primary_key=True)
    rule_name = Column(String(100), nullable=False)
    rule_content = Column(Text, nullable=True)
    config_json = Column(Text, nullable=True)
    template_id = Column(Integer, nullable=True)  # 不设置外键，避免冲突
    project_type = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)


class CompanyBidNew(Base):
    """扩展公司投标表"""
    __tablename__ = "company_bids_new"

    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, nullable=True)  # 保留原字段，用于兼容
    project_id = Column(Integer, nullable=False, index=True)  # 项目 ID（主要字段）
    # package_id 已废弃，保留用于兼容查询
    package_id = Column(Integer, nullable=True)  
    company_name = Column(String(100), nullable=False)
    bid_folder_path = Column(String(500), nullable=True)
    total_score = Column(Float, nullable=True)
    ranking = Column(Integer, nullable=True)
    status = Column(String(20), default="pending")
    processed_rules = Column(Integer, default=0)
    total_rules = Column(Integer, default=0)
    ocr_status = Column(String(20), default="pending")
    created_at = Column(DateTime, default=datetime.now)

    # 关系
    assignments = relationship("Assignment", back_populates="company", cascade="all, delete-orphan")

    @property
    def resolved_folder_path(self):
        """
        动态解析文件路径
        
        逻辑：
        1. 如果 bid_folder_path 不为 NULL，直接使用
        2. 如果为 NULL 但有 project_id，从项目获取路径
        3. 如果为 NULL 但有 package_id，从包关联的项目获取路径
        4. 返回 None 如果都无法获取
        
        Returns:
            str: 解析后的文件路径，或 None
        """
        # 优先使用直接存储的路径
        if self.bid_folder_path:
            return self.bid_folder_path
        
        # 尝试从 project_id 构建路径
        if self.project_id:
            # 标准路径格式：src/data/tasks/{project_id}/bids/{company_name}
            return f"src/data/tasks/{self.project_id}/bids/{self.company_name}"
        
        # 如果只有 package_id，需要从包获取 project_id
        if self.package_id:
            from sqlalchemy.orm import Session
            from models.database import engine
            session = Session(engine)
            try:
                package = session.query(Package).filter(Package.id == self.package_id).first()
                if package:
                    return f"src/data/tasks/{package.project_id}/bids/{self.company_name}"
            finally:
                session.close()
        
        return None


class EvaluationResultNew(Base):
    """扩展评审结果表"""
    __tablename__ = "evaluation_results_new"

    id = Column(Integer, primary_key=True)
    subtask_id = Column(Integer, nullable=True)
    assignment_id = Column(Integer, nullable=True)  # 新增：关联 assignment
    company_bid_id = Column(Integer, nullable=True)
    package_id = Column(Integer, nullable=True)
    company_id = Column(Integer, nullable=True)
    rule_id = Column(Integer, nullable=True)
    criteria_id = Column(Integer, nullable=True)  # 新增：评审项 ID
    criteria_type = Column(String(20), nullable=True)  # 新增：评审项类型
    rule_name = Column(String(100), nullable=True)
    score = Column(Float, nullable=True)
    max_score = Column(Float, default=100.0)
    reason = Column(Text, nullable=True)
    evidence = Column(Text, nullable=True)
    evidence_details = Column(Text, nullable=True)
    llm_response = Column(Text, nullable=True)
    evaluator_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class UserSessionNew(Base):
    """用户会话表"""
    __tablename__ = "user_sessions_new"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(String(255), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.now)

    # 关系
    user = relationship("User")


class ProjectTypeModel(Base):
    """项目类型表"""
    __tablename__ = "project_types"

    id = Column(Integer, primary_key=True, autoincrement=True)
    type_code = Column(String(50), unique=True, nullable=False, index=True)
    type_name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    review_focus = Column(Text, nullable=True)
    status = Column(String(20), default="active")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


def init_extended_db():
    """初始化扩展数据库表"""
    Base.metadata.create_all(bind=engine)
    print("✅ 扩展数据库表创建完成")


if __name__ == "__main__":
    init_extended_db()
