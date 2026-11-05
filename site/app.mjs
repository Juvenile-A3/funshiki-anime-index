import {
  escapeHtml as esc,
  segmentDuration, segmentPlaybackTargets, segmentTargetLabel, totalDuration, episodeProgress, findSegments,
  findSubjects, findHomeSubjects, animeQuarter, recentBroadcastQuarters, timelineContributors, discussionSeasons, recordingCoverage,
  parseRoute,
  validateCatalog,
  videoUrl, recordingDate, quarterLabel,
  categories, subjectCategory, isIndexedSegment, paginate,
} from "./domain.mjs";
import { createAnalytics } from "./analytics.mjs";
import { aboutMarkup } from "./about.mjs";
import { applyLocalAssets, isLocalCover } from "./assets.mjs";
const main = document.querySelector("main");
document.querySelector(".skip").addEventListener("click", (e) => {
  e.preventDefault();
  main.focus();
  main.scrollIntoView();
});
let data,
  config,
  aboutCopy,
  timelineOrder = "desc",
  searchTimer,
  summaryObserver;
const catalogNavigationKey = "catalog-navigation-v1";
let catalogNavigation = { hash: "#/", y: 0 };
try {
  const saved = JSON.parse(sessionStorage.getItem(catalogNavigationKey));
  if (/^#\/(?:\?.*)?$/.test(saved?.hash) && Number.isFinite(saved.y) && saved.y >= 0) {
    catalogNavigation = saved;
  }
} catch { /* Navigation still works in memory when storage is unavailable. */ }
function rememberCatalog(hash, y) {
  catalogNavigation = { hash, y };
  try { sessionStorage.setItem(catalogNavigationKey, JSON.stringify(catalogNavigation)); } catch {}
  document.querySelector('[data-nav="anime"]').setAttribute("href", hash);
}
// Capture the position before an internal link changes the route.
document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href]");
  if (link && parseRoute(location.hash).page === "home") {
    rememberCatalog(location.hash || "#/", window.scrollY);
  }
}, true);
window.addEventListener("pagehide", () => {
  if (parseRoute(location.hash).page === "home") rememberCatalog(location.hash || "#/", window.scrollY);
});
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
const subject = (id) => data.subjects.find((s) => s.id === id);
const video = (bvid) => data.videos.find((v) => v.bvid === bvid);
const external = (href, label, cls = "") =>
  `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
const pill = (label, cls = "") =>
  `<span class="pill ${cls}">${esc(label)}</span>`;
const formatDate = (d) => d?.replaceAll("-", ".") || "日期待核实";
const formatSummary = (value) =>
  esc(value.split("[简介原文]")[0].trimEnd()).replace(/(?:\r\n|\r|\n)+/g, "<br>");
const shortDate = (d) => d ? formatDate(d).slice(2) : "日期待核实";
const dateOf = (v) => recordingDate(v);
const shortTitle = (title) => title.replace(/^【[^】]*】\s*/, "");
function cover(s, cls = "", eager = false) {
  const variants = (s.image_variants || []).filter(v => isLocalCover(v.image));
  const url = variants[0]?.image || (isLocalCover(s.image) ? s.image : "");
  const sizes = cls ? "(max-width: 600px) 160px, 250px" : "(max-width: 640px) 46vw, (max-width: 1024px) 30vw, 280px";
  return `<div class="cover ${cls}" style="--cover-color:${esc(s.color || "#d6d0ec")}"><span class="cover-fallback" aria-hidden="true">${esc(s.name.slice(0, 2))}</span>${url ? `<img src="${esc(url)}" ${variants.length ? `srcset="${variants.map(v => `${esc(v.image)} ${v.width}w`).join(", ")}" sizes="${sizes}" width="${variants[0].width}" height="${variants[0].height}"` : ""} alt="${esc(s.name)}封面" loading="${eager ? "eager" : "lazy"}" decoding="async">` : ""}</div>`;
}
function card(s, i, activeQuarter = "") {
  const seasonLabel = quarterLabel(activeQuarter || s.quarter);
  return `<a class="anime-card" href="#/anime/${s.id}">${cover(s, "", i < 4)}<div class="card-top"><span>${esc(seasonLabel)} · ${esc(categories[subjectCategory(s)])}</span></div><h3>${esc(s.name)}</h3><div class="card-bottom"><span><b>${s.segments.length}</b> 个切片</span><span>最近 ${shortDate(s.latest)}</span></div></a>`;
}
function home() {
  const params = parseRoute(location.hash).params;
  const q = params.get("q") || "";
  const presenters = ["大鼻子叔叔", "诶嘿酱", "泛哥哥"];
  const presenter = presenters[Math.floor(Math.random() * presenters.length)];
  const recommended = findSubjects(data, "", "all", "count").slice(0, 3);
  const animeQuarters = [...new Set(data.subjects.map(animeQuarter).filter(q => q && q !== "999999"))]
    .sort()
    .reverse();
  let quickFilter = params.get("quick") || (q ? "all" : "recent");
  if (quickFilter === "current") quickFilter = "recent";
  if (!["all", "recent", "time-machine", "satellite"].includes(quickFilter)) quickFilter = "recent";
  const season = discussionSeasons(data);
  const coverage = recordingCoverage(data);
  let pageNumber = params.get("page") || 1;
  main.innerHTML = `<section class="hero"><div class="hero-copy"><h1>想听<span class="host-name">${presenter}</span>聊什么？</h1><form class="search" id="search-form" role="search"><span aria-hidden="true">⌕</span><input id="search" type="search" aria-label="搜索作品或切片" placeholder="搜索作品或切片" value="${esc(q)}" autocomplete="off"></form><div class="suggestions"><span>试试搜索：</span>${recommended.map((s) => `<button data-query="${esc(s.name)}">${esc(s.name)}</button>`).join("")}</div></div><aside class="hero-aside" aria-label="收录概况"><div class="archive-number">${findSubjects(data).length}<small>部作品</small></div><div class="archive-divider"></div><div class="aside-stats"><span><b>${data.videos.length}</b>期录播</span><span><b>${data.segments.filter(e => isIndexedSegment(e) && e.subject_ids.length).length}</b>个切片</span><div class="archive-range"><span>收录日期</span><strong>${shortDate(coverage.from)} — ${shortDate(coverage.to)}</strong></div></div></aside></section><section class="catalog-section" aria-label="作品栏目"><div class="section-head"><div class="catalog-heading"><div class="quick-filters" id="catalog-tabs" aria-label="作品栏目"><button type="button" data-quick-filter="all">所有作品</button><button type="button" data-quick-filter="recent">近期热播</button><button type="button" data-quick-filter="time-machine">时光机</button><button type="button" data-quick-filter="satellite">新番卫星</button></div><span id="result-count" class="sr-only"></span></div><div class="filters"><label class="sr-only" for="category">作品分类</label><select id="category"><option value="all">全部类型</option>${Object.entries(categories).filter(([k]) => !["music", "unknown"].includes(k)).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select><label class="sr-only" for="quarter">作品季度</label><select id="quarter"><option value="all">全部季度</option>${animeQuarters.map(q => `<option value="${q}">${quarterLabel(q)}</option>`).join("")}<option value="999999">未定档</option></select></div></div><div id="anime-grid" class="anime-grid"></div></section><section id="segment-results" class="search-segments" hidden aria-label="匹配的切片"></section>`;
  document.querySelector("#category").value = ["manga", "novel"].includes(params.get("category")) ? "book" : params.get("category") || "all";
  document.querySelector("#quarter").value = params.get("quarter") || "all";
  if (!document.querySelector("#category").value) document.querySelector("#category").value = "all";
  if (!document.querySelector("#quarter").value) document.querySelector("#quarter").value = "all";
  document.querySelector("#anime-grid").insertAdjacentHTML("afterend", '<nav class="pagination" id="pagination" aria-label="作品分页"></nav>');
  document.querySelector("#result-count").setAttribute("aria-live", "polite");
  const update = (resetPage = true) => {
    clearTimeout(searchTimer);
    if (resetPage) pageNumber = 1;
    const selectedQuarter = document.querySelector("#quarter").value;
    const results = findHomeSubjects(data, {
      query: document.querySelector("#search").value,
      category: document.querySelector("#category").value,
      quarter: selectedQuarter,
      quickFilter,
    });
    document.querySelectorAll("[data-quick-filter]").forEach((button) => {
      const selected = button.dataset.quickFilter === quickFilter;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    document.querySelector("#result-count").textContent = `找到 ${results.length} 部作品`;
    const paged = paginate(results, pageNumber);
    pageNumber = paged.page;
    const urlParams = new URLSearchParams();
    for (const [key, value] of Object.entries({ q: document.querySelector("#search").value,
      category: document.querySelector("#category").value, quarter: selectedQuarter, quick: quickFilter })) {
      if (value && (key === "quick" || value !== "all")) urlParams.set(key, value);
    }
    if (pageNumber > 1) urlParams.set("page", pageNumber);
    history.replaceState(null, "", `#/${urlParams.size ? "?" + urlParams : ""}`);
    rememberCatalog(location.hash, catalogNavigation.hash === location.hash ? catalogNavigation.y : 0);
    document.querySelector("#anime-grid").innerHTML = results.length
      ? paged.items.map((s, i) => card(s, i, quickFilter === "recent" ? [season.current, season.previous].find(q => recentBroadcastQuarters(s, season).includes(q)) : "")).join("")
      : `<div class="empty"><span aria-hidden="true">⌕</span><h3>还没有找到这部作品</h3><p>试试正式名称或别名，也可以去整期时间轴看看。</p><button id="reset-search">清空筛选</button></div>`;
    const matches = findSegments(data, document.querySelector("#search").value, new Set(findHomeSubjects(data, {category:document.querySelector("#category").value,quarter:selectedQuarter,quickFilter}).map(s=>s.id)), new Set(results.map(s=>s.id)));
    const clips = document.querySelector("#segment-results");
    clips.hidden = !document.querySelector("#search").value.trim();
    clips.innerHTML = `<div class="section-head"><h2>切片</h2><span>${matches.length} 个结果</span></div><div class="timeline">${matches.map(e=>segment(e,{showVideo:false,showSubject:true})).join("") || '<p class="search-no-clips">没有匹配的切片。</p>'}</div>`;
    const pager = document.querySelector("#pagination");
    pager.innerHTML = paged.pages > 1 ? `<button type="button" data-page="${pageNumber - 1}" ${pageNumber === 1 ? "disabled" : ""}>上一页</button><span aria-live="polite">第 ${pageNumber} / ${paged.pages} 页</span><button type="button" data-page="${pageNumber + 1}" ${pageNumber === paged.pages ? "disabled" : ""}>下一页</button>` : "";
    pager.querySelectorAll("[data-page]").forEach(button => button.addEventListener("click", () => {
      pageNumber = Number(button.dataset.page);
      update(false);
      const heading = document.querySelector("#catalog-tabs");
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    document.querySelector("#reset-search")?.addEventListener("click", () => {
      document.querySelector("#search").value = "";
      document.querySelector("#category").value = "all";
      document.querySelector("#quarter").value = "all";
      quickFilter = "all";
      update();
    });
  };
  document.querySelector("#search").addEventListener("input", (event) => {
    clearTimeout(searchTimer);
    if (!event.isComposing) searchTimer = setTimeout(() => { if (event.target.value.trim()) quickFilter = "all"; update(); }, 180);
  });
  document.querySelector("#search").addEventListener("compositionend", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { if (document.querySelector("#search").value.trim()) quickFilter = "all"; update(); }, 180);
  });
  document.querySelector("#category").addEventListener("change", () => {
    if (!["all", "anime"].includes(document.querySelector("#category").value)) {
      quickFilter = "all";
      document.querySelector("#quarter").value = "all";
    }
    update();
  });
  document.querySelector("#quarter").addEventListener("change", update);
  document.querySelectorAll("[data-quick-filter]").forEach((button) =>
    button.addEventListener("click", () => {
      quickFilter = button.dataset.quickFilter;
      update();
    }),
  );
  document.querySelector("#search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const query = document.querySelector("#search").value;
    quickFilter = "all";
    history.replaceState(null, "", `#/?q=${encodeURIComponent(query)}`);
    update();
    document
      .querySelector("#catalog-tabs")
      .scrollIntoView({ behavior: "smooth" });
  });
  document.querySelectorAll("[data-query]").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelector("#search").value = b.dataset.query;
      quickFilter = "all";
      update();
    }),
  );
  update(false);
}
function segment(e, { showVideo = true, showSubject = false, contextSubject = null } = {}) {
  const v = video(e.bvid);
  const progress = contextSubject ? episodeProgress(contextSubject,v) : '';
  return `<article class="segment ${progress ? "has-progress" : ""} ${showSubject ? "recording-segment" : ""}" id="${esc(e.id)}"><div class="segment-body"><div class="segment-heading"><h3>${esc(e.text)}</h3>${progress ? `<span class="episode-progress">${esc(progress)}</span>` : ""}</div>${showSubject && isIndexedSegment(e) && e.subject_ids.length ? `<div class="subject-links">${e.subject_ids.map((id) => `<a href="#/anime/${id}">${esc(subject(id).name)}</a>`).join("")}</div>` : ""}<p class="segment-duration">${esc(segmentDuration(e))}</p></div>${showVideo ? `<div class="segment-source"><a class="source-video" href="#/video/${v.bvid}">${esc(shortTitle(v.title))}</a><time class="segment-date" datetime="${esc(dateOf(v))}">${shortDate(dateOf(v))}</time></div>` : ""}<div class="segment-actions">${segmentPlaybackTargets(e).map((t, i) => external(videoUrl(e.bvid, t.p, t.seconds), esc(segmentTargetLabel(e, t, i)), i === 0 ? "play primary" : "play")).join("")}</div></article>`;
}
function timelineOrderControl() {
  return `<button class="timeline-order" id="timeline-order" type="button" aria-label="时间排序：${timelineOrder === "desc" ? "最新在前，点击切换为最早在前" : "最早在前，点击切换为最新在前"}"><span aria-hidden="true">${timelineOrder === "desc" ? "↓" : "↑"}</span> ${timelineOrder === "desc" ? "最新在前" : "最早在前"}</button>`;
}
function bindTimelineControls(render) {
  document.querySelector("#timeline-order")?.addEventListener("click", () => {
    timelineOrder = timelineOrder === "desc" ? "asc" : "desc";
    const y = scrollY;
    render();
    document.querySelector("#timeline-order")?.focus({ preventScroll: true });
    window.scrollTo(0, y);
  });
}
function animePage(id) {
  const s = subject(Number(id));
  if (!s || !findSubjects(data).some(item => item.id === s.id)) return notFound();
  const segments = data.segments
    .filter((e) => isIndexedSegment(e) && e.subject_ids.includes(s.id))
    .sort((a, b) => {
      const order =
        dateOf(video(b.bvid)).localeCompare(dateOf(video(a.bvid))) ||
        a.bvid.localeCompare(b.bvid) ||
        a.targets[0].p - b.targets[0].p ||
        a.targets[0].seconds - b.targets[0].seconds;
      return timelineOrder === "asc" ? -order : order;
    });
  main.innerHTML = `<div class="page-wrap"><a class="back" href="#/">← 聊动画</a><section class="subject-hero">${cover(s, "detail-cover")}<div class="subject-info"><h1>${esc(s.name)}</h1><p class="original">${esc(s.original_name)}</p><div class="subject-meta">${pill(quarterLabel(s.quarter))}${pill(categories[subjectCategory(s)])}${external(`https://bgm.tv/subject/${s.id}`, "在 Bangumi 查看")}<span class="bangumi-rating" id="bangumi-rating" aria-live="polite" hidden></span></div><div class="subject-summary"><p class="summary" id="subject-summary-text">${formatSummary(s.summary || "暂无作品简介。")}</p><button class="summary-toggle" type="button" aria-expanded="false" aria-controls="subject-summary-text">展开</button></div><div class="subject-numbers"><strong>${segments.length}</strong> 个切片 <span class="total-duration">共 ${esc(totalDuration(segments).label)}</span><span>来自 ${new Set(segments.map((e) => e.bvid)).size} 期录播</span></div></div></section><div class="section-head"><h2>相关片段</h2><div class="timeline-controls">${timelineOrderControl()}</div></div><div class="timeline">${segments.map((e) => segment(e, {contextSubject:s})).join("")}</div></div>`;
  bindTimelineControls(() => animePage(id));
  bindSummary();
  const ratingTarget = document.querySelector("#bangumi-rating");
  const score = Number(s.rating?.score);
  if (Number.isFinite(score) && score > 0) {
    ratingTarget.hidden = false;
    ratingTarget.title = `Bangumi 评分 · 更新于 ${s.rating_fetched_at.slice(0, 10)}`;
    ratingTarget.innerHTML = `<span class="rating-value"><strong>${score.toFixed(1)}</strong><small>/10</small></span>`;
  } else {
    ratingTarget.remove();
  }
}
function bindSummary() {
  summaryObserver?.disconnect();
  const block = document.querySelector(".subject-summary");
  const text = block.querySelector(".summary");
  const button = block.querySelector("button");
  const info = document.querySelector(".subject-info");
  const image = document.querySelector(".detail-cover");
  let expanded = false;
  const measure = () => {
    const lineHeight = parseFloat(getComputedStyle(text).lineHeight);
    const available = image.clientHeight - (text.getBoundingClientRect().top - info.getBoundingClientRect().top)
      - document.querySelector(".subject-numbers").clientHeight - 8;
    const lines = matchMedia("(max-width: 600px)").matches ? 5 : Math.max(3, Math.floor(available / lineHeight));
    const previewHeight = lines * lineHeight;
    text.style.setProperty("--summary-preview-height", `${previewHeight}px`);
    const overflows = text.scrollHeight > previewHeight + 1;
    button.hidden = !overflows;
    block.classList.toggle("is-expanded", expanded);
    button.setAttribute("aria-expanded", String(expanded));
    button.textContent = expanded ? "收起" : "展开";
  };
  button.addEventListener("click", () => { expanded = !expanded; measure(); });
  summaryObserver = new ResizeObserver(measure);
  summaryObserver.observe(image);
  summaryObserver.observe(info);
  measure();
}
function videosPage() {
  const videoQuarter = (v) => {
    const [year, month] = dateOf(v).split("-");
    const startMonth = Math.floor((Number(month) - 1) / 3) * 3 + 1;
    return `${year}${String(startMonth).padStart(2, "0")}`;
  };
  const videoQuarterLabel = (quarter) => quarterLabel(quarter);
  const videoType = (v) => {
    if (v.kind) return v.kind;
    const title = shortTitle(v.title);
    if (title.includes("燃来")) return "screening";
    if (title.includes("茶话会")) return "tea";
    return "talk";
  };
  const quarters = [...new Set(data.videos.map(videoQuarter))].sort().reverse();
  const presenters = ["大鼻子叔叔", "诶嘿酱", "泛哥哥"];
  const presenter = presenters[Math.floor(Math.random() * presenters.length)];
  let selectedType = "all";
  const videoRow = (v) => {
    const entries = data.segments.filter((e) => e.bvid === v.bvid);
    const screening = videoType(v) === "screening";
    const works = [...new Set(entries.flatMap(e => e.subject_ids))].map(id => subject(id)).filter(Boolean);
    return `<article class="segment recording-card"><time class="recording-date" datetime="${dateOf(v)}">${shortDate(dateOf(v))}</time><h2><a class="recording-link" href="#/video/${v.bvid}">${esc(shortTitle(v.title))}</a></h2><div class="recording-card-bottom">${screening ? works.map(s => `<a class="screening-work" href="#/anime/${s.id}">${esc(s.name)}</a>`).join("、") : `<span>${entries.length} 个切片 · ${works.length} 部相关作品</span>`}</div></article>`;
  };
  main.innerHTML = `<div class="page-wrap"><div class="page-title video-page-title"><div class="video-title-copy"><h1>想回顾<span class="host-name">${presenter}</span>哪期直播？</h1><div class="quick-filters video-type-filters" aria-label="录播分类"><button type="button" data-video-type="all" aria-pressed="true">全部录播</button><button type="button" data-video-type="talk" aria-pressed="false">杂谈回</button><button type="button" data-video-type="screening" aria-pressed="false">放映会</button><button type="button" data-video-type="tea" aria-pressed="false">茶话会</button><button type="button" data-video-type="op_ed" aria-pressed="false">OP/ED 鉴赏</button></div></div><label class="video-quarter-filter" for="video-quarter"><select id="video-quarter" aria-label="录播季度"><option value="all">全部季度</option>${quarters.map((quarter) => `<option value="${quarter}">${videoQuarterLabel(quarter)}</option>`).join("")}</select></label></div><div class="timeline recording-grid" id="video-list"></div></div>`;
  const render = () => {
    const selectedQuarter = document.querySelector("#video-quarter").value;
    document.querySelector("#video-list").innerHTML = data.videos
      .filter((v) => (selectedQuarter === "all" || videoQuarter(v) === selectedQuarter) && (selectedType === "all" || videoType(v) === selectedType))
      .map(videoRow)
      .join("");
    document.querySelectorAll("[data-video-type]").forEach((button) => {
      const selected = button.dataset.videoType === selectedType;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  };
  document.querySelector("#video-quarter").addEventListener("change", render);
  document.querySelectorAll("[data-video-type]").forEach((button) =>
    button.addEventListener("click", () => {
      selectedType = button.dataset.videoType;
      render();
    }),
  );
  render();
}
function videoPage(bvid) {
  const v = video(bvid);
  if (!v) return notFound();
  const entries = data.segments.filter((e) => e.bvid === bvid);
  main.innerHTML = `<div class="page-wrap"><a class="back" href="#/videos">← 补录播</a><div class="page-title"><div class="eyebrow video-posted-date">${shortDate(dateOf(v))}</div><h1>${esc(shortTitle(v.title))}</h1>${external(`https://www.bilibili.com/video/${bvid}/`, "打开完整录播", "text-link")}</div><div class="timeline">${entries.map((e) => segment(e, { showVideo: false, showSubject: true })).join("")}</div></div>`;
}
function aboutPage() {
  main.innerHTML = aboutMarkup(aboutCopy, config.repository, timelineContributors(data));
}
function notFound() {
  main.innerHTML =
    '<div class="page-wrap empty"><h1>这份档案还不存在</h1><p>链接可能已变更，也可能暂未收录。</p><a href="#/">回到作品</a></div>';
}
function render() {
  clearTimeout(searchTimer);
  summaryObserver?.disconnect();
  const r = parseRoute(location.hash);
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const selected =
      a.dataset.nav ===
      (["videos", "video"].includes(r.page)
        ? "videos"
        : r.page === "about"
          ? "about"
          : "anime");
    a.classList.toggle("active", selected);
    selected
      ? a.setAttribute("aria-current", "page")
      : a.removeAttribute("aria-current");
  });
  if (r.page === "home") home();
  else if (r.page === "anime") animePage(r.id);
  else if (r.page === "videos") videosPage();
  else if (r.page === "video") videoPage(r.id);
  else if (r.page === "about") aboutPage();
  else notFound();
  document.querySelector('[data-nav="anime"]').setAttribute("href", catalogNavigation.hash);
  if (r.page === "anime") main.querySelector(".back")?.setAttribute("href", catalogNavigation.hash);
  document.title =
    (r.page === "anime" && subject(Number(r.id))
      ? subject(Number(r.id)).name + " · "
      : "") + "诶嘿漫谈部";
}
try {
  const responses = await Promise.all([
    fetch(new URL("./catalog.json", import.meta.url)),
    fetch(new URL("./config.json", import.meta.url)),
    fetch(new URL("./assets/subjects.json", import.meta.url)),
    fetch(new URL("./about.json", import.meta.url)),
  ]);
  if (responses.some((r) => !r.ok)) throw new Error("数据文件未能加载");
  const [catalog, settings, assets, copy] = await Promise.all(responses.map((r) => r.json()));
  data = applyLocalAssets(catalog, assets);
  config = settings;
  aboutCopy = copy;
  validateCatalog(data);
  const analytics = createAnalytics(config.analytics);
  const trackClip = event => {
    if (event.type === 'auxclick' && event.button !== 1) return;
    const link = event.target.closest('.segment-actions a.play');
    if (!link) return;
    const entry = data.segments.find(e => e.id === link.closest('.segment').id);
    const index = [...link.parentElement.children].indexOf(link);
    if (entry) analytics.clip(entry, segmentPlaybackTargets(entry)[index]);
  };
  document.addEventListener('click', trackClip);
  document.addEventListener('auxclick', trackClip);
  const navigate = () => {
    const restore = parseRoute(location.hash).page === "home" &&
      (location.hash || "#/") === catalogNavigation.hash;
    const y = restore ? catalogNavigation.y : 0;
    render();
    const route = parseRoute(location.hash);
    analytics.page(route.page === 'anime' && subject(Number(route.id)) ? Number(route.id) : null);
    main.focus({ preventScroll: true });
    requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "instant" }));
  };
  navigate();
  window.addEventListener("hashchange", navigate);
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "/" &&
      !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)
    ) {
      const input = document.querySelector("#search");
      if (input) {
        e.preventDefault();
        input.focus();
      }
    }
  });
  document.addEventListener(
    "error",
    (e) => {
      if (e.target instanceof HTMLImageElement) e.target.hidden = true;
    },
    true,
  );
} catch (error) {
  main.innerHTML = `<div class="page-wrap empty"><h1>档案暂时没有打开</h1><p>${esc(error.message)}</p><p>请刷新重试，或检查站点的数据文件是否部署完整。</p><button onclick="location.reload()">重新加载</button></div>`;
}
