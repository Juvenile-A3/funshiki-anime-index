import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  findSubjects, videoUrl, formatTime, normalize, escapeHtml,
  parseRoute, validateCatalog, findHomeSubjects,
} from '../site/domain.mjs';

const data = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));

function homeData(records) {
  return {
    subjects: records.map(([id, quarter, , type = 2]) => ({
      id, quarter, type, name: `Work${id}`, original_name: '', aliases: [],
    })),
    videos: records.map(([id]) => ({ bvid: `video${id}`, published_date: `2026-10-${String(id).padStart(2, '0')}` })),
    segments: records.flatMap(([id, , count]) => Array.from({ length: count }, () => ({
      subject_ids: [id], kind: 'indexed', bvid: `video${id}`,
    }))),
  };
}

test('home defaults to clip count even when a less-discussed work is newer', () => {
  const catalog = homeData([[1, '201610', 4], [2, '201607', 1]]);
  assert.deepEqual(findHomeSubjects(catalog).map(s => s.id), [1, 2]);
  assert.deepEqual(findHomeSubjects(catalog, { query: 'Work2' }).map(s => s.id), [2]);
});

test('time machine shows two seasons of anime, current season first and count within each', () => {
  const catalog = homeData([
    [1, '201610', 1], [2, '201610', 3], [3, '201607', 9],
    [4, '201610', 10, 4], [5, '201604', 8], [6, '202610', 7],
  ]);
  const options = { quickFilter: 'time-machine', now: new Date(2026, 9, 19) };
  assert.deepEqual(findHomeSubjects(catalog, options).map(s => s.id), [2, 1, 3]);
  assert.deepEqual(findHomeSubjects(catalog, { ...options, quarter: '201607' }).map(s => s.id), [3]);
});

test('January time machine includes the previous October across the year boundary', () => {
  const catalog = homeData([[1, '201601', 1], [2, '201510', 5], [3, '201507', 8], [4, '201610', 9]]);
  assert.deepEqual(findHomeSubjects(catalog, {
    quickFilter: 'time-machine', now: new Date(2026, 0, 1),
  }).map(s => s.id), [1, 2]);
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
