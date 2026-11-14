#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = __dirname;
const result = spawnSync(process.execPath, [path.join(root, 'cli.cjs'), 'status'], { encoding: 'utf8', timeout: 1800 });
let status;
try { status = JSON.parse(result.stdout || '{}'); } catch { status = { state: 'idle' }; }

const gpu = status.gpu?.state || 'cold';
const pending = status.pending || 0;
const state = status.recording ? 'recording' : status.active ? (gpu === 'yielded' ? 'waiting' : 'transcribing') : 'idle';
const pulse = ['·', '••', '•••'][Math.floor(Date.now() / 180) % 3];
const labels = { recording: `󰍬 ${pulse}`, transcribing: `󰄀 ${pulse}`, waiting: '󰒲 Attente GPU', idle: '' };
const tooltip = state === 'idle' ? 'Whispr Flow · inactif' : `Whispr Flow · ${state} · GPU ${gpu}${pending ? ` · ${pending} en attente` : ''}`;
process.stdout.write(JSON.stringify({ text: labels[state], alt: state, class: state, tooltip }));
