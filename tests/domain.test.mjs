import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  findSubjects, videoUrl, formatTime, normalize, escapeHtml,
  parseRoute, validateCatalog, findHomeSubjects, indexSubjects, paginate, CATALOG_PAGE_SIZE, discussionSeasons, subjectCategory, recentBroadcastQuarters, timelineContributors,
  findSegments, totalDuration, episodeProgress, recordingDate,
} from '../site/domain.mjs';

const data = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));

test('segment search includes database slang and direct text, deduplicates shared works and excludes life topics',()=>{
  const c=homeData([[1,'202607',0],[2,'202607',0]]);
  c.subjects[0].search_aliases=['黑话测试'];
  c.segments=[{id:'a',kind:'indexed',text:'独有评语',subject_ids:[1,2],bvid:'video1',targets:[{p:1,seconds:30}]},
    {id:'b',kind:'life',text:'独有评语',subject_ids:[],bvid:'video2',targets:[{p:1,seconds:40}]}];
  assert.deepEqual(findSegments(c,'黑话测试').map(e=>e.id),['a']);
  assert.deepEqual(findSegments(c,'独有评语').map(e=>e.id),['a']);
  assert.deepEqual(findSegments(c,'黑话测试',new Set([3])),[]);
  assert.deepEqual(findSegments(c,''),[]);
  assert.deepEqual(findSegments(c,'黑话测试',null,new Set([1])),[]);
  assert.equal(findSubjects(c,'黑话测试')[0].id,1);
});
test('duration unions overlapping source spans and signals unknown ends',()=>{
  const entries=[{bvid:'a',targets:[{p:1,seconds:10,end_seconds:50},{p:2,seconds:0,end_seconds:20}],playback_targets:[{p:3,seconds:10,end_seconds:50}]},
    {bvid:'a',targets:[{p:1,seconds:20,end_seconds:60}]}, {bvid:'b',targets:[{p:1,seconds:0}]}];
  assert.deepEqual(totalDuration(entries),{seconds:70,incomplete:true,label:'至少 1 分 10 秒'});
});
test('episode progress uses the previous broadcast day, actual episodes and confirmed completion',()=>{
  const s={type:2,platform:'TV',air_date:'2026-07-02',airing:{episode_count:4,episodes:[
    {number:1,broadcast_date:'2026-07-02'},{number:2,broadcast_date:'2026-07-02'},
    {number:3,broadcast_date:'2026-07-02'},{number:4,broadcast_date:'2026-07-09'}]}};
  assert.equal(episodeProgress(s,{live_date:'2026-07-02'}),'预告');
  assert.equal(episodeProgress(s,{live_date:'2026-07-03'}),'#3');
  assert.equal(episodeProgress(s,{live_date:'2026-07-09'}),'#3');
  assert.equal(episodeProgress(s,{live_date:'2026-07-10'}),'完结');
  assert.equal(episodeProgress({...s,airing:{episode_count:12,episodes:s.airing.episodes}},{live_date:'2026-07-17'}),'#4');
  assert.equal(episodeProgress(s,{published_date:'2026-07-10'}),'');
  assert.equal(recordingDate({live_date:'2026-07-02',published_date:'2026-07-03'}),'2026-07-02');
});

test('pagination covers every result once and clamps empty or invalid pages', () => {
  const items = Array.from({ length: 264 }, (_, i) => i);
  const pages = Array.from({ length: 5 }, (_, i) => paginate(items, i + 1));
  assert.deepEqual(pages.flatMap(p => p.items), items);
  assert.equal(pages[0].items.length, 60);
  assert.equal(pages[4].items.length, 24);
  for (const columns of [5, 3, 2]) assert.equal(CATALOG_PAGE_SIZE % columns, 0);
  assert.equal(paginate(items, 999).page, 5);
  assert.equal(paginate(items, -1).page, 1);
  assert.equal(paginate(items, 'bad').page, 1);
  assert.deepEqual(paginate([], 2).items, []);
});

