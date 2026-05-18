# 绿色低碳生产及绿色回收评审技能 (green_low_carbon_skill)

## 1. Skill 用途

本Skill用于从投标人投标文件中，**根据评审规则提取相关的原文描述信息**，为后续评分提供依据。

### 核心功能
1. **提取文档引用**：找出与评审规则相关的原文描述
2. **记录来源信息**：包括文档名称、页码（如果能获取）、原文内容

### 评审范围
- 绿色工厂认证
- 绿色供应链管理企业认证
- 绿色生产和绿色回收制度

## 2. 依赖说明

**重要**：本Skill设计为可在独立环境运行，仅依赖Python标准库（pathlib、typing、re）。

- **默认支持**：`.md`、`.txt` 文本文件
- **可选增强**：如需解析 `.pdf` 和 `.docx`，请单独安装 `PyMuPDF` 和 `python-docx`

## 3. 使用方法

### 3.1 输入数据
- 投标人投标技术文件中所有绿色低碳生产及绿色回收信息文本
- 可能包含在以下文件中：
  - `绿色低碳生产及绿色回收佐证材料/`
  - 投标文件其他章节中涉及绿色低碳的文字内容

### 3.2 输出数据
```json
{
  "评审规则": "取得国家工信部认证的有效绿色工厂、绿色供应链管理企业认证的，得4分。取得0项认证但建立了绿色生产和绿色回收制度的，或取得1项认证的，得2分。其余情况，得0分。",
  "文档引用": [
    {
      "文档名称": "绿色低碳生产及绿色回收佐证材料/绿色低碳生产及绿色回收.md",
      "页码": null,
      "原文内容": "建立了绿色生产管理制度和绿色回收管理制度"
    }
  ]
}
```

## 4. 评分规则（供参考）

| 条件 | 得分 |
|------|------|
| 取得国家工信部认证的有效绿色工厂、绿色供应链管理企业认证 | 4分 |
| 取得0项认证但建立了绿色生产和绿色回收制度的，或取得1项认证的 | 2分 |
| 其余情况 | 0分 |

## 5. 调用示例

### 在项目中使用
```python
from skills.green_low_carbon_skill.extractor import GreenLowCarbonExtractor

extractor = GreenLowCarbonExtractor()
result = extractor.extract("src/data/tasks/1/bids/河北信高真空开关电器有限公司")

print(result["评审规则"])
for ref in result["文档引用"]:
    print(f"文档: {ref['文档名称']}")
    print(f"页码: {ref['页码']}")
    print(f"原文: {ref['原文内容']}")
```

### 独立运行
Skill可以完全独立于项目运行：

```bash
cd skills/green_low_carbon_skill
python standalone_extractor.py ../../src/data/tasks/1/bids/河北信高真空开关电器有限公司
```

## 6. 文件结构

```
skills/green_low_carbon_skill/
├── README.md                  # 使用说明
├── skill.json                 # Skill配置
├── requirements.txt           # 依赖说明
├── extractor.py               # 数据提取器（核心，无项目依赖）
├── standalone_extractor.py    # 独立运行脚本
└── __init__.py                # 包初始化
```
