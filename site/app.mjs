import {
  escapeHtml as esc,
  formatTime,
  findSubjects,
  parseRoute,
  validateCatalog,
  videoUrl, recordingDate, quarterLabel,
  categories, contentKinds, subjectCategory, isIndexedSegment, recognizeSubjects, searchBangumi, fromBangumi, getBangumiSubject,
} from "./domain.mjs";
const main = document.querySelector("main");
document.querySelector(".skip").addEventListener("click", (e) => {
  e.preventDefault();
  main.focus();
  main.scrollIntoView();
});
let data,
  config,
  preRoll = 0;
const kinds = contentKinds;
const subject = (id) => data.subjects.find((s) => s.id === id);
const video = (bvid) => data.videos.find((v) => v.bvid === bvid);
const external = (href, label, cls = "") =>
  `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
const pill = (label, cls = "") =>
  `<span class="pill ${cls}">${esc(label)}</span>`;
const formatDate = (d) => d?.replaceAll("-", ".") || "日期待核实";
const dateOf = (v) => recordingDate(v);
const shortTitle = (title) => title.replace(/^【[^】]*】\s*/, "");
function cover(s, cls = "") {
  const url = /^https:\/\//.test(s.image || "") ? s.image : "";
  return `<div class="cover ${cls}" style="--cover-color:${esc(s.color || "#d6d0ec")}"><span class="cover-fallback" aria-hidden="true">${esc(s.name.slice(0, 2))}</span>${url ? `<img src="${esc(url)}" alt="${esc(s.name)}封面" loading="lazy" referrerpolicy="no-referrer">` : ""}</div>`;
}
function card(s, i) {
  return `<a class="anime-card" href="#/anime/${s.id}">${cover(s)}<div class="card-top"><span>${esc(quarterLabel(s.quarter))} · ${esc(categories[subjectCategory(s)])}</span><span class="card-arrow" aria-hidden="true">↗</span></div><h3>${esc(s.name)}</h3><p class="card-original">${esc(s.original_name)}</p><div class="card-bottom"><span><b>${s.segments.length}</b> 个时点</span><span>最近 ${formatDate(s.latest)}</span></div></a>`;
}
function home() {
  const params = parseRoute(location.hash).params;
  const q = params.get("q") || "";
  main.innerHTML = `<section class="hero"><div class="hero-copy"><div class="eyebrow"><span class="live-dot"></span> 泛式档案整理 · 作品与录播片段索引</div><h1>找到一部作品，<br>回到聊它的<span>那一刻。</span></h1><p>把漫长的杂谈，整理成可以抵达的时点。<br class="desktop-only">从作品出发，重温泛式的每一次分享。</p><form class="search" id="search-form" role="search"><span aria-hidden="true">⌕</span><input id="search" type="search" aria-label="搜索作品名称、别名或作品 ID" placeholder="搜作品名称、别名或作品 ID…" value="${esc(q)}" autocomplete="off"><kbd>/</kbd><button type="submit">找一找 <span aria-hidden="true">↗</span></button></form><div class="suggestions"><span>试试搜索</span><button data-query="冰之城墙">冰之城墙</button><button data-query="灰原君">灰原君</button><button data-query="左撇子艾伦">左撇子艾伦</button></div></div><aside class="hero-aside" aria-label="档案概况"><div class="archive-label">THE TALK ARCHIVE <span>↗</span></div><div class="archive-number">${String(findSubjects(data).length).padStart(2, "0")}<small>部作品，已建立索引</small></div><div class="archive-divider"></div><div class="aside-stats"><span><b>${data.videos.length}</b>期录播</span><span><b>${data.segments.filter((e) => isIndexedSegment(e) && e.subject_ids.length).length}</b>个作品时点</span></div><div class="aside-note">录播投稿日期范围<br><strong>${formatDate(data.coverage.from)} — ${formatDate(data.coverage.to)}</strong><span>数据整理：泛式档案 · ${data.segments.length} 条片段</span></div></aside></section><section class="catalog-section" aria-labelledby="catalog-title"><div class="section-head"><div><div class="eyebrow">BROWSE THE ARCHIVE</div><h2 id="catalog-title">聊过的作品 <span id="result-count"></span></h2></div><div class="filters"><label class="sr-only" for="category">作品分类</label><select id="category"><option value="all">全部作品</option>${Object.entries(categories).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select><label class="sr-only" for="period">作品年份</label><select id="period"><option value="all">全部年份</option>${[
    ...new Set(
      data.subjects.map((s) => (s.quarter && s.quarter !== "999999" ? s.quarter.slice(0, 4) : null)).filter(Boolean),
    ),
  ]
    .sort()
    .reverse()
    .map((y) => `<option value="${y}">${y} 年作品</option>`)
    .join(
      "",
    )}</select><label class="sr-only" for="quarter">作品季度</label><select id="quarter"><option value="all">全部季度</option>${[...new Set(data.subjects.map(s => s.quarter).filter(Boolean))].sort().reverse().map(q => `<option value="${q}">${quarterLabel(q)}</option>`).join("")}</select><label class="sr-only" for="sort">排序</label><select id="sort"><option value="recent">最近聊到</option><option value="count">收录片段最多</option></select></div></div><div id="anime-grid" class="anime-grid"></div><p class="coverage-note">这里只展示已建立作品关联的条目。没有搜索结果，表示当前尚未收录，并不代表没有聊过。</p></section><section class="recent-strip"><span class="pill">最新收录</span><a href="#/video/${data.videos[0].bvid}">${formatDate(dateOf(data.videos[0]))} <strong>${esc(shortTitle(data.videos[0].title))}</strong></a><a href="#/videos">看整期时间轴 ↗</a></section>`;
  const update = () => {
    const results = findSubjects(
      data,
      document.querySelector("#search").value,
      document.querySelector("#period").value,
      document.querySelector("#sort").value,
      document.querySelector("#category").value,
      document.querySelector("#quarter").value,
    );
    document.querySelector("#result-count").textContent = `${results.length}`;
    document.querySelector("#anime-grid").innerHTML = results.length
      ? results.map(card).join("")
      : `<div class="empty"><span aria-hidden="true">⌕</span><h3>还没有找到这部作品</h3><p>试试正式名称或别名，也可以去整期时间轴看看。</p><button id="reset-search">清空筛选</button></div>`;
    document.querySelector("#reset-search")?.addEventListener("click", () => {
      document.querySelector("#search").value = "";
      document.querySelector("#period").value = "all";
      document.querySelector("#category").value = "all";
      document.querySelector("#quarter").value = "all";
      update();
    });
  };
  document.querySelector("#search").addEventListener("input", update);
  document.querySelector("#period").addEventListener("change", update);
  document.querySelector("#category").addEventListener("change", update);
  document.querySelector("#quarter").addEventListener("change", update);
  document.querySelector("#sort").addEventListener("change", update);
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
  return `<article class="segment" id="${esc(e.id)}"><div class="segment-time"><span>${formatTime(e.targets[0].seconds)}</span>${e.targets[0].end_seconds !== undefined ? `<small>至 ${formatTime(e.targets[0].end_seconds)}</small>` : ""}<small>${showVideo ? formatDate(dateOf(v)) : `P${e.targets[0].p}`}</small></div><div class="segment-body"><div class="segment-tags">${pill(kinds[e.kind] || "待分类")}${!e.subject_ids.length && isIndexedSegment(e) ? pill("作品待确认", "muted") : ""}${e.review === "text-reviewed" ? '<span class="reviewed" title="已根据笔记与 Bangumi 条目核对，尚未逐段观看">✓ 条目已核对</span>' : ""}</div><h3>${esc(e.text)}</h3>${showVideo ? `<a class="source-video" href="#/video/${v.bvid}">${esc(shortTitle(v.title))}</a>` : ""}${showSubject && isIndexedSegment(e) && e.subject_ids.length ? `<div class="subject-links">${e.subject_ids.map((id) => `<a href="#/anime/${id}">${esc(subject(id).name)} ↗</a>`).join("")}</div>` : ""}<div class="segment-source">数据整理：${esc(e.source.author)}${e.source.row ? ` · 原表第 ${e.source.row} 行` : ""} · ${external(e.source.url, e.source.type === "archive-csv" ? "原始片段 ↗" : "查看原笔记 ↗")}<a href="#/review?entry=${encodeURIComponent(e.id)}">纠错</a></div></div><div class="segment-actions">${e.targets.map((t, i) => external(videoUrl(e.bvid, t.p, t.seconds, preRoll), `${t.variant === "source" ? `播放片段 · P${t.p}` : t.variant === "danmaku" ? "弹幕版" : "普通版"} <span aria-hidden="true">↗</span>`, i === 0 ? "play primary" : "play")).join("")}${e.targets[0].end_seconds !== undefined ? external(videoUrl(e.bvid, e.targets[0].p, e.targets[0].end_seconds), "跳到结束 ↗", "play") : ""}</div></article>`;
}
function replayControl() {
  return `<label class="preroll"><input id="preroll" type="checkbox" ${preRoll ? "checked" : ""}> 提前 5 秒进入上下文</label>`;
}
function bindReplay(render) {
  document.querySelector("#preroll")?.addEventListener("change", (e) => {
    preRoll = e.target.checked ? 5 : 0;
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
    .sort(
      (a, b) =>
        dateOf(video(b.bvid)).localeCompare(dateOf(video(a.bvid))) ||
        a.bvid.localeCompare(b.bvid) ||
        a.targets[0].p - b.targets[0].p ||
        a.targets[0].seconds - b.targets[0].seconds,
    );
  main.innerHTML = `<div class="page-wrap"><a class="back" href="#/">← 作品索引</a><section class="subject-hero">${cover(s, "detail-cover")}<div><div class="eyebrow">WORK IN THE ARCHIVE</div><h1>${esc(s.name)}</h1><p class="original">${esc(s.original_name)}</p><div class="subject-meta">${pill(quarterLabel(s.quarter))}${pill(categories[subjectCategory(s)])}${external(`https://bgm.tv/subject/${s.id}`, "在 Bangumi 查看 ↗")}</div><p class="summary">${esc(s.summary || "作品名称与季度按泛式档案提供的表格整理。")}</p><div class="subject-numbers"><strong>${segments.length}</strong> 个收录片段 <span>来自 ${new Set(segments.map((e) => e.bvid)).size} 期录播</span></div></div></section><div class="section-head"><h2>相关杂谈</h2>${replayControl()}</div><p class="subtle">片段范围按泛式档案原表保留。日期为录播投稿日期；“播放片段”从起点打开 B 站，结束时间供定位参考。</p><div class="timeline">${segments.map((e) => segment(e)).join("")}</div></div>`;
  bindReplay(() => animePage(id));
}
function videosPage() {
  main.innerHTML = `<div class="page-wrap"><div class="page-title"><div class="eyebrow">FROM BEGINNING TO END</div><h1>整期录播，按时间展开。</h1><p>也可以先选一期，再看看那天都聊了什么。</p></div><div class="video-list">${data.videos
    .map((v, i) => {
      const entries = data.segments.filter((e) => e.bvid === v.bvid);
      return `<a class="video-row" href="#/video/${v.bvid}"><span class="video-index">${String(i + 1).padStart(2, "0")}</span><div><span class="eyebrow">${formatDate(dateOf(v))} 投稿 · 收录 ${v.pages.length} 个分 P</span><h2>${esc(shortTitle(v.title))}</h2><p>${entries.length} 个话题时点 · ${new Set(entries.flatMap((e) => e.subject_ids)).size} 部已关联作品</p></div><span class="round-arrow" aria-hidden="true">↗</span></a>`;
    })
    .join(
      "",
    )}</div><p class="coverage-note">按泛式档案表格中的录播投稿日期排序，仅展示表内收录的作品片段，未覆盖的时间段不代表没有内容。</p></div>`;
}
function videoPage(bvid) {
  const v = video(bvid);
  if (!v) return notFound();
  const entries = data.segments.filter((e) => e.bvid === bvid);
  main.innerHTML = `<div class="page-wrap"><a class="back" href="#/videos">← 全部录播</a><div class="page-title"><div class="eyebrow">${formatDate(dateOf(v))} 投稿 · VIDEO ARCHIVE</div><h1>${esc(shortTitle(v.title))}</h1><p>${entries.length} 个收录片段 · 保留原表分 P 与起止时间</p>${external(`https://www.bilibili.com/video/${bvid}/`, "打开完整录播 ↗", "text-link")}</div><div class="section-head"><h2>这一期的时间轴</h2>${replayControl()}</div><div class="timeline">${entries.map((e) => segment(e, { showVideo: false, showSubject: true })).join("")}</div></div>`;
  bindReplay(() => videoPage(bvid));
}
function aboutPage() {
  main.innerHTML = `<div class="page-wrap prose"><div class="eyebrow">ABOUT THIS ARCHIVE</div><h1>让每一段分享，<br>更容易被找到。</h1><p class="lead">这是一个非官方的泛式作品与录播片段索引。本次数据由用户提供，来自 B 站「泛式档案」整理的《上传作品信息.csv》，以原表的作品 ID、季度、分 P 和片段起止链接建立索引。</p><h2>这份档案收录了什么</h2><p>当前收录投稿日期为 ${formatDate(data.coverage.from)} 至 ${formatDate(data.coverage.to)} 的 ${data.videos.length} 期录播，${data.subjects.length} 部已建立关联的作品，${data.segments.length} 个作品片段。原表季度 999999 显示为“未定档”；同名但作品 ID 不同的条目分别保留。</p><h2>时间与标记说明</h2><p>起止链接与剪辑时间逐行核对，保留小数秒。跳转使用原录播分 P。B 站播放从起点开始，不会在标注终点自动停止。</p><p>表内未提供直播日期、CID 或完整分 P 时长，因此这些字段不作推测；片段内容尚未逐段复看，也不据此推断主播评价或内容类别。</p><h2>感谢留下时间轴的人</h2><div class="credit-box">${[...new Set(data.segments.map((e) => e.source.author))].map((a) => `<strong>${esc(a)}</strong>`).join(" ")}<p>感谢「泛式档案」整理并提供线索。每条片段保留原表行号与起止链接，观看请回到原录播。此前公开笔记的首批测试数据已保存为项目历史快照。</p></div><h2>缺失、修正与参与</h2><p>搜不到并不等于没有聊过；时点也可能因为视频重传而失效。你可以在时点旁点击“纠错”，保存审核草稿并导出补丁，再通过仓库提交。草稿只保存在当前浏览器，不会自动上传。</p><p><a href="#/review">进入整理工作台 ↗</a>${config.repository ? " · " + external(`https://github.com/${config.repository}`, "GitHub 仓库 ↗") : ""}</p><h2>数据与实现</h2><p>作品名称与季度以原表为准，原名、别名、封面及类型按相同作品 ID 从 ${external("https://bgm.tv/", "Bangumi")} 补充；录播链接来自原表。站点为静态页面，访问时不会向 B 站发起批量采集。数据更新与展示分开，新的候选内容经审核后发布。</p><p class="subtle">数据版本：${esc(data.fetched_at)} · schema ${data.schema_version} · 非官方粉丝项目</p></div>`;
}
const draftKey = "funshiki-review-v1";
function getDrafts() {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey) || "{}");
    return d && typeof d === "object" && !Array.isArray(d) ? d : {};
  } catch {
    return {};
  }
}
function reviewPage() {
  const route = parseRoute(location.hash);
  const selected = route.params.get("entry");
  const all = route.params.get("all") === "1";
  const candidates = data.segments.filter(e => selected ? e.id === selected : all || (!e.subject_ids.length && isIndexedSegment(e)));
  const drafts = getDrafts();
  const pool = new Map(data.subjects.map(s => [s.id, s]));
  Object.values(drafts).flatMap(d => d.subjects || []).forEach(s => { if (!pool.has(s.id)) pool.set(s.id, s); });
  main.innerHTML = `<div class="page-wrap"><div class="page-title"><div class="eyebrow">REVIEW THE ARCHIVE</div><h1>一起把线索补完整。</h1><p>识别作品、搜索 Bangumi，再保存审核草稿。聊生活、聊新视频暂不进入作品索引，仍保留整期时间轴。</p></div><div class="review-toolbar"><span>${candidates.length} 条记录 · <b id="draft-count">${Object.keys(drafts).length}</b> 条本地草稿</span><button id="export-drafts">导出审核补丁 ↓</button><a href="#/review">待确认线索</a><a href="#/review?all=1">全部话题（含已分类）</a></div><p id="review-status" class="status" role="status"></p><div class="review-list"></div></div>`;
  const status = document.querySelector("#review-status");
  for (const entry of candidates) {
    const draft = drafts[entry.id] || entry;
    const chosen = new Set(draft.subject_ids);
    const form = document.createElement("form");
    form.className = "review-card";
    form.innerHTML = `<div class="eyebrow">${formatDate(dateOf(video(entry.bvid)))} · ${formatTime(entry.targets[0].seconds)}</div><h2>${esc(entry.text)}</h2><p>${external(entry.source.url, "查看原始来源 ↗")} · ${external(videoUrl(entry.bvid, entry.targets[0].p, entry.targets[0].seconds), "观看对应片段 ↗")}</p><label>内容分类<select name="kind">${Object.entries(kinds).map(([key, label]) => `<option value="${key}" ${draft.kind === key ? "selected" : ""}>${label}</option>`).join("")}</select></label><fieldset class="work-picker"><legend>关联作品（可选多个）</legend><div class="chosen-subjects"></div><div class="local-matches"></div><div class="bangumi-search"><label>作品名或简称<input name="keyword" value="${esc(entry.text)}" maxlength="100" placeholder="输入作品名称"></label><label>搜索范围<select name="type"><option value="all">全部作品</option><option value="2">动画</option><option value="1">书籍（小说 / 漫画）</option><option value="4">游戏</option></select></label><button type="button" class="search-bangumi">搜索 Bangumi</button></div><p class="search-status" role="status"></p><div class="bangumi-results"></div><button type="button" class="more-results" hidden>下一页</button></fieldset><label>修正依据<input name="reason" required maxlength="500" value="${esc(draft.reason || "")}" placeholder="说明作品、版本或话题分类的核对依据"></label><button type="submit">保存本地草稿</button><button type="button" class="discard">丢弃此条草稿</button>`;
    document.querySelector(".review-list").append(form);
    const kind = form.elements.kind;
    const picker = form.querySelector(".work-picker");
    const drawChosen = () => {
      const container = form.querySelector(".chosen-subjects");
      container.innerHTML = chosen.size ? [...chosen].map(id => `<button type="button" data-remove="${id}">${esc(pool.get(id)?.name || String(id))} · 移除 ×</button>`).join("") : '<p class="subtle">暂未关联作品</p>';
      container.querySelectorAll("[data-remove]").forEach(b => b.onclick = () => { chosen.delete(Number(b.dataset.remove)); drawChosen(); });
    };
    const drawResults = (container, subjects, local = false) => {
      container.innerHTML = subjects.map(s => `<div class="bangumi-result"><div><strong>${esc(s.name)}</strong><small>${esc(categories[subjectCategory(s)])} · ${esc(s.air_date || "日期未定")} · #${s.id}<br>${esc(s.original_name)}</small></div>${external(`https://bgm.tv/subject/${s.id}`, "查看 ↗")}<button type="button" data-add="${s.id}">${local ? "关联候选" : "关联作品"}</button></div>`).join("");
      container.querySelectorAll("[data-add]").forEach(button => button.onclick = async () => {
        const id = Number(button.dataset.add);
        button.disabled = true;
        try {
          if (!pool.has(id)) {
            const s = fromBangumi(await getBangumiSubject(id));
            pool.set(id, s);
          }
          chosen.add(id); drawChosen(); button.textContent = "已关联";
        } catch (error) { form.querySelector(".search-status").textContent = `${error.message}，请重试。`; }
        finally { button.disabled = false; }
      });
    };
    const localMatches = () => drawResults(form.querySelector(".local-matches"), recognizeSubjects([...pool.values()], form.elements.keyword.value), true);
    form.elements.keyword.addEventListener("input", localMatches);
    const toggleKind = () => { picker.disabled = !isIndexedSegment({ kind: kind.value }); };
    kind.addEventListener("change", toggleKind);
    toggleKind(); drawChosen(); localMatches();
    let offset = 0, searchKey = "", searchType = "all";
    const searchButton = form.querySelector(".search-bangumi");
    const more = form.querySelector(".more-results");
    const runSearch = async (next = false) => {
      if (searchButton.disabled) return;
      if (!next) { offset = 0; searchKey = form.elements.keyword.value; searchType = form.elements.type.value; }
      searchButton.disabled = true; more.disabled = true;
      const message = form.querySelector(".search-status");
      message.textContent = "正在搜索 Bangumi…";
      form.querySelector(".bangumi-results").replaceChildren();
      more.hidden = true;
      try {
        const result = await searchBangumi(searchKey, searchType, offset);
        drawResults(form.querySelector(".bangumi-results"), result.subjects);
        message.textContent = result.warning || (result.subjects.length ? "" : "没有找到作品，请尝试其他名称。");
        offset = result.nextOffset;
        more.hidden = !result.hasMore;
      } catch (error) { message.textContent = `${error.message}。可重试搜索；已有草稿仍可保存。`; }
      finally { searchButton.disabled = false; more.disabled = false; }
    };
    searchButton.onclick = () => runSearch();
    more.onclick = () => runSearch(true);
    form.elements.keyword.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } });
    form.onsubmit = e => {
      e.preventDefault();
      const reason = form.elements.reason.value.trim();
      if (!reason) { status.textContent = "请填写修正依据。"; return; }
      const subject_ids = isIndexedSegment({ kind: kind.value }) ? [...chosen] : [];
      const current = getDrafts();
      current[entry.id] = { id: entry.id, kind: kind.value, subject_ids, reason,
        subjects: subject_ids.filter(id => !subject(id)).map(id => pool.get(id)) };
      try {
        localStorage.setItem(draftKey, JSON.stringify(current));
        document.querySelector("#draft-count").textContent = Object.keys(current).length;
        status.textContent = "草稿已保存；导出并应用审核补丁后更新公开索引。";
      } catch { status.textContent = "浏览器无法保存草稿，请检查存储权限。"; }
    };
    form.querySelector(".discard").onclick = () => {
      const current = getDrafts(); delete current[entry.id];
      try { localStorage.setItem(draftKey, JSON.stringify(current)); reviewPage(); }
      catch { status.textContent = "无法更新浏览器存储。"; }
    };
  }
  if (!candidates.length) document.querySelector(".review-list").innerHTML = '<p class="empty">暂时没有待确认记录，可查看全部话题。</p>';
  document.querySelector("#export-drafts").onclick = () => {
    const records = Object.values(getDrafts());
    if (!records.length) { status.textContent = "还没有可导出的草稿。"; return; }
    const subjects = [...new Map(records.flatMap(d => d.subjects || []).map(s => [s.id, s])).values()];
    const serialized = JSON.stringify({ schema_version: 1, catalog_version: data.version, subjects,
      changes: records.map(({ subjects, ...change }) => change) }, null, 2);
    let output = document.querySelector("#patch-json");
    if (!output) {
      const label = document.createElement("label"); label.className = "patch-output";
      label.textContent = "审核补丁 JSON（也可复制保存为 .json 文件）";
      output = document.createElement("textarea"); output.id = "patch-json"; output.readOnly = true; output.rows = 10;
      label.append(output); status.after(label);
    }
    output.value = serialized;
    const url = URL.createObjectURL(new Blob([serialized], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "funshiki-review-patch.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = "补丁已生成，包含新增 Bangumi 作品；尚未修改已发布索引。";
  };
}

function notFound() {
  main.innerHTML =
    '<div class="page-wrap empty"><h1>这份档案还不存在</h1><p>链接可能已变更，也可能暂未收录。</p><a href="#/">回到作品索引 ↗</a></div>';
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
  else if (r.page === "review") reviewPage();
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
