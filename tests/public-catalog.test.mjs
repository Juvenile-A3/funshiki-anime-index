import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { publicCatalog, assertPublicCatalog } from '../scripts/public-catalog.mjs';

const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));

test('published data contains only allowed website fields', () => {
  assert.doesNotThrow(() => assertPublicCatalog(catalog));
  assert.deepEqual(publicCatalog(catalog), catalog);
});

test('private processing fields are stripped at every level', () => {
  const input = structuredClone(catalog);
  input.provenance = { filename: 'private.csv' };
  input.subjects[0].metadata_source = 'local';
  input.videos[0].date_basis = 'review';
  input.segments[0].review = { decision: 'local' };
  input.segments[0].source.file = 'private.csv';
  input.segments[0].source.members = ['private'];
  input.segments[0].targets[0].verification = 'local';
  assert.throws(() => assertPublicCatalog(input));
  assert.deepEqual(publicCatalog(input), catalog);
});

test('catalog version changes when public content changes', () => {
  const input = structuredClone(catalog);
  input.segments[0].text += ' corrected';
  assert.notEqual(publicCatalog(input).version, catalog.version);
});
