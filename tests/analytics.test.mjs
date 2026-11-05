import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalytics } from '../site/analytics.mjs';

const config = {website_id:'test-site',script_url:'https://cloud.umami.is/script.js',domains:['example.com']};
function harness(hostname = 'example.com') {
  const scripts = [], sent = [];
  const win = {location:{hostname,pathname:'/',hash:'#/?q=secret'},umami:{track:fn=>sent.push(fn({url:'/?q=secret',referrer:'/?secret',website:'test-site'}))}};
  const doc = {title:'诶嘿漫谈部',createElement:()=>({dataset:{}}),head:{append:s=>scripts.push(s)}};
  return {win,doc,scripts,sent,analytics:createAnalytics(config,win,doc)};
}
test('Umami queues views, separates work visits and strips searches without duplicate filter views', () => {
  const h = harness();
  h.analytics.page();
  h.win.location.hash = '#/?q=another'; h.analytics.page();
  h.win.location.hash = '#/anime/123'; h.analytics.page(123);
  assert.equal(h.sent.length,0);
  assert.equal(h.scripts[0].dataset.autoTrack,'false');
  h.scripts[0].onload();
  assert.deepEqual(h.sent.map(p=>[p.name || 'pageview',p.url]),[['pageview','/#/'],['pageview','/#/anime/123'],['work_view','/#/anime/123']]);
  assert.equal(h.sent[2].data.subject_id,123);
  assert.ok(h.sent.every(p=>p.referrer === '' && !p.url.includes('?')));
  h.analytics.clip({id:'clip-1',subject_ids:[123,456],bvid:'BVtest'},{p:2,seconds:20});
  assert.deepEqual(h.sent.at(-1).data,{segment_id:'clip-1',subject_ids:'123,456',bvid:'BVtest',part:2,seconds:20});
});
test('Local previews never load Umami, tracker failures do not affect browsing', () => {
  const local = harness('127.0.0.1'); local.analytics.page();
  assert.equal(local.scripts.length,0);
  const h = harness(); h.scripts[0].onerror(); h.analytics.page(); h.scripts[0].onload();
  assert.equal(h.sent.length,0);
});
