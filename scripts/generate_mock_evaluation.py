#!/usr/bin/env python3
"""生成模拟评审数据"""
import sys
import os

script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.join(script_dir, '..')
src_dir = os.path.join(project_root, 'src')
sys.path.insert(0, src_dir)

from sqlalchemy.orm import Session
from models.database import SessionLocal
from models.project_structure import Project, Section, Package, Bidder
from models.evaluation_items import EvaluationItem, PackageItem
from models.evaluation_results import EvaluationResult
from datetime import datetime

# 评审项配置
EVALUATION_ITEMS = [
    {"code": "E001", "name": "资质审查", "description": "审查投标人资质是否符合要求"},
    {"code": "E002", "name": "技术方案", "description": "评估技术方案的可行性和先进性"},
    {"code": "E003", "name": "商务条款", "description": "审查商务条款的合规性"},
    {"code": "E004", "name": "报价合理性", "description": "评估报价的合理性和竞争力"},
    {"code": "E005", "name": "业绩考核", "description": "考核投标人过往业绩"},
]

# 模拟公司名称
COMPANY_NAMES = [
    "北京科创科技有限公司",
    "上海建工集团有限公司",
    "深圳智造科技有限公司",
    "广州恒信工程有限公司",
    "杭州创新科技有限公司",
    "成都远景工程技术有限公司",
]

# 评分理由模板
SCORE_REASONS = {
    "E001": [
        "资质齐全，符合要求",
        "资质基本符合要求，部分文件需补充",
        "资质存在瑕疵，需进一步核实",
        "资质不符合要求",
    ],
    "E002": [
        "技术方案先进，完全满足需求",
        "技术方案可行，基本满足需求",
        "技术方案存在一定风险",
        "技术方案不符合要求",
    ],
    "E003": [
        "商务条款完全合规",
        "商务条款基本合规，个别条款需协商",
        "商务条款存在较多问题",
        "商务条款严重不合规",
    ],
    "E004": [
        "报价合理，具有竞争力",
        "报价基本合理",
        "报价偏高，但在可接受范围内",
        "报价过高，超出预算",
    ],
    "E005": [
        "业绩优秀，经验丰富",
        "业绩良好，符合要求",
        "业绩一般，需进一步考察",
        "业绩不足，不符合要求",
    ],
}

# 评审依据模板
EVALUATION_BASIS = {
    "E001": [
        "营业执照、资质证书齐全",
        "相关资质证明文件",
        "法人授权委托书",
    ],
    "E002": [
        "技术方案文档",
        "技术参数对比表",
        "类似项目经验证明",
    ],
    "E003": [
        "商务响应文件",
        "合同条款确认书",
        "售后服务承诺",
    ],
    "E004": [
        "报价明细表",
        "成本分析报告",
        "价格合理性说明",
    ],
    "E005": [
        "过往项目业绩证明",
        "客户评价及反馈",
        "奖项及荣誉证书",
    ],
}


def create_evaluation_items(db: Session):
    """创建评审项"""
    for item in EVALUATION_ITEMS:
        existing = db.query(EvaluationItem).filter(EvaluationItem.item_code == item["code"]).first()
        if not existing:
            eval_item = EvaluationItem(
                item_code=item["code"],
                item_name=item["name"],
                item_description=item["description"],
                is_active=True,
            )
            db.add(eval_item)
    db.commit()
    print("评审项已创建")


def create_mock_project(db: Session):
    """创建模拟项目、标段、包和投标人"""
    # 创建项目
    project = db.query(Project).filter(Project.project_code == "TEST001").first()
    if not project:
        project = Project(
            project_code="TEST001",
            project_name="测试项目-绿色低碳生产",
            description="绿色低碳生产技术改造项目",
            status="active",
        )
        db.add(project)
        db.commit()
        print("项目已创建")

    # 创建标段
    section = db.query(Section).filter(Section.section_code == "S001").first()
    if not section:
        section = Section(
            project_id=project.id,
            section_code="S001",
            section_name="第一标段",
            description="核心生产区改造",
        )
        db.add(section)
        db.commit()
        print("标段已创建")

    # 创建包
    package = db.query(Package).filter(Package.package_no == "P001").first()
    if not package:
        package = Package(
            section_id=section.id,
            package_no="P001",
            package_name="设备采购包",
            evaluation_status="completed",
        )
        db.add(package)
        db.commit()
        print("包已创建")

    # 创建投标人
    eval_items = db.query(EvaluationItem).all()
    for i, company_name in enumerate(COMPANY_NAMES):
        bidder = db.query(Bidder).filter(Bidder.company_name == company_name).first()
        if not bidder:
            bidder = Bidder(
                package_id=package.id,
                company_name=company_name,
            )
            db.add(bidder)
            db.commit()

        # 创建包与评审项关联
        for eval_item in eval_items:
            pkg_item = db.query(PackageItem).filter(
                PackageItem.package_id == package.id,
                PackageItem.item_id == eval_item.id
            ).first()
            if not pkg_item:
                pkg_item = PackageItem(
                    package_id=package.id,
                    item_id=eval_item.id,
                    is_required=True,
                )
                db.add(pkg_item)
        db.commit()

    print("投标人已创建")
    return package.id


def generate_mock_results(db: Session, package_id: int):
    """生成模拟评审结果"""
    package = db.query(Package).filter(Package.id == package_id).first()
    if not package:
        print("包不存在")
        return

    bidders = db.query(Bidder).filter(Bidder.package_id == package_id).all()
    package_items = db.query(PackageItem).filter(PackageItem.package_id == package_id).all()

    # 清除旧的评审结果
    db.query(EvaluationResult).filter(EvaluationResult.package_id == package_id).delete()
    db.commit()

    import random

    for bidder in bidders:
        for pkg_item in package_items:
            eval_item = db.query(EvaluationItem).filter(EvaluationItem.id == pkg_item.item_id).first()
            if not eval_item:
                continue

            # 随机生成评分（60-100分）
            score = round(random.uniform(60, 100), 2)
            
            # 根据评分选择理由
            reason_idx = 0
            if score >= 90:
                reason_idx = 0
            elif score >= 80:
                reason_idx = 1
            elif score >= 70:
                reason_idx = 2
            else:
                reason_idx = 3

            # 获取评分理由（处理找不到的情况）
            reasons = SCORE_REASONS.get(eval_item.item_code, ["评审通过", "评审基本通过", "评审需关注", "评审未通过"])
            score_reason = reasons[reason_idx] if reason_idx < len(reasons) else reasons[-1]

            # 随机选择评审依据
            basis_options = EVALUATION_BASIS.get(eval_item.item_code, ["评审文件"])
            basis = "; ".join(random.sample(basis_options, min(2, len(basis_options))))

            result = EvaluationResult(
                package_id=package_id,
                bidder_id=bidder.id,
                item_id=eval_item.id,
                score=score,
                score_reason=score_reason,
                evaluation_basis=basis,
                evaluation_status="completed",
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
            db.add(result)

    db.commit()
    print(f"已为 {len(bidders)} 家公司生成 {len(package_items)} 个评审项的评审结果")


def main():
    db = SessionLocal()
    try:
        print("开始生成模拟评审数据...")
        
        # 创建评审项
        create_evaluation_items(db)
        
        # 创建模拟项目结构
        package_id = create_mock_project(db)
        
        # 生成评审结果
        generate_mock_results(db, package_id)
        
        print("模拟评审数据生成完成！")
    finally:
        db.close()


if __name__ == "__main__":
    main()
