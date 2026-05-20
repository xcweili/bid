import os
import sqlite3

# 获取脚本所在目录
script_dir = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(script_dir, '..', 'bid_evaluation.db')

# 连接数据库
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 检查 package_items 表是否有 custom_weight 字段
cursor.execute("PRAGMA table_info(package_items)")
columns = [col[1] for col in cursor.fetchall()]

if 'custom_weight' in columns:
    print("正在修复 package_items 表，删除 custom_weight 字段...")
    
    # 创建临时表
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
    
    # 复制数据（排除 custom_weight）
    cursor.execute("""
        INSERT INTO package_items_new (id, package_id, item_id, is_required)
        SELECT id, package_id, item_id, is_required
        FROM package_items
    """)
    
    # 删除旧表并重命名新表
    cursor.execute("DROP TABLE package_items")
    cursor.execute("ALTER TABLE package_items_new RENAME TO package_items")
    
    conn.commit()
    print("修复完成！")
else:
    print("package_items 表已经没有 custom_weight 字段，无需修复。")

# 关闭连接
conn.close()
