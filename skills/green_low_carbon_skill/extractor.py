from pathlib import Path
from typing import Dict, List, Optional, Any
import re


class GreenLowCarbonExtractor:
    RULE_CONTENT = """取得国家工信部认证的有效绿色工厂、绿色供应链管理企业认证的，得4分。
    取得0项认证但建立了绿色生产和绿色回收制度的，或取得1项认证的，得2分。
    其余情况，得0分。"""

    def __init__(self):
        self.relevant_keywords = [
            "绿色工厂", "绿色供应链", "绿色生产", "绿色回收",
            "低碳", "绿色制造", "清洁生产", "节能降碳",
            "工信部", "工业和信息化部", "认证", "证书"
        ]

    def extract(self, company_bid_path: str) -> Dict[str, Any]:
        result = {
            "评审规则": self.RULE_CONTENT.strip(),
            "文档引用": []
        }

        green_material_path = Path(company_bid_path) / "绿色低碳生产及绿色回收佐证材料"
        if not green_material_path.exists():
            return result

        for file_path in green_material_path.rglob("*"):
            if file_path.is_file() and file_path.suffix.lower() in ['.md', '.txt']:
                content = self._extract_text_content(str(file_path))
                if content:
                    references = self._find_relevant_references(content, str(file_path))
                    result["文档引用"].extend(references)

        return result

    def _extract_text_content(self, file_path: str) -> Optional[str]:
        suffix = Path(file_path).suffix.lower()
        if suffix in ['.md', '.txt']:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    return f.read()
            except UnicodeDecodeError:
                with open(file_path, 'r', encoding='gbk') as f:
                    return f.read()
        return None

    def _find_relevant_references(self, content: str, file_path: str) -> List[Dict[str, Any]]:
        references = []
        lines = content.split('\n')

        for i, line in enumerate(lines):
            line = line.strip()
            if not line:
                continue

            if self._is_relevant_line(line):
                relative_path = self._get_relative_path(file_path)
                references.append({
                    "文档名称": relative_path,
                    "页码": self._estimate_page(i, lines),
                    "原文内容": line
                })

        return references

    def _is_relevant_line(self, line: str) -> bool:
        return any(keyword in line for keyword in self.relevant_keywords)

    def _estimate_page(self, line_index: int, all_lines: List[str]) -> Optional[str]:
        lines_per_page = 30
        page_num = (line_index // lines_per_page) + 1
        if page_num > 1:
            return f"第{page_num}页"
        return None

    def _get_relative_path(self, file_path: str) -> str:
        try:
            return str(Path(file_path).relative_to(Path(file_path).anchor))
        except ValueError:
            return file_path
