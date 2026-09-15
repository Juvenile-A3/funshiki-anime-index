let h,groups=[],drafts=new Map(),expanded=new Set();
export function configureSlang(helpers){h=helpers;}
export function bgmLink(id){return id?`<a class="jump-link bangumi-jump" href="https://bgm.tv/subject/${h.esc(id)}" target="_blank" rel="noreferrer">查看 Bangumi ↗ <small>#${h.esc(id)}</small></a>`:'';}
function choices(g,d){
  return g.candidates.map(a=>`<div class="alias-choice ${d.selected.includes(a.id)?'chosen':''} ${a.status==='rejected'?'rejected-choice':''}"><label><input type="checkbox" data-alias-choice="${h.esc(a.id)}" ${d.selected.includes(a.id)?'checked':''}>${h.cover(a.cover_url)}<span><strong>${h.esc(a.target_kind==='series'?a.series_name:a.work_name)}</strong><small>${a.target_kind==='series'?'整个系列 · 按作品时间判断':h.esc(h.cats[a.work_category]||'具体作品')}${a.air_date?' · '+h.esc(a.air_date):''} · ${h.esc(a.scope||'全局')}</small>${h.pill(a.status)}</span></label><div class="alias-candidate-actions">${bgmLink(a.bangumi_id)}<button class="quiet" data-alias-edit="${h.esc(a.id)}">修改关键词 / 对象</button></div></div>`).join('');
}
export function renderSlang(data,{preserve=false}={}){
  const old=groups,previous=drafts;groups=data;drafts=new Map();
  if(!preserve)expanded.clear();
  return groups.map(g=>{
    let selected=g.candidates.filter(a=>a.status==='confirmed').map(a=>a.id);
    if(!selected.length&&g.candidates.filter(a=>a.status!=='rejected').length===1)selected=g.candidates.filter(a=>a.status!=='rejected').map(a=>a.id);
    let d={selected};if(preserve&&old.some(x=>x.id===g.id&&x.fingerprint===g.fingerprint))d=previous.get(g.id)||d;drafts.set(g.id,d);
    return `<article class="review-card slang-group" data-row="${h.esc(g.id)}"><header class="review-head"><h2>「${h.esc(g.term)}」</h2><span>${g.candidates.length} 个对应放在一起核对</span></header><p class="muted">勾选正确对象；保存时，其余待核对或已核对对象会标为排除。确实有多种含义时可多选。</p><div class="alias-candidates">${choices(g,d)}</div><div class="review-controls"><button class="primary" data-group-confirm>${selected.length===1&&g.candidates.length===1?'确认正确':'确认所选对应'}</button><button data-group-reject>这些对应都不对</button><span class="muted">游戏、小说、漫画和动画各自保留。</span></div><section class="group-correction"><p class="muted">搜索其他作品，或改为一个系列</p><div class="quick-search"><input data-slang-search type="search" placeholder="作品名、别名或 Bangumi ID" aria-label="黑话指代作品搜索"><select data-source aria-label="搜索来源"><option value="local">库内作品</option><option value="remote">Bangumi</option></select><select data-type aria-label="指代作品类型"><option value="">全部类型</option><option value="4">游戏</option><option value="1">小说 / 漫画 / 书籍</option><option value="2">动画</option><option value="3">音乐</option><option value="6">真人 / 特摄</option></select><button data-search-go>搜索</button></div><div data-slang-results></div><div class="row series-add"><label>整个系列 <select data-new-series>${h.selectOptions({'':'选择系列',...Object.fromEntries(h.getOptions().series.map(s=>[s.id,s.name]))})}</select></label><button data-series-add>加入候选一起判断</button></div></section><details class="occurrences" data-occurrences ${expanded.has(g.id)?'open':''}><summary>查看全部原文与录播时点 · 可逐条解绑</summary><div data-occurrence-body></div></details></article>`;
  }).join('');
}
function groupPayload(g){const d=drafts.get(g.id);if(!d.selected.length)throw Error(`「${g.term}」有多个或未确定的候选，请勾选正确对象；全都不对可直接排除。`);return {normalized:g.normalized,fingerprint:g.fingerprint,selected_ids:d.selected};}
export async function confirmSlangPage(){
  const pending=groups.filter(g=>g.status==='pending');if(!pending.length)throw Error('本页没有待核对的黑话组');
  let payload;
  try{payload=pending.map(groupPayload);}catch(error){const g=pending.find(g=>!drafts.get(g.id).selected.length);h.$$('[data-row]').find(x=>x.dataset.row===g.id)?.scrollIntoView({block:'center'});throw error;}
  const result=await h.api('confirm-alias-groups',{groups:payload});h.toast(`已确认 ${result.confirmed} 组黑话`);await h.afterSave();
}
export function wireSlang(){
  const {$,$$,api,busy,esc,toast}=h;
  for(const card of $$('.slang-group')){
    const g=groups.find(x=>x.id===card.dataset.row),d=drafts.get(g.id);
    $$('[data-alias-choice]',card).forEach(x=>x.onchange=()=>{d.selected=$$('[data-alias-choice]:checked',card).map(c=>c.dataset.aliasChoice);x.closest('.alias-choice').classList.toggle('chosen',x.checked);});
    $$('[data-alias-edit]',card).forEach(x=>x.onclick=()=>h.edit('aliases',x.dataset.aliasEdit));
    $('[data-group-confirm]',card).onclick=e=>busy(e.target,async()=>{await api('confirm-alias-groups',{groups:[groupPayload(g)]});toast('同一黑话的候选已一并保存');await h.afterSave();});
    $('[data-group-reject]',card).onclick=e=>busy(e.target,async()=>{await api('confirm-alias-groups',{groups:[{normalized:g.normalized,fingerprint:g.fingerprint,selected_ids:[],reject_all:true}]});toast('已排除这组候选');await h.afterSave();});
    let seq=0,debounce;
    async function search(){
      const q=$('[data-slang-search]',card).value.trim(),remote=$('[data-source]',card).value==='remote',type=$('[data-type]',card).value,request=++seq;
      if(!q){$('[data-slang-results]',card).innerHTML='';return;}
      $('[data-slang-results]',card).innerHTML='<p class="muted">正在搜索…</p>';
      try{
        const result=await api((remote?'bangumi/search':'works')+'?'+new URLSearchParams({q,type}));if(request!==seq||!card.isConnected)return;
        const works=remote?(result.data||[]).map(w=>({id:w.id,name:w.name_cn||w.name,bangumi_id:w.id,category:h.bangumiCategory(w),cover_url:w.images?.common,air_date:w.date})):result.items;
        $('[data-slang-results]',card).innerHTML=works.slice(0,20).map((w,i)=>`<div class="mini-work">${h.cover(w.cover_url)}<div><strong>${esc(w.name)}</strong><small>${esc(h.cats[w.category]||'')} · ${esc(w.air_date||'日期未知')}</small>${bgmLink(w.bangumi_id)}</div><button data-add-alias="${i}">加入候选一起判断</button></div>`).join('')||'<p class="muted">未找到作品，可切换 Bangumi 或换一个关键词。</p>';
        $$('[data-add-alias]',card).forEach(b=>b.onclick=()=>busy(b,async()=>{let w=works[Number(b.dataset.addAlias)];if(remote)w=await api('bangumi/import',{id:w.bangumi_id});await api('alias',{term:g.term,work_id:w.id,target_kind:'work',status:'pending'});toast('已加入这组黑话的候选，请勾选并确认');await h.afterSave();}));
      }catch(error){$('[data-slang-results]',card).innerHTML=`<p class="error-text">${esc(error.message)}</p>`;}
    }
    $('[data-search-go]',card).onclick=e=>busy(e.target,search);
    $('[data-slang-search]',card).oninput=()=>{clearTimeout(debounce);++seq;if($('[data-source]',card).value==='local')debounce=setTimeout(search,450);};
    $('[data-slang-search]',card).onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(debounce);search();}};
    $('[data-source]',card).onchange=()=>{++seq;$('[data-slang-results]',card).innerHTML='';};
    $('[data-series-add]',card).onclick=e=>busy(e.target,async()=>{const sid=$('[data-new-series]',card).value;if(!sid)throw Error('请先选择系列');await api('alias',{term:g.term,target_kind:'series',series_id:sid,status:'pending'});toast('系列已加入这组候选');await h.afterSave();});
    const details=$('[data-occurrences]',card),body=$('[data-occurrence-body]',card);let loaded=false;
    async function showOccurrences(){
      if(loaded)return;loaded=true;body.innerHTML='<p>正在读取全部原文…</p>';
      try{
        const r=await api('alias-occurrences?'+new URLSearchParams({term:g.normalized}));
        function render(){
          body.innerHTML=`<p class="occurrence-count">共 ${r.total} 条原文；${r.items.filter(x=>x.excluded).length} 条已解绑。解绑不删除笔记，也不改变人工确认过的作品。</p><div class="occurrence-list">${r.items.map((x,i)=>`<article class="occurrence ${x.excluded?'excluded-occurrence':''}" data-occurrence-row="${i}"><div class="row">${h.videoLink(x)}<button data-toggle-occurrence="${i}">${x.excluded?'恢复关联':'解绑此原文'}</button><span class="pill">${x.excluded?'已解绑':x.current_match?'参与识别':'历史原文 / 证据'}</span></div><p class="occurrence-text">${esc(x.original_description||x.description)}</p>${x.original_description!==x.description?'<p class="muted">当前描述：'+esc(x.description)+'</p>':''}<p class="muted">${esc(x.recording_title)}<br>${esc(x.source_locator)}${x.author?' · '+esc(x.author):''} ${h.external(x.note_url,'打开原笔记')}</p></article>`).join('')||'<p>没有匹配的时轴原文。</p>'}</div>`;
          $$('[data-toggle-occurrence]',body).forEach(b=>b.onclick=()=>busy(b,async()=>{
            const i=Number(b.dataset.toggleOccurrence),x=r.items[i],position=$('.occurrence-list',body).scrollTop;
            const saved=await api('alias-occurrence',{entry_id:x.id,term:g.term,excluded:!x.excluded,revision:x.exclusion_revision});
            x.excluded=!!saved.excluded;x.exclusion_revision=saved.revision;render();$('.occurrence-list',body).scrollTop=position;
            toast(x.excluded?'已解绑：这一段不再通过此黑话识别':'已恢复这一段与黑话的关联');await h.refreshStats();
          }));
        }
        render();
      }catch(error){loaded=false;body.innerHTML=`<p class="error-text">${esc(error.message)}，收起后可重新展开。</p>`;}
    }
    details.ontoggle=()=>{if(details.open){expanded.add(g.id);showOccurrences();}else expanded.delete(g.id);};if(details.open)showOccurrences();
  }
}
