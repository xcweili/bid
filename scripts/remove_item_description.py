import os
import sqlite3

script_dir = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(script_dir, '..', 'bid_evaluation.db')

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("PRAGMA table_info(evaluation_items)")
columns = [col[1] for col in cursor.fetchall()]

if 'item_description' in columns:
    print("正在删除 evaluation_items 表的 item_description 字段...")

    cursor.execute("""
        CREATE TABLE evaluation_items_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_code TEXT NOT NULL UNIQUE,
            item_name TEXT NOT NULL,
            item_content TEXT,
            material_category TEXT,
            is_active INTEGER DEFAULT 1,
            workflow_id TEXT,
            created_at TEXT,
            updated_at TEXT
        )
    """)

    cursor.execute("""
        INSERT INTO evaluation_items_new (
            id, item_code, item_name, item_content,
            material_category, is_active, workflow_id, created_at, updated_at
        )
        SELECT id, item_code, item_name, item_content,
               material_category, is_active, workflow_id, created_at, updated_at
        FROM evaluation_items
    """)

    cursor.execute("DROP TABLE evaluation_items")
    cursor.execute("ALTER TABLE evaluation_items_new RENAME TO evaluation_items")

    conn.commit()
    print("删除完成！")
else:
    print("evaluation_items 表已经没有 item_description 字段，无需修改。")

conn.close()
