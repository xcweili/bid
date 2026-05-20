"""数据库迁移脚本 - 更新评审项表结构"""
import sqlite3
import os

script_dir = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(script_dir, '..', 'bid_evaluation.db')


def migrate_database():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # 1. 检查并添加 item_content 字段到 evaluation_items 表
        cursor.execute("PRAGMA table_info(evaluation_items)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'item_content' not in columns:
            cursor.execute("ALTER TABLE evaluation_items ADD COLUMN item_content TEXT")
            print("已添加 item_content 字段")
        else:
            print("item_content 字段已存在")
        
        # 2. 删除 max_score, min_score, weight 字段（SQLite不支持直接删除列，需要重建表）
        if 'max_score' in columns:
            print("正在删除评分范围和权重字段...")
            
            # 创建临时表
            cursor.execute("""
                CREATE TABLE evaluation_items_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_code TEXT NOT NULL UNIQUE,
                    item_name TEXT NOT NULL,
                    item_description TEXT,
                    item_content TEXT,
                    material_category TEXT,
                    is_active INTEGER DEFAULT 1,
                    workflow_id TEXT,
                    created_at TEXT,
                    updated_at TEXT
                )
            """)
            
            # 复制数据
            cursor.execute("""
                INSERT INTO evaluation_items_new (
                    id, item_code, item_name, item_description, item_content,
                    material_category, is_active, workflow_id, created_at, updated_at
                )
                SELECT id, item_code, item_name, item_description, item_content,
                       material_category, is_active, workflow_id, created_at, updated_at
                FROM evaluation_items
            """)
            
            # 删除旧表并重命名新表
            cursor.execute("DROP TABLE evaluation_items")
            cursor.execute("ALTER TABLE evaluation_items_new RENAME TO evaluation_items")
            print("已删除 max_score, min_score, weight 字段")
        else:
            print("评分范围和权重字段已不存在")
        
        # 3. 删除 package_items 表中的 custom_weight 字段
        cursor.execute("PRAGMA table_info(package_items)")
        pkg_columns = [col[1] for col in cursor.fetchall()]
        
        if 'custom_weight' in pkg_columns:
            print("正在删除 package_items 的 custom_weight 字段...")
            
            cursor.execute("""
                CREATE TABLE package_items_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    package_id INTEGER NOT NULL,
                    item_id INTEGER NOT NULL,
                    is_required INTEGER DEFAULT 1,
                    FOREIGN KEY (package_id) REFERENCES packages(id),
                    FOREIGN KEY (item_id) REFERENCES evaluation_items(id)
                )
            """)
            
            cursor.execute("""
                INSERT INTO package_items_new (id, package_id, item_id, is_required)
                SELECT id, package_id, item_id, is_required
                FROM package_items
            """)
            
            cursor.execute("DROP TABLE package_items")
            cursor.execute("ALTER TABLE package_items_new RENAME TO package_items")
            print("已删除 package_items 的 custom_weight 字段")
        else:
            print("package_items 的 custom_weight 字段已不存在")
        
        # 4. 创建 files 表（如果不存在）
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_name TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_type TEXT,
                file_size INTEGER,
                description TEXT,
                created_at TEXT
            )
        """)
        print("files 表已就绪")
        
        # 5. 创建关联表 evaluation_item_files（如果不存在）
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS evaluation_item_files (
                item_id INTEGER NOT NULL,
                file_id INTEGER NOT NULL,
                PRIMARY KEY (item_id, file_id),
                FOREIGN KEY (item_id) REFERENCES evaluation_items(id),
                FOREIGN KEY (file_id) REFERENCES files(id)
            )
        """)
        print("evaluation_item_files 关联表已就绪")
        
        conn.commit()
        print("数据库迁移完成！")
        
    except Exception as e:
        print(f"迁移过程中出错: {e}")
        conn.rollback()
    finally:
        conn.close()


if __name__ == '__main__':
    migrate_database()
