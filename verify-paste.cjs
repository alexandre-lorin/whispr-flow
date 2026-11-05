// Recette native isolée : aucun compte, aucun micro, aucun prompt utilisateur.
const {app,BrowserWindow}=require('electron');
const {active,deliver,hypr}=require('./delivery.cjs');
const fs=require('node:fs'),path=require('node:path');
const {root}=require('./paths.cjs');
app.setPath('userData',path.join(root,'paste-check'));
app.whenReady().then(async()=>{
 const original=await active();let win;
 try{
  win=new BrowserWindow({width:400,height:160,title:'Vérification dictée',webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><title>Vérification dictée</title><style>body{background:#111;color:white;font:14px system-ui}textarea{width:95%;height:70px}</style><p>Vérification du collage · sans micro</p><textarea autofocus></textarea>'));
  await new Promise(r=>setTimeout(r,450));
  const clients=JSON.parse(await hypr(['-j','clients']));const own=clients.find(c=>c.pid===process.pid);
  if(!own)throw Error('Fenêtre de recette absente.');
  await hypr(['dispatch','focuswindow',`address:${own.address}`]);
  await new Promise(r=>setTimeout(r,200));
  await win.webContents.executeJavaScript('document.querySelector("textarea").focus()');
  const target=await active();if(target.pid!==process.pid)throw Error('Focus de recette indisponible.');
  win.setTitle('Vérification dictée — titre modifié');
  await new Promise(r=>setTimeout(r,150));
  const text='Vérification locale du collage, sans envoi.';
  const result=await deliver(text,target);
  await new Promise(r=>setTimeout(r,350));
  const value=await win.webContents.executeJavaScript('document.querySelector("textarea").value');
  const report={pasteDispatched:result==='pasted',nativePasteReceived:value===text,titleChangeAllowed:true,microphoneOpened:false};
  fs.mkdirSync(path.join(__dirname,'output'),{recursive:true});
  fs.writeFileSync(path.join(__dirname,'output','paste-check.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
 }catch(e){console.error(e.message);process.exitCode=1;}
 finally{
  if(original.address)await hypr(['dispatch','focuswindow',`address:${original.address}`]).catch(()=>{});
  win?.destroy();app.quit();
 }
});