test('work search preserves aliases and counts but leaves clip text to clip search', () => {
  const catalog = homeData([[1, '202610', 1], [2, '202610', 1]]);
  catalog.subjects[0].aliases = ['旧 名'];
  catalog.segments.push({ subject_ids: [1, 2], kind: 'indexed', bvid: 'video2', text: '共享片段' });
  catalog.segments.push({ subject_ids: [1], kind: 'life', bvid: 'video1', text: '不应检索' });
  assert.equal(indexSubjects(catalog), indexSubjects(catalog));
  assert.deepEqual(findSubjects(catalog, '旧名').map(s => s.id), [1]);
  assert.equal(findSubjects(catalog, '共享片段').length, 0);
  assert.equal(findSubjects(catalog, '不应检索').length, 0);
  assert.equal(indexSubjects(catalog)[0].segments.length, 2);
});

function homeData(records) {
  return {
    subjects: records.map(([id, quarter, , type = 2]) => ({
      id, quarter, type, platform: type === 2 ? 'TV' : '', name: `Work${id}`, original_name: '', aliases: [],
    })),
    videos: records.flatMap(([id,,count]) => Array.from({length:count},(_,i)=>({ bvid: i ? `video${id}-${i}` : `video${id}`, published_date: `2026-10-${String(id).padStart(2, '0')}` }))),
    segments: records.flatMap(([id, , count]) => Array.from({ length: count }, (_, i) => ({
      subject_ids: [id], kind: 'indexed', bvid: i ? `video${id}-${i}` : `video${id}`,
    }))),
  };
}

test('all works sort by distinct recording mentions even when a less-discussed work is newer', () => {
  const catalog = homeData([[1, '201610', 4], [2, '201607', 1]]);
  assert.deepEqual(findHomeSubjects(catalog, {quickFilter: 'all'}).map(s => s.id), [1, 2]);
  assert.deepEqual(findHomeSubjects(catalog, { quickFilter: 'all', query: 'Work2' }).map(s => s.id), [2]);
});

test('mention ranking deduplicates recordings then uses non-screening union duration and latest date', () => {
  const c = homeData([[1,'202610',1],[2,'202610',1],[3,'202610',1],[4,'202610',1],[5,'202610',1]]);
  c.videos = [
    {bvid:'old',kind:'talk',live_date:'2026-10-01'},
    {bvid:'new',kind:'talk',live_date:'2026-10-02'},
    {bvid:'screen',kind:'screening',live_date:'2026-10-03'},
  ];
  const clip = (id,bvid,start,end) => ({subject_ids:[id],bvid,kind:'indexed',targets:[{p:1,seconds:start,end_seconds:end}]});
  c.segments = [
    ...Array.from({length:5},()=>clip(1,'new',0,20)), // Five clips still only one mention / 20 seconds.
    clip(2,'old',0,30),clip(2,'new',0,30),
    clip(3,'old',0,50),clip(3,'screen',0,10000), // Screening counts as a recording, not duration.
    clip(4,'old',0,100),clip(4,'old',50,150), // Overlaps count once.
    clip(5,'new',0,150),
  ];
  assert.deepEqual(findHomeSubjects(c,{quickFilter:'all'}).map(s=>s.id),[2,3,5,4,1]);
  const indexed = indexSubjects(c);
  assert.equal(indexed[0].mentionCount,1);
  assert.equal(indexed[2].discussionSeconds,50);
  assert.equal(indexed[3].discussionSeconds,150);
  // Special quarter priority stays ahead of the mention comparator.
  c.subjects.forEach((s,i)=>s.quarter=i===0?'202610':'202607');
  const fresh = structuredClone(c);
  fresh.segments.forEach(e=>e.text='时光机');
  assert.equal(findHomeSubjects(fresh,{quickFilter:'time-machine'})[0].id,1);
});

test('time machine includes all archived seasons with explicit time-machine discussions, newest quarter first', () => {
  const catalog = homeData([[1,'201610',1],[2,'201610',3],[3,'201607',9],[4,'201610',10,4],[5,'201604',8],[6,'201601',7],[7,'201604',20]]);
  for (const entry of catalog.segments) if (!entry.subject_ids.includes(7)) entry.text='时光机回顾';
  const options={quickFilter:'time-machine',now:new Date(2026,9,19)};
  assert.deepEqual(findHomeSubjects(catalog,options).map(s=>s.id),[2,1,3,5,6]);
  assert.deepEqual(findHomeSubjects(catalog,{...options,quarter:'201604'}).map(s=>s.id),[5]);
  assert.deepEqual(findHomeSubjects(catalog,{...options,now:new Date(2028,0,1)}).map(s=>s.id),[2,1,3,5,6]);
});

