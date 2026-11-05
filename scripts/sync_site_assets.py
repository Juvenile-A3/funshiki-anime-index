"""Sync public Bangumi metadata and responsive covers. Python 3.10+ / Pillow."""
import argparse
import copy
import hashlib
import html
import io
import json
import os
import re
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'site/assets'
MANIFEST = ASSETS / 'subjects.json'
COVER_PATTERN = re.compile(r'assets/covers/\d+-[a-f0-9]{16}\.webp')
FIELDS = ('name', 'original_name', 'aliases', 'type', 'platform', 'air_date', 'quarter', 'summary', 'image')
PIPELINE_VERSION = 2


def download(url):
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={
                'User-Agent': 'FunshikiAnimeIndex/1.0 (https://funshiki-anime-index.cn/)',
                'Referer': 'https://bgm.tv/',
            })
            with urllib.request.urlopen(request, timeout=25) as response:
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def normalize_metadata(detail):
    if not isinstance(detail.get('name'), str) or not detail['name'].strip():
        raise ValueError('Missing subject name')
    if detail.get('type') not in (1, 2, 3, 4, 6):
        raise ValueError('Invalid subject type')
    aliases = []
    for field in detail.get('infobox', []):
        if field.get('key') == '别名':
            value = field.get('value')
            aliases.extend([v.get('v') for v in value if isinstance(v, dict)] if isinstance(value, list) else [value])
    date = detail.get('date') or None
    if date:
        datetime.strptime(date, '%Y-%m-%d')
    quarter = f'{date[:4]}{((int(date[5:7]) - 1) // 3 * 3 + 1):02}' if date else '999999'
    source = (detail.get('images', {}).get('large') or '').replace('http:', 'https:')
    return dict(name=detail.get('name_cn') or detail['name'], original_name=detail['name'],
                aliases=list(dict.fromkeys(a for a in aliases if isinstance(a, str) and a)),
                type=detail['type'], platform=detail.get('platform') or '', air_date=date,
                quarter=quarter, summary=detail.get('summary') or '', image=source)


def local_file(path):
    if not isinstance(path, str) or not COVER_PATTERN.fullmatch(path):
        raise ValueError('Invalid generated cover path')
    candidate = ROOT / 'site' / path
    if candidate.is_symlink():
        raise ValueError('Generated covers must not be symlinks')
    target = candidate.resolve()
    if target.parent != (ASSETS / 'covers').resolve():
        raise ValueError('Cover escapes asset directory')
    return target


def usable(entry):
    if entry.get('pipeline_version') != PIPELINE_VERSION or not entry.get('rating_fetched_at'):
        return False
    if not entry.get('image_source'):
        return entry.get('image') == '' and entry.get('image_variants') == []
    variants = entry.get('image_variants') or []
    try:
        return bool(variants) and local_file(entry['image']).is_file() and all(
            local_file(v['image']).is_file() for v in variants)
    except (KeyError, ValueError):
        return False


