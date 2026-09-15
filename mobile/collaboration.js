let h;
export function configureCollaboration(helpers){h=helpers;}
export async function showCollaboration(){
  const {$,$$,esc,api,busy,toast}=h,status=await api('collaboration/status');
  $('#list').innerHTML=`<section class="review-card"><h2>各自编辑，再合并修改</h2><p>把协作包发给朋友；每个人在自己的电脑、安卓手机或 iPad 上整理，完成后交换 JSON 修改包。合并前会展示变更和冲突。</p><label class="field">修改记录中的名字<input id="collaborator" maxlength="80" placeholder="你的名字或昵称" value="${esc(localStorage.getItem('library-actor')||'')}"></label><p class="muted">${status.received_bundle?'这份资料库来自协作包，导出范围从 '+esc(new Date(status.base_at).toLocaleString())+' 开始。':'主资料库：导出我的修改会包括现有人工修改；分享协作包会建立新的协作起点。'}</p><div class="collab-actions"><section><span class="step-number">1</span><h3>分享数据库和操作面板</h3><p>生成包含当前数据库、笔记原文和整理台的 ZIP。电脑版解压后使用 Python 3.12+ 启动；手机版在网页入口导入 ZIP，无需解压。</p><div class="row"><button class="primary" id="share-bundle">生成电脑协作包</button><button id="share-mobile">生成手机 / iPad 数据包</button></div><p class="mobile-help">手机 / iPad：打开 <a href="https://funshiki-anime-index.cn/mobile/" id="mobile-entry" target="_blank" rel="noreferrer">随身整理台 ↗</a>，导入数据包，编辑后导出修改。数据仅保存在各自设备；建议定期导出恢复包。</p><div id="bundle-download"></div></section><section><span class="step-number">2</span><h3>编辑完成，发回修改</h3><p>只导出人工修改及所需的新作品、系列资料。对方的修改通过下方预览后合并。</p><button id="export-changes">导出我的修改</button><div id="changes-download"></div></section></div></section><section class="review-card"><h2>导入修改包</h2><p>选择对方发来的 JSON 文件。不同字段的修改自动合并，同一字段的不同修改由你选择。合并前自动备份本机数据库。</p><input id="import-changes" type="file" accept=".json,application/json" aria-label="选择 JSON 修改包"><div id="merge-preview"></div></section>`;
  $('#collaborator').oninput=e=>localStorage.setItem('library-actor',e.target.value.trim());
  $('#share-bundle').onclick=e=>busy(e.target,async()=>{const r=await api('collaboration/share',{});$('#bundle-download').innerHTML=`<p><a class="download-link" href="${r.download_url||'/api/download?name='+encodeURIComponent(r.filename)}" download="${esc(r.filename)}">下载协作包 · ${(r.bytes/1024/1024).toFixed(1)} MB</a></p>`;toast('协作包已生成');});
  $('#export-changes').onclick=e=>busy(e.target,async()=>{const r=await api('collaboration/export',{});$('#changes-download').innerHTML=`<p><a class="download-link" href="${r.download_url||'/api/download?name='+encodeURIComponent(r.filename)}" download="${esc(r.filename)}">下载我的修改 · ${r.changes} 条</a></p>`;toast(`已导出 ${r.changes} 条修改`);});
  $('#share-mobile').onclick=e=>busy(e.target,async()=>{const r=await api('collaboration/share',{client:'browser'});$('#bundle-download').innerHTML=`<p><a class="download-link" href="${r.download_url||'/api/download?name='+encodeURIComponent(r.filename)}" download="${esc(r.filename)}">下载手机 / iPad 数据包 · ${(r.bytes/1024/1024).toFixed(1)} MB</a></p>`;toast('手机 / iPad 数据包已生成');});
  if(globalThis.libraryLocalApi){$('#share-bundle').hidden=true;$('#mobile-entry').href=new URL('./',location.href).href;}
  let packageData,preview;
  async function renderPreview(){
    preview=await api('collaboration/preview',{package:packageData});
    const c=preview.counts;
    $('#merge-preview').innerHTML=`<div class="merge-summary"><h3>${esc(preview.author)} 的修改</h3><p>可直接合并 ${c.merge} 条 · 新增 ${c.new} 条 · 有冲突 ${c.conflict} 条 · 已相同 ${c.unchanged} 条</p></div>${preview.items.filter(x=>x.status!=='unchanged').map((x,i)=>`<article class="merge-item"><h4>${esc(x.title)} <span class="pill ${x.status==='conflict'?'warning':''}">${({merge:'可合并',new:'新增',conflict:'需要选择'})[x.status]}</span></h4>${x.diff.map(d=>`<div class="change-row"><b>${esc(d.label)}</b><del>${esc(d.before)}</del><span>→</span><ins>${esc(d.after)}</ins></div>`).join('')}${x.conflicts.map(f=>`<fieldset class="merge-conflict"><legend>${esc(f.label)} · 双方都改过</legend><p class="muted">共同原值：${esc(f.base)}</p><label><input type="radio" name="choice-${i}-${esc(f.field)}" data-key="${esc(x.table+':'+x.id)}" data-field="${esc(f.field)}" value="local">保留本机：${esc(f.local)}</label><label><input type="radio" name="choice-${i}-${esc(f.field)}" data-key="${esc(x.table+':'+x.id)}" data-field="${esc(f.field)}" value="remote">采用对方：${esc(f.remote)}</label></fieldset>`).join('')}</article>`).join('')}<div class="review-controls"><button class="primary" id="apply-merge" ${!c.merge&&!c.new&&!c.conflict?'disabled':''}>合并预览中的修改</button><button id="refresh-preview">重新预览</button><span class="muted">未选择的冲突会保留待处理，其余修改正常合并。</span></div>`;
    $('#refresh-preview').onclick=e=>busy(e.target,renderPreview);
    $('#apply-merge').onclick=e=>busy(e.target,async()=>{
      const choices={};$$('[data-key]:checked').forEach(x=>{(choices[x.dataset.key]??={})[x.dataset.field]=x.value;});
      const r=await api('collaboration/apply',{package:packageData,fingerprint:preview.fingerprint,choices});
      toast(`已合并 ${r.merged} 条修改，补入 ${r.dependencies_added} 条依赖资料；${r.skipped_conflicts} 条冲突待处理`);await h.refreshStats();await renderPreview();
    });
  }
  $('#import-changes').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    try{if(file.size>32_000_000)throw Error('修改包不能超过 32 MB');packageData=JSON.parse(await file.text());$('#merge-preview').innerHTML='<p>正在核对修改包…</p>';await renderPreview();}
    catch(error){$('#merge-preview').innerHTML=`<p class="error-text">${esc(error.message)}</p>`;}
  };
}
