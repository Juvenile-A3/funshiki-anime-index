import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  findSubjects, videoUrl, formatTime, normalize, escapeHtml,
  parseRoute, validateCatalog,
} from '../site/domain.mjs';

const data = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));

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
