"""Validate and apply an explicitly reviewed exported patch locally."""
import argparse,copy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def apply_patch(catalog,patch):
    if patch.get('schema_version')!=1 or patch.get('catalog_version')!=catalog['version']: raise ValueError('补丁版本与当前目录不匹配')
    if not isinstance(patch.get('changes'),list): raise ValueError('缺少 changes 列表')
    result=copy.deepcopy(catalog); entries={e['id']:e for e in result['segments']}; subjects={s['id'] for s in result['subjects']};seen=set()
    for change in patch['changes']:
        id=change.get('id')
        if id in seen or id not in entries: raise ValueError('重复或未知时点')
        seen.add(id)
        ids=change.get('subject_ids')
        if not isinstance(ids,list) or any(type(x)!=int or x not in subjects for x in ids) or len(ids)!=len(set(ids)): raise ValueError('未知或重复动画 ID')
        if change.get('kind') not in ('discussion','watch','pv','general'): raise ValueError('无效分类')
        if not isinstance(change.get('reason'),str) or not change['reason'].strip() or len(change['reason'])>500: raise ValueError('需要 1~500 字的审核依据')
        entries[id].update(subject_ids=ids,kind=change['kind'],review='text-reviewed',review_reason=change['reason'].strip())
    import hashlib
    result['version']='review-'+hashlib.sha256(json.dumps(result['segments'],ensure_ascii=False,sort_keys=True).encode()).hexdigest()[:12]
    return result
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('patch',type=Path);args=p.parse_args()
    path=ROOT/'data/catalog.json';catalog=json.loads(path.read_text(encoding='utf-8'));patch=json.loads(args.patch.read_text(encoding='utf-8-sig'))
    result=apply_patch(catalog,patch)
    path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('审核补丁已应用；请检查 git diff 后提交。')
