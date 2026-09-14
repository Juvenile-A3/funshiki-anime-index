import { test } from "node:test";
import assert from "node:assert/strict";
import { fromBangumi, subjectCategory, findSubjects, recognizeSubjects, searchBangumi, validateCatalog } from "../site/domain.mjs";
import { readFile } from "node:fs/promises";
const catalog = JSON.parse(await readFile(new URL("../data/catalog.json", import.meta.url), "utf8"));
const work = (id, type, platform) => fromBangumi({ id, type, platform, name: `原名${id}`, name_cn: `作品${id}`, infobox: [{key: "别名", value: [{v: `简称${id}`}]}] });

test("Bangumi distinguishes animation, novels, manga, games and unclassified books", () => {
  assert.deepEqual([work(1,2,"TV"),work(2,1,"小说"),work(3,1,"漫画"),work(4,4,"PC"),work(5,1,"")].map(subjectCategory), ["anime","novel","manga","game","book"]);
  assert.equal(subjectCategory(catalog.subjects[0]), "anime");
  assert.throws(() => work(6,3,"CD"));
});
test("all work types support alias recognition and category filtering", () => {
  const subjects = [work(1,2,"TV"),work(2,1,"小说"),work(3,1,"漫画"),work(4,4,"PC")];
  const data = {...catalog, subjects, segments: [{...catalog.segments[0], subject_ids: [1,2,3,4]}]};
  assert.deepEqual(recognizeSubjects(subjects, "聊简称2和作品4").map(s => s.id), [2,4]);
  assert.deepEqual(findSubjects(data, "简称3", "all", "recent", "manga").map(s => s.id), [3]);
  assert.equal(findSubjects(data, "简称3", "all", "recent", "novel").length, 0);
});
test("life and new-video topics never contribute to work indexes", () => {
  for (const kind of ["life", "new_video"]) {
    const data = {...catalog, segments: [{...catalog.segments[0], kind, subject_ids: [catalog.subjects[0].id]}]};
    assert.equal(findSubjects(data).length, 0);
    assert.throws(() => validateCatalog(data), /非作品/);
    data.segments[0].subject_ids = [];
    assert.equal(validateCatalog(data), true);
  }
});
const response = body => ({ok: true, json: async () => body});
const record = {id:132823,type:1,name:'ようこそ実力至上主義の教室へ',name_cn:'欢迎来到实力至上主义的教室',platform:'小说'};

test("unchanged abbreviations reach all search engines and legacy-only hits get details", async () => {
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({url, body: options.body && JSON.parse(options.body)});
    if (url.includes('/search/subject/')) {
      assert.ok(url.includes(encodeURIComponent('实教')));
      assert.ok(url.includes('type=1'));
      assert.ok(url.includes('start=10'));
      return response({results:25,list:[{...record,platform:undefined}]});
    }
    if (url.includes('/v0/subjects/')) return response(record);
    const body = JSON.parse(options.body);
    assert.deepEqual(body.filter.type,[1]);
    assert.ok(url.endsWith('offset=10'));
    assert.ok(body.keyword === '实教' || (body.keyword === '' && body.filter.tag[0] === '实教'));
    return response({total:0,data:[]});
  };
  const result = await searchBangumi(' 实教 ','1',10,fetcher);
  assert.equal(result.subjects[0].id,132823);
  assert.equal(subjectCategory(result.subjects[0]),'novel');
  assert.deepEqual(result.subjects[0].aliases,[]);
  assert.equal(result.nextOffset,20); assert.equal(result.hasMore,true);
  assert.equal(requests.length,4); assert.equal(result.warning,'');
});

test("generic tag matches work even when other engines fail", async () => {
  const result = await searchBangumi('某个社区简称','4',0,async (_,options) => {
    if (!options.body) throw new Error('offline');
    const body = JSON.parse(options.body);
    assert.deepEqual(body.filter.type,[4]);
    if (!body.filter.tag) throw new Error('offline');
    return response({total:1,data:[{id:42,type:4,name:'游戏正式名'}]});
  });
  assert.equal(result.subjects[0].id,42); assert.ok(result.warning); assert.equal(result.hasMore,false);
});

test("merged search deduplicates IDs and reuses modern metadata without skipping pages", async () => {
  const result = await searchBangumi('测试','all',0,async (url,options)=> {
    if (url.includes('/v0/subjects/')) assert.fail('unnecessary details request');
    return response(options.body ? {total:12,data:[record]} : {results:12,list:[record,{id:99,type:3,name:'音乐'}]});
  });
  assert.equal(result.subjects.length,1); assert.equal(result.nextOffset,10); assert.equal(result.hasMore,true);
});

test("empty results, HTTP failures and failed details are handled without fabricating types", async () => {
  await assert.rejects(searchBangumi(' ','all',0), /请输入/);
  await assert.rejects(searchBangumi('测试','all',0,async ()=>({ok:false,status:429})), /429/);
  const empty = await searchBangumi('测试','all',0,async (_,options)=>response(options.body ? {total:0,data:[]} : {results:0}));
  assert.equal(empty.subjects.length,0); assert.equal(empty.hasMore,false); assert.equal(empty.warning,'');
  const failed = await searchBangumi('测试','all',0,async (url,options)=> {
    if (url.includes('/v0/subjects/')) throw new Error('offline');
    return response(options.body ? {total:0,data:[]} : {results:1,list:[record]});
  });
  assert.equal(failed.subjects.length,0); assert.ok(failed.warning);
  const removed = await searchBangumi('测试','all',0,async (url,options)=> {
    if (url.includes('/v0/subjects/')) return {ok:false,status:404};
    return response(options.body ? {total:0,data:[]} : {results:1,list:[record]});
  });
  assert.equal(removed.subjects.length,0); assert.equal(removed.warning,'');
});
