import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  findSubjects,
  videoUrl,
  formatTime,
  normalize,
  escapeHtml,
  parseRoute,
  validateCatalog,
} from "../site/domain.mjs";
const data = JSON.parse(
  await readFile(new URL("./fixtures/seed-catalog.json", import.meta.url), "utf8"),
);
test("real seed catalog: all subjects and targets resolve", () =>
  assert.equal(validateCatalog(data), true));
test("short Chinese alias resolves Bangumi title", () => {
  assert.equal(findSubjects(data, "灰原君")[0].id, 567418);
});
test("one animation returns discussions across all three recordings", () => {
  const s = findSubjects(data, "冰之城墙");
  assert.equal(s.length, 1);
  assert.equal(s[0].segments.length, 3);
  assert.equal(new Set(s[0].segments.map((e) => e.bvid)).size, 3);
});
test("year filter and empty search do not fabricate matches", () => {
  assert.equal(findSubjects(data, "冰之城墙", "2016").length, 0);
  assert.equal(findSubjects(data, "完全不存在的番名").length, 0);
  assert.equal(findSubjects(data, "", "2016").length, 13);
});
test("punctuation and fullwidth search normalize", () =>
  assert.equal(normalize("ＡＢＣ！ Δ"), "abcδ"));
test("both versions survive deduplication but count once", () => {
  const e = data.segments.find(
    (e) => e.bvid === "BV1v6MN6fE3f" && e.subject_ids.includes(493724),
  );
  assert.equal(e.targets.length, 2);
  assert.deepEqual(
    e.targets.map((t) => t.p),
    [1, 2],
  );
  assert.deepEqual(
    e.targets.map((t) => t.seconds),
    [1405, 1405],
  );
});
test("links preserve p and seconds, optional pre-roll clamps to zero", () => {
  assert.equal(
    videoUrl("BV1v6MN6fE3f", 2, 1405),
    "https://www.bilibili.com/video/BV1v6MN6fE3f/?p=2&t=1405",
  );
  assert.ok(videoUrl("BV1v6MN6fE3f", 1, 2, 5).endsWith("t=0"));
  assert.equal(videoUrl("javascript:alert(1)", 1, 5), null);
  assert.equal(videoUrl("BV1v6MN6fE3f", 0, 5), null);
});
test("invalid CID is rejected before publishing", () => {
  const bad = structuredClone(data);
  bad.segments[0].targets[0].cid = -1;
  assert.throws(() => validateCatalog(bad), /无效视频时点/);
});
test("unknown animation and duplicate segment are rejected", () => {
  const bad = structuredClone(data);
  bad.segments[0].subject_ids = [999999999];
  assert.throws(() => validateCatalog(bad), /无效关联/);
  const dup = structuredClone(data);
  dup.segments.push(dup.segments[0]);
  assert.throws(() => validateCatalog(dup), /重复时点/);
});
test("untrusted note text is escaped before HTML rendering", () =>
  assert.equal(
    escapeHtml('<img src=x onerror="a()">'),
    "&lt;img src=x onerror=&quot;a()&quot;&gt;",
  ));
test("hash routing supports Pages subdirectory and queries", () => {
  assert.deepEqual(parseRoute("#/anime/535669").id, "535669");
  assert.equal(parseRoute("#/review?entry=a%26b").params.get("entry"), "a&b");
  assert.equal(parseRoute("").page, "home");
  assert.equal(formatTime(1405), "00:23:25");
});
