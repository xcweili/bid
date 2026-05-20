"""数据库迁移脚本 - 为evaluation_items表添加api_key和base_url字段"""
import sqlite3
import os

# 获取脚本所在目录
script_dir = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(script_dir, '..', 'bid_evaluation.db')

# 连接数据库
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 检查是否已存在api_key字段
cursor.execute("PRAGMA table_info(evaluation_items)")
columns = [col[1] for col in cursor.fetchall()]

if 'api_key' not in columns:
    print("正在为 evaluation_items 表添加 api_key 和 base_url 字段...")
    
    # 添加 api_key 字段
    cursor.execute("ALTER TABLE evaluation_items ADD COLUMN api_key TEXT")
    
    # 添加 base_url 字段
    cursor.execute("ALTER TABLE evaluation_items ADD COLUMN base_url TEXT")
    
    conn.commit()
    print("字段添加完成！")
else:
    print("api_key 和 base_url 字段已存在，无需重复添加")

# 关闭连接
conn.close()