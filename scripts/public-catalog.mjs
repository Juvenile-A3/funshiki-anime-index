import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const pick = (value, keys) => Object.fromEntries(keys.filter(k => Object.hasOwn(value, k)).map(k => [k, value[k]]));
const target = value => pick(value, ['p','cid','seconds','end_seconds','variant']);

export function publicCatalog(input) {
  const result = {
    schema_version: input.schema_version,
    subjects: input.subjects.map(s => pick(s, ['id','name','original_name','aliases','search_aliases','type','platform','air_date','quarter','image','summary'])),
    videos: input.videos.map(v => ({
      ...pick(v, ['bvid','title','kind','live_date','published_date']),
      pages: v.pages.map(p => pick(p, ['p','cid','duration','title','variant','verification'])),
    })),
    segments: input.segments.map(e => ({
      ...pick(e, ['id','bvid','text','subject_ids','kind','cross_p']),
      source: pick(e.source || {}, ['type','author','url','original_text']),
      targets: e.targets.map(target),
      ...(e.playback_targets ? {playback_targets:e.playback_targets.map(target)} : {}),
    })),
  };
  return {...result, version:createHash('sha256').update(JSON.stringify(result)).digest('hex').slice(0,16)};
}

export function assertPublicCatalog(input) {
  if (JSON.stringify(input) !== JSON.stringify(publicCatalog(input))) {
    throw new Error('公开索引包含未允许的字段，或版本摘要不匹配。');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [source, destination] = process.argv.slice(2);
  if (!source || !destination) throw new Error('需要输入与输出 JSON 路径');
  const catalog = publicCatalog(JSON.parse(await readFile(source, 'utf8')));
  await writeFile(destination, JSON.stringify(catalog, null, 2) + '\n');
}
