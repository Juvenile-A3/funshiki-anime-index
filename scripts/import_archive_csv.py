"""Import 泛式档案's CSV as the published index, preserving each source row."""
import argparse
import csv
import hashlib
import json
import re
import time
import urllib.request
from collections import Counter
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]


def timestamp(value):
    h, m, s = value.split(':')
    return round(int(h) * 3600 + int(m) * 60 + float(s), 3)


def target(url):
    parsed = urlparse(url)
    match = re.fullmatch(r'/video/(BV[0-9A-Za-z]{10})/?', parsed.path)
    if parsed.scheme != 'https' or parsed.netloc != 'www.bilibili.com' or not match:
        raise ValueError('无效 B 站链接: ' + url)
    query = parse_qs(parsed.query)
    seconds = float(query['t'][0])
    p = int(query.get('p', ['1'])[0])
    if seconds < 0 or p < 1:
        raise ValueError('无效时点: ' + url)
    return match[1], p, seconds


def build_catalog(rows, metadata, source_hash):
    subjects, videos, segments = {}, {}, []
    for number, row in enumerate(rows, 2):
        sid = int(row['作品ID'])
        bvid, p, start = target(row['开始时间'])
        end_bvid, end_p, end = target(row['结束时间'])
        if (end_bvid, end_p) != (bvid, p) or p != int(row['p数']) or end <= start:
            raise ValueError(f'第 {number} 行起止时间或分 P 不一致')
        if abs(start - timestamp(row['开始时间（剪辑）'])) > .001 or abs(end - timestamp(row['结束时间（剪辑）'])) > .001:
            raise ValueError(f'第 {number} 行剪辑时间与链接不一致')
        quarter = row['季度']
        if quarter != '999999' and not re.fullmatch(r'\d{4}(01|04|07|10)', quarter):
            raise ValueError(f'第 {number} 行季度无效')
        if sid not in subjects:
            meta = metadata.get(str(sid), {})
            aliases = [a for field in meta.get('infobox', []) if field['key'] == '别名'
                       for a in ([v['v'] for v in field['value']] if isinstance(field['value'], list) else [field['value']]) if isinstance(a, str)]
            subjects[sid] = dict(id=sid, name=row['作品名称'], original_name=meta.get('name', ''),
                aliases=list(dict.fromkeys(aliases + [meta.get('name_cn', '')])) ,
                type=meta.get('type', 0), platform=meta.get('platform', ''),
                air_date=meta.get('date'), quarter=quarter,
                image=(meta.get('images', {}).get('large', '') or '').replace('http:', 'https:'),
                summary=meta.get('summary', '')[:400], metadata_source='Bangumi' if meta else 'CSV')
        elif subjects[sid]['name'] != row['作品名称'] or subjects[sid]['quarter'] != quarter:
            raise ValueError(f'第 {number} 行作品名称或季度冲突')
        published = row['时间'].replace('：', ':')
        v = videos.setdefault(bvid, dict(bvid=bvid, title=row['名称'], live_date=None,
            published_date=published[:10], published_at=published, date_basis='published', pages=[]))
        if v['title'] != row['名称'] or v['published_at'] != published:
            raise ValueError(f'第 {number} 行视频信息冲突')
        if not any(page['p'] == p for page in v['pages']):
            v['pages'].append(dict(p=p, cid=None, duration=None, title=f'P{p}', verification='csv-linked'))
        identity = f'{sid}:{bvid}:{p}:{start}:{end}'
        segments.append(dict(id='archive-' + hashlib.sha256(identity.encode()).hexdigest()[:16],
            bvid=bvid, text=row['作品名称'], subject_ids=[sid], kind='indexed', review='source-imported',
            source=dict(type='archive-csv', author='泛式档案', file='上传作品信息.csv', row=number,
                        url=row['开始时间'], end_url=row['结束时间']),
            targets=[dict(cid=None, p=p, seconds=start, end_seconds=end, variant='source')],
            playback_verified=False))
    if len({e['id'] for e in segments}) != len(segments):
        raise ValueError('存在重复片段，需核对原表')
    dates = sorted(v['published_date'] for v in videos.values())
    for v in videos.values():
        v['pages'].sort(key=lambda page: page['p'])
    return dict(schema_version=1, version='archive-' + source_hash[:12],
        fetched_at='CSV 导入；投稿时间截至 ' + dates[-1],
        coverage=dict(**{'from':dates[0], 'to':dates[-1]}, date_basis='published'),
        provenance=dict(author='泛式档案', file='上传作品信息.csv', sha256=source_hash, rows=len(rows)),
        subjects=list(subjects.values()), videos=sorted(videos.values(), key=lambda v:v['published_at'], reverse=True),
        segments=sorted(segments, key=lambda e:(videos[e['bvid']]['published_at'], e['bvid'], -e['targets'][0]['p'], -e['targets'][0]['seconds']), reverse=True))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('csv', nargs='?', type=Path, default=ROOT / '上传作品信息.csv')
    parser.add_argument('--fetch-metadata', action='store_true')
    args = parser.parse_args()
    cache = ROOT / 'data/raw/archive-metadata.json'
    metadata = json.loads(cache.read_text(encoding='utf-8')) if cache.exists() else {}
    with args.csv.open(encoding='utf-8-sig', newline='') as handle:
        rows = list(csv.DictReader(handle))
    if args.fetch_metadata:
        cache.parent.mkdir(parents=True, exist_ok=True)
        missing = sorted({r['作品ID'] for r in rows} - metadata.keys(), key=int)
        for index, sid in enumerate(missing, 1):
            request = urllib.request.Request('https://api.bgm.tv/v0/subjects/' + sid,
                headers={'User-Agent':'FunshikiArchive/1.0 (https://github.com/Juvenile-A3/funshiki-anime-index)'})
            try:
                with urllib.request.urlopen(request, timeout=15) as response:
                    metadata[sid] = json.load(response)
            except Exception as error:
                print(f'Metadata {sid}: {error}', flush=True)
            cache.write_text(json.dumps(metadata, ensure_ascii=False), encoding='utf-8')
            if index % 20 == 0:
                print(f'Metadata {index}/{len(missing)}', flush=True)
            time.sleep(.35)
    catalog = build_catalog(rows, metadata, hashlib.sha256(args.csv.read_bytes()).hexdigest())
    (ROOT / 'data/catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'subjects':len(catalog['subjects']), 'videos':len(catalog['videos']),
                      'segments':len(catalog['segments']), 'types':dict(Counter(s['type'] for s in catalog['subjects']))}, ensure_ascii=False))


if __name__ == '__main__':
    main()
