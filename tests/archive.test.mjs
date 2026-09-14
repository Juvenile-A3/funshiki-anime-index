import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCatalog, findSubjects, quarterLabel, videoUrl, subjectCategory } from '../site/domain.mjs';
const data = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));

test('published CSV catalog resolves every subject and clip', () => assert.equal(validateCatalog(data), true));
test('quarter filters use source quarter, including unspecified releases', () => {
  const result = findSubjects(data, '', 'all', 'recent', 'all', '202607');
  assert.ok(result.length > 0);
  assert.ok(result.every(s => s.quarter === '202607'));
  assert.equal(findSubjects(data, '', 'all', 'recent', 'all', '999999').length, 6);
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
