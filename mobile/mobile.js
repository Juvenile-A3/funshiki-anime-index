import {database,stored} from './storage.js';
const $=s=>document.querySelector(s),status=$('#mobile-status'),saveState=$('#mobile-save-state');
const worker=new Worker('/mobile/worker.js');let seq=0,db,active,started=false,apiQueue=Promise.resolve(),offlineReady=false;
const pending=new Map();
function call(kind,data={}){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});worker.postMessage({id,kind,...data});});}
worker.onmessage=({data:m})=>{const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.value);};
worker.onerror=()=>{for(const p of pending.values())p.reject(Error('整理引擎已停止，请重新打开；已显示保存成功的修改仍在本机。'));pending.clear();};
function error(e){status.textContent=e.message||String(e);status.className='error-text';saveState.textContent='操作未完成：'+(e.message||e);}
function download(bytes,name,type){const url=URL.createObjectURL(new Blob([bytes],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.textContent='下载 '+name;return a;}
async function saveBytes(bytes){await stored(db,'put',{...active,bytes,updated_at:new Date().toISOString()});active={...active,bytes};}
async function prepareOffline(){
  if(!('serviceWorker' in navigator))return;
  try{await navigator.serviceWorker.register('/mobile/sw.js');await navigator.serviceWorker.ready;offlineReady=true;saveState.textContent='离线准备完成 · 数据仅存本机';}
  catch{saveState.textContent='本机保存可用；离线准备未完成，请保持联网后重开网页';}
}
async function openPackage(record){
  active=record;status.textContent='正在读取本机资料库…';await call('open',{bytes:record.bytes});
  localStorage.setItem('funshiki-mobile-active',record.id);
  document.body.classList.remove('mobile-loading');$('#mobile-start').hidden=true;$('#mobile-bar').hidden=false;
  saveState.textContent=offlineReady?'离线准备完成 · 数据仅存本机':'数据仅存本机 · 正在准备离线';
  if(!started){started=true;document.querySelectorAll('[data-nav]').forEach(b=>b.disabled=true);await import('./app.js');document.querySelectorAll('[data-nav]').forEach(b=>b.disabled=false);$('.sidebar-bottom').innerHTML='<span class="dot"></span> 当前设备 · 保存即入库<p>在“协作与合并”导出修改。<br>定期保存恢复包，保留全部编辑进度。</p>';}
  else location.reload();
}
async function savedPackages(){
  const records=await stored(db,'getAll');const box=$('#mobile-saved');box.replaceChildren();
  for(const r of records.sort((a,b)=>b.updated_at.localeCompare(a.updated_at))){const b=document.createElement('button');b.textContent='继续本机资料 · '+new Date(r.created_at).toLocaleString()+' · 最近保存 '+new Date(r.updated_at).toLocaleString();b.onclick=()=>openPackage(r).catch(error);box.append(b);}
}
async function importZip(file){
  if(file.size>50_000_000)throw Error('协作 ZIP 不能超过 50 MB');status.textContent='正在检查并导入协作包…';
  const manifest=await call('import',{bytes:await file.arrayBuffer()});
  const id=manifest.library_id+':'+manifest.package_id+(manifest.resume?':resume:'+Date.now():''),existing=await stored(db,'get',id);
  if(existing){status.textContent='该协作包已导入，继续现有编辑进度。';return openPackage(existing);}
  const bytes=await call('imported-bytes'),record={id,bytes,created_at:manifest.created_at||new Date().toISOString(),updated_at:new Date().toISOString()};
  await stored(db,'put',record);await navigator.storage?.persist?.();return openPackage(record);
}
async function bangumi(path,body){
  const [endpoint,search='']=path.split('?'),q=new URLSearchParams(search);let url,init;
  if(endpoint==='bangumi/import'||/^\d+$/.test(q.get('q')||'')){const id=endpoint==='bangumi/import'?body.id:q.get('q');if(!/^\d+$/.test(String(id)))throw Error('Bangumi ID 应为数字');url='https://api.bgm.tv/v0/subjects/'+id;}
  else{url='https://api.bgm.tv/v0/search/subjects?limit=20&offset='+(Number(q.get('offset'))||0);init={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keyword:q.get('q'),sort:'match',filter:q.get('type')?{type:[Number(q.get('type'))]}:{}})};}
  const r=await fetch(url,{...init,credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(25000)}).catch(()=>{throw Error('Bangumi 连接失败。可先用库内搜索，联网后重试。');});
  if(!r.ok)throw Error('Bangumi 暂时无法查询（'+r.status+'）');return r.json();
}
globalThis.libraryLocalApi=(path,body)=>{
  const task=async()=>{
    const mutates=body!==undefined&&!['collaboration/preview','collaboration/export','collaboration/share','export'].includes(path);
    const remote=path.startsWith('bangumi/')?await bangumi(path,body):undefined;
    if(mutates)saveState.textContent='正在处理并保存到本机，请稍候…';
    const result=await call('request',{path,body,remote});
    if(mutates){
      try{await saveBytes(await call('bytes'));saveState.textContent='已保存到本机 · '+new Date().toLocaleTimeString();}
      catch(e){await call('open',{bytes:active.bytes});saveState.textContent='本机空间不足或存储失败，本次修改未保存';throw Error('本机存储失败，已撤回本次修改。请导出恢复包后检查设备可用空间。');}
    }
    if(result?.filename){const bytes=await call('request',{path:'download?name='+encodeURIComponent(result.filename)});result.download_url=download(bytes,result.filename,result.filename.endsWith('.zip')?'application/zip':'application/json').href;}
    return result;
  };
  const result=apiQueue.then(task);apiQueue=result.catch(()=>{});return result;
};
$('#mobile-packages').onclick=async()=>{await apiQueue;document.body.classList.add('mobile-loading');$('#mobile-start').hidden=false;$('#mobile-bar').hidden=true;status.textContent='选择本机资料或导入另一份协作包。现有编辑进度会保留。';await savedPackages();};
$('#mobile-backup').onclick=async()=>{
  const b=$('#mobile-backup');b.disabled=true;
  try{await apiQueue;const bytes=await call('backup'),a=download(bytes,'funshiki-resume-'+new Date().toISOString().slice(0,10)+'.zip','application/zip');a.id='mobile-backup-link';a.textContent='恢复包已准备好，点此保存';$('#mobile-backup-link')?.remove();b.after(a);a.click();}
  catch(e){error(e);}finally{b.disabled=false;}
};
$('#mobile-import').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{e.target.disabled=true;await importZip(file);}catch(err){error(err);}finally{e.target.disabled=false;e.target.value='';}};
async function boot(){
  try{db=await database();status.textContent='首次打开正在下载本地整理引擎，之后可离线使用…';prepareOffline();await call('boot');$('#mobile-start-actions').hidden=false;await savedPackages();const id=localStorage.getItem('funshiki-mobile-active'),record=id?await stored(db,'get',id):null;if(record)await openPackage(record);else status.textContent='准备好了。导入电脑生成的协作 ZIP 即可开始。';}
  catch(e){error(e);}
}
if(navigator.locks){navigator.locks.request('funshiki-mobile-editor',{ifAvailable:true},async lock=>{if(!lock){status.textContent='另一个标签页正在使用整理台。请先关闭它，再刷新本页。';return;}await boot();await new Promise(()=>{});});}
else status.textContent='请使用新版 Chrome 或 Safari 打开，以确保本机资料不会被多个标签页同时覆盖。';
