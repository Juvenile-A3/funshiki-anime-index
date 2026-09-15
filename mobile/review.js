// The two review queues share search controls, but save independent decisions.
let h, items=[], table='', drafts=new Map();
export function configureReview(helpers){h=helpers;}
const parse=v=>{try{return JSON.parse(v);}catch{return {};}};
export function sourceSummary(e){
  const {esc}=h,s=e.source_health;
  if(!s)return '';
  const text=[...s.attention,...s.notes].join('；');
  return text?`<p class="source-status ${s.level==='attention'?'attention':''}">${esc(text)}</p>`:'';
}
function searchBox(){return `<div class="quick-search"><input type="search" data-search placeholder="搜索作品名、别称或 Bangumi ID" aria-label="修正作品搜索"><select data-search-source aria-label="搜索范围"><option value="local">库内作品</option><option value="remote">Bangumi</option></select><select data-search-type aria-label="作品类型"><option value="">全部类型</option><option value="2">动画</option><option value="1">书籍</option><option value="4">游戏</option><option value="3">音乐</option><option value="6">真人 / 特摄</option></select><button data-search-button>搜索</button></div><div data-results class="inline-results"></div>`;}
function choices(e,d){
  const {esc,cover,cats,qlabel,external}=h;
  return d.works.map(w=>`<div class="work-choice ${d.ids.includes(w.work_id)?'chosen':''}"><label><input type="checkbox" data-choice="${esc(w.work_id)}" ${d.ids.includes(w.work_id)?'checked':''}>${cover(w.cover_url)}<span><strong>${esc(w.name)}</strong><small>${esc(cats[w.work_category||w.category]||'')} · ${esc(w.quarter?qlabel(w.quarter):'非 TV / 季度未定')}</small></span></label>${w.bangumi_id?external('https://bgm.tv/subject/'+w.bangumi_id,'#'+w.bangumi_id):''}</div>`).join('')||'<p class="muted">暂无作品候选。可直接搜索，或选择生活杂谈等分类。</p>';
}
function evidence(a){
  const {esc}=h,v=parse(a.evidence),list=Array.isArray(v)?v:[v];
  const examples=list.flatMap(x=>[x.description,x.original_text,x.text,x.source_text,...(x.examples||[]).map(y=>typeof y==='string'?y:y.description||y.original_text||y.text)]).filter(Boolean);
  return examples.length?`<p class="alias-example">原文：${esc([...new Set(examples)].slice(0,3).join(' ／ '))}</p>`:'';
}
export function renderReview(kind,data,{preserve=false}={}){
  const oldItems=items,oldDrafts=drafts,oldTable=table;
  table=kind;items=data;drafts=new Map();
  const {esc,pill,topics,videoLink,external,selectOptions,getOptions}=h;
  return data.map(e=>{
    if(kind==='entries'){
      const linked=e.links.filter(w=>w.status!=='candidate'),candidates=e.links.filter(w=>w.status==='candidate');
      let d={category:e.category,ids:linked.map(w=>w.work_id),works:[...e.links]};
      if(!d.ids.length&&candidates.length===1&&!['life','channel','general'].includes(e.category))d.ids=[candidates[0].work_id];
      if(!linked.length&&e.confidence==='high')d.ids=[e.confidence_work_id];
      if(d.ids.length)d.category='work';
      if(preserve&&oldTable===kind&&oldItems.some(x=>x.id===e.id&&x.revision===e.revision))d=oldDrafts.get(e.id)||d;
      drafts.set(e.id,d);
      return `<article class="review-card" data-row="${esc(e.id)}"><header class="review-head"><div>${pill(e.status)} ${e.confidence==='high'?'<span class="pill high">高可信度 · 已确认黑话唯一对应</span>':''}${e.context_kind==='retrospective'?'<span class="pill">旧番回顾</span>':''}</div><span>${videoLink(e)}</span></header><h2 class="entry-description">${esc(e.description||'（原时点无文字）')}</h2><p class="recording-context">${external('https://www.bilibili.com/video/'+e.recording_id,e.recording_title)}<br>${esc(e.source_locator)}${e.author?' · '+esc(e.author):''}</p>${sourceSummary(e)}<div class="work-choices" data-choices>${choices(e,d)}</div><div class="review-controls"><label>话题分类 <select data-category>${selectOptions(topics,d.category)}</select></label><button class="primary" data-confirm>${e.status==='pending'?'确认正确':'保存修正'}</button><button class="quiet" data-edit="${esc(e.id)}">完整编辑 / 原笔记</button><span data-hint class="muted">${candidates.length>1&&!linked.length?'有多个候选，请勾选实际谈及的作品。':'可勾选多个作品；修改依据选填。'}</span></div>${searchBox()}</article>`;
    }
    let d={term:e.term,target_kind:e.target_kind,work_id:e.work_id,series_id:e.series_id,scope:e.scope};
    if(preserve&&oldTable===kind&&oldItems.some(x=>x.id===e.id&&x.revision===e.revision))d=oldDrafts.get(e.id)||d;
    drafts.set(e.id,d);e={...e,...d};
    return `<article class="review-card alias-card" data-row="${esc(e.id)}"><header class="review-head"><div>${pill(e.status)} <span class="pill">${esc(e.scope||'全局')}</span></div><button class="quiet" data-edit="${esc(e.id)}">完整编辑 / 来源</button></header><div class="alias-fields"><label>黑话关键词<input data-term value="${esc(e.term)}"></label><label>指代类型<select data-target-kind>${selectOptions({work:'具体作品',series:'整个系列'},e.target_kind)}</select></label><label data-series-field ${e.target_kind==='series'?'':'hidden'}>对应系列<select data-series>${selectOptions({'':'选择系列',...Object.fromEntries(getOptions().series.map(s=>[s.id,s.name]))},e.series_id)}</select></label></div><p class="alias-target" data-target-name>${esc(e.target_kind==='series'?e.series_name:e.work_name)}${e.bangumi_id?' · '+external('https://bgm.tv/subject/'+e.bangumi_id,'Bangumi '+e.bangumi_id):''}</p>${evidence(e)}<div class="review-controls"><button class="primary" data-confirm>${e.status==='pending'?'确认正确':'保存修正'}</button><button data-reject>不是这个对应</button><span class="muted">默认全局。系列黑话按录播与作品时间选择具体作品。</span></div>${searchBox()}</article>`;
  }).join('');
}
function entryPatch(d){
  if(d.category==='unclassified'||(d.category==='work'&&!d.ids.length))throw Error('请先选择对应作品，或选择生活杂谈等分类');
  return {category:d.category,work_ids:d.category==='work'?d.ids:[]};
}
function aliasPatch(d){
  if(!d.term.trim()||!(d.target_kind==='work'?d.work_id:d.series_id))throw Error('请填写关键词并选择对应作品或系列');
  return {...d,term:d.term.trim(),work_id:d.target_kind==='work'?d.work_id:null,series_id:d.target_kind==='series'?d.series_id:null,status:'confirmed'};
}
async function confirmOne(e,d){
  await h.api('update',{table,id:e.id,revision:e.revision,patch:table==='entries'?entryPatch(d):aliasPatch(d)});
  h.toast('已确认并保存');await h.afterSave();
}
export function wireReview(){
  const {$,$$,api,busy,esc,cover,cats,external,toast}=h;
  for(const card of $$('[data-row]')){
    const e=items.find(x=>x.id===card.dataset.row),d=drafts.get(e.id);
    function wireChoices(){
      $$('[data-choice]',card).forEach(b=>b.onchange=()=>{
        d.ids=$$('[data-choice]:checked',card).map(x=>x.dataset.choice);if(d.ids.length)d.category='work';
        $('[data-category]',card).value=d.category;b.closest('.work-choice').classList.toggle('chosen',b.checked);
      });
    }
    if(table==='entries'){
      wireChoices();$('[data-category]',card).onchange=ev=>{d.category=ev.target.value;if(d.category!=='work'){d.ids=[];$$('[data-choice]',card).forEach(x=>{x.checked=false;x.closest('.work-choice').classList.remove('chosen');});}};
    }else{
      $('[data-term]',card).oninput=ev=>d.term=ev.target.value;
      $('[data-target-kind]',card).onchange=ev=>{d.target_kind=ev.target.value;$('[data-series-field]',card).hidden=d.target_kind!=='series';$('[data-target-name]',card).textContent=d.target_kind==='series'?(h.getOptions().series.find(s=>s.id===d.series_id)?.name||'请选择系列'):(e.work_name||'搜索具体作品');};
      $('[data-series]',card).onchange=ev=>{d.series_id=ev.target.value;$('[data-target-name]',card).textContent=h.getOptions().series.find(s=>s.id===d.series_id)?.name||'请选择系列';};
      $('[data-reject]',card).onclick=ev=>busy(ev.target,async()=>{await api('update',{table,id:e.id,revision:e.revision,patch:{status:'rejected'}});toast('已排除该对应');await h.afterSave();});
    }
    $('[data-confirm]',card).onclick=ev=>busy(ev.target,()=>confirmOne(e,d));
    let seq=0,debounce;
    async function search(){
      const q=$('[data-search]',card).value.trim(),request=++seq,remote=$('[data-search-source]',card).value==='remote',type=$('[data-search-type]',card).value;
      if(!q){$('[data-results]',card).innerHTML='';return;}
      $('[data-results]',card).innerHTML='<p class="muted">正在搜索…</p>';
      try{
        const r=await api((remote?'bangumi/search':'works')+'?'+new URLSearchParams({q,type}));if(request!==seq||!card.isConnected)return;
        const works=remote?(r.data||[]).map(w=>({id:w.id,name:w.name_cn||w.name,bangumi_id:w.id,cover_url:w.images?.common,air_date:w.date,category:h.bangumiCategory(w)})):r.items;
        $('[data-results]',card).innerHTML=works.slice(0,20).map((w,i)=>`<div class="mini-work">${cover(w.cover_url)}<div><strong>${esc(w.name)}</strong><small>${esc(cats[w.category]||'')} · ${esc(w.air_date||'日期未知')}${w.bangumi_id?' · '+external('https://bgm.tv/subject/'+w.bangumi_id,'Bangumi '+w.bangumi_id):''}</small></div><button data-pick="${i}">${remote?'入库并':'采用并'}确认</button>${table==='entries'?`<button data-add="${i}">加入多选</button>`:''}</div>`).join('')||'<p class="muted">没有结果。可换词、切换 Bangumi，或在完整编辑中创建无 ID 的作品。</p>';
        for(const button of $$('[data-pick], [data-add]',card))button.onclick=()=>busy(button,async()=>{
          let w=works[Number(button.dataset.pick??button.dataset.add)];if(remote)w=await api('bangumi/import',{id:w.bangumi_id});
          if(table==='entries'){
            if(button.hasAttribute('data-add')){if(!d.works.some(x=>x.work_id===w.id))d.works.push({...w,work_id:w.id});if(!d.ids.includes(w.id))d.ids.push(w.id);d.category='work';$('[data-category]',card).value='work';$('[data-choices]',card).innerHTML=choices(e,d);wireChoices();return;}
            d.ids=[w.id];d.category='work';
          }else{d.work_id=w.id;d.target_kind='work';}
          await confirmOne(e,d);
        });
      }catch(error){if(request===seq)$('[data-results]',card).innerHTML=`<p class="error-text">${esc(error.message)}</p>`;}
    }
    $('[data-search-button]',card).onclick=ev=>busy(ev.target,search);
    $('[data-search]',card).oninput=()=>{clearTimeout(debounce);++seq;if($('[data-search-source]',card).value==='local')debounce=setTimeout(search,450);};
    $('[data-search]',card).onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();clearTimeout(debounce);search();}};
    $('[data-search-source]',card).onchange=()=>{++seq;$('[data-results]',card).innerHTML='';};
  }
}
export async function confirmPage(){
  const pending=items.filter(e=>e.status==='pending');if(!pending.length)throw Error('本页没有待核对条目');
  // Validate all drafts before any request. Alias edits use one atomic batch too.
  const data=pending.map((e,i)=>{
    try{return {id:e.id,revision:e.revision,...(table==='entries'?entryPatch(drafts.get(e.id)):{patch:aliasPatch(drafts.get(e.id))})};}
    catch(error){const card=h.$$('[data-row]').find(x=>x.dataset.row===e.id);card?.scrollIntoView({block:'center'});h.$('[data-search]',card)?.focus({preventScroll:true});throw Error(`第 ${i+1} 条「${(e.description||e.term).slice(0,30)}」：${error.message}；本页尚未保存。`);}
  });
  const result=await h.api('confirm-batch',{table,items:data});h.toast(`已确认本页 ${result.confirmed} 条记录`);await h.afterSave();
}
export function renderHistory(data){
  const {esc,names}=h;
  return data.map(a=>`<article class="review-card history-card" data-history="${a.id}"><header class="review-head"><strong>${esc(a.summary.action)} · ${esc(names[a.entity]||a.entity)}</strong><span>${esc(a.actor)} · ${esc(new Date(a.at).toLocaleString())}${a.origin==='collaboration'?' · 协作合并':''}</span></header><h3>${esc(a.summary.title)}</h3>${a.summary.context?'<p class="muted">'+esc(a.summary.context)+'</p>':''}<div class="change-list">${a.summary.diff.map(d=>`<div class="change-row"><b>${esc(d.label)}</b><del>${esc(d.before)}</del><span aria-label="改为">→</span><ins>${esc(d.after)}</ins></div>`).join('')||'<p>已保存核对操作。</p>'}</div>${a.reason?'<p>备注：'+esc(a.reason)+'</p>':''}<div class="row">${a.before_json?`<button data-undo="${a.id}">撤销这次修改</button>`:''}<details><summary>原始记录</summary><pre>${esc(JSON.stringify({before:a.before_json?parse(a.before_json):null,after:parse(a.after_json)},null,2))}</pre></details></div></article>`).join('');
}
