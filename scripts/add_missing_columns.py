#!/usr/bin/env python3
"""为数据库表添加缺失的列"""
import sqlite3
import os

script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.join(script_dir, '..')
db_path = os.path.join(project_root, 'bid_evaluation.db')

def add_missing_columns():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # 为 packages 表添加 evaluation_status 列
        cursor.execute("PRAGMA table_info(packages)")
        pkg_columns = [col[1] for col in cursor.fetchall()]
        
        if 'evaluation_status' not in pkg_columns:
            cursor.execute("ALTER TABLE packages ADD COLUMN evaluation_status TEXT DEFAULT 'pending'")
            conn.commit()
            print("已为 packages 表添加 evaluation_status 列")
        else:
            print("packages 表的 evaluation_status 列已存在")
            
    except Exception as e:
        print(f"添加列时出错: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    add_missing_columns()
