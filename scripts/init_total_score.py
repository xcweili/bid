import os
import sqlite3

script_dir = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(script_dir, '..', 'bid_evaluation.db')

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("正在重新计算所有投标人的总分...")

# 获取所有投标人
cursor.execute("SELECT id FROM bidders")
bidders = cursor.fetchall()

for bidder in bidders:
    bidder_id = bidder[0]
    
    # 计算该投标人所有已完成评审的总分
    cursor.execute("""
        SELECT COALESCE(SUM(score), 0) FROM evaluation_results 
        WHERE bidder_id = ? AND evaluation_status = 'completed' AND score IS NOT NULL
    """, (bidder_id,))
    
    total = cursor.fetchone()[0]
    
    # 更新总分
    cursor.execute("UPDATE bidders SET total_score = ? WHERE id = ?", (total, bidder_id))
    print(f"投标人ID {bidder_id}: 总分 = {total}")

conn.commit()
print("\n总分计算完成！")
conn.close()