"""数据库迁移脚本 - 添加任务分配分发模式字段"""
"""
执行方式：python migrations/add_dispatch_fields.py
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, inspect
from sqlalchemy.orm import Session
from loguru import logger
from datetime import datetime
import sys
import os

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import db_session, engine
from models.extended_models import Base, Assignment, Package, User, CompanyBidNew, EvaluationCriteria


def check_table_exists(table_name: str) -> bool:
    """检查表是否存在"""
    inspector = inspect(engine)
    return table_name in inspector.get_table_names()


def check_column_exists(table_name: str, column_name: str) -> bool:
    """检查列是否存在"""
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def migrate_assignment_table():
    """迁移 Assignment 表"""
    logger.info("检查 Assignment 表结构...")
    
    if not check_table_exists('assignments'):
        logger.error("assignments 表不存在！请先运行基础迁移。")
        return False
    
    # 检查需要添加的字段
    fields_to_add = []
    
    if not check_column_exists('assignments', 'assignment_type'):
        fields_to_add.append('assignment_type')
    
    if not check_column_exists('assignments', 'assigned_criteria_ids'):
        fields_to_add.append('assigned_criteria_ids')
    
    if not check_column_exists('assignments', 'dispatch_mode'):
        fields_to_add.append('dispatch_mode')
    
    if not check_column_exists('assignments', 'team_leader_id'):
        fields_to_add.append('team_leader_id')
    
    if not check_column_exists('assignments', 'started_at'):
        fields_to_add.append('started_at')
    
    if not check_column_exists('assignments', 'completed_at'):
        fields_to_add.append('completed_at')
    
    if not check_column_exists('assignments', 'progress_percent'):
        fields_to_add.append('progress_percent')
    
    if not check_column_exists('assignments', 'company_id'):
        fields_to_add.append('company_id')
    
    if not fields_to_add:
        logger.info("✅ Assignment 表结构已是最新")
        return True
    
    logger.info(f"需要添加的字段：{fields_to_add}")
    
    # 使用 SQLAlchemy 的 ALTER TABLE 语句添加字段
    from sqlalchemy import text
    
    db = db_session()
    try:
        for field in fields_to_add:
            if field == 'assignment_type':
                db.execute(text("ALTER TABLE assignments ADD COLUMN assignment_type VARCHAR(20) DEFAULT 'by_package'"))
                logger.info("✅ 添加 assignment_type 字段")
            
            elif field == 'assigned_criteria_ids':
                db.execute(text("ALTER TABLE assignments ADD COLUMN assigned_criteria_ids TEXT"))
                logger.info("✅ 添加 assigned_criteria_ids 字段")
            
            elif field == 'dispatch_mode':
                db.execute(text("ALTER TABLE assignments ADD COLUMN dispatch_mode VARCHAR(20)"))
                logger.info("✅ 添加 dispatch_mode 字段")
            
            elif field == 'team_leader_id':
                db.execute(text("ALTER TABLE assignments ADD COLUMN team_leader_id INTEGER"))
                logger.info("✅ 添加 team_leader_id 字段")
            
            elif field == 'started_at':
                db.execute(text("ALTER TABLE assignments ADD COLUMN started_at DATETIME"))
                logger.info("✅ 添加 started_at 字段")
            
            elif field == 'completed_at':
                db.execute(text("ALTER TABLE assignments ADD COLUMN completed_at DATETIME"))
                logger.info("✅ 添加 completed_at 字段")
            
            elif field == 'progress_percent':
                db.execute(text("ALTER TABLE assignments ADD COLUMN progress_percent INTEGER DEFAULT 0"))
                logger.info("✅ 添加 progress_percent 字段")
            
            elif field == 'company_id':
                db.execute(text("ALTER TABLE assignments ADD COLUMN company_id INTEGER"))
                logger.info("✅ 添加 company_id 字段")
        
        db.commit()
        logger.info("✅ Assignment 表迁移完成")
        return True
        
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Assignment 表迁移失败：{e}")
        return False
    finally:
        db.close()


def update_existing_assignments():
    """更新现有分配记录的分发模式"""
    logger.info("更新现有分配记录...")
    
    db = db_session()
    try:
        # 将所有现有记录的 dispatch_mode 设置为 assignment_type
        db.execute(text("""
            UPDATE assignments 
            SET dispatch_mode = assignment_type 
            WHERE dispatch_mode IS NULL
        """))
        
        updated_count = db.execute(text("SELECT ROW_COUNT()")).fetchone()[0]
        db.commit()
        
        logger.info(f"✅ 更新了 {updated_count} 条分配记录")
        return True
        
    except Exception as e:
        db.rollback()
        logger.error(f"❌ 更新分配记录失败：{e}")
        return False
    finally:
        db.close()


def verify_migration():
    """验证迁移结果"""
    logger.info("验证迁移结果...")
    
    # 检查所有字段是否存在
    required_fields = [
        'assignment_type', 'assigned_criteria_ids', 'dispatch_mode',
        'team_leader_id', 'started_at', 'completed_at', 'progress_percent', 'company_id'
    ]
    
    all_exist = True
    for field in required_fields:
        if not check_column_exists('assignments', field):
            logger.error(f"❌ 字段 {field} 不存在")
            all_exist = False
    
    if all_exist:
        logger.info("✅ 所有字段已成功添加")
    
    # 检查数据
    db = db_session()
    try:
        count = db.query(Assignment).count()
        logger.info(f"✅ 当前共有 {count} 条分配记录")
        
        # 检查 dispatch_mode 分布
        from sqlalchemy import func
        mode_stats = db.query(
            Assignment.dispatch_mode, 
            func.count(Assignment.id).label('count')
        ).group_by(Assignment.dispatch_mode).all()
        
        logger.info("分发模式统计:")
        for mode, count in mode_stats:
            logger.info(f"  - {mode}: {count}")
        
        return all_exist
        
    except Exception as e:
        logger.error(f"❌ 验证失败：{e}")
        return False
    finally:
        db.close()


def main():
    """主函数"""
    logger.info("=" * 60)
    logger.info("开始执行任务分配分发模式迁移")
    logger.info("=" * 60)
    
    # 1. 迁移 Assignment 表
    if not migrate_assignment_table():
        logger.error("迁移失败，请检查错误信息")
        sys.exit(1)
    
    # 2. 更新现有记录
    if not update_existing_assignments():
        logger.warning("更新现有记录失败，但不影响迁移")
    
    # 3. 验证迁移
    if not verify_migration():
        logger.warning("验证未完全通过，请检查")
    
    logger.info("=" * 60)
    logger.info("✅ 迁移完成！")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
