function pcmLevel(buffer){let sum=0,n=Math.floor(buffer.length/2);for(let i=0;i<n*2;i+=2)sum+=buffer.readInt16LE(i)**2;return n?Math.sqrt(sum/n)/32768:0;}
function wav(pcm){const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(36+pcm.length,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(16000,24);h.writeUInt32LE(32000,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);return Buffer.concat([h,pcm]);}
function clean(text){return String(text).replace(/[\x00-\x1f\x7f-\x9f]/g,' ').replace(/\s+/g,' ').trim().slice(0,32000);}
// Trames de 20 ms. Les silences terminent un morceau, jamais la dictée.
function segmenter(emit){
 let pending=Buffer.alloc(0),frames=[],pre=[],voiced=0,silent=0,noise=.0008;
 function flush(){if(voiced>=8)emit(Buffer.concat(frames));frames=[];voiced=0;silent=0;pre=[];}
 function push(chunk){
  pending=Buffer.concat([pending,chunk]);let offset=0;
  for(;offset+640<=pending.length;offset+=640){
   const frame=Buffer.from(pending.subarray(offset,offset+640)),level=pcmLevel(frame),speech=level>Math.max(.0025,Math.min(.012,noise*3));
   if(!speech&&level<.015)noise=noise*.98+level*.02;
   if(!frames.length){pre.push(frame);if(pre.length>12)pre.shift();if(!speech)continue;frames=pre;pre=[];}
   else frames.push(frame);
   if(speech){voiced++;silent=0;}else silent++;
   // 4 s de contexte puis pause de 500 ms ; pause plus courte après 18 s.
   if((frames.length>=200&&silent>=25)||(frames.length>=900&&silent>=8)||frames.length>=1400)flush();
  }
  pending=Buffer.from(pending.subarray(offset));
 }
 return {push,finish(){if(pending.length&&frames.length)frames.push(pending.subarray(0,pending.length-pending.length%2));flush();pending=Buffer.alloc(0);},clear(){pending=Buffer.alloc(0);frames=[];pre=[];}};
}
module.exports={pcmLevel,wav,clean,segmenter};
