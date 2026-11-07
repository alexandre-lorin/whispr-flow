const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('recorder', {
  onCommand: fn => ipcRenderer.on('record:command', (_event, command) => fn(command)),
  sendChunk: chunk => ipcRenderer.send('record:chunk', chunk),
  sendError: message => ipcRenderer.send('record:error', String(message).slice(0, 200)),
  ready: () => ipcRenderer.send('record:ready'),
});
