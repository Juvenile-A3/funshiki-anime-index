import json,time,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]
cache=root/'data/latest/bangumi'; cache.mkdir(exist_ok=True)
for i,seed in enumerate(json.loads((root/'config/subjects-seed.json').read_text(encoding='utf-8'))):
    path=cache/f'{i}.json'
    if not path.exists():
        req=urllib.request.Request('https://api.bgm.tv/v0/search/subjects?limit=5',data=json.dumps({'keyword':seed['query'],'filter':{'type':[seed['type']] if seed.get('type') else [1,2,4]},'sort':'match'}).encode(),headers={'Content-Type':'application/json','User-Agent':'FunshikiAnimeIndex/0.1 (public metadata prototype)'})
        with urllib.request.urlopen(req,timeout=30) as response: data=json.load(response)
        path.write_text(json.dumps({'seed':seed,'response':data},ensure_ascii=False,indent=2),encoding='utf-8')
        time.sleep(1)
    data=json.loads(path.read_text(encoding='utf-8'))['response']
    print(i,seed['query'],[(s['id'],s.get('name_cn'),s.get('date')) for s in data.get('data',[])[:3]],flush=True)
