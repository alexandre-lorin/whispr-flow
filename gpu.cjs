const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),http=require('node:http'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {wav,clean}=require('./audio.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function request(port,route,{body,headers={},signal,timeout=120000}={}){
 return new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port,path:route,method:body?'POST':'GET',headers,signal},res=>{
   let data='',size=0;res.setEncoding('utf8');res.on('data',b=>{size+=b.length;if(size>1024*1024)req.destroy(Error('Réponse locale trop longue.'));else data+=b;});
   res.on('end',()=>resolve({code:res.statusCode,data}));res.on('error',reject);
  });req.setTimeout(timeout,()=>req.destroy(Error('Le moteur local ne répond pas.')));req.on('error',reject);req.end(body);
 });
}
function runnerPresent(){
 try{for(const pid of fs.readdirSync('/proc')){
  if(!/^\d+$/.test(pid))continue;
  try{const name=fs.readFileSync(`/proc/${pid}/comm`,'utf8').trim();if(!/^ollama/.test(name))continue;
   const args=fs.readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0');
   if(args.includes('runner')||args[1]==='run'||/llama.*server/.test(name))return true;
  }catch{}
 }}catch{}return false;
}
async function ollamaResident(){try{const r=await request(11434,'/api/ps',{timeout:700});return r.code===200&&JSON.parse(r.data).models?.some(m=>m.size_vram>0)||false;}catch{return false;}}
function createGPU({model=path.join(os.homedir(),'.local/share/falcon/models/ggml-large-v3-turbo.bin'),onState=()=>{},probeRunner=runnerPresent,probeResident=ollamaResident,monitor=true,launch=spawn,transport=request,reservePort}={}){
 let proc,closed,port,route,warming,generation=0,gpu=false,state='cold',priority=false,disposed=false,pumping=false,queue=[],current,monitorTimer,lastResident=0,resident=false,lastDemand=Date.now(),monitorBusy=false,memory={},recoveries=0;
 function report(value){if(state===value)return;state=value;onState({state,queued:queue.length+(current?1:0)});}
 function terminate(){generation++;gpu=false;warming=null;const p=proc;proc=null;
  if(p&&p.exitCode===null){p.kill('SIGTERM');const timer=setTimeout(()=>{if(p.exitCode===null)p.kill('SIGKILL');},500);timer.unref();}
 }
 function setPriority(value){if(priority===value)return;priority=value;if(value){if(current)current.preempted=true;terminate();report('yielded');}else{report('cold');void warm().then(pump).catch(()=>{});}}
 async function checkPriority(){
  if(disposed||monitorBusy)return;monitorBusy=true;
  try{
   const runner=probeRunner();
   if(runner){lastDemand=Date.now();setPriority(true);}
   if(Date.now()-lastResident>1600){lastResident=Date.now();resident=await probeResident();}
   if(runner||resident){lastDemand=Date.now();setPriority(true);}
   else if(priority&&Date.now()-lastDemand>2500)setPriority(false);
  }finally{monitorBusy=false;}
 }
 async function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});}
 function warm(){
  if(disposed)return Promise.reject(Error('Moteur arrêté.'));
  if(priority)return Promise.reject(Error('Priorité Ollama.'));
  if(state==='ready'&&proc)return Promise.resolve();
  if(warming)return warming;
  const epoch=++generation;
  const task=(async()=>{
   report('loading');port=await (reservePort?reservePort():freePort());route='/dictation-'+crypto.randomBytes(18).toString('hex');
   if(epoch!==generation||disposed||priority)throw Error('Chargement suspendu.');
   const p=proc=launch('whisper-server',['-m',model,'--host','127.0.0.1','--port',String(port),'--request-path',route,'-l','fr','-nt','-t','4','-sns','-bs','5','-bo','5'],{stdio:['ignore','ignore','pipe']});
   closed=new Promise(resolve=>{p.once('error',()=>resolve());p.once('close',resolve);});
   p.once('close',()=>{if(proc===p){proc=null;gpu=false;if(!priority&&!disposed)report('cold');}});
   let pending='';gpu=false;
   memory={};
   p.stderr.on('data',b=>{if(proc!==p)return;pending=(pending+b.toString()).slice(-4096);const lines=pending.split(/[\r\n]/);pending=lines.pop();for(const line of lines){if(/using CUDA\d+ backend/.test(line))gpu=true;const size=line.match(/(kv self|kv cross|kv pad|compute buffer[^:=]*)\s*(?:size)?\s*=\s*([\d.]+)\s*MB/i);if(size)memory[size[1].trim()]=Number(size[2]);}});
   for(let i=0;i<200;i++){
    if(epoch!==generation||priority||disposed)throw Error('Chargement suspendu.');
    if(p.exitCode!==null)throw Error('Le moteur Whisper ne démarre pas.');
    try{const r=await transport(port,route+'/health',{timeout:500});if(r.code===200&&gpu){report('ready');return;}}catch{}
    await sleep(100);
   }
   throw Error('Chargement GPU trop long.');
  })();
  warming=task;
  task.catch(()=>{if(epoch===generation&&!priority&&!disposed){terminate();report('error');}}).finally(()=>{if(warming===task)warming=null;});
  return task;
 }
 async function infer(pcm,{signal,language='fr'}={}){
  const boundary='whisper-'+crypto.randomBytes(12).toString('hex');
  const fields={language,response_format:'json',temperature:'0.0',temperature_inc:'0.2',translate:'false',no_timestamps:'true',prompt:'',carry_initial_prompt:'false'};
  const parts=[];for(const [key,value]of Object.entries(fields))parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="segment.wav"\r\nContent-Type: audio/wav\r\n\r\n`),wav(pcm),Buffer.from(`\r\n--${boundary}--\r\n`));
  const body=Buffer.concat(parts),r=await transport(port,route+'/inference',{body,headers:{'Content-Type':`multipart/form-data; boundary=${boundary}`,'Content-Length':body.length},signal});
  if(r.code!==200)throw Error('Le moteur GPU a refusé le segment.');
  try{return clean(JSON.parse(r.data).text||'');}catch{throw Error('Réponse Whisper invalide.');}
 }
 async function pump(){
  if(pumping||disposed||priority)return;pumping=true;
  try{while(queue.length&&!disposed&&!priority){
   const item=current=queue.shift();
   if(item.signal?.aborted){item.reject(Error('Dictée annulée.'));current=null;continue;}
   const epoch=generation;
   try{await warm();if(item.signal?.aborted)throw Error('Dictée annulée.');if(priority)throw Error('Priorité Ollama.');const text=await infer(item.pcm,item);if(item.signal?.aborted)throw Error('Dictée annulée.');item.resolve(text);}
   catch(e){
    if(!disposed&&!item.signal?.aborted&&(priority||item.preempted||generation!==epoch&&state==='yielded')){item.preempted=false;queue.unshift(item);}
    else if(!disposed&&!item.signal?.aborted&&!item.retried&&['ECONNRESET','ECONNREFUSED','EPIPE'].includes(e.code)){
     item.retried=true;recoveries++;terminate();report('cold');queue.unshift(item);
    }else item.reject(e);
   }
   finally{current=null;}
  }}finally{pumping=false;if(queue.length&&!priority&&!disposed)void pump();}
 }
 function submit(pcm,{signal,language='fr'}={}){
  if(disposed)return Promise.reject(Error('Moteur arrêté.'));
  return new Promise((resolve,reject)=>{
   let settled=false;
   const done=(error,value)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);item.pcm=null;error?reject(error):resolve(value);};
   const abort=()=>{queue=queue.filter(x=>x!==item);done(Error('Dictée annulée.'));};
   const item={pcm,signal,language,resolve:value=>done(null,value),reject:error=>done(error)};
   if(signal?.aborted){abort();return;}
   signal?.addEventListener('abort',abort,{once:true});queue.push(item);void pump();
  });
 }
 async function start(){if(monitor){await checkPriority();monitorTimer=setInterval(()=>void checkPriority(),300);}if(!priority)await warm();}
 function disposeNow(){disposed=true;clearInterval(monitorTimer);terminate();for(const item of queue)item.reject(Error('Moteur arrêté.'));queue=[];}
 return {start,submit,setPriority,checkPriority,disposeNow,status:()=>({state,pid:proc?.pid||null,queued:queue.length+(current?1:0),priority,recoveries,memoryMiB:{...memory}}),warm,closed:()=>closed};
}
module.exports={createGPU,runnerPresent,ollamaResident};
