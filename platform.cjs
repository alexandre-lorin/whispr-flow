const os = require('node:os');

const platform = process.platform;
const supported = new Set(['linux', 'win32', 'darwin']);

function currentPlatform() {
  if (!supported.has(platform)) throw Error(`Système non pris en charge : ${platform}`);
  return platform;
}

function capabilities(name = currentPlatform()) {
  return {
    id: name,
    label: name === 'linux' ? 'Linux / Hyprland' : name === 'win32' ? 'Windows' : 'macOS',
    nativeCapture: name === 'linux' ? 'PipeWire' : name === 'win32' ? 'WASAPI' : 'AVFoundation',
    nativeClipboard: name === 'linux' ? 'Wayland' : name === 'win32' ? 'Win32' : 'NSPasteboard',
    gpu: name === 'win32' ? 'CUDA / DirectML' : name === 'darwin' ? 'Metal' : 'CUDA',
    status: name === 'linux' ? 'production' : 'planned',
  };
}

module.exports = { currentPlatform, capabilities, platform: currentPlatform(), version: os.release() };
