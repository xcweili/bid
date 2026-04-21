"""
数据库迁移脚本 - 为 Assignment 表添加 started_at 和 dispatch_mode 字段
执行：python -m src.migrations.add_assignment_fields
"""
from sqlalchemy import text, inspect
from models.database import engine
from loguru import logger


def add_assignment_fields():
    """为 Assignment 表添加新字段"""
    
    # SQL 语句
    alter_started_at = """
    ALTER TABLE assignments 
    ADD COLUMN started_at DATETIME NULL
    """
    
    alter_dispatch_mode = """
    ALTER TABLE assignments 
    ADD COLUMN dispatch_mode VARCHAR(20) NULL
    """
    
    try:
        with engine.connect() as conn:
            # 使用 SQLAlchemy inspector 检查字段是否存在
            inspector = inspect(engine)
            columns = [c['name'] for c in inspector.get_columns('assignments')]
            
            started_at_exists = 'started_at' in columns
            dispatch_mode_exists = 'dispatch_mode' in columns
            
            # 添加 started_at 字段
            if not started_at_exists:
                logger.info("添加 started_at 字段...")
                conn.execute(text(alter_started_at))
                logger.info("✅ started_at 字段添加成功")
            else:
                logger.warning("⚠️ started_at 字段已存在，跳过")
            
            # 添加 dispatch_mode 字段
            if not dispatch_mode_exists:
                logger.info("添加 dispatch_mode 字段...")
                conn.execute(text(alter_dispatch_mode))
                logger.info("✅ dispatch_mode 字段添加成功")
            else:
                logger.warning("⚠️ dispatch_mode 字段已存在，跳过")
            
            conn.commit()
            
        logger.info("✅ 数据库迁移完成")
        return True
        
    except Exception as e:
        logger.error(f"❌ 迁移失败：{e}")
        raise


if __name__ == "__main__":
    add_assignment_fields()
    print("迁移完成！")
