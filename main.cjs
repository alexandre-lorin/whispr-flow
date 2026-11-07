const {app,BrowserWindow,ipcMain} = require('electron');
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
const {root,socket}=require('./paths.cjs');
 const {createDictation}=require('./engine.cjs');
const {hypr,active,deliver}=require('./delivery.cjs');
const {SIZE,nearCursor}=require('./geometry.cjs');
const {createDiagnostics}=require('./diagnostics.cjs');
if (process.platform !== 'linux') {
 require('./portable-main.cjs');
} else {
app.setName('Dictee Toubi');app.setPath('userData',path.join(root,'ui'));
const primary=app.requestSingleInstanceLock();
if(!primary){app.quit();}else{
 const engine=createDictation({onProgress:gpuChanged});
 let win,server,job,state='idle',dismiss,levelTimer,busy=false,drag,dragTimer,ownAddress,dragSequence=0,deliveryChain=Promise.resolve(),focusBeforeShow,preparation,placement,lastDelivery;
 const pending=new Map();
 const diagnostics=createDiagnostics();
 function gpuChanged(){if(!job&&pending.size)renderPending();}
 function renderPending(){
  if(job)return;
  if(!pending.size){state='idle';hide(true);return;}
  const gpu=engine.gpuStatus();
  update(gpu.state==='yielded'?'waiting':'transcribing',gpu.state==='yielded'?'Priorité Ollama':gpu.state==='loading'?'Chargement GPU…':'Whisper · GPU');
 }
 function finalize(current){
  pending.set(current.token,current);
  const outcome=engine.finish(current).then(text=>({text}),error=>({error}));
  deliveryChain=deliveryChain.catch(()=>{}).then(async()=>{
   const result=await outcome;if(current.cancelled)return;if(result.error)throw result.error;
   const started=performance.now();await deliver(result.text,current.target,()=>!current.cancelled);lastDelivery={milliseconds:Math.round(performance.now()-started)};
  }).catch(error=>{current.error=error;}).finally(()=>{
   pending.delete(current.token);
   if(job)return;
   if(!pending.size&&current.error&&!current.cancelled){showError(current.error);return;}
   renderPending();
  });
  renderPending();
 }
 function stopDrag(){dragSequence++;drag=null;clearInterval(dragTimer);dragTimer=null;
  if(ownAddress&&focusBeforeShow?.address)void active().then(w=>{if(w.address===ownAddress)return hypr(['dispatch','focuswindow',`address:${focusBeforeShow.address}`]);}).catch(()=>{});
 }
 async function beginDrag(sequence){
  if(!win?.isVisible()||!ownAddress||drag)return;
  const cursor=JSON.parse(await hypr(['-j','cursorpos']));
  const clients=JSON.parse(await hypr(['-j','clients']));
  const own=clients.find(w=>w.address===ownAddress);if(!own)return;
  if(sequence!==dragSequence)return;
  const current=drag={cursor,at:own.at,since:Date.now(),moving:false};
  dragTimer=setInterval(async()=>{
   if(drag!==current||current.moving)return;
   if(Date.now()-current.since>30000){stopDrag();return;}
   current.moving=true;
   try{
    const p=JSON.parse(await hypr(['-j','cursorpos']));
    if(drag!==current)return;
    const x=Math.round(current.at[0]+p.x-current.cursor.x),y=Math.round(current.at[1]+p.y-current.cursor.y);
    await hypr(['dispatch','movewindowpixel',`exact ${x} ${y},address:${ownAddress}`]);
   }catch{stopDrag();}finally{current.moving=false;}
  },32);
 }
 function update(phase,detail=''){
  state=phase;
  if(!win||win.isDestroyed())return;
  win.webContents.send('state',{phase,detail});
  if(['done','preview'].includes(phase))dismiss=setTimeout(hide,2400);
  // Les erreurs et la copie seule restent lisibles jusqu'à F9/Maj+F9.
 }
 function showError(error){
  const code=diagnostics.add(error);
  // Un échec de placement ne doit jamais rendre visible la fenêtre centrée.
  if(code.startsWith('UI_')||!placement?.matched||!win?.isVisible()){state='idle';hide(true);return;}
  update('error',code==='NO_SPEECH'?'Aucune parole reconnue.':code==='MICROPHONE'?'Micro indisponible.':code==='CLIPBOARD'?'Copie indisponible.':'Transcription indisponible.');
 }
 function hide(immediate=false){clearTimeout(dismiss);stopDrag();if(win&&!win.isDestroyed()){if(immediate)win.hide();win.webContents.send('state',{phase:'hidden'});if(!immediate)setTimeout(()=>{if(!job)win.hide();},120);}}
 async function show(anchor){
  clearTimeout(dismiss);
  placement={matched:false};
  focusBeforeShow=await active();
  const cursor=anchor||JSON.parse(await hypr(['-j','cursorpos']));
  const monitors=JSON.parse(await hypr(['-j','monitors']));
  const bounds=nearCursor(cursor,monitors),{x,y}=bounds;
  await new Promise((resolve,reject)=>{
   const id=crypto.randomUUID(),timer=setTimeout(()=>{preparation=null;reject(Error('La capsule ne répond pas.'));},2000);
   preparation={id,done(){clearTimeout(timer);preparation=null;resolve();}};
   win.webContents.send('state',{phase:'hidden',prepareId:id});
  });
  win.setBounds(bounds);win.showInactive();
  // Wayland laisse le placement au compositeur.
  let own;
  for(let i=0;i<40;i++){
   const clients=JSON.parse(await hypr(['-j','clients']));own=clients.find(w=>w.pid===process.pid&&w.title==='Dictee Toubi'&&w.mapped!==false);
   if(own)break;
   await new Promise(r=>setTimeout(r,35));
  }
  if(!own)throw Error('Capsule absente du compositeur.');
  ownAddress=own.address;
  await hypr(['dispatch','resizewindowpixel',`exact ${SIZE.width} ${SIZE.height},address:${own.address}`]);
  await hypr(['dispatch','movewindowpixel',`exact ${x} ${y},address:${own.address}`]);
  let positioned;
  for(let i=0;i<20;i++){
   const clients=JSON.parse(await hypr(['-j','clients']));positioned=clients.find(w=>w.address===ownAddress);
   if(positioned&&Math.abs(positioned.at[0]-x)<=1&&Math.abs(positioned.at[1]-y)<=1)break;
   await new Promise(r=>setTimeout(r,20));
  }
  placement={matched:!!positioned&&Math.abs(positioned.at[0]-x)<=1&&Math.abs(positioned.at[1]-y)<=1};
  if(!placement.matched){win.hide();throw Error('Placement de la capsule refusé.');}
 }
 async function cancel(){
  if(job){const old=job;old.cancelled=true;job=null;clearInterval(levelTimer);await engine.cancel(old);}
  else{for(const item of pending.values())item.cancelled=true;await engine.cancel();}
  renderPending();
 }
 async function toggle(anchor){
  if(busy)return;
  busy=true;
  try{
   if(!job){
    const [target,cursor]=await Promise.all([active(),anchor||hypr(['-j','cursorpos']).then(JSON.parse)]);if(!target.address)throw Error('Sélectionnez un champ de saisie.');
    const current={id:Date.now(),token:crypto.randomUUID(),target};job=current;
    await show(cursor);if(job!==current)return;update('starting');
    await engine.start(current);if(job!==current)return;update('recording');
    levelTimer=setInterval(()=>{try{const v=engine.level(current);win.webContents.send('level',v);}catch(error){clearInterval(levelTimer);if(job===current){job=null;void engine.cancel(current);showError(error);}}},100);
   }else{
    const current=job;job=null;clearInterval(levelTimer);finalize(current);
   }
  }catch(error){if(job){const failed=job;job=null;await engine.cancel(failed);showError(error);}}
  finally{busy=false;}
 }
 app.whenReady().then(async()=>{
  win=new BrowserWindow({title:'Dictee Toubi',...SIZE,show:false,frame:false,transparent:true,backgroundColor:'#00000000',focusable:true,skipTaskbar:true,resizable:false,alwaysOnTop:true,hasShadow:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  win.setIgnoreMouseEvents(false);win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  ipcMain.on('prepared',(event,id)=>{if(event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&id===preparation?.id)preparation.done();});
  ipcMain.on('drag', (event,action)=>{
   if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)return;
   if(action==='start')void beginDrag(++dragSequence).catch(stopDrag);
   else if(action==='stop')stopDrag();
  });
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
  await win.loadFile(path.join(__dirname,'index.html'));
  try{fs.unlinkSync(socket);}catch(e){if(e.code!=='ENOENT')throw e;}
  server=net.createServer({allowHalfOpen:true},s=>{
   let input='';s.setTimeout(2000,()=>s.destroy());
   s.on('error',()=>{});s.on('data',b=>{
    input+=b;if(input.length>256){s.destroy();return;}if(!input.includes('\n'))return;
    let cmd=input.trim(),cursor;input='';
    if(cmd.startsWith('{'))try{const value=JSON.parse(cmd);cmd=value.type;const p=value.cursor;if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<100000&&Math.abs(p.y)<100000)cursor={x:p.x,y:p.y};}catch{s.end(JSON.stringify({error:'Commande invalide'}));return;}
    if(cmd==='toggle')void toggle(cursor);
    else if(cmd==='cancel')void cancel();
    else if(cmd==='preview'&&!job&&!pending.size){void show(cursor).then(()=>update('preview')).catch(()=>{});}
    else if(cmd==='quit'){s.end(JSON.stringify({state:'stopped'}));app.quit();return;}
    else if(cmd!=='status'){s.end(JSON.stringify({error:'Commande invalide'}));return;}
    s.end(JSON.stringify({state,active:!!job||pending.size>0,recording:!!job,pending:pending.size,gpu:engine.gpuStatus(),placement,lastDelivery,diagnostics:diagnostics.list()}));
   });
  });server.listen(socket,()=>fs.chmodSync(socket,0o600));
  if(!process.argv.includes('--verify-isolated'))void engine.warm().catch(()=>{});
  if(process.argv.includes('--verify-ui')){
   const before=await active();
   await show();update('preview');
   clearTimeout(dismiss);
   await new Promise(r=>setTimeout(r,700));
   const after=await active();
   const output=path.join(__dirname,'output');fs.mkdirSync(output,{recursive:true});
   fs.writeFileSync(path.join(output,'capsule.png'),(await win.webContents.capturePage()).toPNG());
   const report={focusPreserved:before.address===after.address,visible:win.isVisible(),focusable:win.isFocusable(),state,placement,microphoneOpened:false};
   if(process.argv.includes('--verify-errors')){
    const beforeError=JSON.parse(await hypr(['-j','clients'])).find(w=>w.address===ownAddress);
    showError(Error('Erreur de fixture de transcription.'));
    await new Promise(r=>setTimeout(r,100));
    const afterError=JSON.parse(await hypr(['-j','clients'])).find(w=>w.address===ownAddress);
    report.errorKeepsPosition=JSON.stringify(beforeError?.at)===JSON.stringify(afterError?.at);
    report.errorKeepsSize=JSON.stringify(beforeError?.size)===JSON.stringify(afterError?.size);
   }else report.pointer=await new Promise(resolve=>require('node:child_process').execFile('python3',[path.join(__dirname,'verify-pointer.py'),String(process.pid)],{timeout:6000,maxBuffer:2000},(error,stdout)=>{try{resolve(JSON.parse(stdout));}catch{resolve({nativeWaylandDrag:false,error:error?'Recette pointeur indisponible.':'Réponse invalide.'});}}));
   hide();await new Promise(r=>setTimeout(r,400));report.hiddenAtRest=!win.isVisible();
   fs.writeFileSync(path.join(output,'native-check.json'),JSON.stringify(report,null,2));
   if(process.argv.includes('--verify-isolated'))app.quit();
  }
 }).catch(()=>app.quit());
 app.on('before-quit',()=>{stopDrag();clearInterval(levelTimer);clearTimeout(dismiss);engine.disposeNow();server?.close();try{fs.unlinkSync(socket);}catch{}});
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>app.quit());
 app.on('window-all-closed',()=>app.quit());
}
}
