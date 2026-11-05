import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCatalog, findSubjects, quarterLabel, videoUrl, subjectCategory, segmentDuration, segmentPlaybackTargets, segmentTargetLabel } from '../site/domain.mjs';
const data = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));

test('published catalog resolves every subject and clip', () => assert.equal(validateCatalog(data), true));
test('quarter filters use source quarter, including unspecified releases', () => {
  const result = findSubjects(data, '', 'all', 'recent', 'all', '202607');
  assert.ok(result.length > 0);
  assert.ok(result.every(s => s.quarter === '202607'));
  assert.ok(findSubjects(data, '', 'all', 'recent', 'all', '999999').length > 0);
  assert.equal(quarterLabel('999999'), '未定档');
});
test('fractional times and original part survive generated links', () => {
  assert.equal(videoUrl('BV19t8H6bEx5', 4, 261.2), 'https://www.bilibili.com/video/BV19t8H6bEx5/?p=4&t=261.2');
  assert.ok(videoUrl('BV19t8H6bEx5', 4, 261.2, 5).endsWith('t=256.2'));
});
test('invalid end time or invented CID is rejected', () => {
  const bad = structuredClone(data);
  bad.segments[0].targets[0].end_seconds = -1;
  assert.throws(() => validateCatalog(bad));
  const badCid = structuredClone(data);
  badCid.segments[0].targets[0].cid = 1;
  assert.throws(() => validateCatalog(badCid));
});
test('live action is separate from animation', () => assert.equal(subjectCategory({ type: 6 }), 'live'));

test('library pointers without a verified end display their start, not a fabricated duration', () => {
  assert.equal(segmentDuration({ targets: [{ p: 1, seconds: 1645 }] }), '起点 00:27:25');
  const pointers = data.segments.filter(e => e.source.type === 'library-timeline');
  assert.ok(pointers.length > 0);
  assert.ok(pointers.every(e => e.source.author && e.source.url));
});

test('cross-part card sums source durations and jumps only to its beginning', () => {
  const groups = data.segments.filter(e => e.cross_p);
  assert.equal(groups.length, 4);
  const e = groups.find(e => e.bvid === 'BV1VS3j6PEic');
  assert.equal(e.text, '简短提及');
  assert.deepEqual(e.targets.map(t => [t.p, t.seconds, t.end_seconds]), [[1, 4651.4, 4692.8], [2, 1.8, 49.2]]);
  assert.equal(segmentDuration(e), '1 分 29 秒（跨P）');
  assert.equal(segmentPlaybackTargets(e).length, 1);
  assert.equal(segmentTargetLabel(e, e.targets[0], 0), '跳转切片');
  const bad = structuredClone(data);
  bad.segments.find(s => s.id === e.id).targets[1].p = 1;
  assert.throws(() => validateCatalog(bad), /跨P/);
});

test('alternate version is a separate jump and never doubles clip duration', () => {
  const e = data.segments.find(e => e.bvid === 'BV1zKHu61E6c');
  const jumps = segmentPlaybackTargets(e);
  assert.deepEqual(jumps.map(t => t.p), [1, 2]);
  assert.equal(jumps[0].seconds, jumps[1].seconds);
  assert.equal(segmentTargetLabel(e, jumps[1], 1), '弹幕版');
  assert.equal(segmentDuration(e), segmentDuration({...e, playback_targets: []}));
  const bad = structuredClone(data);
  bad.segments.find(s => s.id === e.id).playback_targets[1].p = 99;
  assert.throws(() => validateCatalog(bad), /无效视频时点/);
});

test('screening uses the reviewed program classification and comment', () => {
  assert.equal(data.videos.find(v => v.bvid === 'BV1QyLN6rE5A').kind, 'screening');
  assert.ok(data.segments.filter(e => e.bvid === 'BV1QyLN6rE5A').every(e => e.text === '放映会'));
  assert.equal(data.videos.find(v => v.bvid === 'BV1pEXQB2E3D').kind, 'screening');
  const lookBack = data.segments.filter(e => e.bvid === 'BV1pEXQB2E3D');
  assert.equal(lookBack.length, 1);
  assert.equal(lookBack[0].text, '放映会');
  assert.deepEqual(lookBack[0].subject_ids, [480441]);
  assert.deepEqual(lookBack[0].targets.map(t => [t.p, t.seconds, t.end_seconds]), [[1, 106.1, 4281]]);
  assert.deepEqual(segmentPlaybackTargets(lookBack[0]).map(t => [t.p, t.seconds]), [[1, 106.1], [2, 106.1]]);
});
