"""团队管理 API - 重构版"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
from loguru import logger
from datetime import datetime

from api.middleware import get_current_user_from_request
from models.database import db_session
from models.extended_models import Team, TeamMember, User

router = APIRouter(prefix="/api/teams", tags=["团队管理"])


# 请求模型
class AddMemberRequest(BaseModel):
    user_id: int
    role: str  # technical_evaluator/business_evaluator


class CreateTeamRequest(BaseModel):
    team_name: str
    description: Optional[str] = None
    team_manager_id: Optional[int] = None  # 团队负责人 ID（可选）
    members: Optional[List[AddMemberRequest]] = None  # 直接添加的成员列表（可选）


class UpdateTeamRequest(BaseModel):
    team_name: Optional[str] = None
    description: Optional[str] = None
    team_manager_id: Optional[int] = None  # 新增：团队负责人 ID


class UpdateMemberRoleRequest(BaseModel):
    role: str  # technical_evaluator/business_evaluator


@router.get("")
async def get_teams(request: Request):
    """获取团队列表"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        teams = db.query(Team).all()
        result = []
        for t in teams:
            # 获取团队负责人（从 TeamMember 表中 role="team_manager" 的记录）
            leader_member = db.query(TeamMember).filter(
                TeamMember.team_id == t.id,
                TeamMember.role == "team_manager",
                TeamMember.is_active == True
            ).first()
            
            team_manager_id = None
            manager_name = None
            if leader_member:
                user = db.query(User).filter(User.id == leader_member.user_id).first()
                if user:
                    team_manager_id = user.id
                    manager_name = user.real_name
            
            # 获取普通团队成员（排除 team_manager）
            members = db.query(TeamMember).filter(
                TeamMember.team_id == t.id,
                TeamMember.is_active == True,
                TeamMember.role != "team_manager"  # 负责人不显示在成员列表
            ).all()
            
            member_list = []
            for m in members:
                user = db.query(User).filter(User.id == m.user_id).first()
                if user:
                    member_list.append({
                        "user_id": user.id,
                        "username": user.username,
                        "real_name": user.real_name,
                        "role": m.role
                    })
            
            # 统计各角色数量
            manager_count = len([m for m in member_list if m["role"] == "team_manager"])
            tech_evaluator_count = len([m for m in member_list if m["role"] == "technical_evaluator"])
            biz_evaluator_count = len([m for m in member_list if m["role"] == "business_evaluator"])
            
            result.append({
                "id": t.id,
                "team_name": t.team_name,
                "description": t.description,
                "team_manager_id": team_manager_id,
                "manager_name": manager_name,
                "member_count": len(member_list),
                "manager_count": manager_count,
                "tech_evaluator_count": tech_evaluator_count,
                "biz_evaluator_count": biz_evaluator_count,
                "members": member_list,
                "created_at": t.created_at.isoformat() if t.created_at else None
            })
        
        return result
    finally:
        db.close()


