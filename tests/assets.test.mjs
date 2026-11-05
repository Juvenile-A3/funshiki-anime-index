import test from "node:test";
import assert from "node:assert/strict";
import { applyLocalAssets, isLocalCover } from "../site/assets.mjs";

const source = "https://lain.bgm.tv/pic/cover/l/example.jpg";
const image = "assets/covers/12-0123456789abcdef.webp";
const catalog = () => ({ subjects: [{ id: 12, image: source, name: "Example" }] });
const manifest = () => ({ subjects: { 12: {
  image, image_source: source, rating: { score: 8.2 }, rating_fetched_at: "2026-11-05T00:00:00Z",
} } });

test("local covers and saved ratings replace runtime external dependencies", () => {
  const result = applyLocalAssets(catalog(), manifest());
  assert.equal(result.subjects[0].image, image);
  assert.equal(result.subjects[0].rating.score, 8.2);
  assert.equal(result.subjects[0].name, "Example");
});

test("missing or changed assets require sync instead of silently hotlinking", () => {
  assert.throws(() => applyLocalAssets(catalog(), { subjects: {} }), /sync:assets/);
  const changed = catalog();
  changed.subjects[0].image = source + "?new";
  assert.throws(() => applyLocalAssets(changed, manifest()), /sync:assets/);
  const invalid = manifest();
  invalid.subjects[12].image = source;
  assert.throws(() => applyLocalAssets(catalog(), invalid), /sync:assets/);
});

test("subjects without a source cover keep the text fallback", () => {
  const empty = catalog();
  empty.subjects[0].image = "";
  const saved = manifest();
  saved.subjects[12].image_source = saved.subjects[12].image = "";
  assert.equal(applyLocalAssets(empty, saved).subjects[0].image, "");
});

test("only generated same-site image paths are accepted", () => {
  assert.ok(isLocalCover(image));
  for (const path of [source, "//evil.example/a.webp", "assets/covers/../../a.webp", "data:image/png;base64,x"]) {
    assert.equal(isLocalCover(path), false);
  }
});

test("updated remote metadata overlays the catalog without changing clip associations", () => {
  const data = catalog();
  data.segments = [{ subject_ids: [12] }];
  const saved = manifest();
  saved.subjects[12].catalog_image_source = source;
  saved.subjects[12].image_source = 'https://lain.bgm.tv/new.jpg';
  saved.subjects[12].metadata = { name: 'New title', aliases: ['Example'], quarter: '202701', id: 99 };
  saved.subjects[12].image_variants = [{ image, width: 320, height: 480 }];
  const updated = applyLocalAssets(data, saved);
  assert.equal(updated.subjects[0].name, 'New title');
  assert.equal(updated.subjects[0].id, 12);
  assert.deepEqual(updated.segments[0].subject_ids, [12]);
  assert.equal(updated.subjects[0].image_variants.length, 1);
  saved.subjects[12].image_variants[0].image = '//external.example/image.webp';
  assert.throws(() => applyLocalAssets(catalog(), saved), /sync:assets/);
});
