#!/usr/bin/env python3
"""为 evaluation_items 表添加 workflow_id 列"""
import sqlite3
import os

script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.join(script_dir, '..')
db_path = os.path.join(project_root, 'bid_evaluation.db')

def add_workflow_id_column():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # 检查列是否已存在
        cursor.execute("PRAGMA table_info(evaluation_items)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'workflow_id' not in columns:
            # 添加列
            cursor.execute("ALTER TABLE evaluation_items ADD COLUMN workflow_id TEXT")
            conn.commit()
            print("已成功添加 workflow_id 列")
        else:
            print("workflow_id 列已存在")
            
    except Exception as e:
        print(f"添加列时出错: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    add_workflow_id_column()
