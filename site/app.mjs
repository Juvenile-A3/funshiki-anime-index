import {
  escapeHtml as esc,
  formatTime,
  findSubjects,
  parseRoute,
  validateCatalog,
  videoUrl, recordingDate, quarterLabel,
  categories, subjectCategory, isIndexedSegment,
} from "./domain.mjs";
const main = document.querySelector("main");
document.querySelector(".skip").addEventListener("click", (e) => {
  e.preventDefault();
  main.focus();
  main.scrollIntoView();
});
let data,
  config,
  preRoll = 0,
  timelineOrder = "desc";
const subject = (id) => data.subjects.find((s) => s.id === id);
const video = (bvid) => data.videos.find((v) => v.bvid === bvid);
const external = (href, label, cls = "") =>
  `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
const pill = (label, cls = "") =>
  `<span class="pill ${cls}">${esc(label)}</span>`;
const formatDate = (d) => d?.replaceAll("-", ".") || "日期待核实";
const formatMonthDay = (d) => d?.slice(5).replace("-", ".") || "日期待核实";
const formatSummary = (value) =>
  esc(value.split("[简介原文]")[0].trimEnd()).replace(/(?:\r\n|\r|\n)+/g, "<br>");
const dateOf = (v) => recordingDate(v);
const shortTitle = (title) => title.replace(/^【[^】]*】\s*/, "");
function cover(s, cls = "") {
  const url = /^https:\/\//.test(s.image || "") ? s.image : "";
  return `<div class="cover ${cls}" style="--cover-color:${esc(s.color || "#d6d0ec")}"><span class="cover-fallback" aria-hidden="true">${esc(s.name.slice(0, 2))}</span>${url ? `<img src="${esc(url)}" alt="${esc(s.name)}封面" loading="lazy" referrerpolicy="no-referrer">` : ""}</div>`;
}
function card(s, i) {
  return `<a class="anime-card" href="#/anime/${s.id}">${cover(s)}<div class="card-top"><span>${esc(quarterLabel(s.quarter))} · ${esc(categories[subjectCategory(s)])}</span><span class="card-arrow" aria-hidden="true">↗</span></div><h3>${esc(s.name)}</h3><p class="card-original">${esc(s.original_name)}</p><div class="card-bottom"><span><b>${s.segments.length}</b> 个切片</span><span>最近 ${formatDate(s.latest)}</span></div></a>`;
}
function home() {
  const params = parseRoute(location.hash).params;
  const q = params.get("q") || "";
  const presenters = ["大鼻子叔叔", "诶嘿酱", "泛哥哥"];
  const presenter = presenters[Math.floor(Math.random() * presenters.length)];
  const recommended = findSubjects(data, "", "all", "count").slice(0, 3);
  const now = new Date();
  const seasonMonth = Math.floor(now.getMonth() / 3) * 3 + 1;
  const currentQuarter = `${now.getFullYear()}${String(seasonMonth).padStart(2, "0")}`;
  const timeMachineQuarter = `${now.getFullYear() - 10}${String(seasonMonth).padStart(2, "0")}`;
  const animeQuarter = (s) => {
    if (subjectCategory(s) !== "anime") return "";
    const match = /^(\d{4})(0[1-9]|1[0-2])$/.exec(s.quarter || "");
    if (!match) return "";
    const month = Math.floor((Number(match[2]) - 1) / 3) * 3 + 1;
    return `${match[1]}${String(month).padStart(2, "0")}`;
  };
  const animeQuarters = [...new Set(data.subjects.map(animeQuarter).filter(Boolean))]
    .sort()
    .reverse();
  let quickFilter = "all";
  main.innerHTML = `<section class="hero"><div class="hero-copy"><h1>想听<span class="host-name">${presenter}</span>聊什么？</h1><form class="search" id="search-form" role="search"><span aria-hidden="true">⌕</span><input id="search" type="search" aria-label="搜索作品名称" placeholder="搜索作品名称" value="${esc(q)}" autocomplete="off"><button class="search-submit" type="submit" aria-label="搜索"><span aria-hidden="true">↗</span></button></form><div class="suggestions"><span>试试搜索：</span>${recommended.map((s) => `<button data-query="${esc(s.name)}">${esc(s.name)}</button>`).join("")}</div></div><aside class="hero-aside" aria-label="档案概况"><div class="archive-number">${String(findSubjects(data).length).padStart(2, "0")}<small>部作品</small></div><div class="archive-divider"></div><div class="aside-stats"><span><b>${data.videos.length}</b>期录播</span><span><b>${data.segments.filter((e) => isIndexedSegment(e) && e.subject_ids.length).length}</b>个切片</span></div></aside></section><section class="catalog-section" aria-labelledby="catalog-title"><div class="section-head"><div class="catalog-heading"><h2 id="catalog-title">聊过的作品 <span id="result-count"></span></h2><div class="quick-filters" aria-label="快捷筛选"><button type="button" data-quick-filter="current">当季热播</button><button type="button" data-quick-filter="time-machine">时光机</button><button type="button" data-quick-filter="satellite">新番卫星</button></div></div><div class="filters"><label class="sr-only" for="category">作品分类</label><select id="category"><option value="all">全部类型</option>${Object.entries(categories).filter(([k]) => !["book", "music", "unknown"].includes(k)).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select><label class="sr-only" for="quarter">作品季度</label><select id="quarter"><option value="all">全部季度</option>${animeQuarters.map(q => `<option value="${q}">${quarterLabel(q)}</option>`).join("")}</select><label class="sr-only" for="sort">排序</label><select id="sort"><option value="recent">最近聊到</option><option value="count">收录切片最多</option></select></div></div><div id="anime-grid" class="anime-grid"></div></section>`;
  const update = () => {
    const selectedQuarter = document.querySelector("#quarter").value;
    const results = findSubjects(
      data,
      document.querySelector("#search").value,
      "all",
      document.querySelector("#sort").value,
      document.querySelector("#category").value,
      "all",
    ).filter((s) => {
      if (selectedQuarter !== "all" && animeQuarter(s) !== selectedQuarter) return false;
      if (quickFilter === "current") return animeQuarter(s) === currentQuarter;
      if (quickFilter === "time-machine") return animeQuarter(s) === timeMachineQuarter;
      if (quickFilter === "satellite") return animeQuarter(s) > currentQuarter;
      return true;
    });
    document.querySelectorAll("[data-quick-filter]").forEach((button) => {
      const selected = button.dataset.quickFilter === quickFilter;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    document.querySelector("#result-count").textContent = `${results.length}`;
    document.querySelector("#anime-grid").innerHTML = results.length
      ? results.map(card).join("")
      : `<div class="empty"><span aria-hidden="true">⌕</span><h3>还没有找到这部作品</h3><p>试试正式名称或别名，也可以去整期时间轴看看。</p><button id="reset-search">清空筛选</button></div>`;
    document.querySelector("#reset-search")?.addEventListener("click", () => {
      document.querySelector("#search").value = "";
      document.querySelector("#category").value = "all";
      document.querySelector("#quarter").value = "all";
      quickFilter = "all";
      syncTimeSort();
      update();
    });
  };
  const syncTimeSort = () => {
    const hasTimeFilter = quickFilter !== "all" || document.querySelector("#quarter").value !== "all";
    document.querySelector("#sort").value = hasTimeFilter ? "count" : "recent";
  };
  document.querySelector("#search").addEventListener("input", update);
  document.querySelector("#category").addEventListener("change", update);
  document.querySelector("#quarter").addEventListener("change", () => {
    syncTimeSort();
    update();
  });
  document.querySelector("#sort").addEventListener("change", update);
  document.querySelectorAll("[data-quick-filter]").forEach((button) =>
    button.addEventListener("click", () => {
      quickFilter = quickFilter === button.dataset.quickFilter ? "all" : button.dataset.quickFilter;
      syncTimeSort();
      update();
    }),
  );
  document.querySelector("#search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const query = document.querySelector("#search").value;
    history.replaceState(null, "", `#/?q=${encodeURIComponent(query)}`);
    update();
    document
      .querySelector("#catalog-title")
      .scrollIntoView({ behavior: "smooth" });
  });
  document.querySelectorAll("[data-query]").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelector("#search").value = b.dataset.query;
      update();
    }),
  );
  update();
}
function segment(e, { showVideo = true, showSubject = false } = {}) {
  const v = video(e.bvid);
  const tags = `${!e.subject_ids.length && isIndexedSegment(e) ? pill("作品待确认", "muted") : ""}${e.review === "text-reviewed" ? '<span class="reviewed" title="已根据笔记与 Bangumi 条目核对，尚未逐段观看">✓ 条目已核对</span>' : ""}`;
  return `<article class="segment" id="${esc(e.id)}"><div class="segment-time"><strong>${formatTime(e.targets[0].seconds)}</strong>${e.targets[0].end_seconds !== undefined ? `<span class="segment-end">至 ${formatTime(e.targets[0].end_seconds)}</span>` : ""}${showVideo ? `<span class="segment-date">${formatMonthDay(dateOf(v))}</span>` : ""}</div><div class="segment-body">${tags ? `<div class="segment-tags">${tags}</div>` : ""}<h3>${esc(e.text)}</h3>${showVideo ? `<a class="source-video" href="#/video/${v.bvid}">${esc(shortTitle(v.title))}</a>` : ""}${showSubject && isIndexedSegment(e) && e.subject_ids.length ? `<div class="subject-links">${e.subject_ids.map((id) => `<a href="#/anime/${id}">${esc(subject(id).name)} ↗</a>`).join("")}</div>` : ""}</div><div class="segment-actions">${e.targets.map((t, i) => external(videoUrl(e.bvid, t.p, t.seconds, preRoll), `${t.variant === "source" ? "跳转切片" : t.variant === "danmaku" ? "弹幕版" : "普通版"} <span aria-hidden="true">↗</span>`, i === 0 ? "play primary" : "play")).join("")}</div></article>`;
}
function replayControl() {
  return `<label class="preroll"><input id="preroll" type="checkbox" ${preRoll ? "checked" : ""}> 提前 5 秒进入上下文</label>`;
}
function timelineOrderControl() {
  return `<label class="timeline-order" for="timeline-order"><select id="timeline-order" aria-label="时间排序"><option value="desc" ${timelineOrder === "desc" ? "selected" : ""}>倒序</option><option value="asc" ${timelineOrder === "asc" ? "selected" : ""}>正序</option></select></label>`;
}
function bindReplay(render) {
  document.querySelector("#preroll")?.addEventListener("change", (e) => {
    preRoll = e.target.checked ? 5 : 0;
    const y = scrollY;
    render();
    window.scrollTo(0, y);
  });
}
function bindTimelineControls(render) {
  bindReplay(render);
  document.querySelector("#timeline-order")?.addEventListener("change", (e) => {
    timelineOrder = e.target.value;
    const y = scrollY;
    render();
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
  main.innerHTML = `<div class="page-wrap"><a class="back" href="#/">← 作品</a><section class="subject-hero">${cover(s, "detail-cover")}<div class="subject-info"><h1>${esc(s.name)}</h1><p class="original">${esc(s.original_name)}</p><div class="subject-meta">${pill(quarterLabel(s.quarter))}${pill(categories[subjectCategory(s)])}${external(`https://bgm.tv/subject/${s.id}`, "在 Bangumi 查看 ↗")}<span class="bangumi-rating" id="bangumi-rating" aria-live="polite" hidden></span></div><p class="summary">${formatSummary(s.summary || "作品信息来自 B 站的泛式档案。")}</p><div class="subject-numbers"><strong>${segments.length}</strong> 个切片 <span>来自 ${new Set(segments.map((e) => e.bvid)).size} 期录播</span></div></div></section><div class="section-head"><h2>相关杂谈</h2><div class="timeline-controls">${timelineOrderControl()}${replayControl()}</div></div><div class="timeline">${segments.map((e) => segment(e)).join("")}</div></div>`;
  bindTimelineControls(() => animePage(id));
  getBangumiSubject(s.id)
    .then((detail) => {
      const rating = detail.rating;
      const score = Number(rating?.score);
      const target = document.querySelector("#bangumi-rating");
      if (!target) return;
      if (!Number.isFinite(score) || score <= 0) {
        target.remove();
        return;
      }
      target.hidden = false;
      target.innerHTML = `<span class="rating-value"><strong>${score.toFixed(1)}</strong><small>/10</small></span>`;
    })
    .catch(() => document.querySelector("#bangumi-rating")?.remove());
}
function videosPage() {
  const videoQuarter = (v) => {
    const [year, month] = dateOf(v).split("-");
    const startMonth = Math.floor((Number(month) - 1) / 3) * 3 + 1;
    return `${year}${String(startMonth).padStart(2, "0")}`;
  };
  const videoQuarterLabel = (quarter) => quarterLabel(quarter);
  const videoType = (v) => {
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
    const [year, month, day] = dateOf(v).split("-");
    return `<a class="video-row" href="#/video/${v.bvid}"><time class="video-date" datetime="${dateOf(v)}"><span>${year}</span><strong>${month}.${day}</strong></time><div><h2>${esc(shortTitle(v.title))}</h2><p>${entries.length} 个切片 · ${new Set(entries.flatMap((e) => e.subject_ids)).size} 部相关作品</p></div><span class="round-arrow" aria-hidden="true">↗</span></a>`;
  };
  main.innerHTML = `<div class="page-wrap"><div class="page-title video-page-title"><div class="video-title-copy"><h1>想回顾<span class="host-name">${presenter}</span>哪期直播？</h1><div class="video-type-filters" aria-label="录播分类"><button type="button" data-video-type="talk" aria-pressed="false">杂谈回</button><button type="button" data-video-type="screening" aria-pressed="false">放映会</button><button type="button" data-video-type="tea" aria-pressed="false">茶话会</button></div></div><label class="video-quarter-filter" for="video-quarter"><select id="video-quarter" aria-label="录播季度"><option value="all">全部季度</option>${quarters.map((quarter) => `<option value="${quarter}">${videoQuarterLabel(quarter)}</option>`).join("")}</select></label></div><div class="video-list" id="video-list"></div></div>`;
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
      selectedType = selectedType === button.dataset.videoType ? "all" : button.dataset.videoType;
      render();
    }),
  );
  render();
}
function videoPage(bvid) {
  const v = video(bvid);
  if (!v) return notFound();
  const entries = data.segments.filter((e) => e.bvid === bvid);
  main.innerHTML = `<div class="page-wrap"><a class="back" href="#/videos">← 录播</a><div class="page-title"><div class="eyebrow video-posted-date">${formatDate(dateOf(v))}</div><h1>${esc(shortTitle(v.title))}</h1>${external(`https://www.bilibili.com/video/${bvid}/`, "打开完整录播 ↗", "text-link")}</div><div class="section-head"><h2>时间轴</h2>${replayControl()}</div><div class="timeline">${entries.map((e) => segment(e, { showVideo: false, showSubject: true })).join("")}</div></div>`;
  bindReplay(() => videoPage(bvid));
}
function aboutPage() {
  main.replaceChildren();
}
function notFound() {
  main.innerHTML =
    '<div class="page-wrap empty"><h1>这份档案还不存在</h1><p>链接可能已变更，也可能暂未收录。</p><a href="#/">回到作品 ↗</a></div>';
}
function render() {
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
  document.title =
    (r.page === "anime" && subject(Number(r.id))
      ? subject(Number(r.id)).name + " · "
      : "") + "泛式杂谈索引";
}
try {
  const responses = await Promise.all([
    fetch(new URL("./catalog.json", import.meta.url)),
    fetch(new URL("./config.json", import.meta.url)),
  ]);
  if (responses.some((r) => !r.ok)) throw new Error("数据文件未能加载");
  [data, config] = await Promise.all(responses.map((r) => r.json()));
  validateCatalog(data);
  render();
  window.addEventListener("hashchange", () => {
    render();
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  });
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
