"""Build the initial reviewed seed, not an unattended ingestion job."""
import json,re,hashlib
from pathlib import Path
from datetime import datetime,timezone,timedelta
ROOT=Path(__file__).resolve().parents[1]
def load(path): return json.loads((ROOT/path).read_text(encoding='utf-8-sig'))

def group_entries(entries,pages):
    groups={}
    page_map={p['cid']:p for p in pages}
    for e in entries:
        if e['issues'] or not e['text']: continue
        p=page_map[e['cid']]
        base=re.sub(r'[-_ ]?弹幕版$','',p['part'])
        # Matching title, duration, second, heading required to merge variants.
        key=(base,p['duration'],e['seconds'],e['text'])
        g=groups.setdefault(key,{'text':e['text'],'targets':[]})
        target={'cid':e['cid'],'p':e['p'],'seconds':e['seconds'],'variant':'danmaku' if p['part'].endswith('弹幕版') else 'normal'}
        if target not in g['targets']: g['targets'].append(target)
    return list(groups.values())

def main():
    source=load('data/latest/candidate.json'); rules=load('config/mapping-rules.json')['rules']
    subjects=[]
    for i,rule in enumerate(rules):
        result=load(f"data/latest/bangumi/{rule['query_index']}.json")
        s=next(s for s in result['response']['data'] if s['id']==rule['subject_id'])
        image=(s.get('images') or {}).get('large') or (s.get('images') or {}).get('common') or ''
        subjects.append({'id':s['id'],'type':s.get('type',2),'name':s.get('name_cn') or s['name'],'original_name':s['name'],'aliases':list(dict.fromkeys([result['seed']['query'],*result['seed']['aliases']])),'air_date':s.get('date'),'platform':s.get('platform') or '','image':image.replace('http://','https://'),'summary':(s.get('summary') or '')[:400],'color':['#b9b4d9','#bdd4cb','#e0c5bb','#adc6d3','#d5c7df'][i%5]})
    videos=[];segments=[]
    for v in source['videos']:
        match=re.search(r'(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})',v['description'])
        live_date='-'.join([match[1],match[2].zfill(2),match[3].zfill(2)]) if match else None
        videos.append({'bvid':v['bvid'],'title':v['title'],'live_date':live_date,'published_date':datetime.fromtimestamp(v['pubdate'],timezone(timedelta(hours=8))).date().isoformat(),'pages':[{'cid':p['cid'],'p':p['page'],'title':p['part'],'duration':p['duration']} for p in v['pages']]})
        for n in v['notes']:
            for e in group_entries(n['entries'],v['pages']):
                ids=[r['subject_id'] for r in rules if any(pattern in e['text'] for pattern in r['patterns'])]
                kind='pv' if 'pv' in e['text'].lower() else 'watch' if any(word in e['text'] for word in ('时光机之','下播看','二创','mad')) else 'discussion' if ids else 'general'
                targets=sorted(e['targets'],key=lambda t:(t['variant']=='danmaku',t['p']))
                segments.append({'id':f"{v['bvid']}-{n['cvid']}-{targets[0]['cid']}-{targets[0]['seconds']}",'bvid':v['bvid'],'text':e['text'],'subject_ids':ids,'kind':kind,'review':'text-reviewed' if ids else 'pending','source':{'cvid':n['cvid'],'author':n['author'],'url':n['url'],'published':n['published']},'targets':targets,'playback_verified':False})
    dates=sorted(v['live_date'] for v in videos if v['live_date'])
    catalog={'schema_version':1,'version':'seed-2026-07-05-v1','fetched_at':source['fetched_at'],'coverage':{'from':dates[0],'to':dates[-1],'folder_id':source['folder_id']},'subjects':subjects,'videos':videos,'segments':segments}
    (ROOT/'data/catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f"Catalog: {len(subjects)} subjects, {len(videos)} videos, {len(segments)} topics, {sum(bool(e['subject_ids']) for e in segments)} mapped, {sum(len(e['targets']) for e in segments)} targets")
if __name__=='__main__': main()
