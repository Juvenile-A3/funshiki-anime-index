import { mkdir, copyFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { validateCatalog } from "../site/domain.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(
  await readFile(join(root, "data/catalog.json"), "utf8"),
);
validateCatalog(catalog);
await mkdir(join(root, "dist"), { recursive: true });
for (const file of [
  "index.html",
  "app.mjs",
  "domain.mjs",
  "style.css",
  "favicon.svg",
])
  await copyFile(join(root, "site", file), join(root, "dist", file));
await copyFile(
  join(root, "data/catalog.json"),
  join(root, "dist/catalog.json"),
);
await copyFile(join(root, "config/site.json"), join(root, "dist/config.json"));
console.log(
  `Built static site: ${catalog.subjects.length} subjects, ${catalog.videos.length} videos, ${catalog.segments.length} timepoints.`,
);
