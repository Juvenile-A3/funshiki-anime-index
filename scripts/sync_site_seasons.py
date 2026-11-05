"""Save Bangumi broadcast dates for seasonal filters; no guessed weekly end dates."""
import argparse
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timezone, timedelta
from sync_site_assets import ROOT, MANIFEST, download, save_manifest


def broadcast_end(meta):
    values = []
    for field in meta.get('infobox', []):
        if field.get('key') not in ('播放结束', '放送结束'):
            continue
        raw = field.get('value')
        if not isinstance(raw, str):
            return None
        matches = re.findall(r'(\d{4})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})\s*日?', raw)
        try:
            dates = {date(*map(int, parts)).isoformat() for parts in matches}
        except ValueError:
            return None
        if len(dates) != 1:
            return None
        values.extend(dates)
    return values[0] if len(set(values)) == 1 and values[0] >= meta['date'] else None


def quarter(value):
    d = date.fromisoformat(value + '-01' if len(value) == 7 else value)
    return f'{d.year}{(d.month - 1) // 3 * 3 + 1:02}'


def broadcast_day(value):
    if value and 'T' in value:
        stamp = datetime.fromisoformat(value)
        return (stamp.date() - timedelta(days=stamp.hour < 6)).isoformat()
    return value


def broadcast_profile(meta, episodes, policy):
    start = meta.get('date')
    if meta.get('type') != 2 or meta.get('platform') not in ('TV', 'WEB') or not start:
        return None
    date.fromisoformat(start)
    dates = sorted({broadcast_day(e['airdate']) for e in episodes.get('data', [])
                    if e.get('type', 0) == 0 and e.get('airdate') and broadcast_day(e['airdate']) >= start})
    for value in dates:
        quarter(value)  # Some scheduled episodes have only a confirmed month.
    end = broadcast_end(meta)
    quarters = {quarter(start), *(quarter(d) for d in dates)}
    if end and not dates:
        first, last = date.fromisoformat(start), date.fromisoformat(end)
        q = first.year * 4 + (first.month - 1) // 3
        while q <= last.year * 4 + (last.month - 1) // 3:
            quarters.add(f'{q // 4}{q % 4 * 3 + 1:02}')
            q += 1
    count = max(meta.get('total_episodes') or 0, meta.get('eps') or 0, episodes.get('total') or 0)
    schedule = []
    for e in episodes.get('data', []):
        number, day = e.get('sort') or e.get('ep'), e.get('airdate')
        if e.get('type',0) != 0 or not number or not day:
            continue
        # Bangumi airdate is a broadcast-day label. If a source supplies an actual
        # calendar timestamp, times before 06:00 remain part of the previous night.
        schedule.append(dict(number=number, broadcast_date=broadcast_day(day)))
    long_running = count >= policy['long_running_min_episodes']
    long_running = policy.get('long_running_overrides', {}).get(str(meta['id']), long_running)
    return dict(start=start, end=end or (dates[-1] if dates else None), confirmed_end=end,
                quarters=sorted(quarters), episode_dates=dates, episodes=schedule,
                long_running=long_running, episode_count=count,
                basis='episode_airdates' if dates else 'broadcast_end' if end else 'premiere_only',
                source_url=f'https://bgm.tv/subject/{meta["id"]}/ep')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true')
    args = parser.parse_args()
    policy = json.loads((ROOT / 'config/season-policy.json').read_text(encoding='utf8'))
    manifest = json.loads(MANIFEST.read_text(encoding='utf8'))
    cache = ROOT / 'data/library/site-airing'
    cache.mkdir(parents=True, exist_ok=True)
    def fetch(sid, saved):
        current = saved['metadata']
        if current['type'] != 2 or current['platform'] not in ('TV', 'WEB') or not current.get('air_date'):
            return sid, None
        path = cache / f'{sid}-detail.json'
        if args.refresh or not path.exists():
            path.write_bytes(download(f'https://api.bgm.tv/v0/subjects/{sid}'))
        meta = json.loads(path.read_text(encoding='utf8'))
        if str(meta.get('id')) != sid or meta.get('date') != current['air_date']:
            raise ValueError(f'{sid}: 播出日期与作品快照不一致，请先刷新作品资料')
        path = cache / f'{sid}.json'
        if args.refresh or not path.exists():
            path.write_bytes(download(f'https://api.bgm.tv/v0/episodes?subject_id={sid}&type=0&limit=100'))
        episodes = json.loads(path.read_text(encoding='utf8'))
        return sid, broadcast_profile(meta, episodes, policy)
    failures = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(fetch, sid, saved): sid for sid, saved in manifest['subjects'].items()}
        for n, future in enumerate(as_completed(futures), 1):
            try:
                sid, profile = future.result()
                if profile:
                    manifest['subjects'][sid]['airing'] = profile
            except Exception as exc:
                failures.append(dict(id=futures[future], error=str(exc)))
            if n % 40 == 0 or n == len(futures):
                print(f'Broadcast dates {n}/{len(futures)}; failures {len(failures)}', flush=True)
    save_manifest(manifest)
    report = dict(checked_at=datetime.now(timezone.utc).isoformat(), failures=failures,
                  profiles={sid: s['airing'] for sid, s in manifest['subjects'].items() if s.get('airing')})
    output = ROOT / 'output/site-seasons'
    output.mkdir(parents=True, exist_ok=True)
    (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    if failures:
        raise SystemExit('播出资料未全部同步，请查看 output/site-seasons/report.json')


if __name__ == '__main__':
    main()