@router.get("/{team_id}")
async def get_team(request: Request, team_id: int):
    """获取团队详情"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    db = db_session()
    try:
        team = db.query(Team).filter(Team.id == team_id).first()
        if not team:
            raise HTTPException(status_code=404, detail="团队不存在")
        
        # 获取团队负责人
        leader_member = db.query(TeamMember).filter(
            TeamMember.team_id == team_id,
            TeamMember.role == "team_manager",
            TeamMember.is_active == True
        ).first()
        
        team_manager_id = None
        manager_name = None
        if leader_member:
            user = db.query(User).filter(User.id == leader_member.user_id).first()
            if user:
                team_manager_id = user.id
                manager_name = user.real_name
        
        # 获取普通团队成员（排除 team_manager）
        members = db.query(TeamMember).filter(
            TeamMember.team_id == team_id,
            TeamMember.is_active == True,
            TeamMember.role != "team_manager"
        ).all()
        
        member_list = []
        for m in members:
            user = db.query(User).filter(User.id == m.user_id).first()
            if user:
                member_list.append({
                    "user_id": user.id,
                    "username": user.username,
                    "real_name": user.real_name,
                    "role": m.role,
                    "is_active": m.is_active,
                    "joined_at": m.joined_at.isoformat() if m.joined_at else None
                })
        
        return {
            "id": team.id,
            "team_name": team.team_name,
            "description": team.description,
            "team_manager_id": team_manager_id,
            "manager_name": manager_name,
            "member_count": len(member_list),
            "members": member_list,
            "created_at": team.created_at.isoformat() if team.created_at else None
        }
    finally:
        db.close()


@router.post("")
async def create_team(request: Request, team_req: CreateTeamRequest):
    """创建团队（支持直接添加成员）"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role not in ["admin", "team_leader"]:
        raise HTTPException(status_code=403, detail="仅管理员和评标组长可创建团队")
    
    db = db_session()
    try:
        # 创建团队
        team = Team(
            team_name=team_req.team_name,
            description=team_req.description,
            created_at=datetime.now()
        )
        db.add(team)
        db.commit()
        db.refresh(team)
        
        added_members = []
        
        # 如果指定了团队负责人，添加为成员
        if team_req.team_manager_id is not None:
            user = db.query(User).filter(User.id == team_req.team_manager_id).first()
            if user:
                member = TeamMember(
                    team_id=team.id,
                    user_id=team_req.team_manager_id,
                    role="team_manager",
                    is_active=True,
                    joined_at=datetime.now()
                )
                db.add(member)
                added_members.append({"user_id": user.id, "real_name": user.real_name, "role": "team_manager"})
                logger.info(f"团队 {team.id} 添加负责人：{user.username}")
        
        # 如果指定了成员列表，批量添加
        if team_req.members:
            for member_req in team_req.members:
                # 跳过已作为负责人的用户
                if member_req.user_id == team_req.team_manager_id:
                    continue
                    
                user = db.query(User).filter(User.id == member_req.user_id).first()
                if not user:
                    continue
                
                # 检查用户是否已在团队中
                existing = db.query(TeamMember).filter(
                    TeamMember.team_id == team.id,
                    TeamMember.user_id == member_req.user_id,
                    TeamMember.is_active == True
                ).first()
                
                if existing:
                    continue
                
                member = TeamMember(
                    team_id=team.id,
                    user_id=member_req.user_id,
                    role=member_req.role,
                    is_active=True,
                    joined_at=datetime.now()
                )
                db.add(member)
                added_members.append({"user_id": user.id, "real_name": user.real_name, "role": member_req.role})
        
        # 提交所有成员（负责人和普通成员）
        if added_members:
            db.commit()
        
        logger.info(f"团队 {team.id} 创建成功，共添加 {len(added_members)} 个成员")
        
        return {
            "message": "团队创建成功",
            "team_id": team.id,
            "added_members": added_members
        }
    except Exception as e:
        db.rollback()
        logger.error(f"创建团队失败：{e}")
        raise HTTPException(status_code=500, detail=f"创建失败：{str(e)}")
    finally:
        db.close()


@router.put("/{team_id}")
async def update_team(request: Request, team_id: int, team_req: UpdateTeamRequest):
    """更新团队"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role not in ["admin", "team_leader"]:
        raise HTTPException(status_code=403, detail="无权限更新团队")
    
    db = db_session()
    try:
        team = db.query(Team).filter(Team.id == team_id).first()
        if not team:
            raise HTTPException(status_code=404, detail="团队不存在")
        
        if team_req.team_name:
            team.team_name = team_req.team_name
        if team_req.description is not None:
            team.description = team_req.description
        
        db.commit()
        
        # 如果指定了团队负责人，更新负责人
        if team_req.team_manager_id is not None:
            # 检查用户是否存在
            user = db.query(User).filter(User.id == team_req.team_manager_id).first()
            if not user:
                raise HTTPException(status_code=404, detail="用户不存在")
            
            # 查找当前的负责人
            existing_leader = db.query(TeamMember).filter(
                TeamMember.team_id == team_id,
                TeamMember.role == "team_manager",
                TeamMember.is_active == True
            ).first()
            
            if existing_leader:
                # 如果当前负责人和新负责人不是同一个人，先移除旧负责人
                if existing_leader.user_id != team_req.team_manager_id:
                    existing_leader.is_active = False  # 软删除旧负责人
            
            # 检查新负责人是否已存在
            new_member = db.query(TeamMember).filter(
                TeamMember.team_id == team_id,
                TeamMember.user_id == team_req.team_manager_id
            ).first()
            
            if not new_member:
                # 添加新负责人
                new_member = TeamMember(
                    team_id=team_id,
                    user_id=team_req.team_manager_id,
                    role="team_manager",
                    is_active=True,
                    joined_at=datetime.now()
                )
                db.add(new_member)
            else:
                # 如果已存在但角色不是 team_manager，更新角色
                if new_member.role != "team_manager":
                    new_member.role = "team_manager"
            
            db.commit()
        
        return {"message": "团队更新成功"}
    finally:
        db.close()


@router.delete("/{team_id}")
async def delete_team(request: Request, team_id: int):
    """删除团队"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role not in ["admin", "team_leader"]:
        raise HTTPException(status_code=403, detail="无权限删除团队")
    
    db = db_session()
    try:
        team = db.query(Team).filter(Team.id == team_id).first()
        if not team:
            raise HTTPException(status_code=404, detail="团队不存在")
        
        db.delete(team)
        db.commit()
        return {"message": "团队已删除"}
    finally:
        db.close()


