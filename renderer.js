const capsule=document.querySelector('main'),label=document.querySelector('#label'),detail=document.querySelector('#detail'),time=document.querySelector('#time'),language=document.querySelector('#language'),wave=document.querySelector('#wave');
const bars=Array.from({length:7},()=>wave.appendChild(document.createElement('i')));
const labels={preview:'Dictée',starting:'Micro…',recording:'Dictée',transcribing:'Transcription',waiting:'En attente',done:'Collage demandé',copied:'Texte copié',error:'À vérifier'};
let elapsedTimer;
window.dictation.onState(s=>{
 clearInterval(elapsedTimer);
 capsule.title=s.phase==='error'?s.detail:'';
 if(s.prepareId)capsule.classList.add('preparing');else if(s.phase!=='hidden')capsule.classList.remove('preparing');
 capsule.dataset.phase=s.phase;if(Object.prototype.hasOwnProperty.call(s,'variant'))capsule.dataset.variant=s.variant||'';capsule.classList.toggle('hidden',s.phase==='hidden');label.textContent=labels[s.phase]||'Dictée';detail.textContent=s.detail||(s.phase==='recording'?'Micro actif':s.phase==='transcribing'?'Chargement GPU…':'Whisper local');detail.title=detail.textContent;time.textContent='';bars.forEach(b=>b.style.height='3px');
 if(s.phase==='transcribing'){
  const since=performance.now();
  const tick=()=>{time.textContent=`${Math.floor((performance.now()-since)/1000)} s`;};
  tick();elapsedTimer=setInterval(tick,250);
 }
});
window.dictation.onLevel(v=>{time.textContent=`${Math.floor(v.seconds/60)}:${String(v.seconds%60).padStart(2,'0')}`;bars.forEach((b,i)=>b.style.height=`${3+Math.min(1,v.level*12)*(15-Math.abs(i-3)*3)}px`);});
window.dictation.onProgress(v=>{if(v.gpu&&capsule.dataset.phase==='transcribing')detail.textContent='RTX 4060 · En cours';});
window.dictation.onLanguage(v=>{language.textContent=String(v).toUpperCase();capsule.dataset.language=v;language.classList.remove('changed');void language.offsetWidth;language.classList.add('changed');setTimeout(()=>language.classList.remove('changed'),420);});
document.querySelector('.icon').addEventListener('click',event=>{event.stopPropagation();window.dictation.toggleLanguage();});
