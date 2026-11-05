/* 通用工具：DOM、事件、格式化 —— 全局命名空间 CVL */
(function () {
  const CVL = (window.CVL = window.CVL || {});
  CVL.util = {};
  const U = CVL.util;

  U.$ = (s, r) => (r || document).querySelector(s);
  U.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  U.el = function (tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  };
  U.h = function (html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.round = (v, n) => {
    const p = Math.pow(10, n);
    return Math.round(v * p) / p;
  };
  U.fmt = function (v, n) {
    if (v === undefined || v === null || Number.isNaN(v)) return '—';
    if (typeof v !== 'number') return String(v);
    if (Number.isInteger(v)) return String(v);
    return U.round(v, n === undefined ? 2 : n).toString();
  };
  U.bytes = function (n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  };
  U.pad = (n, w) => String(n).padStart(w || 2, '0');

  U.debounce = function (fn, ms) {
    let t = 0;
    return function () {
      const a = arguments, s = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(s, a), ms);
    };
  };
  U.rafThrottle = function (fn) {
    let queued = false, lastArgs = null;
    return function () {
      lastArgs = arguments;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        fn.apply(null, lastArgs);
      });
    };
  };

  /* 简易事件总线 */
  const map = new Map();
  CVL.bus = {
    on(evt, fn) {
      if (!map.has(evt)) map.set(evt, new Set());
      map.get(evt).add(fn);
      return () => map.get(evt).delete(fn);
    },
    emit(evt, payload) {
      const s = map.get(evt);
      if (s) s.forEach((f) => { try { f(payload); } catch (e) { console.error(e); } });
    },
  };

  let toastTimer = 0;
  U.toast = function (msg, ms) {
    const t = U.$('#toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), ms || 1900);
  };

  /* 颜色工具 */
  U.hsl2rgb = function (h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  };

  /* 灰度值 -> 热力色（深色底，0 暗 255 亮） */
  U.grayColor = function (v) {
    const t = U.clamp(v / 255, 0, 1);
    const lo = [22, 26, 32], hi = [232, 240, 248];
    const g = Math.round(lo[0] + (hi[0] - lo[0]) * t);
    const g2 = Math.round(lo[1] + (hi[1] - lo[1]) * t);
    const g3 = Math.round(lo[2] + (hi[2] - lo[2]) * t);
    return `rgb(${g},${g2},${g3})`;
  };
  U.lum = (v) => (v > 150 ? '#0b0d10' : '#dfe6ee');
})();
