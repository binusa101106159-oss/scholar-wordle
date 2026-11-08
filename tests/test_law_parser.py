import sys,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/laws-build'))
from parse_laws import parse

class LawParserRegression(unittest.TestCase):
 def test_printed_single_paragraph_number_is_not_removed(self):
  lines=['法規名稱：中華民國憲法','公布日期：民國 36 年 01 月 01 日','第 48 條','1 總統應於就職時宣誓，誓詞如左：']
  with patch('parse_laws.raw_text',return_value=lines):data=parse('test','測試','中華民國憲法','unused')
  self.assertEqual(data['items'][0]['paras'][0]['n'],1)
 def test_inserted_code_chapter_starts_new_heading(self):
  lines=['法規名稱：中華民國刑法','修正日期：民國 115 年 07 月 22 日','第 1 條','前一條文。','第 五 章之一 沒收','第 2 條','後一條文。']
  with patch('parse_laws.raw_text',return_value=lines):data=parse('test','測試','中華民國刑法','unused')
  self.assertEqual([item['t'] for item in data['items']],['art','ch','art'])
  self.assertEqual(data['items'][1]['text'],'第 五 章之一 沒收')
  self.assertIsNone(data['items'][0]['paras'][0]['n'])

if __name__=='__main__':unittest.main()
