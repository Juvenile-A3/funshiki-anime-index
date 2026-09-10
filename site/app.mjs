import {
  escapeHtml as esc,
  formatTime,
  findSubjects,
  parseRoute,
  validateCatalog,
  videoUrl,
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
const kinds = {
  discussion: "作品杂谈",
  watch: "观看 / 鉴赏",
  pv: "PV / 新作消息",
  general: "其他话题",
};
const subject = (id) => data.subjects.find((s) => s.id === id);
const video = (bvid) => data.videos.find((v) => v.bvid === bvid);
const external = (href, label, cls = "") =>
  `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
const pill = (label, cls = "") =>
  `<span class="pill ${cls}">${esc(label)}</span>`;
const formatDate = (d) => d?.replaceAll("-", ".") || "日期待核实";
const shortTitle = (title) => title.replace(/^【[^】]*】\s*/, "");
function cover(s, cls = "") {
  const url = /^https:\/\//.test(s.image || "") ? s.image : "";
  return `<div class="cover ${cls}" style="--cover-color:${esc(s.color || "#d6d0ec")}"><span class="cover-fallback" aria-hidden="true">${esc(s.name.slice(0, 2))}</span>${url ? `<img src="${esc(url)}" alt="${esc(s.name)}封面" loading="lazy" referrerpolicy="no-referrer">` : ""}</div>`;
}
function card(s, i) {
  return `<a class="anime-card" href="#/anime/${s.id}">${cover(s)}<div class="card-top"><span>${esc(s.air_date?.slice(0, 4) || "未定")} · ${esc(s.platform || "动画")}</span><span class="card-arrow" aria-hidden="true">↗</span></div><h3>${esc(s.name)}</h3><p class="card-original">${esc(s.original_name)}</p><div class="card-bottom"><span><b>${s.segments.length}</b> 个时点</span><span>最近 ${formatDate(s.latest)}</span></div></a>`;
}
function home() {
  const params = parseRoute(location.hash).params;
  const q = params.get("q") || "";
  main.innerHTML = `<section class="hero"><div class="hero-copy"><div class="eyebrow"><span class="live-dot"></span> 动画 · 录播 · 那些聊过的瞬间</div><h1>找到一部动画，<br>回到聊它的<span>那一刻。</span></h1><p>把漫长的杂谈，整理成可以抵达的时点。<br class="desktop-only">从作品出发，重温泛式的每一次分享。</p><form class="search" id="search-form" role="search"><span aria-hidden="true">⌕</span><input id="search" type="search" aria-label="搜索动画名称、别名或笔记关键词" placeholder="搜动画、简称，或笔记里的关键词…" value="${esc(q)}" autocomplete="off"><kbd>/</kbd><button type="submit">找一找 <span aria-hidden="true">↗</span></button></form><div class="suggestions"><span>试试搜索</span><button data-query="冰之城墙">冰之城墙</button><button data-query="灰原君">灰原君</button><button data-query="左撇子艾伦">左撇子艾伦</button></div></div><aside class="hero-aside" aria-label="档案概况"><div class="archive-label">THE TALK ARCHIVE <span>↗</span></div><div class="archive-number">${String(data.subjects.length).padStart(2, "0")}<small>部动画，已建立索引</small></div><div class="archive-divider"></div><div class="aside-stats"><span><b>${data.videos.length}</b>期录播</span><span><b>${data.segments.filter((e) => e.subject_ids.length).length}</b>个动画时点</span></div><div class="aside-note">首批测试数据<br><strong>${formatDate(data.coverage.from)} — ${formatDate(data.coverage.to)}</strong><span>持续整理中 · 每个时点都有出处</span></div></aside></section><section class="catalog-section" aria-labelledby="catalog-title"><div class="section-head"><div><div class="eyebrow">BROWSE THE ARCHIVE</div><h2 id="catalog-title">聊过的动画 <span id="result-count"></span></h2></div><div class="filters"><label class="sr-only" for="period">动画年份</label><select id="period"><option value="all">全部年份</option>${[
    ...new Set(
      data.subjects.map((s) => s.air_date?.slice(0, 4)).filter(Boolean),
    ),
  ]
    .sort()
    .reverse()
    .map((y) => `<option value="${y}">${y} 年动画</option>`)
    .join(
      "",
    )}</select><label class="sr-only" for="sort">排序</label><select id="sort"><option value="recent">最近聊到</option><option value="count">讨论时点最多</option></select></div></div><div id="anime-grid" class="anime-grid"></div><p class="coverage-note">这里只展示已建立作品关联的条目。没有搜索结果，表示当前尚未收录，并不代表没有聊过。</p></section><section class="recent-strip"><span class="pill">最新收录</span><a href="#/video/${data.videos[0].bvid}">${formatDate(data.videos[0].live_date)} <strong>${esc(shortTitle(data.videos[0].title))}</strong></a><a href="#/videos">看整期时间轴 ↗</a></section>`;
  const update = () => {
    const results = findSubjects(
      data,
      document.querySelector("#search").value,
      document.querySelector("#period").value,
      document.querySelector("#sort").value,
    );
    document.querySelector("#result-count").textContent = `${results.length}`;
    document.querySelector("#anime-grid").innerHTML = results.length
      ? results.map(card).join("")
      : `<div class="empty"><span aria-hidden="true">⌕</span><h3>还没有找到这部动画</h3><p>试试正式名称或别名，也可以去整期时间轴看看。</p><button id="reset-search">清空筛选</button></div>`;
    document.querySelector("#reset-search")?.addEventListener("click", () => {
      document.querySelector("#search").value = "";
      document.querySelector("#period").value = "all";
      update();
    });
  };
  document.querySelector("#search").addEventListener("input", update);
  document.querySelector("#period").addEventListener("change", update);
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
  return `<article class="segment" id="${esc(e.id)}"><div class="segment-time"><span>${formatTime(e.targets[0].seconds)}</span><small>${showVideo ? formatDate(v.live_date) : `P${e.targets[0].p}`}</small></div><div class="segment-body"><div class="segment-tags">${pill(kinds[e.kind] || "待分类")}${!e.subject_ids.length ? pill("作品待确认", "muted") : ""}${e.review === "text-reviewed" ? '<span class="reviewed" title="已根据笔记与 Bangumi 条目核对，尚未逐段观看">✓ 条目已核对</span>' : ""}</div><h3>${esc(e.text)}</h3>${showVideo ? `<a class="source-video" href="#/video/${v.bvid}">${esc(shortTitle(v.title))}</a>` : ""}${showSubject && e.subject_ids.length ? `<div class="subject-links">${e.subject_ids.map((id) => `<a href="#/anime/${id}">${esc(subject(id).name)} ↗</a>`).join("")}</div>` : ""}<div class="segment-source">笔记整理：${esc(e.source.author)} · ${external(e.source.url, "查看原笔记 ↗")}<a href="#/review?entry=${encodeURIComponent(e.id)}">纠错</a></div></div><div class="segment-actions">${e.targets.map((t, i) => external(videoUrl(e.bvid, t.p, t.seconds, preRoll), `${t.variant === "danmaku" ? "弹幕版" : "普通版"} <span aria-hidden="true">↗</span>`, i === 0 ? "play primary" : "play")).join("")}</div></article>`;
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
  if (!s) return notFound();
  const segments = data.segments
    .filter((e) => e.subject_ids.includes(s.id))
    .sort(
      (a, b) =>
        video(b.bvid).live_date.localeCompare(video(a.bvid).live_date) ||
        a.targets[0].seconds - b.targets[0].seconds,
    );
  main.innerHTML = `<div class="page-wrap"><a class="back" href="#/">← 动画索引</a><section class="subject-hero">${cover(s, "detail-cover")}<div><div class="eyebrow">ANIME IN THE ARCHIVE</div><h1>${esc(s.name)}</h1><p class="original">${esc(s.original_name)}</p><div class="subject-meta">${pill(s.air_date?.slice(0, 4) || "未定")}${pill(s.platform || "动画")}${external(`https://bgm.tv/subject/${s.id}`, "在 Bangumi 查看 ↗")}</div><p class="summary">${esc(s.summary || "动画条目信息来自 Bangumi。")}</p><div class="subject-numbers"><strong>${segments.length}</strong> 个讨论时点 <span>来自 ${new Set(segments.map((e) => e.bvid)).size} 期录播</span></div></div></section><div class="section-head"><h2>相关杂谈</h2>${replayControl()}</div><p class="subtle">话题描述保留粉丝笔记原文，不作为主播观点摘要。时间标签已校验，内容尚未逐段复听。</p><div class="timeline">${segments.map((e) => segment(e)).join("")}</div></div>`;
  bindReplay(() => animePage(id));
}
function videosPage() {
  main.innerHTML = `<div class="page-wrap"><div class="page-title"><div class="eyebrow">FROM BEGINNING TO END</div><h1>整期录播，按时间展开。</h1><p>也可以先选一期，再看看那天都聊了什么。</p></div><div class="video-list">${data.videos
    .map((v, i) => {
      const entries = data.segments.filter((e) => e.bvid === v.bvid);
      return `<a class="video-row" href="#/video/${v.bvid}"><span class="video-index">0${i + 1}</span><div><span class="eyebrow">${formatDate(v.live_date)} · ${v.pages.length} P</span><h2>${esc(shortTitle(v.title))}</h2><p>${entries.length} 个话题时点 · ${new Set(entries.flatMap((e) => e.subject_ids)).size} 部已关联动画</p></div><span class="round-arrow" aria-hidden="true">↗</span></a>`;
    })
    .join(
      "",
    )}</div><p class="coverage-note">范围以录播组收藏夹当前最新三期为准，不代表主播全部最新投稿。直播日期取自视频简介。</p></div>`;
}
function videoPage(bvid) {
  const v = video(bvid);
  if (!v) return notFound();
  const entries = data.segments.filter((e) => e.bvid === bvid);
  main.innerHTML = `<div class="page-wrap"><a class="back" href="#/videos">← 全部录播</a><div class="page-title"><div class="eyebrow">${formatDate(v.live_date)} · LIVE ARCHIVE</div><h1>${esc(shortTitle(v.title))}</h1><p>${entries.length} 个话题时点 · 相同内容的普通版与弹幕版已合并展示</p>${external(`https://www.bilibili.com/video/${bvid}/`, "打开完整录播 ↗", "text-link")}</div><div class="section-head"><h2>这一期的时间轴</h2>${replayControl()}</div><div class="timeline">${entries.map((e) => segment(e, { showVideo: false, showSubject: true })).join("")}</div></div>`;
  bindReplay(() => videoPage(bvid));
}
function aboutPage() {
  main.innerHTML = `<div class="page-wrap prose"><div class="eyebrow">ABOUT THIS ARCHIVE</div><h1>让每一段分享，<br>更容易被找到。</h1><p class="lead">这是一个由粉丝整理的泛式动漫杂谈索引。以录播组收藏夹为范围，以公开笔记为线索，用 Bangumi 条目连接动画和讨论时点。</p><h2>这份档案收录了什么</h2><p>当前是首批测试数据：${formatDate(data.coverage.from)} 至 ${formatDate(data.coverage.to)} 的 ${data.videos.length} 期录播，${data.subjects.length} 部已建立关联的动画，${data.segments.length} 个话题时点。其中作品名称明确的内容进入动画索引；简称不确定或一般话题保留在整期时间轴。</p><h2>怎么看“条目已核对”</h2><p>表示笔记的用词与 Bangumi 条目经过文本核对，时间标签的分 P、CID 和时长也经过校验。它不表示已经听看每一段录播。笔记中可能包含整理者的感想、梗和主观描述，请以原视频为准。</p><h2>感谢留下时间轴的人</h2><div class="credit-box">${[...new Set(data.segments.map((e) => e.source.author))].map((a) => `<strong>${esc(a)}</strong>`).join(" ")}<p>每个时点都保留笔记作者与原始链接。这里展示必要的话题摘录，观看请回到原录播。</p></div><h2>缺失、修正与参与</h2><p>搜不到并不等于没有聊过；时点也可能因为视频重传而失效。你可以在时点旁点击“纠错”，保存审核草稿并导出补丁，再通过仓库提交。草稿只保存在当前浏览器，不会自动上传。</p><p><a href="#/review">进入整理工作台 ↗</a>${config.repository ? " · " + external(`https://github.com/${config.repository}`, "GitHub 仓库 ↗") : ""}</p><h2>数据与实现</h2><p>动画元数据来自 ${external("https://bgm.tv/", "Bangumi")}；录播来自 ${external("https://space.bilibili.com/281341996/favlist", "下播型泛式录播组收藏夹")}。站点为静态页面，访问时不会向 B 站发起批量采集。数据更新与展示分开，新的候选内容经审核后发布。</p><p class="subtle">采集快照：${esc(data.fetched_at)} · schema ${data.schema_version} · 非官方粉丝项目</p></div>`;
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
  const candidates = selected
    ? data.segments.filter((e) => e.id === selected)
    : data.segments.filter((e) => !e.subject_ids.length);
  const drafts = getDrafts();
  main.innerHTML = `<div class="page-wrap"><div class="page-title"><div class="eyebrow">A LITTLE HELP GOES A LONG WAY</div><h1>一起把线索补完整。</h1><p>选择动画、核对分类，再导出审核补丁。草稿仅保存在当前浏览器，不会自动发布。</p></div><div class="review-toolbar"><span>${candidates.length} 条${selected ? "选中记录" : "待确认线索"} · <b id="draft-count">${Object.keys(drafts).length}</b> 条本地草稿</span><button id="export-drafts">导出审核补丁 ↓</button>${selected ? '<a href="#/review">查看全部待确认</a>' : ""}</div><p id="review-status" class="status" role="status"></p><div class="review-list">${
    candidates
      .map((e) => {
        const d = drafts[e.id] || {};
        const sid = d.subject_ids?.[0] ?? e.subject_ids[0] ?? "";
        return `<form class="review-card" data-entry="${esc(e.id)}"><div class="eyebrow">${formatDate(video(e.bvid).live_date)} · ${formatTime(e.targets[0].seconds)}</div><h2>${esc(e.text)}</h2><p>${external(e.source.url, "查看笔记 ↗")} · ${external(videoUrl(e.bvid, e.targets[0].p, e.targets[0].seconds), "观看对应片段 ↗")}</p><div class="review-fields"><label>对应动画<select name="subject"><option value="">暂不关联动画</option>${data.subjects.map((s) => `<option value="${s.id}" ${Number(sid) === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label><label>内容分类<select name="kind">${Object.entries(
          kinds,
        )
          .map(
            ([k, l]) =>
              `<option value="${k}" ${(d.kind || e.kind) === k ? "selected" : ""}>${l}</option>`,
          )
          .join(
            "",
          )}</select></label></div><label>修正依据或补充条目<input name="reason" placeholder="例如：这段讨论的是第二季，Bangumi 条目为…" value="${esc(d.reason || "")}" maxlength="500"></label><button type="submit">${d.reason ? "更新草稿" : "保存本地草稿"}</button></form>`;
      })
      .join("") ||
    '<div class="empty"><h2>暂时没有待确认记录</h2><a href="#/">回到动画索引</a></div>'
  }</div></div>`;
  document.querySelectorAll(".review-card").forEach((form) =>
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const fields = new FormData(form);
      const reason = String(fields.get("reason")).trim();
      const status = document.querySelector("#review-status");
      if (!reason) {
        status.textContent = "请填写修正依据，方便后续审核。";
        form.querySelector("[name=reason]").focus();
        return;
      }
      const drafts = getDrafts();
      drafts[form.dataset.entry] = {
        id: form.dataset.entry,
        subject_ids: fields.get("subject")
          ? [Number(fields.get("subject"))]
          : [],
        kind: fields.get("kind"),
        reason,
      };
      try {
        localStorage.setItem(draftKey, JSON.stringify(drafts));
        status.textContent = "草稿已保存在当前浏览器；导出后可提交到仓库。";
        document.querySelector("#draft-count").textContent =
          Object.keys(drafts).length;
        form.querySelector("button[type=submit]").textContent = "更新草稿";
      } catch {
        status.textContent = "浏览器无法保存草稿，请检查存储权限。";
      }
    }),
  );
  document.querySelectorAll(".review-card").forEach((form) => {
    const discard = document.createElement("button");
    discard.type = "button";
    discard.textContent = "丢弃此条草稿";
    form.append(discard);
    discard.addEventListener("click", () => {
      const drafts = getDrafts();
      delete drafts[form.dataset.entry];
      try {
        localStorage.setItem(draftKey, JSON.stringify(drafts));
        reviewPage();
        document.querySelector("#review-status").textContent =
          "此条本地草稿已丢弃。";
      } catch {
        document.querySelector("#review-status").textContent =
          "无法更新浏览器存储。";
      }
    });
  });
  document.querySelector("#export-drafts").addEventListener("click", () => {
    const records = Object.values(getDrafts());
    const status = document.querySelector("#review-status");
    if (!records.length) {
      status.textContent = "还没有可导出的草稿。";
      return;
    }
    const serialized = JSON.stringify(
      { schema_version: 1, catalog_version: data.version, changes: records },
      null,
      2,
    );
    let output = document.querySelector("#patch-json");
    if (!output) {
      const label = document.createElement("label");
      label.className = "patch-output";
      label.textContent = "审核补丁 JSON（也可复制保存为 .json 文件）";
      output = document.createElement("textarea");
      output.id = "patch-json";
      output.readOnly = true;
      output.rows = 10;
      label.append(output);
      status.after(label);
    }
    output.value = serialized;
    const blob = new Blob([serialized], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "funshiki-review-patch.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent =
      "补丁已生成；若下载未开始，可复制下方 JSON 保存。尚未修改已发布索引。";
  });
}
function notFound() {
  main.innerHTML =
    '<div class="page-wrap empty"><h1>这份档案还不存在</h1><p>链接可能已变更，也可能暂未收录。</p><a href="#/">回到动画索引 ↗</a></div>';
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
