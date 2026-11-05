const {spawn}=require('node:child_process');
const {pcmLevel,wav,clean,segmenter}=require('./audio.cjs');
const {createGPU}=require('./gpu.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function createDictation(options={}){
 const gpu=options.gpu||createGPU({onState:options.onProgress});
 const jobs=new Map();let recording=null;
 const launch=options.spawn||spawn;
 function get(args){const j=jobs.get(args?.token);if(!j||j.id!==args.id)throw Error('Cette dictée est terminée.');return j;}
 async function halt(j){
  if(j.proc&&j.proc.exitCode===null){j.stopping=true;j.proc.kill('SIGINT');const timer=setTimeout(()=>{if(j.proc.exitCode===null)j.proc.kill('SIGKILL');},800);await j.closed;clearTimeout(timer);}
 }
 async function start({id,token}){
  if(recording)throw Error('Une capture est déjà ouverte.');
  if(typeof token!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(token))throw Error('Dictée invalide.');
  const j={id,token,controller:new AbortController(),parts:[],level:0,bytes:0,started:Date.now(),phase:'recording'};
  jobs.set(token,j);recording=j;
  j.segmenter=segmenter(pcm=>{
   const part=gpu.submit(pcm,{signal:j.controller.signal}).then(text=>({text}),error=>({error}));
   j.parts.push(part);
  });
  try{
   j.proc=launch('pw-record',['--raw','--rate','16000','--channels','1','--format','s16','-'],{stdio:['ignore','pipe','ignore']});
   j.closed=new Promise(resolve=>{j.proc.once('error',()=>{j.error=Error('Microphone indisponible.');resolve();});j.proc.once('close',()=>{if(!j.stopping&&!j.controller.signal.aborted)j.error=Error('Capture interrompue.');resolve();});});
   j.proc.stdout.on('data',pcm=>{if(j.controller.signal.aborted)return;j.bytes+=pcm.length;j.level=pcmLevel(pcm);j.segmenter.push(pcm);});
   for(let i=0;i<50;i++){if(j.controller.signal.aborted)throw Error('Dictée annulée.');if(j.error)throw j.error;if(j.bytes)break;await sleep(40);}
   if(!j.bytes)throw Error('Microphone indisponible.');
   j.timer=setTimeout(()=>{void cancel({id,token});},1800000);
   return true;
  }catch(e){await cancel({id,token});throw e;}
 }
 function level(args){const j=get(args);if(j.error)throw j.error;return {level:j.level,seconds:Math.floor((Date.now()-j.started)/1000),segments:j.parts.length};}
 async function finish(args){
  const j=get(args);if(j.phase!=='recording')throw Error('Transcription déjà en cours.');
  j.phase='transcribing';if(recording===j)recording=null;clearTimeout(j.timer);
  try{
   await halt(j);if(j.controller.signal.aborted)throw Error('Dictée annulée.');if(j.error)throw j.error;
   j.segmenter.finish();
   const parts=await Promise.all(j.parts);
   if(j.controller.signal.aborted)throw Error('Dictée annulée.');
   const failed=parts.find(p=>p.error);if(failed)throw failed.error;
   const text=clean(parts.map(p=>p.text).join(' '));
   if(!text)throw Error('Aucune parole reconnue.');
   return text;
  }finally{jobs.delete(j.token);j.parts=[];j.segmenter.clear();}
 }
 async function cancel(args){
  const selected=args?[jobs.get(args.token)].filter(Boolean):[...jobs.values()];
  for(const j of selected){if(args&&j.id!==args.id)continue;j.controller.abort();clearTimeout(j.timer);if(recording===j)recording=null;await halt(j);j.segmenter.clear();j.parts=[];jobs.delete(j.token);}
  return selected.length>0;
 }
 function disposeNow(){for(const j of jobs.values()){j.controller.abort();clearTimeout(j.timer);if(j.proc?.exitCode===null)j.proc.kill('SIGKILL');j.segmenter.clear();j.parts=[];}jobs.clear();recording=null;gpu.disposeNow();}
 return {start,level,finish,cancel,dispose:()=>cancel(),disposeNow,warm:()=>gpu.start(),gpuStatus:()=>gpu.status()};
}
module.exports={createDictation,pcmLevel,wav,clean};
