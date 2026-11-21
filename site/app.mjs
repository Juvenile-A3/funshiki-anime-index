import {
  escapeHtml as esc,
  segmentDuration, preferredPlaybackTarget, totalDuration, episodeProgress, findSegments,
  findSubjects, findHomeSubjects, catalogFilters, subtypeCounts, seasonNames, quarterStartMonth, recentCardDateLabel, timelineContributors, discussionSeasons, recordingCoverage,
  parseRoute,
  validateCatalog,
  videoUrl, recordingDate, quarterLabel,
  categories, subjectCategory, isIndexedSegment, paginate, screeningSubjectIds,
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
  segmentsById,
  config,
  aboutCopy,
  timelineOrder = "desc",
  searchTimer,
  summaryObserver;
let preferDanmaku = false;
try { preferDanmaku = localStorage.getItem("prefer-danmaku") === "true"; } catch {}
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
function backLink(fallback, label) {
  const previous = history.state?.previousRoute;
  return `<a class="back" href="${esc(previous || fallback)}">← ${previous ? "返回上一页" : label}</a>`;
}
function savePosition() {
  if (!history.state || history.state.scrollY === window.scrollY) return;
  history.replaceState({ ...history.state, scrollY: window.scrollY }, "");
}
document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href]");
  if (!link) return;
  savePosition();
  if (parseRoute(location.hash).page === "home") {
    rememberCatalog(location.hash || "#/", window.scrollY);
  }
  if (link.matches(".back") && history.state?.previousRoute && event.button === 0 &&
      !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    history.back();
  }
}, true);
window.addEventListener("scrollend", savePosition);
window.addEventListener("pagehide", () => {
  savePosition();
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
function releaseLabel(s) {
  if (s.air_date) return `${s.air_date.slice(0, 4)} 年 ${Number(s.air_date.slice(5, 7))} 月`;
  return !s.quarter || s.quarter === "999999" ? "未定档" : s.quarter.slice(0, 4) + " 年";
}
function card(s, i, dateLabel = "") {
  const seasonLabel = dateLabel || releaseLabel(s);
  return `<a class="anime-card" href="#/anime/${s.id}">${cover(s, "", i < 4)}<div class="card-top"><span>${esc(seasonLabel)} · ${esc(categories[subjectCategory(s)])}</span></div><h3>${esc(s.name)}</h3>
    <div class="card-bottom"><span class="card-counts"><span><b>${s.mentionCount}</b><span class="count-unit">期</span>录播</span><span><b>${s.segments.length}</b><span class="count-unit">个</span>切片</span></span><span class="card-date"><span class="date-prefix">最近 </span>${shortDate(s.latest)}</span></div></a>`;
}
function renderPagination(pager, {page, pages}, heading, changePage) {
  if (pages <= 1) {
    pager.replaceChildren();
    return;
  }
  const button = (label, target) =>
    `<button type="button" data-page="${target}" ${target === page ? "disabled" : ""}>${label}</button>`;
  pager.innerHTML = `<div class="page-buttons">
    ${button("首页", 1)}${button("上一页", Math.max(1, page - 1))}
    <span aria-live="polite">第 ${page} / ${pages} 页</span>
    ${button("下一页", Math.min(pages, page + 1))}${button("末页", pages)}
  </div><form class="page-jump">
    <input name="page" type="number" inputmode="numeric" min="1" max="${pages}" required aria-label="跳转页码" placeholder="页码">
    <button type="submit">跳转</button>
  </form>`;
  function go(target) {
    changePage(target);
    heading.tabIndex = -1;
    heading.focus({preventScroll: true});
    heading.scrollIntoView({block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"});
  }
  pager.querySelector(".page-buttons").addEventListener("click", event => {
    const target = event.target.closest("[data-page]");
    if (target) go(Number(target.dataset.page));
  });
  pager.querySelector("form").addEventListener("submit", event => {
    event.preventDefault();
    go(event.currentTarget.elements.page.valueAsNumber);
  });
}
function home() {
  const params = parseRoute(location.hash).params;
  const q = params.get("q") || "";
  const presenters = ["大鼻子叔叔", "诶嘿酱", "泛哥哥"];
  const presenter = presenters[Math.floor(Math.random() * presenters.length)];
  const recommended = findSubjects(data, "", "all", "count").slice(0, 3);
  const availableCategories = new Set(findSubjects(data).map(subjectCategory));
  let quickFilter = params.get("quick") || (q ? "all" : "recent");
  if (quickFilter === "current") quickFilter = "recent";
  if (!["all", "recent", "time-machine", "satellite"].includes(quickFilter)) quickFilter = "recent";
  const season = discussionSeasons(data);
  const coverage = recordingCoverage(data);
  let pageNumber = params.get("page") || 1;
  main.innerHTML = `
    <section class="club-lounge">
      <div class="lounge-search">
        <h1>想听<span>${presenter}</span><span>聊什么？</span></h1>
        <form class="search" id="search-form" role="search">
          <i class="search-glass" aria-hidden="true"></i>
          <input id="search" type="search" aria-label="搜索作品或切片" placeholder="搜索作品或切片" value="${esc(q)}" autocomplete="off">
        </form>
        <div class="suggestions"><span>试试搜索</span>
          ${recommended.map((s) => `<button data-query="${esc(s.name)}">${esc(s.name)}</button>`).join("")}
        </div>
      </div>
      <aside class="collection-shelf" aria-label="部室收录">
        <dl class="shelf-counts">
          <div class="shelf-work"><dt><i class="media-icon disc-icon" aria-hidden="true"></i>部作品</dt><dd>${findSubjects(data).length}</dd></div>
          <div class="shelf-recording"><dt><i class="media-icon tape-icon" aria-hidden="true"></i>期录播</dt><dd>${data.videos.length}</dd></div>
          <div class="shelf-clip"><dt><i class="media-icon film-icon" aria-hidden="true"></i>个切片</dt><dd>${data.segments.filter(e => isIndexedSegment(e) && e.subject_ids.length).length}</dd></div>
        </dl>
        <p class="shelf-dates">收录日期　${formatDate(coverage.from)} — ${formatDate(coverage.to)}</p>
      </aside>
    </section>
    <section class="catalog-section" aria-label="作品栏目"><div class="section-head"><div class="catalog-heading"><div class="quick-filters" id="catalog-tabs" aria-label="作品栏目"><button type="button" data-quick-filter="all">所有作品</button><button type="button" data-quick-filter="recent">近期热播</button><button type="button" data-quick-filter="time-machine">时光机</button><button type="button" data-quick-filter="satellite">新番卫星</button></div><span id="result-count" class="sr-only"></span></div><div class="catalog-controls" aria-label="作品筛选">
      <div class="facet-control"><button type="button" class="facet-toggle" id="type-toggle" aria-controls="type-options"></button><button type="button" class="facet-clear" id="clear-type" aria-label="清除类型筛选" hidden>×</button></div>
      <div class="facet-control"><button type="button" class="facet-toggle" id="date-toggle" aria-controls="date-options"></button><button type="button" class="facet-clear" id="clear-date" aria-label="清除日期筛选" hidden>×</button></div>
    </div></div>
    <div class="facet-panel" id="type-options" role="group" aria-label="作品类型"></div>
    <div class="facet-panel date-panel" id="date-options" role="group" aria-label="年份和季度" hidden></div>
    <div id="anime-grid" class="anime-grid"></div></section><section id="segment-results" class="search-segments" hidden aria-label="匹配的切片"></section>`;
  const categoryParam = params.get("category");
  let category = ["manga", "novel"].includes(categoryParam) ? "book" : categoryParam;
  if (!availableCategories.has(category)) category = "all";
  let subtype = params.get("subtype"), year = params.get("year");
  let selectedSeason = params.get("season") || quarterStartMonth(params.get("month"));
  let legacyQuarter = !year && /^(?:\d{4}(?:01|04|07|10)|999999)$/.test(params.get("quarter"))
    ? params.get("quarter") : null;
  const typePanel = document.querySelector("#type-options");
  const catalog = main.querySelector(".catalog-section");
  const clips = main.querySelector("#segment-results");
  const datePanel = document.querySelector("#date-options");
  const typeToggle = document.querySelector("#type-toggle");
  const dateToggle = document.querySelector("#date-toggle");
  function showPanel(panel) {
    for (const [element, toggle] of [[typePanel, typeToggle], [datePanel, dateToggle]]) {
      element.hidden = element !== panel;
      toggle.setAttribute("aria-expanded", String(!element.hidden));
    }
  }
  for (const [panel, toggle] of [[typePanel, typeToggle], [datePanel, dateToggle]]) {
    toggle.addEventListener("click", () => showPanel(panel.hidden ? panel : null));
    panel.addEventListener("keydown", event => {
      if (event.key === "Escape") { showPanel(null); toggle.focus(); }
    });
  }
  let panelColumn;
  function choice(parent, child, label, active, count) {
    return `<button type="button" class="facet-${child === "all" ? "parent" : "child"}" data-parent="${esc(parent)}" data-child="${esc(child)}" aria-pressed="${active}">${esc(label)}${count === undefined ? "" : ` <small>${count}</small>`}</button>`;
  }
  function renderChoices(panel, html) {
    const focused = panel.contains(document.activeElement) ? document.activeElement.dataset : null;
    panel.innerHTML = html;
    if (focused?.parent) {
      panel.querySelector(`[data-parent="${CSS.escape(focused.parent)}"][data-child="${CSS.escape(focused.child)}"]`)?.focus({preventScroll:true});
    }
  }
  document.querySelector("#anime-grid").insertAdjacentHTML("afterend", '<nav class="pagination" id="pagination" aria-label="作品分页"></nav>');
  document.querySelector("#result-count").setAttribute("aria-live", "polite");
  const update = (resetPage = true) => {
    clearTimeout(searchTimer);
    if (resetPage) pageNumber = 1;
    const query = document.querySelector("#search").value;
    if (panelColumn !== quickFilter) {
      showPanel(quickFilter === "all" ? typePanel : null);
      panelColumn = quickFilter;
    }
    if (quickFilter !== "all" && category !== "anime") category = "all";
    const candidates = findHomeSubjects(data, {quickFilter});
    const filters = catalogFilters(candidates, {category, subtype, year, season: selectedSeason, quickFilter}, season);
    ({subtype, year, season: selectedSeason} = filters);
    const groups = [];
    for (const [key, name] of Object.entries(categories)) {
      if (key === "unknown" || !availableCategories.has(key)) continue;
      if (quickFilter !== "all" && key !== "anime") continue;
      const works = candidates.filter(s => subjectCategory(s) === key);
      if (!works.length) continue;
      const children = subtypeCounts(works).map(([label, count]) =>
        choice(key, label, label, category === key && subtype === label, count));
      groups.push(`<div class="facet-row" role="group" aria-label="${esc(name)}">${choice(key, "all", name, category === key && subtype === "all")}<div class="facet-children">${children.join("")}</div></div>`);
    }
    typeToggle.textContent = category === "all" ? "全部类型" : [categories[category], subtype !== "all" && subtype].filter(Boolean).join(" · ");
    document.querySelector("#clear-type").hidden = category === "all";
    renderChoices(typePanel, groups.join(""));
    const dates = filters.years.map(y => {
      const label = y === "undated" ? "未定档" : y + " 年";
      const children = filters.seasonsByYear.get(y).map(start => choice(y, start, seasonNames[start], !legacyQuarter && year === y && selectedSeason === start));
      return `<div class="facet-row" role="group" aria-label="${label}">${choice(y, "all", label, !legacyQuarter && year === y && selectedSeason === "all")}<div class="facet-children">${children.join("")}</div></div>`;
    });
    if (legacyQuarter) {
      dateToggle.textContent = legacyQuarter === "999999" ? "未定档（动画）" : `${legacyQuarter.slice(0, 4)} 年 ${seasonNames[legacyQuarter.slice(4)]}`;
    } else {
      dateToggle.textContent = year === "all" ? "全部年份" : year === "undated" ? "未定档" : year + " 年" + (selectedSeason === "all" ? "" : " " + seasonNames[selectedSeason]);
    }
    document.querySelector("#clear-date").hidden = year === "all" && !legacyQuarter;
    renderChoices(datePanel, dates.join(""));
    let scoped = filters.subjects;
    if (legacyQuarter) {
      const ids = new Set(findHomeSubjects(data, {category, quickFilter, quarter: legacyQuarter}).map(s => s.id));
      scoped = scoped.filter(s => ids.has(s.id));
    }
    const matchingIds = query.trim() ? new Set(findSubjects(data, query).map(s => s.id)) : null;
    const results = matchingIds ? scoped.filter(s => matchingIds.has(s.id)) : scoped;
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
      category, subtype, year, season: selectedSeason, quarter: legacyQuarter, quick: quickFilter })) {
      if (value && (key === "quick" || value !== "all")) urlParams.set(key, value);
    }
    if (pageNumber > 1) urlParams.set("page", pageNumber);
    history.replaceState(history.state, "", `#/${urlParams.size ? "?" + urlParams : ""}`);
    rememberCatalog(location.hash, catalogNavigation.hash === location.hash ? catalogNavigation.y : 0);
    document.querySelector("#anime-grid").innerHTML = results.length
      ? paged.items.map((s, i) => {
        if (quickFilter !== "recent") return card(s, i);
        const dateFilter = legacyQuarter || (selectedSeason === "all" ? year : year + selectedSeason);
        return card(s, i, recentCardDateLabel(s, season, dateFilter));
      }).join("")
      : `<div class="empty"><span aria-hidden="true">⌕</span><h3>还没有找到这部作品</h3><p>试试正式名称或别名，也可以去整期时间轴看看。</p><button id="reset-search">清空筛选</button></div>`;
    const matches = findSegments(data, query, new Set(scoped.map(s => s.id)), new Set(results.map(s => s.id)));
    clips.hidden = !query.trim();
    if (!results.length && matches.length) {
      if (catalog.previousElementSibling !== clips) catalog.before(clips);
    } else if (catalog.nextElementSibling !== clips) {
      catalog.after(clips);
    }
    clips.innerHTML = `<div class="section-head"><h2>切片</h2><span>${matches.length} 个结果</span></div><div class="timeline">${matches.map(e => segment(e)).join("") || '<p class="search-no-clips">没有匹配的切片。</p>'}</div>`;
    renderPagination(main.querySelector("#pagination"), paged, main.querySelector("#catalog-tabs"), target => {
      pageNumber = target;
      update(false);
    });
    document.querySelector("#reset-search")?.addEventListener("click", () => {
      document.querySelector("#search").value = "";
      category = "all";
      subtype = year = selectedSeason = "all";
      legacyQuarter = null;
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
  typePanel.addEventListener("click", event => {
    const button = event.target.closest("button[data-parent]");
    if (!button) return;
    const selected = button.getAttribute("aria-pressed") === "true";
    category = selected ? "all" : button.dataset.parent;
    subtype = selected ? "all" : button.dataset.child;
    if (!["all", "anime"].includes(category)) {
      legacyQuarter = null;
    }
    update();
  });
  datePanel.addEventListener("click", event => {
    const button = event.target.closest("button[data-parent]");
    if (!button) return;
    const selected = button.getAttribute("aria-pressed") === "true";
    year = selected ? "all" : button.dataset.parent;
    selectedSeason = selected ? "all" : button.dataset.child;
    legacyQuarter = null;
    update();
  });
  document.querySelector("#clear-type").addEventListener("click", () => {
    category = subtype = "all";
    update();
    typeToggle.focus();
  });
  document.querySelector("#clear-date").addEventListener("click", () => {
    year = selectedSeason = "all";
    legacyQuarter = null;
    update();
    dateToggle.focus();
  });
  document.querySelectorAll("[data-quick-filter]").forEach((button) =>
    button.addEventListener("click", () => {
      quickFilter = quickFilter === button.dataset.quickFilter ? "all" : button.dataset.quickFilter;
      update();
    }),
  );
  document.querySelector("#search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    quickFilter = "all";
    update();
    main
      .querySelector("#catalog-tabs, #segment-results:not([hidden])")
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
function segment(e, contextSubject) {
  const v = video(e.bvid);
  const target = preferredPlaybackTarget(e, preferDanmaku);
  const related = !contextSubject && isIndexedSegment(e) ? e.subject_ids.map(subject) : [];
  const source = contextSubject
    ? `<a class="source-video" href="#/video/${v.bvid}">${esc(shortTitle(v.title))}</a><time class="segment-date" datetime="${esc(dateOf(v))}">${shortDate(dateOf(v))}</time>`
    : related.map(s => `<a href="#/anime/${s.id}">${esc(s.name)}</a>`).join("");
  const progressSubjects = contextSubject ? [contextSubject] : related;
  const badges = progressSubjects.map(s => {
    const progress = episodeProgress(s, v);
    if (!progress) return "";
    const label = esc(`${s.name} · ${progress}`);
    return `<span class="episode-progress" title="${label}">${esc(progress)}</span>`;
  }).join("");
  const duration = `<p class="segment-duration">${esc(segmentDuration(e))}</p>`;
  return `<article class="segment ${badges ? "has-progress" : ""} ${contextSubject ? "" : "recording-segment"}" id="${esc(e.id)}">
    <div class="segment-body"><div class="segment-heading"><h3>${external(videoUrl(e.bvid, target.p, target.seconds), esc(e.text), "clip-link")}</h3>${badges}</div>
    ${duration}</div>
    ${source ? `<div class="segment-source">${source}</div>` : ""}</article>`;
}
function danmakuControl() {
  return `<label class="danmaku-control"><input type="checkbox" role="switch" id="prefer-danmaku" ${preferDanmaku ? "checked" : ""}>优先弹幕版</label>`;
}
main.addEventListener("change", event => {
  if (event.target.id !== "prefer-danmaku") return;
  preferDanmaku = event.target.checked;
  try { localStorage.setItem("prefer-danmaku", String(preferDanmaku)); } catch {}
  for (const link of main.querySelectorAll(".clip-link")) {
    const entry = segmentsById.get(link.closest(".segment").id);
    const target = preferredPlaybackTarget(entry, preferDanmaku);
    link.href = videoUrl(entry.bvid, target.p, target.seconds);
  }
});
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
function durationStat(segments) {
  const { seconds, incomplete } = totalDuration(segments);
  if (incomplete && seconds < 60) return "总时长待核实";
  if (seconds > 0 && seconds < 60) return '总时长不足 <strong>1</strong> 分钟';
  const minutes = incomplete ? Math.floor(seconds / 60) : Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const parts = [];
  if (hours) parts.push(`<strong>${hours}</strong> 小时`);
  if (!hours || minutes % 60) parts.push(`<strong>${minutes % 60}</strong> 分钟`);
  return `总时长${incomplete ? "至少" : ""} ${parts.join(" ")}`;
}
function animePage(id) {
  const s = findSubjects(data).find(item => item.id === Number(id));
  if (!s) return notFound();
  const segments = [...s.segments].sort((a, b) => {
    const order =
      dateOf(video(b.bvid)).localeCompare(dateOf(video(a.bvid))) ||
      a.bvid.localeCompare(b.bvid) ||
      a.targets[0].p - b.targets[0].p ||
      a.targets[0].seconds - b.targets[0].seconds;
    return timelineOrder === "asc" ? -order : order;
  });
  const collections = (s.collection_bvids || []).map((bvid, i, all) =>
    external(`https://www.bilibili.com/video/${bvid}`, all.length > 1 ? `合集视频 ${i + 1}` : "合集视频", "play primary")
  ).join("");
  main.innerHTML = `<div class="page-wrap">${backLink(catalogNavigation.hash, "聊动画")}<section class="subject-hero">${cover(s, "detail-cover")}<div class="subject-info"><h1>${esc(s.name)}</h1><p class="original">${esc(s.original_name)}</p><div class="subject-meta">${pill(releaseLabel(s))}${pill(categories[subjectCategory(s)])}${external(`https://bgm.tv/subject/${s.id}`, "在 Bangumi 查看")}<span class="bangumi-rating" id="bangumi-rating" aria-live="polite" hidden></span></div><div class="subject-summary"><p class="summary" id="subject-summary-text">${formatSummary(s.summary || "暂无作品简介。")}</p><button class="summary-toggle" type="button" aria-expanded="false" aria-controls="subject-summary-text">展开</button></div>
    <div class="subject-numbers">
      <div class="subject-stats"><span><strong>${s.mentionCount}</strong> 期录播</span><span><strong>${segments.length}</strong> 个切片</span><span>${durationStat(segments)}</span></div>
      ${collections ? `<div class="collection-links">${collections}</div>` : ""}
    </div></div></section><div class="section-head"><h2>相关片段</h2><div class="timeline-controls">${danmakuControl()}${timelineOrderControl()}</div></div><div class="timeline">${segments.map((e) => segment(e, s)).join("")}</div></div>`;
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
    const lines = matchMedia("(max-width: 700px)").matches ? 5 : Math.max(3, Math.floor(available / lineHeight));
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
  summaryObserver.observe(info.closest(".subject-hero"));
  measure();
}
const videoType = (v) => {
  if (v.kind) return v.kind;
  const title = shortTitle(v.title);
  if (title.includes("燃来")) return "screening";
  if (title.includes("茶话会")) return "tea";
  return "talk";
};

function videosPage() {
  const videoQuarter = (v) => {
    const [year, month] = dateOf(v).split("-");
    const startMonth = Math.floor((Number(month) - 1) / 3) * 3 + 1;
    return `${year}${String(startMonth).padStart(2, "0")}`;
  };
  const quarters = [...new Set(data.videos.map(videoQuarter))].sort().reverse();
  const presenters = ["大鼻子叔叔", "诶嘿酱", "泛哥哥"];
  const presenter = presenters[Math.floor(Math.random() * presenters.length)];
  const params = parseRoute(location.hash).params;
  let selectedType = params.get("type") || "talk";
  let selectedQuarter = quarters.includes(params.get("quarter")) ? params.get("quarter") : "all";
  let pageNumber = params.get("page") || 1;
  const videoRow = (v) => {
    const entries = data.segments.filter((e) => e.bvid === v.bvid);
    const screening = videoType(v) === "screening";
    const heading = `<h2><a class="recording-link" href="#/video/${v.bvid}">${esc(shortTitle(v.title))}</a></h2>`;
    const workLinks = screening ? screeningSubjectIds(entries).map(id =>
      `<a class="screening-work" href="#/anime/${id}">${esc(subject(id).name)}</a><span class="screening-suffix">放映会</span>`
    ).join("、") : "";
    const details = screening
      ? `<div class="screening-heading">${heading}${workLinks ? `<p>${workLinks}</p>` : ""}</div>`
      : `${heading}<div class="recording-card-bottom">${entries.length} 个切片 · ${new Set(entries.flatMap(e => e.subject_ids)).size} 部相关作品</div>`;
    return `<article class="segment recording-card"><time class="recording-date" datetime="${dateOf(v)}">${shortDate(dateOf(v))}</time>${details}</article>`;
  };
  main.innerHTML = `<div class="page-wrap"><div class="page-title video-page-title"><div class="video-title-copy"><h1>想回顾<span class="host-name">${presenter}</span>哪期直播？</h1><div class="quick-filters video-type-filters" aria-label="录播分类"><button type="button" data-video-type="all">全部录播</button><button type="button" data-video-type="talk">杂谈回</button><button type="button" data-video-type="screening">放映会</button><button type="button" data-video-type="tea">茶话会</button><button type="button" data-video-type="op_ed">OP/ED 鉴赏</button></div></div><button type="button" class="facet-toggle video-quarter-toggle" id="video-quarter" aria-label="录播季度" aria-controls="video-quarters" aria-expanded="false"></button></div>
    <div class="facet-panel quarter-options" id="video-quarters" role="group" aria-label="录播季度" hidden>${["all", ...quarters].map(value => `<button type="button" class="facet-child" data-quarter="${esc(value)}">${value === "all" ? "全部季度" : esc(quarterLabel(value))}</button>`).join("")}</div>
    <div class="timeline recording-grid" id="video-list"></div><nav class="pagination" id="pagination" aria-label="录播分页"></nav></div>`;
  const typeButtons = main.querySelectorAll("[data-video-type]");
  if (![...typeButtons].some(button => button.dataset.videoType === selectedType)) selectedType = "talk";
  const quarterToggle = main.querySelector("#video-quarter");
  const quarterPanel = main.querySelector("#video-quarters");
  function showQuarters(open) {
    quarterPanel.hidden = !open;
    quarterToggle.setAttribute("aria-expanded", String(open));
  }
  quarterToggle.addEventListener("click", () => showQuarters(quarterPanel.hidden));
  quarterPanel.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      showQuarters(false);
      quarterToggle.focus();
    }
  });
  const render = () => {
    const matches = data.videos.filter(v =>
      (selectedQuarter === "all" || videoQuarter(v) === selectedQuarter) &&
      (selectedType === "all" || videoType(v) === selectedType));
    const paged = paginate(matches, pageNumber, 48);
    pageNumber = paged.page;
    const filters = new URLSearchParams();
    if (selectedType !== "talk") filters.set("type", selectedType);
    if (selectedQuarter !== "all") filters.set("quarter", selectedQuarter);
    if (pageNumber > 1) filters.set("page", pageNumber);
    history.replaceState(history.state, "", `#/videos${filters.size ? "?" + filters : ""}`);
    main.querySelector("#video-list").innerHTML = paged.items.map(videoRow).join("") ||
      '<p class="search-no-clips">当前筛选下没有录播。</p>';
    renderPagination(main.querySelector("#pagination"), paged, main.querySelector(".video-page-title h1"), target => {
      pageNumber = target;
      render();
    });
    quarterToggle.textContent = selectedQuarter === "all" ? "全部季度" : quarterLabel(selectedQuarter);
    quarterToggle.setAttribute("aria-label", `录播季度，${quarterToggle.textContent}`);
    for (const button of quarterPanel.querySelectorAll("[data-quarter]")) {
      button.setAttribute("aria-pressed", String(button.dataset.quarter === selectedQuarter));
    }
    typeButtons.forEach((button) => {
      const selected = button.dataset.videoType === selectedType;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  };
  quarterPanel.addEventListener("click", event => {
    const button = event.target.closest("[data-quarter]");
    if (!button) return;
    selectedQuarter = selectedQuarter === button.dataset.quarter ? "all" : button.dataset.quarter;
    pageNumber = 1;
    render();
    showQuarters(false);
    quarterToggle.focus();
  });
  typeButtons.forEach((button) =>
    button.addEventListener("click", () => {
      selectedType = selectedType === button.dataset.videoType ? "all" : button.dataset.videoType;
      pageNumber = 1;
      render();
    }),
  );
  render();
}
function videoPage(bvid) {
  const v = video(bvid);
  if (!v) return notFound();
  const entries = data.segments.filter((e) => e.bvid === bvid);
  main.innerHTML = `<div class="page-wrap">${backLink("#/videos", "补录播")}<div class="page-title"><div class="eyebrow video-posted-date">${shortDate(dateOf(v))}</div><h1>${esc(shortTitle(v.title))}</h1><div class="recording-controls">${external(`https://www.bilibili.com/video/${bvid}/`, "打开完整录播", "text-link")}${danmakuControl()}</div></div><div class="timeline">${entries.map((e) => segment(e)).join("")}</div></div>`;
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
  segmentsById = new Map(data.segments.map(entry => [entry.id, entry]));
  const analytics = createAnalytics(config.analytics);
  const trackClip = event => {
    if (event.type === 'auxclick' && event.button !== 1) return;
    const link = event.target.closest('.clip-link');
    if (!link) return;
    const entry = segmentsById.get(link.closest('.segment').id);
    if (entry) analytics.clip(entry, preferredPlaybackTarget(entry, preferDanmaku));
  };
  document.addEventListener('click', trackClip);
  document.addEventListener('auxclick', trackClip);
  const navigate = (event) => {
    if (!Object.hasOwn(history.state || {}, "previousRoute")) {
      const previousRoute = event ? new URL(event.oldURL).hash || "#/" : null;
      const scrollY = (location.hash || "#/") === catalogNavigation.hash ? catalogNavigation.y : 0;
      history.replaceState({ ...history.state, previousRoute, scrollY }, "");
    }
    const y = history.state.scrollY;
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