test('equal mention counts and durations put the latest discussion first before name order', () => {
  const catalog=homeData([[1,'202607',2],[2,'202607',2],[3,'202607',1]]);
  catalog.subjects[0].name='A'; catalog.subjects[1].name='Z';
  assert.deepEqual(findHomeSubjects(catalog,{quickFilter:'all'}).map(s=>s.id),[2,1,3]);
});

test('undated quarter and satellite include unscheduled anime alongside future releases', () => {
  const catalog = homeData([
    [1, '999999', 4], [2, '202701', 3], [3, '202610', 6],
    [4, '202607', 5], [5, '999999', 8, 4], [6, null, 2],
  ]);
  const options = { quickFilter: 'all', now: new Date(2026, 9, 19) };
  assert.deepEqual(findHomeSubjects(catalog, { ...options, quarter: '999999' }).map(s => s.id), [1, 6]);
  assert.deepEqual(findHomeSubjects(catalog, { ...options, quickFilter: 'satellite' }).map(s => s.id), [1, 2, 6]);
  assert.deepEqual(findHomeSubjects(catalog, {
    ...options, quickFilter: 'satellite', quarter: '999999',
  }).map(s => s.id), [1, 6]);
  assert.deepEqual(findHomeSubjects(catalog, { ...options, quickFilter: 'recent' }).map(s => s.id), [3, 4]);
});

test('recent is default, includes continuing broadcasts, excludes long series, and sorts current before previous', () => {
  const catalog = homeData([[1, '202604', 1], [2, '202607', 5], [3, '202610', 2], [4, '202601', 9], [5, '202607', 8]]);
  catalog.subjects[0].airing = { quarters: ['202604', '202607'], long_running: false };
  catalog.subjects[3].airing = { quarters: ['202601', '202604', '202607', '202610'], long_running: true };
  catalog.subjects[4].airing = { quarters: ['202607', '202610'], long_running: false };
  assert.deepEqual(findHomeSubjects(catalog, {now:new Date(2026, 9, 19)}).map(s => s.id), [5, 3, 2, 1]);
});

test('season changes only at a majority regular talk, never at a tea party or preview', () => {
  const catalog = homeData([[1, '202607', 1], [2, '202607', 1], [3, '202607', 1], [4, '202610', 1], [5, '202610', 1], [6, '202610', 1]]);
  catalog.videos = [
    {bvid:'summer',kind:'talk',live_date:'2026-07-11'},
    {bvid:'tea',kind:'tea',live_date:'2026-09-26'},
    {bvid:'early',kind:'talk',live_date:'2026-10-03'},
    {bvid:'autumn',kind:'talk',live_date:'2026-10-10'},
  ];
  catalog.segments = [
    ...[1,2,3].map(id=>({bvid:'summer',kind:'indexed',subject_ids:[id]})),
    ...[4,5,6].map(id=>({bvid:'tea',kind:'indexed',subject_ids:[id]})),
    ...[1,2,3,4].map(id=>({bvid:'early',kind:'indexed',subject_ids:[id]})),
    ...[5,6].map(id=>({bvid:'early',kind:'indexed',text:'PV 鉴赏',subject_ids:[id]})),
    ...[1,4,5,6].map(id=>({bvid:'autumn',kind:'indexed',subject_ids:[id]})),
  ];
  assert.equal(discussionSeasons(catalog,new Date(2026,9,9)).current,'202607');
  const result=discussionSeasons(catalog,new Date(2026,9,10));
  assert.equal(result.current,'202610');
  assert.equal(result.previous,'202607');
  assert.equal(result.transitions.at(-1).bvid,'autumn');
  assert.equal(discussionSeasons(catalog,new Date(2027,0,1)).current,'202610');
});

test('book filter combines manga and novels', () => {
  assert.equal(subjectCategory({type:1,platform:'漫画'}),'book');
  assert.equal(subjectCategory({type:1,platform:'小说'}),'book');
});

