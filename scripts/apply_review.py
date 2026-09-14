"""Validate and apply an explicitly reviewed exported patch locally."""
import argparse,copy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def validate_subject(s):
    if not isinstance(s,dict) or type(s.get('id'))!=int or s['id']<1 or type(s.get('type'))!=int or s['type'] not in (1,2,4): raise ValueError('无效 Bangumi 作品 ID 或类型')
    for key in ('name','original_name','platform','image','summary'):
        if not isinstance(s.get(key),str): raise ValueError('无效作品字段 '+key)
    if not s['name'].strip(): raise ValueError('作品名称不能为空')
    if not isinstance(s.get('aliases'),list) or any(not isinstance(a,str) for a in s['aliases']): raise ValueError('无效作品别名')
    if s.get('air_date') is not None and not isinstance(s['air_date'],str): raise ValueError('无效作品日期')
    if s['image'] and not s['image'].startswith('https://'): raise ValueError('作品图片必须使用 HTTPS')

def apply_patch(catalog,patch):
    if patch.get('schema_version')!=1 or patch.get('catalog_version')!=catalog['version']: raise ValueError('补丁版本与当前目录不匹配')
    if not isinstance(patch.get('changes'),list): raise ValueError('缺少 changes 列表')
    result=copy.deepcopy(catalog); entries={e['id']:e for e in result['segments']}; subjects={s['id'] for s in result['subjects']};seen=set()
    additions=patch.get('subjects',[])
    if not isinstance(additions,list): raise ValueError('无效 subjects 列表')
    for s in additions:
        validate_subject(s)
        if s['id'] in subjects: raise ValueError('新增作品 ID 重复或已存在')
        subjects.add(s['id']);result['subjects'].append(copy.deepcopy(s))
    for change in patch['changes']:
        id=change.get('id')
        if id in seen or id not in entries: raise ValueError('重复或未知时点')
        seen.add(id)
        ids=change.get('subject_ids')
        if not isinstance(ids,list) or any(type(x)!=int or x not in subjects for x in ids) or len(ids)!=len(set(ids)): raise ValueError('未知或重复作品 ID')
        if change.get('kind') not in ('indexed','discussion','watch','pv','general','life','new_video'): raise ValueError('无效分类')
        if change['kind'] in ('life','new_video') and ids: raise ValueError('非作品话题不能关联作品')
        if not isinstance(change.get('reason'),str) or not change['reason'].strip() or len(change['reason'])>500: raise ValueError('需要 1~500 字的审核依据')
        entries[id].update(subject_ids=ids,kind=change['kind'],review='text-reviewed',review_reason=change['reason'].strip())
    linked={sid for entry in result['segments'] for sid in entry.get('subject_ids',[])}
    if any(s['id'] not in linked for s in additions): raise ValueError('新增作品必须关联时点')
    import hashlib
    result['version']='review-'+hashlib.sha256(json.dumps([result['subjects'],result['segments']],ensure_ascii=False,sort_keys=True).encode()).hexdigest()[:12]
    return result
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('patch',type=Path);args=p.parse_args()
    path=ROOT/'data/catalog.json';catalog=json.loads(path.read_text(encoding='utf-8'));patch=json.loads(args.patch.read_text(encoding='utf-8-sig'))
    result=apply_patch(catalog,patch)
    path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('审核补丁已应用；请检查 git diff 后提交。')
