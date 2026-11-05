const {execFile,spawn} = require('node:child_process');
const {promisify} = require('node:util');
const exec=promisify(execFile);
async function hypr(args){return (await exec('hyprctl',args,{timeout:2500,maxBuffer:1024*1024})).stdout.trim();}
async function active(){return JSON.parse(await hypr(['-j','activewindow']));}
function shortcut(w){return /terminal|kitty|alacritty|wezterm|foot|konsole|ghostty|scratchterm|nvterminal/i.test(w.class||'')?'CTRL SHIFT, V':'CTRL, V';}
async function copy(text){await new Promise((resolve,reject)=>{
 // wl-copy se détache après avoir acquis le presse-papiers. Attendre sa
 // sortie, sans pipes hérités par le processus qui conserve la sélection.
 const p=spawn('wl-copy',['--type','text/plain;charset=utf-8'],{stdio:['pipe','ignore','ignore']});
 const timer=setTimeout(()=>{p.kill('SIGTERM');reject(Error('Copie impossible.'));},2000);
 p.once('error',()=>{clearTimeout(timer);reject(Error('Copie impossible.'));});
 p.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Copie impossible.'));});
 p.stdin.on('error',()=>{});p.stdin.end(text);
});}
async function deliver(text,target,valid=()=>true){
 if(!valid())return 'cancelled';
 await copy(text);
 const w=await active();
 if(!valid())return 'cancelled';
 // Ne jamais déplacer le focus : un changement de fenêtre conserve seulement la copie.
 if(!target.address || w.address!==target.address || w.class!==target.class)return 'copied';
 const response=await hypr(['dispatch','sendshortcut',`${shortcut(target)}, address:${target.address}`]);
 if(response!=='ok')return 'copied';
 return 'pasted';
}
module.exports={hypr,active,shortcut,deliver,copy};
