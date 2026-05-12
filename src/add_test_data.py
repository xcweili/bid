"""添加测试数据 - 河北信高真空开关电器有限公司"""
import sys
sys.path.insert(0, str(sys.path[0]))

from models.project_structure import Bidder
from models.database import db_session

db = db_session()

try:
    # 检查是否已存在
    existing_bidder = db.query(Bidder).filter(Bidder.company_name == "河北信高真空开关电器有限公司").first()
    
    if existing_bidder:
        print("投标人已存在:", existing_bidder.id)
    else:
        # 添加新投标人到包1
        new_bidder = Bidder(
            package_id=1,
            company_name="河北信高真空开关电器有限公司",
            social_credit_code="911300001043651234"
        )
        db.add(new_bidder)
        db.commit()
        print(f"成功添加投标人: 河北信高真空开关电器有限公司 (ID: {new_bidder.id})")
        
finally:
    db.close()
