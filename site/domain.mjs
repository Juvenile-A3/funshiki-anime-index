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
const contentKinds = { indexed: true, discussion: true, watch: true, pv: true, general: true, life: true, new_video: true };
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
