export const isLocalCover = (path) => /^assets\/covers\/\d+-[a-f0-9]{16}\.webp$/.test(path || "");

export function applyLocalAssets(catalog, manifest) {
  for (const subject of catalog.subjects) {
    const saved = manifest.subjects?.[subject.id];
    if (!saved || (saved.catalog_image_source ?? saved.image_source) !== (subject.image || "") ||
        (saved.image_source && !isLocalCover(saved.image)) || !saved.rating_fetched_at ||
        (saved.image_variants || []).some(v => !isLocalCover(v.image) || !Number.isInteger(v.width) || v.width <= 0 || !Number.isInteger(v.height) || v.height <= 0)) {
      throw new Error(`作品 ${subject.id} 的本地资源缺失或已过期，请运行 npm run sync:assets`);
    }
    if (saved.metadata) {
      for (const key of ["name", "original_name", "aliases", "type", "platform", "air_date", "quarter", "summary"]) {
        if (Object.hasOwn(saved.metadata, key)) subject[key] = saved.metadata[key];
      }
    }
    subject.image = saved.image || "";
    subject.image_variants = saved.image_variants || [];
    subject.rating = saved.rating;
    subject.rating_fetched_at = saved.rating_fetched_at;
    if (saved.airing?.start === subject.air_date) subject.airing = saved.airing;
  }
  return catalog;
}
