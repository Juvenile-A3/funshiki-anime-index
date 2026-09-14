export const normalize = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "");
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function formatTime(value) {
  const n = Math.floor(value);
  if (!Number.isFinite(n) || n < 0) return "—";
  return [Math.floor(n / 3600), Math.floor(n / 60) % 60, n % 60]
    .map((x) => String(x).padStart(2, "0"))
    .join(":");
}
export function videoUrl(bvid, p, seconds, preRoll = 0) {
  if (
    !/^BV[0-9A-Za-z]{10}$/.test(bvid) ||
    !Number.isInteger(p) ||
    p < 1 ||
    !Number.isFinite(seconds) ||
    seconds < 0
  )
    return null;
  return `https://www.bilibili.com/video/${bvid}/?p=${p}&t=${Math.max(0, Math.round((seconds - preRoll) * 1000) / 1000)}`;
}
export const recordingDate = (v) => v?.published_date || v?.live_date || "";
export function quarterLabel(value) {
  return !value || value === "999999" ? "未定档" : `${value.slice(0, 4)} 年 ${Number(value.slice(4))} 月`;
}
export function parseRoute(hash) {
  const [path, query = ""] = (hash.replace(/^#/, "") || "/").split("?");
  const bits = path.split("/").filter(Boolean);
  return {
    page: bits[0] || "home",
    id: bits[1] || "",
    params: new URLSearchParams(query),
  };
}
export function findSubjects(
  data,
  query = "",
  period = "all",
  sort = "recent",
  category = "all",
  quarter = "all",
) {
  const terms = query.trim().split(/\s+/).map(normalize).filter(Boolean);
  const videoMap = new Map(data.videos.map((v) => [v.bvid, v]));
  return data.subjects
    .map((s) => {
      const segments = data.segments.filter((e) =>
        isIndexedSegment(e) && e.subject_ids.includes(s.id),
      );
      return {
        ...s,
        segments,
        latest:
          segments
            .map((e) => recordingDate(videoMap.get(e.bvid)))
            .sort()
            .at(-1) || "",
      };
    })
    .filter(
      (s) =>
        s.segments.length && (category === "all" || subjectCategory(s) === category) &&
        terms.every(
          (t) =>
            normalize(s.id).includes(t) ||
            normalize(
              [
                s.name,
                s.original_name,
                ...s.aliases,
                ...s.segments.map((e) => e.text),
              ].join(" "),
            ).includes(t),
        ) &&
        (period === "all" || (s.quarter ? (s.quarter === "999999" ? null : s.quarter) : s.air_date)?.startsWith(period)) &&
        (quarter === "all" || s.quarter === quarter),
    )
    .sort((a, b) =>
      sort === "count"
        ? b.segments.length - a.segments.length ||
          a.name.localeCompare(b.name, "zh-CN")
        : b.latest.localeCompare(a.latest) ||
          b.segments.length - a.segments.length ||
          a.name.localeCompare(b.name, "zh-CN"),
    );
}
export function validateCatalog(data) {
  if (data.schema_version !== 1) throw new Error("不支持的数据版本");
  for (const key of ["subjects", "videos", "segments"])
    if (!Array.isArray(data[key])) throw new Error(`缺少 ${key}`);
  const subjects = new Set(data.subjects.map((s) => s.id));
  if (subjects.size !== data.subjects.length) throw new Error("重复作品 ID");
  data.subjects.forEach(validateSubject);
  const videos = new Map(data.videos.map((v) => [v.bvid, v]));
  if (videos.size !== data.videos.length) throw new Error("重复视频 ID");
  const ids = new Set();
  for (const e of data.segments) {
    if (ids.has(e.id)) throw new Error(`重复时点 ${e.id}`);
    ids.add(e.id);
    if (!Object.hasOwn(contentKinds, e.kind)) throw new Error(`无效分类 ${e.id}`);
    if (!isIndexedSegment(e) && e.subject_ids.length) throw new Error(`非作品话题不能关联作品 ${e.id}`);
    if (!videos.has(e.bvid) || e.subject_ids.some((id) => !subjects.has(id)))
      throw new Error(`无效关联 ${e.id}`);
    if (!e.targets.length) throw new Error(`缺少视频目标 ${e.id}`);
    for (const t of e.targets) {
      const page = videos
        .get(e.bvid)
        .pages.find((p) => p.cid === t.cid && p.p === t.p);
      if (
        !page ||
        (page.duration !== null && t.seconds > page.duration) ||
        (page.duration === null && !(e.source.type === "archive-csv" && page.verification === "csv-linked" && t.cid === null)) ||
        (t.end_seconds !== undefined && (!Number.isFinite(t.end_seconds) || t.end_seconds <= t.seconds || (page.duration !== null && t.end_seconds > page.duration))) ||
        !videoUrl(e.bvid, t.p, t.seconds)
      )
        throw new Error(`无效视频时点 ${e.id}`);
    }
  }
  return true;
}

export const categories = { anime: "动画", novel: "小说", manga: "漫画", game: "游戏", book: "其他书籍", live: "真人 / 特摄", music: "音乐", unknown: "类型待确认" };
export const contentKinds = { indexed: "作品片段", discussion: "作品杂谈", watch: "观看 / 鉴赏", pv: "PV / 新作消息", general: "其他话题", life: "聊生活", new_video: "聊新视频" };
export const isIndexedSegment = (entry) => !["life", "new_video"].includes(entry.kind);
export function subjectCategory(s) {
  if (s.type === 0) return "unknown";
  if (s.type === 6) return "live";
  if (s.type === 3) return "music";
  if (s.type === 4) return "game";
  if (s.type === 1) {
    if (/漫画/.test(s.platform)) return "manga";
    if (/小说/.test(s.platform)) return "novel";
    return "book";
  }
  return "anime"; // Existing schema v1 animation records omit type.
}
export function validateSubject(s) {
  if (!Number.isSafeInteger(s.id) || s.id < 1 || (s.type !== undefined && ![0, 1, 2, 3, 4, 6].includes(s.type)) ||
      typeof s.name !== "string" || !s.name.trim() || typeof s.original_name !== "string" ||
      !Array.isArray(s.aliases) || s.aliases.some(a => typeof a !== "string")) throw new Error("无效作品数据");
}
export function fromBangumi(s) {
  if (![1, 2, 4].includes(s.type)) throw new Error("暂不支持此 Bangumi 条目类型");
  const aliases = (s.infobox || []).filter(x => x.key === "别名").flatMap(x =>
    Array.isArray(x.value) ? x.value.map(a => a.v) : [x.value]).filter(x => typeof x === "string");
  const result = { id: s.id, type: s.type, name: s.name_cn || s.name, original_name: s.name,
    aliases: [...new Set(aliases)], platform: s.platform || "", air_date: s.date || null,
    image: (s.images?.large || s.images?.common || "").replace(/^http:/, "https:"), summary: (s.summary || "").slice(0, 400) };
  validateSubject(result);
  return result;
}
export function recognizeSubjects(subjects, text) {
  const value = normalize(text);
  return subjects.filter(s => [s.name, s.original_name, ...s.aliases].some(name => {
    const term = normalize(name);
    return term.length >= 2 && value.includes(term);
  }));
}
export async function searchBangumi(keyword, type = "all", offset = 0, fetcher = fetch) {
  if (!keyword.trim()) throw new Error("请输入作品名称");
  const query = keyword.trim();
  const types = type === "all" ? [1, 2, 4] : [Number(type)];
  const request = async (tag) => {
    const response = await fetcher(`https://api.bgm.tv/v0/search/subjects?limit=10&offset=${offset}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: tag ? "" : query, sort: tag ? "heat" : "match",
        filter: { type: types, ...(tag ? { tag: [query] } : {}) } }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Bangumi 搜索失败（${response.status}），请稍后重试`);
    const result = await response.json();
    if (!Array.isArray(result.data)) throw new Error("Bangumi 返回格式异常");
    return result;
  };
  const legacy = async () => {
    const params = new URLSearchParams({ responseGroup: "small", max_results: "10", start: String(offset) });
    if (type !== "all") params.set("type", String(type));
    const response = await fetcher(`https://api.bgm.tv/search/subject/${encodeURIComponent(query)}?${params}`, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Bangumi 搜索失败（${response.status}）`);
    const result = await response.json();
    if (result.results === 0) return { data: [], total: 0 };
    if (!Array.isArray(result.list)) throw new Error("Bangumi 返回格式异常");
    return { data: result.list.filter(s => types.includes(s.type)), total: result.results || 0, legacy: true };
  };
  // Legacy search and v0 have different matching behavior. Query all sources
  // with the unchanged user input, without series-specific abbreviation rules.
  // Keep both searches: empty keyword search alone would lose ordinary names.
  const responses = await Promise.allSettled([legacy(), request(true), request(false)]);
  const successful = responses.filter(r => r.status === "fulfilled").map(r => r.value);
  if (!successful.length) throw responses[0].reason;
  const records = new Map(successful.flatMap(r => r.data).map(s => [s.id, s]));
  const legacyIds = new Set(successful.filter(r => r.legacy).flatMap(r => r.data).map(s => s.id));
  const modernIds = new Set(successful.filter(r => !r.legacy).flatMap(r => r.data).map(s => s.id));
  const missing = [...legacyIds].filter(id => !modernIds.has(id));
  let detailFailed = false;
  // Hydrate legacy-only hits so novels/manga retain their actual platform.
  // Limit concurrent detail requests and reuse successful metadata across searches.
  for (let i = 0; i < missing.length; i += 3) {
    const details = await Promise.allSettled(missing.slice(i, i + 3).map(id => getBangumiSubject(id, fetcher)));
    details.forEach((r, j) => {
      const id = missing[i + j];
      if (r.status === "fulfilled") records.set(id, r.value);
      else {
        records.delete(id);
        // Legacy search can retain removed or unavailable entries.
        if (![401, 403, 404].includes(r.reason?.status)) detailFailed = true;
      }
    });
  }
  const subjects = [...records.values()].map(fromBangumi);
  const term = normalize(query);
  const titleMatch = s => Math.max(0, ...[s.name, s.original_name, ...s.aliases].map(name =>
    normalize(name) === term ? 2 : normalize(name).includes(term) ? 1 : 0));
  subjects.sort((a, b) => titleMatch(b) - titleMatch(a));
  return {
    subjects,
    total: successful.reduce((sum, r) => sum + (r.total || 0), 0),
    nextOffset: offset + 10,
    hasMore: successful.some(r => offset + 10 < r.total),
    warning: (detailFailed || responses.some(r => r.status === "rejected")) ? "部分搜索失败，当前仅展示已成功返回的结果，可重新搜索。" : "",
  };
}

const subjectDetailCache = new Map();
export async function getBangumiSubject(id, fetcher = fetch) {
  // Test/custom transports do not share browser cache entries.
  if (fetcher === fetch && subjectDetailCache.has(id)) return subjectDetailCache.get(id);
  const response = await fetcher(`https://api.bgm.tv/v0/subjects/${id}`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    const error = new Error(`读取作品详情失败（${response.status}）`);
    error.status = response.status;
    throw error;
  }
  const result = await response.json();
  if (result.id !== id) throw new Error("作品 ID 不匹配");
  fromBangumi(result);
  if (fetcher === fetch) subjectDetailCache.set(id, result);
  return result;
}
