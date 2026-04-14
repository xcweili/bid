import sys
import os

# 添加src目录到Python路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from models.database import db_session
from models.company_bids import CompanyBid

db = db_session()
try:
    companies = db.query(CompanyBid).all()
    print('公司数量:', len(companies))
    for company in companies:
        print('公司ID:', company.id)
        print('公司名:', company.company_name)
        print('任务ID:', company.task_id)
        print('文件夹路径:', company.bid_folder_path)
        print('状态:', company.status)
        print('-' * 50)
finally:
    db.close()
