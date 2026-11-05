import { mkdir, copyFile, readFile, rm, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { assertPublicCatalog } from "./public-catalog.mjs";
import { validateCatalog } from "../site/domain.mjs";
import { applyLocalAssets } from "../site/assets.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const dist = join(root, "dist");
const catalog = JSON.parse(
  await readFile(join(root, "data/catalog.json"), "utf8"),
);
assertPublicCatalog(catalog);
validateCatalog(catalog);
const manifest = JSON.parse(await readFile(join(root, "site/assets/subjects.json"), "utf8"));
const localized = applyLocalAssets(structuredClone(catalog), manifest);
validateCatalog(localized);
// Check all covers before replacing a previously working build. Never fetch at build time.
const covers = new Set();
for (const subject of localized.subjects) {
  if (subject.image) covers.add(subject.image);
  for (const variant of subject.image_variants) covers.add(variant.image);
}
for (const path of covers) await access(join(root, "site", path));
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of [
  "index.html",
  "app.mjs",
  "about.mjs",
  "analytics.mjs",
  "domain.mjs",
  "assets.mjs",
  "style.css",
])
  await copyFile(join(root, "site", file), join(root, "dist", file));
await mkdir(join(dist, "assets/covers"), { recursive: true });
await mkdir(join(dist, "assets/credits"), { recursive: true });
await copyFile(join(root, "site/assets/logo.png"), join(dist, "assets/logo.png"));
for (const name of ["fanshi.webp", "recorders.webp"]) await copyFile(join(root,"site/assets/credits",name),join(dist,"assets/credits",name));
await copyFile(join(root, "site/assets/subjects.json"), join(dist, "assets/subjects.json"));
for (const path of covers) await copyFile(join(root, "site", path), join(dist, path));
await copyFile(
  join(root, "data/catalog.json"),
  join(root, "dist/catalog.json"),
);
await copyFile(join(root, "config/site.json"), join(root, "dist/config.json"));
await copyFile(join(root, "config/about.json"), join(dist, "about.json"));
await copyFile(join(root, "CNAME"), join(root, "dist/CNAME"));
console.log(
  `Built static site: ${catalog.subjects.length} subjects, ${catalog.videos.length} videos, ${catalog.segments.length} timepoints.`,
);
