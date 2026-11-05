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
export const recordingDate = (v) => v?.live_date || v?.published_date || "";
export function totalDuration(entries) {
  // Union overlapping source intervals; alternate playback versions are not added twice.
  const groups = new Map();
  let incomplete = false;
  for (const e of entries) for (const t of e.targets || []) {
    if (!Number.isFinite(t.end_seconds)) { incomplete = true; continue; }
    const key = `${e.bvid}:${t.p}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push([t.seconds, t.end_seconds]);
  }
  let seconds = 0;
  for (const intervals of groups.values()) {
    intervals.sort((a,b)=>a[0]-b[0]);
    let start = 0, end = 0;
    for (const [a,b] of intervals) {
      if (a > end) { seconds += end-start; start=a; }
      end=Math.max(end,b);
    }
    seconds += end-start;
  }
  return {seconds, incomplete, label: `${incomplete ? '至少 ' : ''}${segmentDuration({targets:[{seconds:0,end_seconds:seconds}]})}`};
}

export function episodeProgress(subject, recording) {
  if (subjectCategory(subject) !== 'anime' || !recording?.live_date) return '';
  const previous = new Date(`${recording.live_date}T00:00:00Z`);
  previous.setUTCDate(previous.getUTCDate()-1);
  const cutoff = previous.toISOString().slice(0,10);
  const airing = subject.airing;
  const episodes = (airing?.episodes || []).filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.broadcast_date));
  const aired = episodes.filter(e => e.broadcast_date <= cutoff);
  if (subject.air_date && subject.air_date > cutoff && !aired.length) return '预告';
  if (!['TV','WEB'].includes(subject.platform)) return subject.air_date && subject.air_date <= cutoff ? '完结' : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(airing?.confirmed_end) && airing.confirmed_end <= cutoff) return '完结';
  if (airing?.episode_count > 0 && episodes.length >= airing.episode_count && aired.length === episodes.length) return '完结';
  if (aired.length) return `#${Math.max(...aired.map(e=>e.number))}`;
  return '';
}
export function segmentTimeRange(entry) {
  const first = entry.targets[0];
  const last = entry.cross_p ? entry.targets.at(-1) : first;
  return {
    start: `${entry.cross_p ? `P${first.p} ` : ""}${formatTime(first.seconds)}`,
    end: last.end_seconds === undefined ? "" : `${entry.cross_p ? `P${last.p} ` : ""}${formatTime(last.end_seconds)}`,
  };
}
export function segmentPlaybackTargets(entry) {
  return entry.playback_targets || [entry.targets[0]];
}
export function segmentTargetLabel(entry, target, index) {
  return index === 0 ? "跳转切片" : target.variant === "danmaku" ? "弹幕版" : "普通版";
}
export function segmentDuration(entry) {
  if (entry.targets.some(t => t.end_seconds === undefined)) return `起点 ${formatTime(entry.targets[0].seconds)}`;
  const seconds = Math.round(entry.targets.reduce((sum, t) => sum + Math.max(0, (t.end_seconds ?? t.seconds) - t.seconds), 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const rest = seconds % 60;
  return `${hours ? `${hours} 小时 ` : ""}${minutes ? `${minutes} 分 ` : ""}${rest || !seconds ? `${rest} 秒` : ""}`.trim() + (entry.cross_p ? "（跨P）" : "");
}
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
const subjectIndexes = new WeakMap();
// Catalogs are immutable after loading. Build associations and search text once.
export function indexSubjects(data) {
  if (subjectIndexes.has(data)) return subjectIndexes.get(data);
  const videoMap = new Map(data.videos.map((v) => [v.bvid, v]));
  const entries = new Map(data.subjects.map((s) => [s.id, []]));
  for (const segment of data.segments) {
    if (isIndexedSegment(segment)) {
      for (const id of new Set(segment.subject_ids)) entries.get(id)?.push(segment);
    }
  }
  const index = data.subjects.map((s) => {
    const segments = entries.get(s.id);
    const latest = segments.reduce((date, e) => {
      const next = recordingDate(videoMap.get(e.bvid));
      return next > date ? next : date;
    }, "");
    const mentionCount = new Set(segments.map(e => e.bvid)).size;
    const discussionSeconds = Math.round(totalDuration(segments.filter(e => videoMap.get(e.bvid)?.kind !== 'screening')).seconds * 1000) / 1000;
    return { ...s, segments, latest, mentionCount, discussionSeconds,
      searchText: normalize([s.name, s.original_name, ...s.aliases, ...(s.search_aliases || [])].join(" ")) };
  });
  subjectIndexes.set(data, index);
  return index;
}
export function findSegments(data, query, allowedSubjectIds = null, excludedSubjectIds = new Set()) {
  const terms = query.trim().split(/\s+/).map(normalize).filter(Boolean);
  if (!terms.length) return [];
  const subjects = new Map(data.subjects.map(s=>[s.id, s]));
  const videos = new Map(data.videos.map(v=>[v.bvid,v]));
  return data.segments.filter(e => {
    if (!isIndexedSegment(e) || !e.subject_ids.length || e.subject_ids.some(id=>excludedSubjectIds.has(id)) || (allowedSubjectIds && !e.subject_ids.some(id=>allowedSubjectIds.has(id)))) return false;
    const text = normalize([e.text, e.source?.original_text, ...e.subject_ids.flatMap(id=>{
      const s=subjects.get(id); return s ? [s.name,s.original_name,...s.aliases,...(s.search_aliases||[])] : [];
    })].join(' '));
    return terms.every(t=>text.includes(t));
  }).sort((a,b)=>recordingDate(videos.get(b.bvid)).localeCompare(recordingDate(videos.get(a.bvid))) || a.bvid.localeCompare(b.bvid) || a.targets[0].p-b.targets[0].p || a.targets[0].seconds-b.targets[0].seconds);
}

// A full page fills complete rows at every layout: 5, 3 or 2 columns.
export const CATALOG_PAGE_SIZE = 60;
export function paginate(items, requested = 1, size = CATALOG_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.max(1, Math.min(pages, Math.floor(Number(requested)) || 1));
  return { items: items.slice((page - 1) * size, page * size), page, pages, total: items.length };
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
  return indexSubjects(data)
    .filter(
      (s) =>
        s.segments.length && (category === "all" || subjectCategory(s) === category) &&
        terms.every(
          (t) =>
            normalize(s.id).includes(t) ||
            s.searchText.includes(t),
        ) &&
        (period === "all" || (s.quarter ? (s.quarter === "999999" ? null : s.quarter) : s.air_date)?.startsWith(period)) &&
        (quarter === "all" || s.quarter === quarter),
    )
    .sort((a, b) => sort === "count"
      ? compareMentions(a, b)
      : b.latest.localeCompare(a.latest) || compareMentions(a, b));
}
function compareMentions(a, b) {
  return b.mentionCount - a.mentionCount || b.discussionSeconds - a.discussionSeconds ||
    b.latest.localeCompare(a.latest) || a.name.localeCompare(b.name, "zh-CN");
}
export function animeQuarter(subject) {
  if (subjectCategory(subject) !== "anime") return "";
  if (!subject.quarter || subject.quarter === "999999") return "999999";
  const match = /^(\d{4})(0[1-9]|1[0-2])$/.exec(subject.quarter || "");
  if (!match) return "";
  const month = Math.floor((Number(match[2]) - 1) / 3) * 3 + 1;
  return `${match[1]}${String(month).padStart(2, "0")}`;
}

const quarterIndex = (key) => Number(key.slice(0, 4)) * 4 + (Number(key.slice(4)) - 1) / 3;
const quarterKey = (index) => `${Math.floor(index / 4)}${String(index % 4 * 3 + 1).padStart(2, "0")}`;
const dateQuarter = (value) => value ? `${value.slice(0, 4)}${String(Math.floor((Number(value.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, "0")}` : "";
export function broadcastQuarters(subject) {
  if (subjectCategory(subject) !== "anime") return [];
  return subject.airing?.quarters || [animeQuarter(subject)].filter(q => q && q !== "999999");
}

// A late finale before the first new-season talk still belongs to the previous season.
export function recentBroadcastQuarters(subject, discussion) {
  const premiere = animeQuarter(subject);
  const episodic = ["TV", "WEB"].includes(subject.platform) && subject.airing?.episode_count !== 1;
  if (!episodic) return [premiere].filter(q => q && q !== "999999");
  return broadcastQuarters(subject).filter(q => {
    if (q <= premiere) return true;
    const boundary = discussion.transitions.find(t => t.quarter === q)?.date;
    if (!boundary) return true;
    const dates = subject.airing?.episode_dates;
    if (dates?.length) return dates.some(d => d >= boundary && dateQuarter(d) === q);
    return !subject.airing?.end || subject.airing.end >= boundary;
  });
}
export function timelineContributors(data) {
  const authors = new Map();
  const videos = new Map((data.videos || []).map(v => [v.bvid, v]));
  for (const entry of data.segments) {
    const source = entry.source;
    if (source?.type !== "library-timeline" || videos.get(entry.bvid)?.kind === "screening" || !source.author) continue;
    if (!authors.has(source.author)) authors.set(source.author, new Set());
    authors.get(source.author).add(entry.bvid);
  }
  return [...authors].map(([name, entries]) => ({name, count: entries.size}))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
}

export function discussionSeasons(data, now = new Date()) {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const subjects = new Map(data.subjects.map(s => [s.id, s]));
  const byVideo = new Map();
  for (const e of data.segments) {
    if (!isIndexedSegment(e) || /\bpv\b|PV|预告|先导|新番展望/i.test(e.text || "")) continue;
    if (!byVideo.has(e.bvid)) byVideo.set(e.bvid, new Set());
    for (const id of e.subject_ids) {
      const s = subjects.get(id);
      if (s && subjectCategory(s) === "anime" && ["TV", "WEB"].includes(s.platform) && !s.airing?.long_running) byVideo.get(e.bvid).add(id);
    }
  }
  const talks = data.videos.filter(v => v.kind === "talk" && (v.live_date || v.published_date) <= today)
    .sort((a, b) => (a.live_date || a.published_date).localeCompare(b.live_date || b.published_date));
  const starts = new Map();
  for (const v of talks) {
    const date = v.live_date || v.published_date;
    const q = dateQuarter(date);
    const ids = [...(byVideo.get(v.bvid) || [])].filter(id => !subjects.get(id).air_date || subjects.get(id).air_date <= date);
    const matching = ids.filter(id => broadcastQuarters(subjects.get(id)).includes(q));
    // A new season starts with a regular talk dominated by that season's shows.
    // Tea parties, previews, single-title tangents, and an even split cannot advance it.
    if (matching.length >= 3 && matching.length > ids.length / 2 && !starts.has(q)) {
      starts.set(q, { quarter: q, date, bvid: v.bvid, matching: matching.length, total: ids.length });
    }
  }
  const transitions = [...starts.values()].sort((a, b) => a.quarter.localeCompare(b.quarter));
  const fallback = talks.length ? quarterKey(quarterIndex(dateQuarter(talks.at(-1).live_date || talks.at(-1).published_date)) - 1)
    : dateQuarter(today);
  const current = transitions.at(-1)?.quarter || fallback;
  return { current, previous: quarterKey(quarterIndex(current) - 1), transitions };
}

export function recordingCoverage(data) {
  const dates = data.videos.map(recordingDate).filter(Boolean).sort();
  return { from: dates[0] || "", to: dates.at(-1) || "" };
}

export function findHomeSubjects(data, {
  query = "", category = "all", quarter = "all", quickFilter = "recent", now = new Date(),
} = {}) {
  const season = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3);
  const quarterKey = (index) => `${Math.floor(index / 4)}${String(index % 4 * 3 + 1).padStart(2, "0")}`;
  const currentQuarter = quarterKey(season);
  const discussion = discussionSeasons(data, now);
  const recentQuarters = [discussion.current, discussion.previous];
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const recentRank = s => recentQuarters.findIndex(q => recentBroadcastQuarters(s, discussion).includes(q));
  const timeMachineIds = new Set(data.segments.filter(e => isIndexedSegment(e) &&
    /时光机/.test([e.text, e.source?.original_text].filter(Boolean).join(" "))).flatMap(e => e.subject_ids));
  const subjects = findSubjects(data, query, "all", "count", category).filter((s) => {
    const seasonQuarter = animeQuarter(s);
    if (quarter !== "all" && (quickFilter === "recent" || quickFilter === "current") && !recentBroadcastQuarters(s, discussion).includes(quarter)) return false;
    if (quarter !== "all" && !["recent", "current"].includes(quickFilter) && seasonQuarter !== quarter) return false;
    if (quickFilter === "recent" || quickFilter === "current") return subjectCategory(s) === "anime" &&
      !s.airing?.long_running && (!s.air_date || s.air_date <= today) && recentRank(s) >= 0;
    if (quickFilter === "time-machine") return subjectCategory(s) === "anime" && timeMachineIds.has(s.id);
    if (quickFilter === "satellite") return seasonQuarter === "999999" || seasonQuarter > currentQuarter;
    return true;
  });
  if (quickFilter === "time-machine") {
    subjects.sort((a, b) => animeQuarter(b).localeCompare(animeQuarter(a)));
  }
  if (quickFilter === "recent" || quickFilter === "current") subjects.sort((a, b) => recentRank(a) - recentRank(b));
  return subjects;
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
    if (e.cross_p && (e.targets.length < 2 || e.targets.some((t, i) => t.p !== e.targets[0].p + i)))
      throw new Error(`无效跨P分组 ${e.id}`);
    for (const t of [...e.targets, ...(e.playback_targets || [])]) {
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

export const categories = { anime: "动画", book: "书籍", game: "游戏", live: "真人 / 特摄", music: "音乐", unknown: "类型待确认" };
const contentKinds = { indexed: true, discussion: true, watch: true, pv: true, general: true, life: true, new_video: true };
export const isIndexedSegment = (entry) => !["life", "new_video"].includes(entry.kind);
export function subjectCategory(s) {
  if (s.type === 0) return "unknown";
  if (s.type === 6) return "live";
  if (s.type === 3) return "music";
  if (s.type === 4) return "game";
  if (s.type === 1) {
    return "book";
  }
  return "anime"; // Existing schema v1 animation records omit type.
}
export function validateSubject(s) {
  if (!Number.isSafeInteger(s.id) || s.id < 1 || (s.type !== undefined && ![0, 1, 2, 3, 4, 6].includes(s.type)) ||
      typeof s.name !== "string" || !s.name.trim() || typeof s.original_name !== "string" ||
      !Array.isArray(s.aliases) || s.aliases.some(a => typeof a !== "string")) throw new Error("无效作品数据");
}
