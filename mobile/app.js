import {configureSlang,renderSlang,wireSlang,confirmSlangPage} from './slang.js';
import {configureReview,renderReview,wireReview,confirmPage,renderHistory,sourceSummary} from './review.js';
import {configureCollaboration,showCollaboration} from './collaboration.js';
const $ = (q, root = document) => root.querySelector(q);
const $$ = (q, root = document) => [...root.querySelectorAll(q)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names = {recordings:'录播目录',entries:'时轴作品核对',works:'作品资料',series:'系列管理',aliases:'黑话核对',audit_log:'修改记录',collaboration:'协作与合并',alias_exclusions:'黑话原文关联'};
const cats = {tv:'TV 动画',movie:'剧场动画',ova:'OVA',ona:'网络动画',anime_other:'其他动画',manga:'漫画',novel:'小说',book:'其他书籍',game:'游戏',music:'音乐',live_action:'真人 / 特摄',other:'其他作品'};
const topics = {unclassified:'待分类',work:'作品话题',life:'生活杂谈',channel:'频道 / 新视频',general:'其他非作品话题'};
const states = {pending:'待核对',confirmed:'已确认',reference:'来源别名','source-imported':'CSV 已关联',source:'来源关联',candidate:'识别候选',rejected:'已排除'};
const kinds = {talk:'杂谈回',tea:'茶话会',op_ed:'OP / ED 鉴赏',screening:'放映会',other:'其他录播'};
const danmaku = {yes:'有弹幕版',no:'无弹幕版（已核查分 P）',unknown:'弹幕版未知'};
const warnings = {source_cid_changed:'原 CID 已变化',unknown_cid:'CID 无法对应',source_part_index_mismatch:'原分 P 不一致',invalid_source_tag:'原时轴标签失效',empty_text:'原时点无文字',out_of_range:'超过当前视频时长',page_metadata_missing:'缺少分 P 元数据'};
let state = {tab:'recordings',page:1,extra:{}}, current = null, selection = [], stats, options, timer, requestNumber = 0;

async function api(path, body) {
  if(globalThis.libraryLocalApi)return globalThis.libraryLocalApi(path,body===undefined?undefined:{actor:localStorage.getItem('library-actor')||'移动协作者',...body});
  const response = await fetch('/api/' + path, body === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json','X-Library-Request':'1'},body:JSON.stringify({actor:localStorage.getItem('library-actor')||'本机',...body})});
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `请求失败 ${response.status}`);
  return value;
}
function toast(text, error=false) { const el=$('#toast');el.hidden=false;el.textContent=text;el.classList.toggle('error-text',error);clearTimeout(timer);timer=setTimeout(()=>el.hidden=true,error?12000:6500); }
function pill(value) {return `<span class="pill ${value==='pending'||value==='candidate'?'warning':esc(value)}">${esc(states[value]||value)}</span>`;}
function formatTime(sec) { if (sec==null) return '—'; const whole=Math.floor(sec);return [Math.floor(whole/3600),Math.floor(whole/60)%60,whole%60].map(n=>String(n).padStart(2,'0')).join(':')+(sec%1?String(Math.round(sec%1*1000)/1000).slice(1):''); }
function qlabel(q){return q?`${q.slice(0,4)} 年 ${Number(q.slice(5))} 月`:'未知';}
function selectOptions(values, selected=''){return Object.entries(values).map(([k,v])=>`<option value="${esc(k)}" ${k===String(selected??'')?'selected':''}>${esc(v)}</option>`).join('');}
function cover(url){return url?.startsWith('https://')?`<img loading="lazy" src="${esc(url)}" alt="作品封面" referrerpolicy="no-referrer">`:'';}
function bangumiCategory(s){if(s.type===2)return ({TV:'tv','剧场版':'movie',OVA:'ova',WEB:'ona'})[s.platform]||'anime_other';if(s.type===1)return s.platform?.includes('小说')?'novel':s.platform?.includes('漫画')?'manga':'book';return ({3:'music',4:'game',6:'live_action'})[s.type]||'other';}
function external(url,label){if(typeof url!=='string'||!/^https:\/\//.test(url))return esc(label);const bgm=/^https:\/\/(?:bgm.tv|bangumi.tv|chii.in)\/subject\//.test(url);return `<a class="${bgm?'jump-link bangumi-jump':''}" href="${esc(url)}" target="_blank" rel="noreferrer">${bgm?'查看 Bangumi ↗ <small>#'+esc(url.split('/').pop())+'</small>':esc(label)+' ↗'}</a>`;}
function videoLink(e){return `<a class="jump-link video-jump" href="https://www.bilibili.com/video/${esc(e.recording_id)}/${e.p?'?p='+e.p+'&amp;t='+e.start:''}" target="_blank" rel="noreferrer">▶ ${e.p?'从 '+formatTime(e.start)+' 播放原视频 · P'+e.p:'打开所属录播'} ↗</a>`;}
function snapshotSource(data){return `<details><summary>查看原始来源与校验摘要</summary>${(data.observations||[]).map(o=>`<p class="source-link">${esc(o.path)} · ${esc(o.locator)}<br><span class="muted">SHA-256 ${esc(o.sha256)}</span></p><pre>${esc(JSON.stringify(JSON.parse(o.payload),null,2))}</pre>`).join('')||'<p>手工新增记录，见修改记录。</p>'}</details>`;}

async function refreshStats(){
  [stats,options]=await Promise.all([api('stats'),api('options')]);
  $('#stats').innerHTML=[['录播收录',stats.recordings],['有时轴笔记',stats.timeline_notes],['时轴记录',stats.entries],['作品资料',stats.works],['时轴待核对',stats.pending_entries]].map(([label,n])=>`<div class="stat"><span>${label}</span><b>${n.toLocaleString()}</b></div>`).join('');
}
function configureFilters(){
  $('#title').textContent=names[state.tab];$('#add-work').hidden=!['works','series'].includes(state.tab);$('#add-work').textContent=state.tab==='series'?'＋ 添加系列':'＋ 添加作品';
  const descriptions={recordings:`杂谈回、茶话会、OP / ED 鉴赏和放映会。${stats.missing_pages} 条录播的弹幕版状态待补充，${stats.without_timeline} 条暂无时轴。`,entries:`默认显示待核对。直接确认、搜索纠错或选择非作品分类；${stats.high_confidence_entries||0} 条由已确认黑话唯一对应，标记为高可信度。`,works:'TV 动画按所属季度整理；剧场、OVA、网络动画、书籍、游戏等单独分类。',series:'把续作、篇章和改编纳入系列。系列黑话结合录播时间、作品时间及节目季度判断具体作品。',aliases:'同一黑话的不同候选集中判断。支持动画、游戏、小说和漫画；展开全部原文可逐条解绑。',audit_log:'直接查看谁把什么改成了什么。修改依据选填；可撤销此后未再变化的记录。',collaboration:'分享当前资料库和整理台，各自编辑后导入修改包，预览并合并。'};
  $('#subtitle').textContent=descriptions[state.tab];
  const category=state.tab==='recordings'?{'':'所有录播类型',...kinds}:state.tab==='entries'?{'':'所有话题',...topics}:state.tab==='works'?{'':'所有作品分类',...cats}:state.tab==='aliases'?{'':'所有状态',pending:'待核对',confirmed:'已确认',reference:'来源别名',rejected:'已排除'}:{};
  $('#filter-a').innerHTML=selectOptions(category);$('#filter-a').hidden=!Object.keys(category).length;
  const quarters=state.tab==='works'?options.work_quarters:options.quarters;
  $('#filter-quarter').innerHTML=selectOptions({'':'所有季度',...Object.fromEntries(quarters.map(q=>[q,qlabel(q)]))});
  $('#filter-quarter').hidden=['aliases','series','audit_log'].includes(state.tab);
  $('#filter-extra').innerHTML=selectOptions(state.tab==='recordings'?{'':'全部收录',missing:'暂无时轴',unknown:'弹幕版未知',yes:'有弹幕版'}:state.tab==='entries'?{'':'全部核对状态',pending:'待核对',confirmed:'已确认','source-imported':'CSV 已关联',warning:'原始跳转提示',high:'高可信度待核对',unresolved:'尚无作品候选',retrospective:'十年前 / 旧番回顾',csv_conflict:'笔记与 CSV 有分歧'}:state.tab==='aliases'?{'':'所有指代类型',work:'具体作品',series:'整个系列'}:{});
  $('#filter-extra').hidden=!['recordings','entries','aliases'].includes(state.tab);
  $('#search').placeholder=state.tab==='recordings'?'搜索录播名称或 BV 号':state.tab==='aliases'?'搜索黑话、别称或作品名':'搜索文字、作品名称或 ID';
  $('#search').value='';
  if(state.tab==='entries')$('#filter-extra').value='pending';
  if(state.tab==='aliases')$('#filter-a').value='pending';
  $('#filters').hidden=['audit_log','collaboration'].includes(state.tab);
  $('.pagination').hidden=state.tab==='collaboration';
  $('#review-toolbar').hidden=!['entries','aliases'].includes(state.tab);
  $$('#filters input, #filters button').forEach(e=>e.hidden=state.tab==='audit_log');
  $$('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===state.tab));
}
function query(){
  const q=new URLSearchParams({page:state.page,...state.extra});
  if($('#search').value.trim())q.set('q',$('#search').value.trim());
  const a=$('#filter-a').value,b=$('#filter-extra').value;
  if(a) q.set(state.tab==='recordings'?'kind':state.tab==='aliases'?'status':'category',a);
  if(!$('#filter-quarter').hidden&&$('#filter-quarter').value)q.set('quarter',$('#filter-quarter').value);
  if(b&&!$('#filter-extra').hidden){
    if(state.tab==='recordings')q.set(b==='missing'?'missing':'danmaku',b==='missing'?'1':b);
    else if(state.tab==='aliases')q.set('target_kind',b);
    else if(b==='high'){q.set('confidence','high');q.set('status','pending');}
    else q.set(['warning','unresolved','retrospective','csv_conflict'].includes(b)?b:'status',['warning','unresolved','retrospective','csv_conflict'].includes(b)?'1':b);
  }
  return q;
}
function table(head,body){return `<table><thead><tr>${head.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;}
function savePosition(){
  sessionStorage.setItem('library-view',JSON.stringify({...state,filters:[$('#search').value,$('#filter-a').value,$('#filter-quarter').value,$('#filter-extra').value],scroll:window.scrollY}));
}
function readingAnchor(){
  const visible=$$('[data-row]').filter(e=>e.getBoundingClientRect().bottom>0);
  return {y:window.scrollY,rows:visible.map(e=>({id:e.dataset.row,top:e.getBoundingClientRect().top}))};
}
function restoreAnchor(anchor){
  const found=anchor.rows.find(x=>$$('[data-row]').some(e=>e.dataset.row===x.id));
  if(found){const el=$$('[data-row]').find(e=>e.dataset.row===found.id);window.scrollBy(0,el.getBoundingClientRect().top-found.top);}
  else window.scrollTo(0,anchor.y);
}
async function afterSave(){await refreshStats();await load({preserve:true});}
async function load({preserve=false}={}){
  const number=++requestNumber;
  const anchor=preserve?readingAnchor():null;
  savePosition();
  if(!preserve)$('#list').innerHTML='<div class="empty">正在读取资料…</div>';
  $('#confirm-page').disabled=true;
  try {
    if(state.tab==='collaboration'){$('#count').textContent='离线协作';$('#context').innerHTML='';await showCollaboration();return;}
    const data=await api((state.tab==='aliases'?'alias_groups':state.tab)+'?'+query());if(number!==requestNumber)return;
    if(!data.items.length&&state.page>1){state.page=Math.max(1,Math.ceil(data.total/data.limit));return load({preserve});}
    $('#confirm-page').disabled=!data.items.some(e=>e.status==='pending');$('#confirm-page').dataset.available=String(!$('#confirm-page').disabled);
    $('#review-page-note').textContent='本页 '+data.items.filter(e=>e.status==='pending').length+(state.tab==='aliases'?' 组待核对；批量确认采用各组勾选的对象。':' 条待核对；批量确认采用每条当前的选择。');
    $('#count').textContent=`共 ${data.total.toLocaleString()} ${data.unit||'条记录'}`;
    $('#page').textContent=`${data.page} / ${Math.max(1,Math.ceil(data.total/data.limit))}`;
    $('#prev').disabled=data.page===1;$('#next').disabled=data.page*data.limit>=data.total;
    $('#context').innerHTML=state.extra.recording?`当前录播：${esc(state.extra.recording)}　<button id="exit-context">查看全部录播的时轴</button>`:state.extra.work?`当前作品：${esc(state.extra.work)}　<button id="exit-context">查看全部时轴</button>`:'';
    $('#exit-context')?.addEventListener('click',()=>{state.extra={};state.page=1;load();});
    if(!data.items.length){$('#list').innerHTML='<div class="empty">没有符合筛选条件的记录。</div>';return;}
    let html='';
    if(state.tab==='recordings') html=table(['录播 / 原始来源','日期与季度','版本','笔记 / 时轴',''],data.items.map(r=>`<tr><td class="title-cell"><button class="link" data-timeline="${esc(r.id)}">${esc(r.title)}</button><small>${esc(r.id)}　${esc(kinds[r.kind])}</small></td><td>${esc(r.live_date||r.published_date||'未知')}<small>${r.live_date?'录播日期':'投稿日期（录播日期未定）'}<br>${esc(qlabel(r.recording_quarter))}${r.program_quarter?'<br>节目季度 '+esc(qlabel(r.program_quarter)):''}</small></td><td><span class="pill ${r.danmaku==='unknown'?'warning':''}">${esc(danmaku[r.danmaku])}</span></td><td>${r.timeline_notes} 篇 / ${r.entry_count} 条<small>${r.pending_count} 条待核对</small></td><td><button data-edit="${esc(r.id)}">编辑</button></td></tr>`).join(''));
    if(state.tab==='entries')html=renderReview('entries',data.items,{preserve});
    if(state.tab==='works')html='<div class="cover-grid">'+data.items.map(w=>`<article class="work-card">${cover(w.cover_url)}<div><button class="link" data-edit="${esc(w.id)}">${esc(w.name)}</button><p>${esc(cats[w.category])} · ${w.category==='tv'?esc(qlabel(w.quarter)):'独立分类'}</p><p>${w.bangumi_id?external('https://bgm.tv/subject/'+w.bangumi_id,'Bangumi '+w.bangumi_id):'未关联 Bangumi'}</p><button class="link" data-work-entries="${esc(w.id)}">查看相关时轴 →</button></div></article>`).join('')+'</div>';
    if(state.tab==='aliases')html=renderSlang(data.items,{preserve});
    if(state.tab==='series')html=table(['系列名称','库内作品',''],data.items.map(s=>`<tr><td><button class="link" data-edit="${esc(s.id)}">${esc(s.name)}</button><small>${esc(s.id)}</small></td><td>${s.member_count} 部</td><td><button data-edit="${esc(s.id)}">编辑系列</button></td></tr>`).join(''));
    if(state.tab==='audit_log')html=renderHistory(data.items);
    $('#list').innerHTML=html;
    if(state.tab==='entries')wireReview();
    if(state.tab==='aliases')wireSlang();
    if(anchor)restoreAnchor(anchor);
    savePosition();
    $$('[data-edit]').forEach(b=>b.onclick=()=>edit(state.tab,b.dataset.edit));
    $$('[data-timeline]').forEach(b=>b.onclick=()=>navigate('entries',{recording:b.dataset.timeline}));
    $$('[data-work-entries]').forEach(b=>b.onclick=()=>navigate('entries',{work:b.dataset.workEntries}));
    $$('[data-undo]').forEach(b=>b.onclick=()=>busy(b,async()=>{await api('undo',{audit_id:Number(b.dataset.undo)});toast('已撤销，修改前后均已保留');await afterSave();}));
  }catch(error){$('#list').innerHTML=`<div class="empty error-text">${esc(error.message)}</div>`;}
}
async function busy(button,fn){button.disabled=true;try{await fn();}catch(error){toast(error.message,true);}finally{button.disabled=button.dataset.available==='false';}}
async function navigate(tab,extra={}){state={tab,page:1,extra};configureFilters();await load();}
function field(label,name,value,type='text'){return `<label class="field">${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${type==='number'?'step="any"':''}></label>`;}
function fieldSelect(label,name,values,value){return `<label class="field">${esc(label)}<select name="${name}">${selectOptions(values,value)}</select></label>`;}
function noteText(note){try{const raw=JSON.parse(note.content);return (Array.isArray(raw)?raw:raw?.ops||[]).map(o=>typeof o.insert==='string'?o.insert:o.insert?.tag?`\n[P${o.insert.tag.index} ${formatTime(o.insert.tag.seconds)}] `:'').join('');}catch{return note.content;}}
function saveBar(){return '<div class="save-bar"><input name="reason" placeholder="修改依据（选填）" aria-label="修改依据（选填）"><button class="primary" id="save">保存到数据库</button></div>';}
function reviewSummary(review){
  if(!review)return '';
  const evidence=JSON.parse(review.evidence),conflicts=evidence.csv_conflicts||[];
  return `<div class="detail-note">已按原笔记完成候选复核${review.context_kind==='retrospective'?' · 旧番回顾，参考 '+esc(qlabel(review.context_quarter)):''}。${conflicts.length?'笔记写明的作品与附近 CSV 有分歧，候选优先采用原文，CSV 原记录保留。':''}<details><summary>查看本段复核依据</summary><pre>${esc(JSON.stringify(evidence,null,2))}</pre></details></div>`;
}
function searchPanel(){return `<h3>搜索并添加作品</h3><div class="row"><input id="work-query" type="search" placeholder="作品名、别名或 Bangumi ID" aria-label="作品搜索"><select id="work-search-type" aria-label="搜索作品类型">${selectOptions({'':'全部类型',2:'动画',1:'书籍',4:'游戏',3:'音乐',6:'真人 / 特摄'})}</select></div><div class="row"><button type="button" id="local-search">搜索库内作品</button><button type="button" id="bgm-search">搜索 Bangumi</button></div><div id="work-results" class="search-results"></div><div class="row"><button type="button" id="search-more" hidden>下一页搜索结果</button><button type="button" id="manual-work">手工新建无 Bangumi ID 作品</button></div><div id="manual-form" hidden></div>`;}

async function edit(table,id){
  try{
    const data=await api('detail?'+new URLSearchParams({table,id}));current={table,data};
    $('#editor-title').textContent=table==='entries'?'核对时轴与作品':table==='recordings'?'编辑录播资料':table==='works'?'编辑作品资料':table==='series'?'编辑系列':'核对黑话与别名';
    const body=$('#editor-body');
    if(table==='entries'){
      selection=data.links.filter(l=>l.status!=='candidate').map(l=>({id:l.work_id,name:l.name,bangumi_id:l.bangumi_id,cover_url:l.cover_url}));
      body.innerHTML=`<form id="edit-form"><div class="editor-grid"><section><div class="evidence"><b>${esc(data.recording.title)}</b><br>${videoLink(data)} · ${esc(data.source_locator)}${data.note?'<br>'+esc(data.note.author)+' · '+external(data.note.url,'原始笔记'):''}</div>${reviewSummary(data.review)}${sourceSummary(data)}<label class="field">这段时轴的描述<textarea name="description">${esc(data.description)}</textarea></label><div class="row">${field('分 P','p',data.p,'number')}${field('开始（秒）','start',data.start,'number')}${field('结束（秒，可空）','end',data.end,'number')}</div>${fieldSelect('话题分类','category',topics,data.category)}<h4>已选择的作品（可多选）</h4><div id="selected-works"></div><h4>识别候选</h4><div id="candidate-works"></div><details><summary>对照附近 60 秒内的其他笔记 / CSV</summary>${data.nearby.filter(e=>e.id!==id).map(e=>`<p>${esc(e.source_locator)} · P${e.p} ${formatTime(e.start)}<br>${esc(e.description)}</p>`).join('')||'<p>暂无其他来源时点。</p>'}</details>${data.note?`<details><summary>查看完整原始笔记文字</summary><div class="note-text">${esc(noteText(data.note))}</div></details>`:''}${snapshotSource(data)}</section><section>${searchPanel()}</section></div>${saveBar()}</form>`;
      renderSelected();renderCandidates(data.links.filter(l=>l.status==='candidate'));wireSearch();
      $('[name=category]').onchange=()=>{if(['life','channel','general'].includes($('[name=category]').value)){selection=[];renderSelected();}};
    } else if(table==='recordings'){
      body.innerHTML=`<form id="edit-form"><div class="editor-grid"><section>${field('录播名称','title',data.title)}${fieldSelect('录播类型','kind',kinds,data.kind)}<div class="row">${field('录播日期（可空）','live_date',data.live_date,'date')}${field('投稿日期','published_date',data.published_date,'date')}</div>${field('节目讨论季度，如 2026-07（可空）','program_quarter',data.program_quarter)}${fieldSelect('有无弹幕版','danmaku',danmaku,data.danmaku)}<p class="muted">录播季度根据录播日期计算；日期未知时使用投稿日期并标明依据。</p><label class="field">录播说明<textarea name="description">${esc(data.description)}</textarea></label></section><section><h3>已读取的分 P</h3>${data.page_check?`<p class="detail-note">已核查原视频全部 ${data.page_check.page_count} 个分 P；依据名称中的“弹幕版”标记。<br>核查时间：${esc(new Date(data.page_check.checked_at).toLocaleString())}</p>`:""}${data.pages.length?tablePages(data.pages):'<div class="warning-box">现有资料未获取到分 P；弹幕版状态需人工核对。</div>'}<h4>对应笔记</h4>${data.notes.map(n=>`<p class="detail-note">${external(n.url,n.title||'原笔记')}<br>${esc(n.author)} · ${n.has_timeline?'有时轴':'无时轴，仅保留来源'}</p>`).join('')||'<p class="muted">暂无笔记。</p>'}${snapshotSource(data)}</section></div>${saveBar()}</form>`;
    } else if(table==='works'){
      body.innerHTML=`<form id="edit-form"><div class="editor-grid"><section><div class="mini-work">${cover(data.cover_url)}<div>${data.bangumi_id?external('https://bgm.tv/subject/'+data.bangumi_id,'Bangumi '+data.bangumi_id):'无 Bangumi ID 的手工作品'}<small>${esc(data.metadata_source)}</small></div></div>${field('作品名称','name',data.name)}${field('原名','original_name',data.original_name)}${fieldSelect('作品分类','category',cats,data.category)}<div class="row">${field('播出 / 发售日期','air_date',data.air_date,'date')}${field('TV 所属季度，如 2026-07','quarter',data.quarter)}</div>${field('平台 / 形式','platform',data.platform)}${field('封面 HTTPS 地址','cover_url',data.cover_url)}<label class="field">简介<textarea name="summary">${esc(data.summary)}</textarea></label><p class="muted">CSV 原始季度：${esc(data.csv_quarter||'无')}；非 TV 动画季度自动留空。</p></section><section><h3>作品别称与黑话</h3>${data.aliases.map(a=>`<p>${esc(a.term)}　${pill(a.status)}<small class="muted">${esc(a.scope||'全局')}</small></p>`).join('')||'<p class="muted">暂无别称。</p>'}${snapshotSource(data)}</section></div>${saveBar()}</form>`;
    } else if(table==='series'){
      renderSeriesForm(data);
    } else {
      const work=data.work_id?await api('detail?'+new URLSearchParams({table:'works',id:data.work_id})):null;
      body.innerHTML=`<form id="edit-form"><div class="editor-grid"><section>${field('关键词 / 别称','term',data.term)}${fieldSelect('状态','status',{pending:'待核对',confirmed:'确认采用',rejected:'排除该对应',reference:'保留为来源别名'},data.status)}${fieldSelect('指代类型','target_kind',{work:'具体作品',series:'整个系列'},data.target_kind)}${fieldSelect('对应系列','series_id',{'':'选择系列',...Object.fromEntries(options.series.map(s=>[s.id,s.name]))},data.series_id)}${field('适用范围：默认全局；限定时填写 BV 号','scope',data.scope)}<h4>对应的具体作品</h4><div id="alias-target">${work?esc(work.name):'泛指系列时无需选择单个作品'}</div><input name="work_id" type="hidden" value="${esc(data.work_id)}"><h4>关键词来源及时间判断</h4><pre>${esc(JSON.stringify(JSON.parse(data.evidence),null,2))}</pre><p class="muted">系列成员可在“系列管理”修改。系列简称按原文季数、回顾年份、节目季度和录播日期选择作品；结果仍需核对。</p></section><section>${searchPanel()}</section></div>${saveBar()}</form>`;
      wireSearch();
      $('[name=series_id]').onchange=()=>{if($('[name=series_id]').value)$('[name=target_kind]').value='series';};
    }
    $('#edit-form').onsubmit=saveEdit;
    if(!$('#editor').open)$('#editor').showModal();
  }catch(error){toast(error.message,true);}
}
function tablePages(pages){return table(['分 P','名称 / 版本','时长'],pages.map(p=>`<tr><td>P${p.p}</td><td>${esc(p.title)}<small>CID ${p.cid||'未知'}</small></td><td>${formatTime(p.duration)}</td></tr>`).join(''));}
function renderSeriesForm(data){
  selection=(data.work_details||[]).map(w=>({...w}));
  $('#editor-body').innerHTML=`<form id="edit-form"><div class="editor-grid"><section>${field('系列名称','name',data.name||'')}<h4>系列成员</h4><div id="selected-works"></div><p class="muted">加入各季、篇章及改编作品。具体日期在“作品资料”中修改；自动判断优先采用原文指定的类型，未指定时优先动画。</p>${data.evidence?'<details><summary>初始分组依据</summary><pre>'+esc(JSON.stringify(JSON.parse(data.evidence),null,2))+'</pre></details>':''}</section><section>${searchPanel()}</section></div>${saveBar()}</form>`;
  renderSelected();wireSearch();
}
function renderSelected(){
  const selected=$('#selected-works');if(!selected)return;
  selected.innerHTML=selection.map(w=>`<div class="mini-work selected">${cover(w.cover_url)}<div>${esc(w.name)}<small>${w.bangumi_id?external('https://bgm.tv/subject/'+w.bangumi_id,'#'+w.bangumi_id):'手工添加'}${current?.table==='series'?'<br>'+esc(cats[w.category]||'')+' · '+esc(w.air_date||'日期未知'):''}</small></div><button type="button" data-remove="${esc(w.id)}">移除</button></div>`).join('')||`<p class="muted">${current?.table==='series'?'搜索作品并加入这个系列。':'尚未选择作品。生活类话题可以单独分类。'}</p>`;
  $$('[data-remove]').forEach(b=>b.onclick=()=>{selection=selection.filter(w=>w.id!==b.dataset.remove);renderSelected();});
  const aliasWork=$('[name=alias_work]');if(aliasWork)aliasWork.innerHTML=selectOptions(Object.fromEntries(selection.map(w=>[w.id,w.name])));
}
function seriesMatchSummary(link){
  const labels={ten_year_quarter:'按旧番回顾季度判断',confirmed_alias:'采用已确认的黑话对应',latest_released:'按录播时已播出 / 发售的最近作品判断',quarter_preview:'按节目讨论季度判断',upcoming_preview:'按 PV / 预告及后续作品时间判断',explicit_member:'原文明确指定季数或篇章',recording_date_missing:'录播日期缺失，保留多个候选',retrospective_period_missing:'回顾季度缺少对应作品，保留待核对'};
  try{return JSON.parse(link.evidence).filter(e=>['series_time','review_name','review_fuzzy'].includes(e.kind)).map(e=>`<p class="detail-note">关键词「${esc(e.term)}」：${esc(labels[e.decision]||e.decision)}。<br>录播 ${esc(e.recording_date||'日期未知')}${e.work_date?' · 作品 '+esc(e.work_date):''}${e.target_quarter?' · 讨论季度 '+esc(qlabel(e.target_quarter)):''}${e.ambiguous?'<br>这是识别候选，仍需核对。':''}</p>`).join('');}catch{return '';}
}
function renderCandidates(links){
  $('#candidate-works').innerHTML=links.map((l,i)=>`<div class="mini-work">${cover(l.cover_url)}<div>${esc(l.name)}<small>${esc(cats[l.work_category])} · ${esc(qlabel(l.quarter))} · ${l.bangumi_id?external('https://bgm.tv/subject/'+l.bangumi_id,'#'+l.bangumi_id):''}</small>${seriesMatchSummary(l)}<details><summary>匹配依据</summary><pre>${esc(JSON.stringify(JSON.parse(l.evidence),null,2))}</pre></details></div><button type="button" data-candidate="${i}">选择</button></div>`).join('')||'<p class="muted">暂无候选，可在右侧手工搜索。</p>';
  $$('[data-candidate]').forEach(b=>b.onclick=()=>{const l=links[Number(b.dataset.candidate)];chooseWork({id:l.work_id,name:l.name,bangumi_id:l.bangumi_id,cover_url:l.cover_url});});
}
function chooseWork(work){
  if(current?.table==='entries'){
    if(!selection.some(w=>w.id===work.id))selection.push(work);
    $('[name=category]').value='work';renderSelected();toast('已选择作品，保存时轴后生效');
  }else if(current?.table==='series'){
    if(!selection.some(w=>w.id===work.id))selection.push(work);renderSelected();toast('已加入系列成员，保存后生效');
  }else if(current?.table==='aliases'){
    $('[name=work_id]').value=work.id;$('[name=target_kind]').value='work';$('#alias-target').textContent=work.name+' · '+(work.bangumi_id?'Bangumi '+work.bangumi_id:'手工作品');toast('已选择新的对应作品，保存后生效');
  }else{toast('作品已在库中');refreshStats();load();}
}
function wireSearch(){
  let remote=false,offset=0,lastQuery='',lastType='';
  async function search(isRemote,more=false){
    remote=isRemote;if(!more){offset=0;lastQuery=$('#work-query').value.trim();lastType=$('#work-search-type').value;}else offset+=20;
    if(!lastQuery)throw new Error('请输入作品名、别名或 Bangumi ID');
    $('#work-results').innerHTML='<p class="muted">正在搜索…</p>';$('#search-more').hidden=true;
    try{
      const result=await api(remote?'bangumi/search?'+new URLSearchParams({q:lastQuery,type:lastType,offset}):'works?'+new URLSearchParams({q:lastQuery}));
      const works=remote?(result.data||[]).map(s=>({id:s.id,name:s.name_cn||s.name,original_name:s.name,category:bangumiCategory(s),platform:s.platform,date:s.date,cover_url:s.images?.common||s.images?.large,bangumi_id:s.id})):result.items;
      $('#work-results').innerHTML=works.map((w,i)=>`<div class="mini-work">${cover(w.cover_url)}<div>${esc(w.name)}<small>${esc(w.original_name)}<br>${esc(cats[w.category]||'')} ${esc(w.platform||'')} · ${esc(w.date||w.air_date||'日期未知')}<br>${w.bangumi_id?external('https://bgm.tv/subject/'+w.bangumi_id,'Bangumi '+w.bangumi_id):'手工作品'}</small></div><button type="button" data-result="${i}">${remote?'入库并选择':'选择'}</button></div>`).join('')||'<p class="muted">未找到结果。可换一个全名、输入 Bangumi ID，或手工创建作品。</p>';
      $$('[data-result]').forEach(b=>b.onclick=()=>busy(b,async()=>{let w=works[Number(b.dataset.result)];if(remote)w=await api('bangumi/import',{id:w.bangumi_id});chooseWork(w);}));
      $('#search-more').hidden=!remote||offset+works.length>=result.total;
    }catch(error){$('#work-results').innerHTML=`<p class="error-text">${esc(error.message)}。可重试或使用库内搜索。</p>`;}
  }
  $('#local-search').onclick=()=>busy($('#local-search'),()=>search(false));
  $('#bgm-search').onclick=()=>busy($('#bgm-search'),()=>search(true));
  $('#search-more').onclick=()=>busy($('#search-more'),()=>search(remote,true));
  $('#work-query').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();busy($('#local-search'),()=>search(false));}};
  $('#manual-work').onclick=()=>{
    $('#manual-form').hidden=false;$('#manual-form').innerHTML=field('作品名称','manual_name',$('#work-query').value)+fieldSelect('作品分类','manual_category',cats,'other')+'<button type="button" id="create-manual">创建并选择</button>';
    $('#create-manual').onclick=()=>busy($('#create-manual'),async()=>{const w=await api('manual-work',{name:$('[name=manual_name]').value,category:$('[name=manual_category]').value});chooseWork(w);$('#manual-form').hidden=true;});
  };
}
async function saveEdit(event){
  event.preventDefault();const form=event.target;const fields=Object.fromEntries(new FormData(form));
  await busy($('#save'),async()=>{
    let patch;
    if(current.table==='entries')patch={description:fields.description,p:Number(fields.p),start:Number(fields.start),end:fields.end.trim()?Number(fields.end):null,category:fields.category,work_ids:selection.map(w=>w.id)};
    else if(current.table==='recordings')patch={title:fields.title,kind:fields.kind,live_date:fields.live_date||null,published_date:fields.published_date||null,program_quarter:fields.program_quarter||null,danmaku:fields.danmaku,description:fields.description};
    else if(current.table==='works')patch={name:fields.name,original_name:fields.original_name,category:fields.category,air_date:fields.air_date||null,quarter:fields.quarter||null,platform:fields.platform,cover_url:fields.cover_url,summary:fields.summary};
    else if(current.table==='series')patch={name:fields.name,work_ids:selection.map(w=>w.id)};
    else patch={term:fields.term,status:fields.status,scope:fields.scope.trim(),target_kind:fields.target_kind,work_id:fields.target_kind==='work'?fields.work_id:null,series_id:fields.target_kind==='series'?fields.series_id:null};
    if(current.table==='series'&&!current.data.id)await api('series',{...patch,reason:fields.reason});
    else await api('update',{table:current.table,id:current.data.id,revision:current.data.revision,reason:fields.reason,patch});
    $('#editor').close();toast('已保存到数据库，修改记录已保留');await afterSave();
  });
}

$$('[data-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.nav));
$('#filters').onsubmit=e=>{e.preventDefault();state.page=1;load();};
['#filter-a','#filter-quarter','#filter-extra'].forEach(q=>$(q).onchange=()=>{state.page=1;load();});
$('#clear').onclick=()=>navigate(state.tab);
$('#prev').onclick=()=>{state.page--;load();};$('#next').onclick=()=>{state.page++;load();};
$('#close-editor').onclick=()=>$('#editor').close();
$('#export').onclick=()=>busy($('#export'),async()=>{const r=await api('export',{});toast('已导出到 '+r.directory);});
$('#recognize').onclick=()=>busy($('#recognize'),async()=>{toast('正在提取关键词，并根据系列和时间重新生成候选…');const r=await api('recognize',{});toast(`已生成 ${r.candidate_links} 条候选关联；人工确认保持不变`);await afterSave();});
$('#add-work').onclick=()=>{if(state.tab==='series'){current={table:'series',data:{}};$('#editor-title').textContent='添加系列';renderSeriesForm({});$('#edit-form').onsubmit=saveEdit;$('#editor').showModal();return;}current=null;$('#editor-title').textContent='添加作品';$('#editor-body').innerHTML=searchPanel();wireSearch();$('#editor').showModal();};
const helpers={$,$$,esc,api,toast,busy,cats,topics,names,pill,cover,qlabel,videoLink,external,selectOptions,bangumiCategory,getOptions:()=>options,refreshStats,afterSave,edit};
configureReview(helpers);configureCollaboration(helpers);configureSlang(helpers);
$('#confirm-page').onclick=e=>busy(e.target,state.tab==='aliases'?confirmSlangPage:confirmPage);
let scrollTimer;window.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(savePosition,150);},{passive:true});
try{
  const saved=JSON.parse(sessionStorage.getItem('library-view')||'null');
  if(saved&&names[saved.tab])state={tab:saved.tab,page:saved.page||1,extra:saved.extra||{}};
  await refreshStats();configureFilters();
  if(saved?.tab===state.tab&&saved.filters){['#search','#filter-a','#filter-quarter','#filter-extra'].forEach((q,i)=>$(q).value=saved.filters[i]||'');}
  await load();if(saved)window.scrollTo(0,saved.scroll||0);
}catch(error){toast(error.message,true);} 
