"""Fetch only public metadata and published notes. No cookies or API keys.
This command writes a candidate snapshot; never overwrites reviewed catalog.
"""
import argparse
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
class APIError(RuntimeError): pass
class Client:
    def __init__(self, interval=3): self.interval=interval; self.last=0
    def get(self, path, **params):
        time.sleep(max(0, self.interval-(time.monotonic()-self.last)))
        url='https://api.bilibili.com'+path+'?'+urllib.parse.urlencode(params)
        req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.bilibili.com/'})
        try:
            with urllib.request.urlopen(req,timeout=30) as response: result=json.load(response)
        finally: self.last=time.monotonic()
        if result.get('code')!=0: raise APIError(f"{path}: {result.get('code')} {result.get('message')}")
        return result

def parse_note(note, pages):
    """Quill native anchors are authoritative; plain time lines are fallback.
    Reject invalid CIDs/status/time ranges, retain unresolved text for review.
    """
    import re
    ops=json.loads(note['content']) if isinstance(note['content'],str) else note['content']
    if isinstance(ops,dict): ops=ops.get('ops',[])
    records=[]; current=None; text=[]
    for op in ops:
        insert=op.get('insert')
        if isinstance(insert,dict) and insert.get('tag'):
            tag=insert['tag']; current={'cid':tag.get('cid'),'p':tag.get('index'),'seconds':tag.get('seconds'),'text':'','status':tag.get('status',0),'origin':'native'}
            records.append(current)
        elif isinstance(insert,str):
            text.append(insert)
            if current: current['text']+=insert
    if not records:
        for line in ''.join(text).splitlines():
            m=re.match(r'^\s*(?:(\d+)#)?((?:\d{1,2}:)?\d{1,3}:\d{2})\s+(.+)$',line)
            if not m: continue
            parts=[int(x) for x in m[2].split(':')]
            p=int(m[1]) if m[1] else (1 if len(pages)==1 else None)
            page=next((x for x in pages if x['page']==p),None)
            records.append({'cid':page['cid'] if page else None,'p':p,'seconds':sum(v*60**i for i,v in enumerate(reversed(parts))),'text':m[3],'status':0,'origin':'text'})
    for item in records:
        # A timepoint's first nonempty line is its heading; PS and future plans
        # remain outside the short excerpt used for indexing.
        lines=[x.strip() for x in item['text'].splitlines() if x.strip()]
        item['text']=lines[0] if lines else ''
        page=next((p for p in pages if p['cid']==item['cid']),None)
        issues=[]
        if item['status']!=0: issues.append('invalid_source_tag')
        if not page: issues.append('unknown_cid')
        elif item['p']!=page['page']: issues.append('part_mismatch')
        elif not isinstance(item['seconds'],(int,float)) or not 0<=item['seconds']<=page['duration']: issues.append('out_of_range')
        item['issues']=issues
        item['part_title']=page['part'] if page else ''
    return records

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--limit',type=int); args=parser.parse_args()
    config=json.loads((ROOT/'config/sources.json').read_text(encoding='utf-8'))
    client=Client(config['request_interval_seconds'])
    output=ROOT/'data/latest'; output.mkdir(parents=True,exist_ok=True)
    def capture(name,path,**params):
        result=client.get(path,**params)
        (output/name).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        return result['data']
    snapshot={'schema_version':1,'fetched_at':datetime.now(timezone.utc).isoformat(),'folder_id':config['folder_id'],'videos':[]}
    try:
        folder=capture('folder.json','/x/v3/fav/resource/list',media_id=config['folder_id'],pn=1,ps=20,order='pubtime',type=0,tid=0)
        limit=min(args.limit or config['latest_limit'],20)
        for media in (folder.get('medias') or [])[:limit]:
            if media['title']=='已失效视频': continue
            bvid=media['bvid']; view=capture(f'view-{bvid}.json','/x/web-interface/view',bvid=bvid)
            notes=capture(f'notes-{bvid}.json','/x/note/publish/list/archive',oid=view['aid'],oid_type=0,pn=1,ps=10)
            listed=notes.get('list') or []
            total=(notes.get('page') or {}).get('total',0)
            if total>10: raise APIError('More than 10 notes; explicit pagination required before declaring complete.')
            video={'bvid':bvid,'title':view['title'],'pubdate':view['pubdate'],'description':view['desc'],'pages':view['pages'],'notes':[]}
            for n in listed:
                body=capture(f"note-{n['cvid']}.json",'/x/note/publish/info',cvid=n['cvid'])
                if str(body['arc']['oid'])!=str(view['aid']): raise APIError('Note references a different video')
                video['notes'].append({'cvid':n['cvid'],'author':n['author']['name'],'published':n['pubtime'],'url':n['web_url'],'entries':parse_note(body,view['pages'])})
            snapshot['videos'].append(video)
            print(f"{bvid}: {len(video['notes'])} notes",flush=True)
    except Exception as error:
        snapshot['error']=str(error)
        (output/'candidate-partial.json').write_text(json.dumps(snapshot,ensure_ascii=False,indent=2),encoding='utf-8')
        raise
    (output/'candidate.json').write_text(json.dumps(snapshot,ensure_ascii=False,indent=2),encoding='utf-8')
if __name__=='__main__': main()
