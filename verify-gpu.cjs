const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {createGPU,runnerPresent,ollamaResident}=require('./gpu.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function audio(file){const data=fs.readFileSync(file);let pos=12;while(pos+8<=data.length){const n=data.readUInt32LE(pos+4);if(data.toString('ascii',pos,pos+4)==='data')return data.subarray(pos+8,pos+8+n);pos+=8+n+(n%2);}throw Error('Échantillon WAV invalide.');}
function memory(pid){const data=execFileSync('nvidia-smi',['--query-compute-apps=pid,used_gpu_memory','--format=csv,noheader,nounits'],{encoding:'utf8'});const line=data.split('\n').find(l=>Number(l.split(',')[0])===pid);return line?Number(line.split(',')[1].trim()):0;}
(async()=>{
 if(runnerPresent()||await ollamaResident()){console.log('Contrôle GPU reporté : Ollama est prioritaire.');return;}
 const gpu=createGPU({monitor:false}),report={publicAudio:true,microphoneOpened:false,prioritySignalSimulated:true};
 try{
  const pcm=audio('/tmp/dictee-gpu-reference.wav');
  await gpu.start();const pid=gpu.status().pid;
  const start=performance.now();const a=await gpu.submit(pcm,{language:'en'});report.warmInferenceSeconds=Number(((performance.now()-start)/1000).toFixed(2));
  assert.match(a.toLowerCase(),/country/);report.referenceRecognized=true;report.residentMiB=memory(pid);report.buffersMiB=gpu.status().memoryMiB;
  const next=gpu.submit(pcm,{language:'en'});gpu.setPriority(true);await gpu.closed();
  report.gpuReleased=memory(pid)===0;assert.equal(report.gpuReleased,true);
  await sleep(100);gpu.setPriority(false);
  const b=await next;assert.match(b.toLowerCase(),/country/);report.queuedSegmentRecovered=true;
  assert.notEqual(gpu.status().pid,pid);report.reloadedAfterPriority=true;
  const currentPid=gpu.status().pid;await gpu.submit(pcm,{language:'en'});assert.equal(gpu.status().pid,currentPid);report.sameWorkerBetweenDictations=true;
  fs.mkdirSync(path.join(__dirname,'output'),{recursive:true});fs.writeFileSync(path.join(__dirname,'output','gpu-resident-check.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
 }finally{gpu.disposeNow();await gpu.closed();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