test('late finales stay in the previous season until the discussion-season boundary', () => {
  const seasons={transitions:[{quarter:'202610',date:'2026-10-10'}]};
  const subject={type:2,platform:'TV',quarter:'202607',airing:{quarters:['202607','202610'],episode_dates:['2026-09-27','2026-10-04'],end:'2026-10-04'}};
  assert.deepEqual(recentBroadcastQuarters(subject,seasons),['202607']);
  subject.airing.episode_dates.push('2026-10-11');
  assert.deepEqual(recentBroadcastQuarters(subject,seasons),['202607','202610']);
  const october={...subject,quarter:'202610',airing:{quarters:['202610'],episode_dates:['2026-10-01']}};
  assert.deepEqual(recentBroadcastQuarters(october,seasons),['202610']);
});

test('films, OVA and one-shot WEB releases use release quarter, not discussion or invented continuations', () => {
  const seasons={transitions:[{quarter:'202610',date:'2026-10-10'}]};
  for (const platform of ['剧场版','OVA','WEB']) {
    const s={type:2,platform,quarter:'202607',airing:{episode_count:1,quarters:['202607','202610']}};
    assert.deepEqual(recentBroadcastQuarters(s,seasons),['202607']);
  }
  const catalog=homeData([[1,'202610',1],[2,'202607',1],[3,'202604',1]]);
  catalog.subjects.forEach(s=>s.platform='剧场版');
  assert.deepEqual(findHomeSubjects(catalog,{now:new Date(2026,10,5)}).map(s=>s.id),[1,2]);
});

test('contributor credits rank distinct adopted recordings, not number of segments', () => {
  const source=(author,id,extra={})=>({type:'library-timeline',author,entry_id:id,...extra});
  const catalog={videos:[{bvid:'five',kind:'screening'}],segments:[...Array.from({length:5},(_,i)=>({bvid:'one',source:source('甲',String(i))})),{bvid:'two',source:source('乙','a')},{bvid:'three',source:source('乙','b')},{bvid:'four',source:{type:'archive-csv',author:'档案'}},{bvid:'five',source:source('档案','c',{selection:'user-confirmed-screening'})}]};
  assert.deepEqual(timelineContributors(catalog),[{name:'乙',count:2},{name:'甲',count:1}]);
});

test('published catalog is valid and searchable by source title', () => {
  assert.equal(validateCatalog(data), true);
  const first = data.subjects[0];
  assert.ok(findSubjects(data, first.name).some(s => s.id === first.id));
});

test('search normalizes fullwidth letters and punctuation', () => {
  assert.equal(normalize('ＡＢＣ！ Δ'), 'abcδ');
  assert.equal(findSubjects(data, '完全不存在的番名').length, 0);
});

test('video links preserve part and seconds and clamp pre-roll', () => {
  assert.equal(videoUrl('BV1v6MN6fE3f', 2, 1405),
    'https://www.bilibili.com/video/BV1v6MN6fE3f/?p=2&t=1405');
  assert.ok(videoUrl('BV1v6MN6fE3f', 1, 2, 5).endsWith('t=0'));
  assert.equal(videoUrl('javascript:alert(1)', 1, 5), null);
});

test('invalid associations and duplicate clips are rejected', () => {
  const bad = structuredClone(data);
  bad.segments[0].subject_ids = [999999999];
  assert.throws(() => validateCatalog(bad), /无效关联/);
  const dup = structuredClone(data);
  dup.segments.push(dup.segments[0]);
  assert.throws(() => validateCatalog(dup), /重复时点/);
});

test('untrusted text is escaped before HTML rendering', () =>
  assert.equal(escapeHtml('<img src=x onerror="a()">'),
    '&lt;img src=x onerror=&quot;a()&quot;&gt;'));

test('hash routing supports Pages subdirectories and queries', () => {
  assert.equal(parseRoute('#/anime/535669').id, '535669');
  assert.equal(parseRoute('#/anime/535669?from=home').params.get('from'), 'home');
  assert.equal(parseRoute('').page, 'home');
  assert.equal(formatTime(1405), '00:23:25');
});
