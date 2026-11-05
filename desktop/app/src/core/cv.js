/* 主线程图像引擎客户端：与算子线程通信 + 基于 ImageData 的像素工具 */
(function () {
  const CVL = window.CVL;
  const U = CVL.util;

  const W = {
    worker: null,
    ready: null,
    pending: new Map(),
    seq: 0,
    status: 'idle',
    srcID: null,     // 原图 ImageData
    outIDs: [],      // 每步输出 ImageData
  };

  W.maxSide = 880;   // 工作分辨率上限（长边）：纯 JS 内核在 880 左右仍可保持交互流畅

  W.init = function () {
    if (W.ready) return W.ready;
    W.status = 'loading';
    W.ready = new Promise((resolve, reject) => {
      try {
        W.worker = new Worker('src/core/worker.js');
      } catch (e) { reject(e); return; }
      const timer = setTimeout(() => reject(new Error('算子线程初始化超时')), 180000);
      W.worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'ready') {
          clearTimeout(timer);
          W.status = 'ready';
          W.caps = m.has || {};
          resolve(W);
          return;
        }
        if (m.type === 'error') {
          U.toast('算子线程出错：' + m.message);
          console.error('[worker]', m);
          return;
        }
        const p = W.pending.get(m.type);
        if (p) { W.pending.delete(m.type); p(m); }
      };
      W.worker.onerror = (err) => {
        console.error('[worker error]', err);
        clearTimeout(timer);
        W.status = 'error';
        reject(new Error('Worker 加载失败：' + (err.message || '未知')));
      };
      W.worker.postMessage({ type: 'init' });
    });
    return W.ready;
  };

  /* 发消息并等待指定类型的回包；respType 与请求类型可以不同（run -> result） */
  function call(type, payload, transfer, respType) {
    return new Promise((resolve, reject) => {
      const key = respType || type;
      W.pending.set(key, resolve);
      W.worker.postMessage(Object.assign({ type }, payload), transfer || []);
      setTimeout(() => {
        if (W.pending.get(key) === resolve) {
          W.pending.delete(key);
          reject(new Error('算子线程无响应：' + type));
        }
      }, 30000);
    });
  }

  /* 设置原图（ImageData），返回 Promise */
  W.setSource = function (imageData) {
    if (imageData.width > W.maxSide || imageData.height > W.maxSide) {
      imageData = W.resizeImageData(imageData, W.maxSide);
    }
    W.srcID = imageData;
    const copy = new Uint8ClampedArray(imageData.data);
    return call('source', { buf: copy.buffer, w: imageData.width, h: imageData.height }, [copy.buffer]);
  };

  /* 执行算子链；dirtyFrom 允许只重算后半段（前面的产物已缓存） */
  W.run = async function (steps, dirtyFrom) {
    const res = await call('run', {
      steps: steps.map((s) => ({ id: s.id, params: s.params, enabled: s.enabled })),
      dirtyFrom: dirtyFrom || 0,
    }, [], 'result');
    const outs = res.outs.map((o) => new ImageData(new Uint8ClampedArray(o.buf), o.w, o.h));
    W.outIDs = outs;
    W.lastMs = res.ms;
    return { outs, ms: res.ms, metas: res.metas };
  };

  W.probe = function (index, x, y) {
    return call('probe', { index, x, y });
  };

  /* ---------- 主线程工具 ---------- */
  W.canvasFrom = function (src) {
    const c = document.createElement('canvas');
    c.width = src.naturalWidth || src.width;
    c.height = src.naturalHeight || src.height;
    c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
    return c;
  };

  W.imageDataFrom = function (src) {
    const c = W.canvasFrom(src);
    return c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);
  };

  W.resizeImageData = function (id, maxSide) {
    const s = Math.min(1, maxSide / Math.max(id.width, id.height));
    const w = Math.max(1, Math.round(id.width * s));
    const h = Math.max(1, Math.round(id.height * s));
    const src = document.createElement('canvas');
    src.width = id.width; src.height = id.height;
    src.getContext('2d').putImageData(id, 0, 0);
    const dst = document.createElement('canvas');
    dst.width = w; dst.height = h;
    const ctx = dst.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  };

  W.canvasOf = function (id) {
    const c = document.createElement('canvas');
    c.width = id.width; c.height = id.height;
    c.getContext('2d').putImageData(id, 0, 0);
    return c;
  };

  /* 取像素（RGB / 灰度 / HSV） */
  W.pixelAt = function (id, x, y, channel) {
    if (!id || x < 0 || y < 0 || x >= id.width || y >= id.height) return null;
    const i = (y * id.width + x) * 4;
    const d = id.data;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (!channel || channel === 'rgb') return [r, g, b];
    if (channel === 'gray') return [Math.round(0.299 * r + 0.587 * g + 0.114 * b)];
    if (channel === 'r') return [r];
    if (channel === 'g') return [g];
    if (channel === 'b') return [b];
    return W.rgb2hsv(r, g, b, channel);
  };

  W.rgb2hsv = function (r, g, b, only) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), df = mx - mn;
    let h = 0;
    if (df > 1e-6) {
      if (mx === r) h = ((g - b) / df) % 6;
      else if (mx === g) h = (b - r) / df + 2;
      else h = (r - g) / df + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    const s = mx <= 0 ? 0 : df / mx;
    const v = mx;
    // OpenCV 口径：H 折半到 0–179，S/V 到 0–255
    const H = Math.round(h / 2), S = Math.round(s * 255), V = Math.round(v * 255);
    if (only === 'h') return [H, h];
    if (only === 's') return [S, s];
    if (only === 'v') return [V, v];
    return [H, S, V, h, s, v];
  };

  /* 从 ImageData 取一块通道数值矩阵 */
  W.patchOf = function (id, x0, y0, w, h, channel) {
    const rows = [];
    for (let r = 0; r < h; r++) {
      const row = [];
      for (let c = 0; c < w; c++) {
        const xx = U.clamp(x0 + c, 0, id.width - 1);
        const yy = U.clamp(y0 + r, 0, id.height - 1);
        const v = W.pixelAt(id, xx, yy, channel || 'gray');
        row.push(v ? v[0] : 0);
      }
      rows.push(row);
    }
    return { data: rows, w, h, float: false };
  };

  /* 通道整图（给 A 区显示单通道） */
  W.channelImage = function (id, channel) {
    const out = new ImageData(id.width, id.height);
    const s = id.data, d = out.data;
    const n = id.width * id.height;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const o = i * 4;
      let v;
      if (channel === 'r') v = s[o];
      else if (channel === 'g') v = s[o + 1];
      else if (channel === 'b') v = s[o + 2];
      else if (channel === 'h') v = W.rgb2hsv(s[o], s[o + 1], s[o + 2], 'h')[0] * 255 / 179;
      else if (channel === 's') v = W.rgb2hsv(s[o], s[o + 1], s[o + 2], 's')[0];
      else if (channel === 'v') v = W.rgb2hsv(s[o], s[o + 1], s[o + 2], 'v')[0];
      else v = 0.299 * s[o] + 0.587 * s[o + 1] + 0.114 * s[o + 2];
      d[j] = v; d[j + 1] = v; d[j + 2] = v; d[j + 3] = 255;
    }
    return out;
  };

  CVL.cv = W;
})();
