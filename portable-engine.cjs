const { createGPU } = require('./gpu.cjs');
const { segmenter, pcmLevel, clean } = require('./audio.cjs');

function createPortableDictation(options = {}) {
  const gpu = options.gpu || createGPU({ onState: options.onProgress });
  let current;

  async function start() {
    if (current) throw Error('Une dictée est déjà ouverte.');
    const controller = new AbortController();
    const job = current = { controller, parts: [], bytes: 0, level: 0, started: Date.now() };
    job.segmenter = segmenter(pcm => {
      job.parts.push(gpu.submit(pcm, { signal: controller.signal }).then(text => ({ text }), error => ({ error })));
    });
    await gpu.start();
  }

  function push(chunk) {
    if (!current || current.controller.signal.aborted) return;
    const pcm = Buffer.from(chunk);
    current.bytes += pcm.length;
    current.level = pcmLevel(pcm);
    current.segmenter.push(pcm);
  }

  async function finish() {
    const job = current;
    if (!job) throw Error('Aucune dictée ouverte.');
    current = null;
    job.segmenter.finish();
    const parts = await Promise.all(job.parts);
    if (job.controller.signal.aborted) throw Error('Dictée annulée.');
    const failed = parts.find(part => part.error);
    if (failed) throw failed.error;
    const text = clean(parts.map(part => part.text).join(' '));
    if (!text) throw Error('Aucune parole reconnue.');
    job.segmenter.clear();
    return text;
  }

  function cancel() {
    if (!current) return;
    current.controller.abort();
    current.segmenter.clear();
    current.parts = [];
    current = null;
  }

  function status() {
    return { recording: Boolean(current), seconds: current ? Math.floor((Date.now() - current.started) / 1000) : 0, gpu: gpu.status() };
  }

  function disposeNow() { cancel(); gpu.disposeNow(); }
  return { start, push, finish, cancel, status, disposeNow };
}

module.exports = { createPortableDictation };
