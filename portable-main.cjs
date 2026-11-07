const { app, BrowserWindow, globalShortcut, ipcMain, clipboard, screen, session } = require('electron');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { createPortableDictation } = require('./portable-engine.cjs');
const { SIZE } = require('./geometry.cjs');

app.setName('Whispr Flow');
app.setPath('userData', path.join(app.getPath('userData'), 'portable'));
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();

let capsule, recorder, ready = false, recording = false, finishing = false, cursorPosition;
const engine = createPortableDictation({ onProgress: () => updateCapsule() });

function updateCapsule(phase, detail = '') {
  if (!capsule || capsule.isDestroyed()) return;
  capsule.webContents.send('state', { phase, detail });
}

function positionCapsule() {
  const point = cursorPosition || screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const area = display.workArea;
  let x = point.x + 14, y = point.y + 14;
  if (x + SIZE.width > area.x + area.width) x = point.x - SIZE.width - 14;
  if (y + SIZE.height > area.y + area.height) y = point.y - SIZE.height - 14;
  x = Math.max(area.x + 4, Math.min(x, area.x + area.width - SIZE.width - 4));
  y = Math.max(area.y + 4, Math.min(y, area.y + area.height - SIZE.height - 4));
  capsule.setBounds({ x, y, width: SIZE.width, height: SIZE.height });
}

function paste() {
  if (process.platform === 'darwin') {
    execFile('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down'], () => {});
  } else if (process.platform === 'win32') {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"], { windowsHide: true }, () => {});
  }
}

async function toggle() {
  if (finishing) return;
  if (!recording) {
    cursorPosition = screen.getCursorScreenPoint();
    positionCapsule(); capsule.showInactive();
    recording = true; updateCapsule('recording');
    try { recorder.webContents.send('record:command', 'start'); await engine.start(); }
    catch (error) { recording = false; updateCapsule('error', error.message); setTimeout(() => capsule.hide(), 1600); }
    return;
  }
  recording = false; finishing = true; recorder.webContents.send('record:command', 'stop'); updateCapsule('transcribing');
  try {
    const text = await engine.finish();
    clipboard.writeText(text);
    capsule.hide();
    paste();
  } catch (error) { updateCapsule('error', error.message); setTimeout(() => capsule.hide(), 2200); }
  finally { finishing = false; }
}

function cancel() {
  recording = false; finishing = false; recorder?.webContents.send('record:command', 'stop'); engine.cancel(); capsule?.hide();
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => callback(permission === 'media'));
  capsule = new BrowserWindow({ title: 'Whispr Flow', ...SIZE, show: false, frame: false, transparent: true, focusable: true, skipTaskbar: true, resizable: false, alwaysOnTop: true, hasShadow: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  await capsule.loadFile(path.join(__dirname, 'index.html'));
  recorder = new BrowserWindow({ show: false, width: 1, height: 1, webPreferences: { preload: path.join(__dirname, 'portable-preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  await recorder.loadFile(path.join(__dirname, 'portable-recorder.html'));
  ipcMain.on('record:ready', event => { if (event.sender === recorder.webContents) ready = true; });
  ipcMain.on('record:chunk', (event, chunk) => { if (event.sender === recorder.webContents && recording) engine.push(Buffer.from(chunk)); });
  ipcMain.on('record:error', (event, message) => { if (event.sender === recorder.webContents) { recording = false; engine.cancel(); updateCapsule('error', message); } });
  globalShortcut.register('F9', toggle);
  globalShortcut.register('Shift+F9', cancel);
  screen.on('display-metrics-changed', () => { if (recording) positionCapsule(); });
  void engine.status;
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); engine.disposeNow(); recorder?.destroy(); });
app.on('window-all-closed', () => {});
