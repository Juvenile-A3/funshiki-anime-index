import copy,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from collect_latest import parse_note
from make_catalog import group_entries
from apply_review import apply_patch

class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.pages=[{'cid':10,'page':1,'part':'20260704_200714','duration':2000},{'cid':20,'page':2,'part':'20260704_200714-弹幕版','duration':2000}]
    def test_native_and_future_ps(self):
        body={'content':json.dumps([{'insert':{'tag':{'cid':10,'index':1,'seconds':1405,'status':0}}},{'insert':'\n淡岛百景经典认人环节\nPS：下周看别的动画\n'}])}
        e=parse_note(body,self.pages)[0]
        self.assertEqual(e['text'],'淡岛百景经典认人环节');self.assertEqual(e['issues'],[])
    def test_invalid_cid_status_bounds(self):
        for tag in ({'cid':999,'index':1,'seconds':10},{'cid':10,'index':1,'seconds':3000},{'cid':10,'index':1,'seconds':10,'status':1}):
            e=parse_note({'content':json.dumps([{'insert':{'tag':tag}},{'insert':'测试'}])},self.pages)[0]
            self.assertTrue(e['issues'])
    def test_plain_requires_explicit_part_when_multiple(self):
        rows=parse_note({'content':json.dumps([{'insert':'00:10 动画甲\n2#00:12 动画乙\n'}])},self.pages)
        self.assertIn('unknown_cid',rows[0]['issues']);self.assertEqual(rows[1]['cid'],20)
    def test_merge_only_proven_same_version_content(self):
        entries=[{'cid':p['cid'],'p':p['page'],'seconds':30,'text':'同一话题','issues':[]} for p in self.pages]
        grouped=group_entries(entries,self.pages);self.assertEqual(len(grouped),1);self.assertEqual(len(grouped[0]['targets']),2)
        pages=copy.deepcopy(self.pages);pages[1]['part']='another-recording';self.assertEqual(len(group_entries(entries,pages)),2)
    def test_plain_single_part(self):
        rows=parse_note({'content':json.dumps([{'insert':'00:37:20 母鸡卡\nPS: 不是时点\n'}])},self.pages[:1])
        self.assertEqual(len(rows),1);self.assertEqual(rows[0]['seconds'],2240)
    def test_review_patch_is_atomic_and_versioned(self):
        catalog={'version':'v1','subjects':[{'id':1}],'segments':[{'id':'a','subject_ids':[]}]}
        patch={'schema_version':1,'catalog_version':'v1','changes':[{'id':'a','subject_ids':[1],'kind':'discussion','reason':'核对笔记'}]}
        result=apply_patch(catalog,patch);self.assertEqual(catalog['segments'][0]['subject_ids'],[]);self.assertEqual(result['segments'][0]['subject_ids'],[1]);self.assertNotEqual(result['version'],'v1')
        patch['catalog_version']='old'
        with self.assertRaises(ValueError):apply_patch(catalog,patch)
    def test_review_rejects_unknown_subject(self):
        with self.assertRaises(ValueError):apply_patch({'version':'v1','subjects':[{'id':1}],'segments':[{'id':'a'}]},{'schema_version':1,'catalog_version':'v1','changes':[{'id':'a','subject_ids':[2],'kind':'discussion','reason':'test'}]})

if __name__=='__main__':unittest.main()
