const {test}=require('node:test');
const assert=require('node:assert/strict');
const {shortcut}=require('./delivery.cjs');
const {clean,wav,pcmLevel}=require('./engine.cjs');
const {nearCursor}=require('./geometry.cjs');
const {segmenter}=require('./audio.cjs');
const {createDictation}=require('./engine.cjs');
const {createGPU}=require('./gpu.cjs');
const {PassThrough}=require('node:stream');
const {EventEmitter}=require('node:events');
const {capabilities}=require('./platform.cjs');
const {createPortableDictation}=require('./portable-engine.cjs');
test('les cibles déclarées exposent des capacités explicites',()=>{
 assert.equal(capabilities('linux').status,'production');
 assert.equal(capabilities('win32').nativeCapture,'WASAPI');
 assert.equal(capabilities('darwin').gpu,'Metal');
});
test('le moteur portable accepte le cycle de capture hors Linux',async()=>{
 const submitted=[];
 const gpu={start:async()=>{},submit:async pcm=>{submitted.push(pcm.length);return 'portable';},status:()=>({state:'ready'}),disposeNow(){}};
 const engine=createPortableDictation({gpu});
 await engine.start();engine.push(speech(.2));const text=await engine.finish();
 assert.equal(text,'portable');assert.equal(submitted.length,1);engine.disposeNow();
});
const {createDiagnostics}=require('./diagnostics.cjs');
test('les diagnostics ne conservent que codes fixes et dates, jamais le texte de l’erreur',()=>{
 const d=createDiagnostics();d.add(Error('Texte privé de fixture à ne jamais enregistrer'));
 assert.equal(d.list()[0].code,'TRANSCRIPTION');assert.ok(!JSON.stringify(d.list()).includes('privé'));
 for(let i=0;i<25;i++)d.add(Error('Capsule absente du compositeur.'));
 assert.equal(d.list().length,20);assert.equal(d.list()[0].code,'UI_MAPPING');
});
function fakeWorker(){const p=new EventEmitter();p.exitCode=null;p.pid=12345;p.stderr=new PassThrough();p.kill=()=>{p.exitCode=0;setImmediate(()=>p.emit('close',0));};setImmediate(()=>p.stderr.write('using CUDA0 backend\n'));return p;}
test('un segment survit à une connexion moteur perdue, avec une seule reprise',async()=>{
 let calls=0,workers=0;
 const gpu=createGPU({monitor:false,reservePort:async()=>9999,launch:()=>{workers++;return fakeWorker();},transport:async(_port,route)=>{
  if(route.endsWith('/health'))return {code:200,data:'{}'};
  if(++calls===1)throw Object.assign(Error('socket hangup'),{code:'ECONNRESET'});
  return {code:200,data:JSON.stringify({text:'Texte de fixture récupéré'})};
 }});
 try{assert.equal(await gpu.submit(Buffer.alloc(640)),'Texte de fixture récupéré');assert.equal(calls,2);assert.equal(workers,2);assert.equal(gpu.status().recoveries,1);}finally{gpu.disposeNow();}
});
test('une connexion en panne permanente ne crée pas de boucle de relance',async()=>{
 let calls=0;
 const gpu=createGPU({monitor:false,reservePort:async()=>9999,launch:fakeWorker,transport:async(_port,route)=>{
  if(route.endsWith('/health'))return {code:200,data:'{}'};
  calls++;throw Object.assign(Error('socket hangup'),{code:'ECONNRESET'});
 }});
 try{await assert.rejects(gpu.submit(Buffer.alloc(640)),{code:'ECONNRESET'});assert.equal(calls,2);}finally{gpu.disposeNow();}
});
function speech(seconds){const b=Buffer.alloc(Math.round(seconds*16000)*2);for(let i=0;i<b.length/2;i++)b.writeInt16LE(Math.round(Math.sin(i*.09)*4000),i*2);return b;}
test('une pause déclenche un segment avant la fin, sans terminer la capture',()=>{
 const chunks=[],s=segmenter(b=>chunks.push(b));s.push(speech(4.2));assert.equal(chunks.length,0);s.push(Buffer.alloc(32000));assert.equal(chunks.length,1);
 s.push(Buffer.alloc(32000*5));assert.equal(chunks.length,1);s.push(speech(1));s.finish();assert.equal(chunks.length,2);
});
test('une seconde capture reste possible pendant la transcription de la première',async()=>{
 const procs=[],waiting=[];
 const gpu={submit:()=>new Promise(resolve=>waiting.push(resolve)),disposeNow(){}};
 const spawn=()=>{const p=new EventEmitter();p.stdout=new PassThrough();p.exitCode=null;p.kill=()=>{p.exitCode=0;setImmediate(()=>p.emit('close',0));};procs.push(p);setImmediate(()=>p.stdout.write(speech(.2)));return p;};
 const engine=createDictation({gpu,spawn});
 const one={id:1,token:'capture-one'},two={id:2,token:'capture-two'};
 try{
  await engine.start(one);procs[0].stdout.write(speech(4.1));procs[0].stdout.write(Buffer.alloc(32000));assert.equal(waiting.length,1);
  const first=engine.finish(one);await engine.start(two);procs[1].stdout.write(speech(1));const second=engine.finish(two);
  await new Promise(r=>setTimeout(r,20));assert.equal(waiting.length,2);
  waiting[1]('Deuxième dictée');waiting[0]('Première dictée');
  assert.equal(await first,'Première dictée');assert.equal(await second,'Deuxième dictée');
 }finally{engine.disposeNow();}
});
test('annuler libère immédiatement les segments en attente de la priorité Ollama',async()=>{
 const gpu=createGPU({monitor:false});gpu.setPriority(true);const controller=new AbortController();
 const pending=gpu.submit(speech(1),{signal:controller.signal});controller.abort();
 await assert.rejects(pending,/annulée/);assert.equal(gpu.status().queued,0);gpu.disposeNow();
});
test('placement près du curseur, y compris aux bords et sur écran décalé',()=>{
 const monitors=[{x:0,y:0,width:2560,height:1440,scale:1},{x:-1080,y:-400,width:1920,height:1080,scale:1,transform:1}];
 const center=nearCursor({x:500,y:500},monitors);assert.equal(center.x,516);assert.equal(center.y,516);
 const edge=nearCursor({x:2559,y:1439},monitors);assert.ok(edge.x+edge.width<2560);assert.ok(edge.y+edge.height<1440);
 const other=nearCursor({x:-1079,y:-399},monitors);assert.ok(other.x>=-1080);assert.ok(other.y>=-400);assert.ok(other.x+other.width<=0);
});
test('collage natif : terminal ou champ standard, sans touche Entrée',()=>{
 for(const name of ['kitty','terminal-deck','local.toubi.terminal-deck','nvterminal','org.wezfurlong.wezterm'])assert.equal(shortcut({class:name}),'CTRL SHIFT, V');
 for(const name of ['firefox','discord','org.gnome.TextEditor'])assert.equal(shortcut({class:name}),'CTRL, V');
});
test('les caractères de contrôle ne passent pas dans le texte à coller',()=>assert.equal(clean('Bonjour\r\n\x1b monde'),'Bonjour monde'));
test('format audio attendu : PCM mono 16 kHz et niveau nul sur silence',()=>{
 const pcm=Buffer.alloc(32000),audio=wav(pcm);
 assert.equal(audio.readUInt32LE(24),16000);assert.equal(audio.readUInt16LE(22),1);
 assert.equal(audio.readUInt32LE(40),pcm.length);assert.equal(pcmLevel(pcm),0);
});
