const net = require('node:net');
const {spawn,execFileSync} = require('node:child_process');
const path = require('node:path');
const {socket,electron} = require('./paths.cjs');
const action = process.argv[2] || 'toggle';
if (!['toggle','cancel','status','quit','preview'].includes(action)) process.exit(1);
let cursor;
if(['toggle','preview'].includes(action))try{cursor=JSON.parse(execFileSync('hyprctl',['-j','cursorpos'],{encoding:'utf8',timeout:1000}));}catch{}
const message=['toggle','preview'].includes(action)?JSON.stringify({type:action,cursor}):action;
function request(payload=message) { return new Promise((resolve,reject)=>{
 const s=net.connect(socket); let data='';
 s.setTimeout(1800);
 s.on('connect',()=>s.end(payload+'\n'));
 s.on('data',b=>{data+=b; if(data.length>4096)s.destroy(Error('Réponse invalide'));});
 s.on('end',()=>{try{resolve(JSON.parse(data));}catch{reject(Error('Réponse invalide'));}});
 s.on('error',reject);s.on('timeout',()=>s.destroy(Error('Délai dépassé')));
});}
(async()=>{
 let result;
 try{result=await request();}catch(error){
  if(!['toggle','preview'].includes(action)) throw error;
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const p=spawn(electron,[path.join(__dirname,'main.cjs'),'--ozone-platform=wayland'],{detached:true,stdio:'ignore',env});
  p.on('error',()=>{});p.unref();
  for(let i=0;i<35;i++){await new Promise(r=>setTimeout(r,150));try{result=await request();break;}catch{}}
  if(!result)throw Error('La capsule ne démarre pas.');
 }
 if(result?.error==='Commande invalide'&&message!==action)result=await request(action);
 console.log(JSON.stringify(result));
})().catch(()=>{console.error('Dictée indisponible.');process.exitCode=1;});