def write_variants(sid, raw):
    variants = []
    with Image.open(io.BytesIO(raw)) as original:
        original = ImageOps.exif_transpose(original).convert('RGB')
        for width, quality in ((320, 78), (640, 85)):
            image = original.copy()
            image.thumbnail((width, width * 3 // 2), Image.Resampling.LANCZOS)
            if any(v['width'] == image.width for v in variants):
                continue
            output = io.BytesIO()
            image.save(output, format='WEBP', quality=quality, method=6)
            content = output.getvalue()
            digest = hashlib.sha256(content).hexdigest()[:16]
            path = f'assets/covers/{sid}-{digest}.webp'
            local_file(path).write_bytes(content)
            variants.append(dict(image=path, width=image.width, height=image.height))
    return variants


def sync_subject(subject, previous, refresh, overrides):
    entry = copy.deepcopy(previous)
    if refresh or not entry.get('upstream'):
        detail = json.loads(download(f'https://api.bgm.tv/v0/subjects/{subject["id"]}'))
        if detail.get('id') != subject['id']:
            raise ValueError('Subject ID mismatch')
        upstream = normalize_metadata(detail)
        rating = detail.get('rating') or {}
        if not isinstance(rating.get('score', 0), (int, float)) or not 0 <= rating.get('score', 0) <= 10:
            raise ValueError('Invalid rating')
        entry.update(upstream=upstream,
                     rating={key: rating.get(key, 0) for key in ('score', 'total', 'rank')},
                     rating_fetched_at=datetime.now(timezone.utc).isoformat())
    metadata = dict(entry['upstream'])
    if set(overrides) - set(FIELDS):
        raise ValueError('Unknown override field')
    metadata.update(overrides)
    if (any(not isinstance(metadata.get(k), str) for k in ('name', 'original_name', 'platform', 'summary', 'image'))
            or not metadata['name'].strip() or metadata.get('type') not in (1, 2, 3, 4, 6)
            or not isinstance(metadata.get('aliases'), list)
            or any(not isinstance(a, str) for a in metadata['aliases'])
            or not re.fullmatch(r'(?:\d{4}(?:01|04|07|10)|999999)', str(metadata.get('quarter')))):
        raise ValueError('Invalid metadata or override')
    if metadata.get('air_date'):
        datetime.strptime(metadata['air_date'], '%Y-%m-%d')
    old = previous.get('metadata', {})
    metadata['aliases'] = list(dict.fromkeys(a for a in [
        *metadata.get('aliases', []), metadata['name'], metadata['original_name'],
        *subject.get('aliases', []), subject.get('name'), subject.get('original_name'),
        *old.get('aliases', []), old.get('name'), old.get('original_name'),
    ] if isinstance(a, str) and a))
    source = metadata.pop('image') or ''
    if source and (refresh or source != previous.get('image_source') or not usable(previous)):
        if not source.startswith('https://lain.bgm.tv/'):
            raise ValueError('Unsupported cover source')
        raw = download(source)
        digest = hashlib.sha256(raw).hexdigest()
        if digest != previous.get('image_sha256') or not usable(previous):
            entry['image_variants'] = write_variants(subject['id'], raw)
            entry['image'] = entry['image_variants'][-1]['image']
        entry['image_sha256'] = digest
    elif not source:
        entry.update(image='', image_variants=[], image_sha256='')
    entry.update(metadata=metadata, image_source=source, catalog_image_source=subject.get('image') or '',
                 pipeline_version=PIPELINE_VERSION)
    return entry


def save_manifest(manifest):
    temporary = MANIFEST.with_suffix('.tmp')
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for attempt in range(6):
        try:
            temporary.replace(MANIFEST)
            return
        except PermissionError:
            if attempt == 5:
                raise
            time.sleep(0.1 * 2 ** attempt)


def prune_covers(manifest):
    referenced = set()
    for entry in manifest['subjects'].values():
        if entry.get('image'):
            referenced.add(entry['image'])
        referenced.update(v['image'] for v in entry.get('image_variants', []))
    removed = []
    directory = (ASSETS / 'covers').resolve()
    for file in directory.glob('*.webp'):
        path = f'assets/covers/{file.name}'
        if COVER_PATTERN.fullmatch(path) and path not in referenced:
            # Only generated files directly in this project's cover directory.
            local_file(path).unlink()
            removed.append(path)
    return removed


def changes_for(subject, before, after):
    old = dict(before.get('upstream') or {k: subject.get(k) for k in FIELDS})
    new = dict(after['upstream'])
    old['rating'] = before.get('rating')
    new['rating'] = after.get('rating')
    old['cover_content'] = before.get('image_sha256')
    new['cover_content'] = after.get('image_sha256')
    return {key: {'before': old.get(key), 'after': value} for key, value in new.items() if old.get(key) != value}


def write_report(report, directory):
    directory.mkdir(parents=True, exist_ok=True)
    (directory / 'changes.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    lines = ['# Bangumi 资料同步', '', f'检查 {report["checked"]} 部作品；变化 {len(report["changes"])} 部；失败 {len(report["failures"])} 部。', '',
             '变化与上次可用快照比较；首次同步包括基线建立。旧名称保留为别名，人工覆盖配置优先。', '']
    for change in report['changes']:
        lines.append(f'- {change["id"]} · {html.escape(change["name"])}：' + '、'.join(change['fields']))
    for failure in report['failures']:
        lines.append(f'- **同步失败** {failure["id"]}：{html.escape(failure["error"])}；' + ('保留旧快照' if failure['fallback'] else '缺少可用资源，阻止发布'))
    lines.extend(['', f'清理未引用封面 {len(report["removed"])} 个。', '', '完整字段前后值见 changes.json；完整同步快照随工作流产物保存。'])
    markdown = '\n'.join(lines) + '\n'
    (directory / 'changes.md').write_text(markdown, encoding='utf-8')



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true', help='Check all metadata and image contents')
    parser.add_argument('--allow-stale', action='store_true', help='Keep valid old snapshots on network failure')
    args = parser.parse_args()
    catalog = json.loads((ROOT / 'data/catalog.json').read_text(encoding='utf-8'))
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else {'subjects': {}}
    overrides = json.loads((ROOT / 'config/subject-overrides.json').read_text(encoding='utf-8'))
    (ASSETS / 'covers').mkdir(parents=True, exist_ok=True)
    report = dict(checked=len(catalog['subjects']), checked_at=datetime.now(timezone.utc).isoformat(), changes=[], failures=[], removed=[])
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(sync_subject, s, manifest['subjects'].get(str(s['id']), {}), args.refresh,
                               overrides.get(str(s['id']), {})): s for s in catalog['subjects']}
        for index, future in enumerate(as_completed(futures), 1):
            subject = futures[future]
            sid = str(subject['id'])
            previous = manifest['subjects'].get(sid, {})
            try:
                entry = future.result()
                fields = changes_for(subject, previous, entry)
                if fields:
                    report['changes'].append(dict(id=subject['id'], name=entry['metadata']['name'], fields=fields))
                if previous != entry:
                    candidate = {**manifest, 'subjects': {**manifest['subjects'], sid: entry}}
                    save_manifest(candidate)
                    manifest = candidate
            except Exception as error:
                fallback = usable(previous) and previous.get('catalog_image_source') == (subject.get('image') or '')
                if fallback:
                    try:
                        # New manual overrides still take priority during an upstream outage.
                        retained = sync_subject(subject, previous, False, overrides.get(sid, {}))
                        candidate = {**manifest, 'subjects': {**manifest['subjects'], sid: retained}}
                        save_manifest(candidate)
                        manifest = candidate
                    except Exception:
                        fallback = False
                report['failures'].append(dict(id=subject['id'], error=str(error), fallback=fallback))
                print(f'Failed {subject["id"]}: {error}', flush=True)
            if index % 20 == 0 or index == len(futures):
                print(f'Checked {index}/{len(futures)}; failures: {len(report["failures"])}', flush=True)
    ids = {str(s['id']) for s in catalog['subjects']}
    manifest['subjects'] = {sid: entry for sid, entry in manifest['subjects'].items() if sid in ids}
    save_manifest(manifest)
    report['removed'] = prune_covers(manifest)
    report['changes'].sort(key=lambda change: change['id'])
    write_report(report, ROOT / 'output/site-sync')
    if report['failures'] and (not args.allow_stale or any(not f['fallback'] for f in report['failures'])):
        raise SystemExit('Some subjects could not be synchronized; see output/site-sync/changes.json')


if __name__ == '__main__':
    main()
