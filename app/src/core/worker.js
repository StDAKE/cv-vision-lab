/* 算子线程：在 Worker 中执行纯 JS 算子链（无 WASM / 无第三方库），主线程零阻塞
   消息协议：
     {type:'init'}                          -> {type:'ready', version}
     {type:'source', buf, w, h}             -> {type:'source', w, h}      buf 为 RGBA
     {type:'run', steps, dirtyFrom}         -> {type:'result', outs[], metas[], ms}
     {type:'probe', index, x, y}            -> {type:'probe', vals[], ch, x, y}
*/
/* global CVL, importScripts, self */

self.CVL = self.CVL || {};
const W = self.CVL;
W.util = {
  round: (v, n) => { const p = Math.pow(10, n === undefined ? 2 : n); return Math.round(v * p) / p; },
  fmt: (v, n) => (v === undefined || v === null || Number.isNaN(v) ? '—' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : W.util.round(v, n).toString()) : String(v)),
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
};
W.op = { map: new Map(), groups: [] };
W.bus = { on() {}, emit() {} };

importScripts('imgops.js');
importScripts('../operators/registry.js');
importScripts('../operators/ops.js');

const IO = W.IO;

let srcImg = null;          // {w,h,c,d} RGB uint8
let outputs = [];           // 每步输出
let metas = [];
let lastIds = null;

function rgbaOf(im) {
  // 返回新的 Uint8ClampedArray，buffer 可直接 transfer（不会影响缓存）
  return IO.toRGBA(im);
}

function exec(steps, from) {
  let input = from === 0 ? srcImg : (outputs[from - 1] || srcImg);
  for (let i = from; i < steps.length; i++) {
    const st = steps[i] || {};
    const def = st.enabled === false ? null : W.op.get(st.id);
    if (!def) { outputs[i] = input; metas[i] = null; continue; }
    try {
      const res = def.run(input, st.params || {});
      const o = res && res.out ? res.out : input;
      if (!o || !o.w || !o.h) throw new Error('算子的输出不是合法图像');
      outputs[i] = o;
      input = o;
      metas[i] = (res && res.meta) || null;
    } catch (err) {
      outputs[i] = input;
      metas[i] = { error: String((err && err.message) || err) };
    }
  }
}

self.onmessage = function (e) {
  const msg = e.data || {};
  try {
    if (msg.type === 'init') {
      self.postMessage({ type: 'ready', version: '纯 JS 内核 · ' + (W.op.map ? W.op.map.size : 0) + ' 个算子' });
      return;
    }

    if (msg.type === 'source') {
      const rgba = new Uint8ClampedArray(msg.buf);
      srcImg = IO.fromRGBA(rgba, msg.w, msg.h);
      outputs = [];
      metas = [];
      lastIds = null;
      self.postMessage({ type: 'source', w: srcImg.w, h: srcImg.h });
      return;
    }

    if (msg.type === 'run') {
      if (!srcImg) { self.postMessage({ type: 'error', message: '原图尚未就绪', where: 'run' }); return; }
      const t0 = performance.now();
      const steps = msg.steps || [];
      const ids = steps.map((s) => s.id + (s.enabled === false ? '-off' : '')).join('|');
      let from = 0;
      if (msg.dirtyFrom > 0 && ids === lastIds && outputs.length === steps.length) {
        from = Math.min(msg.dirtyFrom, steps.length);
      }
      if (from === 0) { outputs = new Array(steps.length).fill(null); metas = new Array(steps.length).fill(null); }
      else { outputs.length = Math.min(outputs.length, steps.length); metas.length = outputs.length; }
      lastIds = ids;

      exec(steps, from);

      const list = [];
      const transfer = [];
      for (let i = 0; i < steps.length; i++) {
        const im = outputs[i] || srcImg;
        const rgba = rgbaOf(im);
        list.push({ buf: rgba.buffer, w: im.w, h: im.h, c: im.c });
        transfer.push(rgba.buffer);
      }
      self.postMessage({ type: 'result', outs: list, metas, ms: performance.now() - t0 }, transfer);
      return;
    }

    if (msg.type === 'probe') {
      const im = (msg.index < 0 || !outputs[msg.index]) ? srcImg : outputs[msg.index];
      if (!im) { self.postMessage({ type: 'probe', vals: [], ch: 0, x: 0, y: 0 }); return; }
      const x = Math.max(0, Math.min(im.w - 1, msg.x | 0));
      const y = Math.max(0, Math.min(im.h - 1, msg.y | 0));
      const c = im.c;
      const o = (y * im.w + x) * c;
      const vals = [];
      for (let ch = 0; ch < c; ch++) vals.push(im.d[o + ch]);
      self.postMessage({ type: 'probe', vals, ch: c, x, y });
      return;
    }

    if (msg.type === 'hist') {
      const im = (msg.index < 0 || !outputs[msg.index]) ? srcImg : outputs[msg.index];
      if (!im) { self.postMessage({ type: 'hist', bins: null }); return; }
      const bins = new Uint32Array(256);
      const n = im.w * im.h;
      for (let i = 0; i < n; i++) {
        const k = i * im.c;
        const v = im.c === 1 ? im.d[k] : (0.299 * im.d[k] + 0.587 * im.d[k + 1] + 0.114 * im.d[k + 2]) | 0;
        bins[v]++;
      }
      self.postMessage({ type: 'hist', bins: bins.buffer }, [bins.buffer]);
      return;
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err), where: msg.type });
  }
};
