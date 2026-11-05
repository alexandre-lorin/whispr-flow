// Ne jamais stocker Error.message : il peut contenir une commande ou du texte.
function errorCode(error){
 const message=String(error?.message||'');
 if(/capsule ne répond/.test(message))return 'UI_TIMEOUT';
 if(/Capsule absente/.test(message))return 'UI_MAPPING';
 if(/Placement de la capsule/.test(message))return 'UI_PLACEMENT';
 if(/Microphone|Capture interrompue/.test(message))return 'MICROPHONE';
 if(/Aucune parole/.test(message))return 'NO_SPEECH';
 if(/Copie impossible/.test(message))return 'CLIPBOARD';
 if(/annulée/.test(message))return 'CANCELLED';
 if(['ECONNRESET','ECONNREFUSED','EPIPE'].includes(error?.code))return 'ENGINE_CONNECTION';
 return 'TRANSCRIPTION';
}
function createDiagnostics(){
 const entries=[];
 return {add(error){const code=errorCode(error);if(code==='CANCELLED')return code;entries.push({at:new Date().toISOString(),code});if(entries.length>20)entries.shift();return code;},list:()=>entries.map(e=>({...e}))};
}
module.exports={errorCode,createDiagnostics};
