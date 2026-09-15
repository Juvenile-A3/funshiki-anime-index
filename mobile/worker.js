/* SQLite and the desktop Python rules run locally, off the UI thread. */
importScripts('/mobile/runtime/pyodide.js');
const DB='/app/data/library/library.sqlite3';
let py,queue=Promise.resolve();
async function boot(){
  py=await loadPyodide({indexURL:'/mobile/runtime/'});
  await py.loadPackage('sqlite3');
  const response=await fetch('/mobile/python-sources.json');if(!response.ok)throw Error('无法读取整理规则');
  for(const [path,text] of Object.entries(await response.json())){const full='/app/'+path;py.FS.mkdirTree(full.slice(0,full.lastIndexOf('/')));py.FS.writeFile(full,text);}
  py.FS.mkdirTree('/app/data/library');
  await py.runPythonAsync("import sys,json\nsys.path.insert(0,'/app/scripts')\nfrom library_mobile import browser_request,import_browser_bundle\nfrom library import connect,initialize\n");
}
function object(value){const result=value.toJs({dict_converter:Object.fromEntries});value.destroy();return result;}
async function run(m){
  if(m.kind==='boot'){await boot();return {ready:true};}
  if(m.kind==='import'){
    py.FS.writeFile('/incoming.zip',new Uint8Array(m.bytes));
    try{return object(py.runPython("import_browser_bundle(open('/incoming.zip','rb').read(),'/incoming.sqlite3')"));}
    finally{py.FS.unlink('/incoming.zip');}
  }
  if(m.kind==='imported-bytes')return py.FS.readFile('/incoming.sqlite3');
  if(m.kind==='open'){py.FS.writeFile(DB,new Uint8Array(m.bytes));py.runPython("_db=connect();initialize(_db);_db.close()");return {ready:true};}
  if(m.kind==='bytes')return py.FS.readFile(DB);
  if(m.kind==='backup'){
    // A resume copy retains the collaboration baseline; a new share establishes
    // a new baseline. These must never be confused.
    py.runPython("import zipfile\nwith zipfile.ZipFile('/resume.zip','w',zipfile.ZIP_DEFLATED) as z:\n z.write('/app/data/library/library.sqlite3','data/library/library.sqlite3')\n _db=connect();_base=json.loads(_db.execute(\"SELECT value FROM meta WHERE key='collaboration_base'\").fetchone()[0]);_lid=_db.execute(\"SELECT value FROM meta WHERE key='library_id'\").fetchone()[0];_db.close()\n z.writestr('manifest.json',json.dumps({'format':'funshiki-collaboration-v1','library_id':_lid,'package_id':_base['package_id'],'resume':True}))");
    return py.FS.readFile('/resume.zip');
  }
  if(m.kind==='request'){
    py.globals.set('_request_json',JSON.stringify({path:m.path,body:m.body??null,remote:m.remote??null}));
    const r=object(py.runPython("_req=json.loads(_request_json)\nbrowser_request(_req['path'],_req['body'],_req['remote'])"));
    if(r.status>=400)throw Error(r.value.error||'操作失败');
    return r.value;
  }
  throw Error('不支持的本机操作');
}
onmessage=({data:m})=>{queue=queue.then(async()=>{try{const value=await run(m);postMessage({id:m.id,value});}catch(e){postMessage({id:m.id,error:String(e.message||e)});}});};
