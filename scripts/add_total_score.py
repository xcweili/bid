import os
import sqlite3

script_dir = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(script_dir, '..', 'bid_evaluation.db')

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("PRAGMA table_info(bidders)")
columns = [col[1] for col in cursor.fetchall()]

if 'total_score' not in columns:
    print("正在为 bidders 表添加 total_score 字段...")
    
    cursor.execute("ALTER TABLE bidders ADD COLUMN total_score REAL DEFAULT 0.0")
    
    conn.commit()
    print("添加完成！")
else:
    print("total_score 字段已存在，无需修改。")

conn.close()