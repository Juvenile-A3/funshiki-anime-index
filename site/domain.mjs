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
  return `https://www.bilibili.com/video/${bvid}/?p=${p}&t=${Math.max(0, Math.floor(seconds - preRoll))}`;
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
) {
  const terms = query.trim().split(/\s+/).map(normalize).filter(Boolean);
  const videoMap = new Map(data.videos.map((v) => [v.bvid, v]));
  return data.subjects
    .map((s) => {
      const segments = data.segments.filter((e) =>
        e.subject_ids.includes(s.id),
      );
      return {
        ...s,
        segments,
        latest:
          segments
            .map((e) => videoMap.get(e.bvid)?.live_date || "")
            .sort()
            .at(-1) || "",
      };
    })
    .filter(
      (s) =>
        s.segments.length &&
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
        (period === "all" || s.air_date?.startsWith(period)),
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
  if (subjects.size !== data.subjects.length) throw new Error("重复动画 ID");
  const videos = new Map(data.videos.map((v) => [v.bvid, v]));
  const ids = new Set();
  for (const e of data.segments) {
    if (ids.has(e.id)) throw new Error(`重复时点 ${e.id}`);
    ids.add(e.id);
    if (!videos.has(e.bvid) || e.subject_ids.some((id) => !subjects.has(id)))
      throw new Error(`无效关联 ${e.id}`);
    if (!e.targets.length) throw new Error(`缺少视频目标 ${e.id}`);
    for (const t of e.targets) {
      const page = videos
        .get(e.bvid)
        .pages.find((p) => p.cid === t.cid && p.p === t.p);
      if (
        !page ||
        t.seconds > page.duration ||
        !videoUrl(e.bvid, t.p, t.seconds)
      )
        throw new Error(`无效视频时点 ${e.id}`);
    }
  }
  return true;
}