@router.post("/{team_id}/members")
async def add_member(request: Request, team_id: int, member_req: AddMemberRequest):
    """添加团队成员"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role not in ["admin", "team_leader"]:
        raise HTTPException(status_code=403, detail="无权限添加成员")
    
    db = db_session()
    try:
        # 检查团队是否存在
        team = db.query(Team).filter(Team.id == team_id).first()
        if not team:
            raise HTTPException(status_code=404, detail="团队不存在")
        
        # 检查用户是否存在
        user = db.query(User).filter(User.id == member_req.user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")
        
        # 检查用户是否已在团队中
        existing = db.query(TeamMember).filter(
            TeamMember.team_id == team_id,
            TeamMember.user_id == member_req.user_id,
            TeamMember.is_active == True
        ).first()
        
        if existing:
            raise HTTPException(status_code=400, detail="用户已在团队中")
        
        # 检查角色是否合法
        if member_req.role not in ["team_manager", "technical_evaluator", "business_evaluator"]:
            raise HTTPException(status_code=400, detail="无效的角色")
        
        # 如果是团队负责人，检查是否已有其他负责人
        if member_req.role == "team_manager":
            existing_leader = db.query(TeamMember).filter(
                TeamMember.team_id == team_id,
                TeamMember.role == "team_manager",
                TeamMember.is_active == True
            ).first()
            if existing_leader:
                raise HTTPException(status_code=400, detail="团队已有一个负责人")
        
        # 添加成员
        member = TeamMember(
            team_id=team_id,
            user_id=member_req.user_id,
            role=member_req.role,
            is_active=True,
            joined_at=datetime.now()
        )
        db.add(member)
        db.commit()
        
        return {
            "message": "成员添加成功",
            "member": {
                "user_id": user.id,
                "real_name": user.real_name,
                "role": member_req.role
            }
        }
    finally:
        db.close()


@router.delete("/{team_id}/members/{user_id}")
async def remove_member(request: Request, team_id: int, user_id: int):
    """移除团队成员"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role not in ["admin", "team_leader"]:
        raise HTTPException(status_code=403, detail="无权限移除成员")
    
    db = db_session()
    try:
        member = db.query(TeamMember).filter(
            TeamMember.team_id == team_id,
            TeamMember.user_id == user_id
        ).first()
        
        if not member:
            raise HTTPException(status_code=404, detail="成员不存在")
        
        # 软删除
        member.is_active = False
        db.commit()
        
        return {"message": "成员已移除"}
    finally:
        db.close()


@router.put("/{team_id}/members/{user_id}/role")
async def update_member_role(request: Request, team_id: int, user_id: int, role_req: UpdateMemberRoleRequest):
    """修改团队成员角色"""
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="未授权")
    
    if current_user.role not in ["admin", "team_leader"]:
        raise HTTPException(status_code=403, detail="无权限修改成员角色")
    
    db = db_session()
    try:
        member = db.query(TeamMember).filter(
            TeamMember.team_id == team_id,
            TeamMember.user_id == user_id
        ).first()
        
        if not member:
            raise HTTPException(status_code=404, detail="成员不存在")
        
        # 检查角色是否合法
        if role_req.role not in ["team_manager", "technical_evaluator", "business_evaluator"]:
            raise HTTPException(status_code=400, detail="无效的角色")
        
        # 如果改为团队负责人，检查是否已有其他负责人
        if role_req.role == "team_manager" and member.role != "team_manager":
            existing_leader = db.query(TeamMember).filter(
                TeamMember.team_id == team_id,
                TeamMember.role == "team_manager",
                TeamMember.user_id != user_id,
                TeamMember.is_active == True
            ).first()
            if existing_leader:
                raise HTTPException(status_code=400, detail="团队已有一个负责人")
        
        member.role = role_req.role
        db.commit()
        
        return {"message": "角色更新成功"}
    finally:
        db.close()
