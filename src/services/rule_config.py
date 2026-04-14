"""规则配置管理"""
import json
from pathlib import Path
from typing import Dict, List
from loguru import logger


class RuleConfigManager:
    """规则配置管理器"""
    
    def __init__(self):
        self.configs = {}
    
    def create_rule_config(self, rule_id: int, config: Dict) -> str:
        """创建规则配置
        
        Args:
            rule_id: 规则 ID
            config: 配置内容
                {
                    "items": [
                        {
                            "item_name": "供货业绩评分",
                            "source_files": ["技术文件/业绩.doc", "技术文件/合同.pdf"],
                            "max_score": 20,
                            "scoring_criteria": "..."
                        }
                    ]
                }
        
        Returns:
            配置 JSON 字符串
        """
        config_json = json.dumps(config, ensure_ascii=False, indent=2)
        self.configs[rule_id] = config
        logger.info(f"创建规则配置 rule_id={rule_id}")
        return config_json
    
    def get_rule_config(self, rule_id: int) -> Dict:
        """获取规则配置"""
        return self.configs.get(rule_id, {"items": []})
    
    def extract_content_from_files(self, company_folder: str, source_files: List[str]) -> str:
        """从指定文件中提取内容
        
        Args:
            company_folder: 公司文件夹路径
            source_files: 源文件相对路径列表
            
        Returns:
            拼接后的内容
        """
        content_parts = []
        base_path = Path(company_folder)
        
        for rel_path in source_files:
            file_path = base_path / rel_path
            if file_path.exists():
                content = self._read_file_content(str(file_path))
                content_parts.append(f"=== {rel_path} ===\n{content}\n")
                logger.info(f"读取文件：{rel_path}")
            else:
                logger.warning(f"文件不存在：{file_path}")
                content_parts.append(f"=== {rel_path} ===\n[文件不存在]\n")
        
        return "\n\n".join(content_parts)
    
    def _read_file_content(self, file_path: str) -> str:
        """读取文件内容"""
        from services.file_processor import FileProcessor
        # 临时创建 FileProcessor 实例读取文件
        import tempfile
        fp = FileProcessor(tempfile.gettempdir())
        return fp.read_file_content(file_path)
