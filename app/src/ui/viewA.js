/* A 区：原图 / 处理后 对比，直方图与指标（基于 ImageData 渲染） */
(function () {
  const CVL = window.CVL;
  const U = CVL.util;

  function A() {
    this.el = U.$('#aBody');
    this.mode = 'side';
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.fitScale = 1;
    this.hover = null;
    this.orig = null; this.proc = null;
    this.origID = null; this.procID = null;
    this.split = 0.5;
    this.srcCV = document.createElement('canvas');
    this.procCV = document.createElement('canvas');
    this.diffCV = document.createElement('canvas');
    this._build();
  }

  A.prototype._build = function () {
    const self = this;
    this.el.innerHTML = '';
    const wrap = U.el('div', 'a-wrap');
    const stageWrap = U.el('div', 'a-stage-wrap');
    this.canvas = U.el('canvas', 'a-stage');
    stageWrap.appendChild(this.canvas);
    const side = U.el('div', 'a-side');

    const hb = U.el('div', 'histo-box');
    const ht = U.el('div', 'histo-title');
    ht.innerHTML = '<span>直方图</span><span style="color:#4c9aff">处理后</span>';
    this.hCanvas = U.el('canvas');
    this.hCanvas.height = 78;
    hb.appendChild(ht); hb.appendChild(this.hCanvas);
    side.appendChild(hb);

    const mb = U.el('div', 'histo-box');
    this.mBox = U.el('div');
    mb.appendChild(this.mBox);
    side.appendChild(mb);

    this.note = U.el('div', 'a-note');
    side.appendChild(this.note);

    const lg = U.el('div', 'a-legend');
    lg.innerHTML = '<span>滚轮缩放</span><span>拖拽平移</span><span>点击取像素</span>';
    side.appendChild(lg);

    wrap.appendChild(stageWrap);
    wrap.appendChild(side);
    this.el.appendChild(wrap);

    const tools = U.$('#aTools');
    tools.innerHTML = '';
    const seg = U.el('div', 'seg');
    const modes = [['side', '并排'], ['slider', '滑块'], ['diff', '差分'], ['overlay', '叠加']];
    modes.forEach(([k, lab]) => {
      const b = U.el('button', k === this.mode ? 'on' : '', lab);
      b.onclick = () => self.setMode(k);
      seg.appendChild(b);
    });
    tools.appendChild(seg);
    const fitBtn = U.el('button', 'chip', '适应');
    fitBtn.onclick = () => { self.zoom = 1; self.pan = { x: 0, y: 0 }; self._fit(); self.draw(); };
    tools.appendChild(fitBtn);

    this._bindEvents(stageWrap);
    this.resize();
    new ResizeObserver(() => { this.resize(); this.draw(); }).observe(stageWrap);
  };

  A.prototype._bindEvents = function () {
    const c = this.canvas;
    let dragging = false, last = null;

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const k = e.deltaY < 0 ? 1.14 : 1 / 1.14;
      const z2 = U.clamp(this.zoom * k, 0.5, 24);
      const real = this.zoom * this.fitScale;
      const real2 = z2 * this.fitScale;
      const cx = this.canvas.width / 2, cy = this.canvas.height / 2;
      const ox = (mx * devicePixelRatio - cx - this.pan.x) / real;
      const oy = (my * devicePixelRatio - cy - this.pan.y) / real;
      this.pan.x = mx * devicePixelRatio - cx - ox * real2;
      this.pan.y = my * devicePixelRatio - cy - oy * real2;
      this.zoom = z2;
      this.draw();
    }, { passive: false });

    c.addEventListener('mousedown', (e) => { dragging = true; last = { x: e.clientX, y: e.clientY }; c.style.cursor = 'grabbing'; });
    window.addEventListener('mouseup', () => { dragging = false; c.style.cursor = 'crosshair'; });
    c.addEventListener('mousemove', (e) => {
      if (dragging && last) {
        this.pan.x += (e.clientX - last.x) * devicePixelRatio;
        this.pan.y += (e.clientY - last.y) * devicePixelRatio;
        last = { x: e.clientX, y: e.clientY };
        this.draw();
        return;
      }
      const p = this._toImage(e);
      if (p) { this.hover = p; CVL.bus.emit('probe', p); }
    });
    c.addEventListener('mouseleave', () => { this.hover = null; this.draw(); });
    c.addEventListener('click', (e) => {
      const p = this._toImage(e);
      if (p) CVL.bus.emit('probe', p);
    });
  };

  A.prototype._viewport = function () {
    const w = this.canvas.width, h = this.canvas.height;
    if (this.mode === 'side') {
      const half = w / 2 - 6;
      return [
        { x: 0, y: 0, w: half, h, img: this.orig },
        { x: w / 2 + 6, y: 0, w: half, h, img: this.proc },
      ];
    }
    return [{ x: 0, y: 0, w, h, img: this.proc }];
  };

  A.prototype._fit = function () {
    const img = this.orig || this.proc;
    if (!img) return;
    const w = this.canvas.width, h = this.canvas.height;
    const vw = this.mode === 'side' ? w / 2 - 6 : w;
    this.fitScale = Math.min(vw / img.width, h / img.height) * 0.94;
  };

  A.prototype._toImage = function (e) {
    const r = this.canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * devicePixelRatio;
    const my = (e.clientY - r.top) * devicePixelRatio;
    const vs = this._viewport();
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (mx < v.x || mx > v.x + v.w) continue;
      if (!v.img) return null;
      const s = this.zoom * this.fitScale;
      const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
      const ix = (mx - cx - this.pan.x) / s + v.img.width / 2;
      const iy = (my - cy - this.pan.y) / s + v.img.height / 2;
      if (ix >= 0 && iy >= 0 && ix < v.img.width && iy < v.img.height) {
        return { x: Math.floor(ix), y: Math.floor(iy) };
      }
    }
    return null;
  };

  A.prototype.resize = function () {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    this.canvas.width = Math.max(80, Math.round(r.width * dpr));
    this.canvas.height = Math.max(80, Math.round(r.height * dpr));
    this._fit();
  };

  A.prototype._toCanvas = function (id, canvas) {
    if (!id) return null;
    canvas.width = id.width; canvas.height = id.height;
    canvas.getContext('2d').putImageData(id, 0, 0);
    return canvas;
  };

  A.prototype.setImages = function (origID, procID) {
    this.origID = origID; this.procID = procID;
    this.orig = this._toCanvas(origID, this.srcCV);
    this.proc = this._toCanvas(procID, this.procCV);
    if (origID && procID && origID.width === procID.width && origID.height === procID.height) {
      this.diffCV.width = origID.width; this.diffCV.height = origID.height;
      const ctx = this.diffCV.getContext('2d');
      const o = ctx.createImageData(origID.width, origID.height);
      const a = origID.data, b = procID.data;
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.min(255, (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3 * 4);
        o.data[i] = d; o.data[i + 1] = d; o.data[i + 2] = d; o.data[i + 3] = 255;
      }
      ctx.putImageData(o, 0, 0);
    }
    if (!this._fitted) { this._fit(); this._fitted = true; }
    this.draw();
  };

  A.prototype.setMode = function (m) {
    this.mode = m;
    const seg = U.$('#aTools .seg');
    if (seg) {
      const keys = ['side', 'slider', 'diff', 'overlay'];
      U.$$('button', seg).forEach((b, i) => b.classList.toggle('on', keys[i] === m));
    }
    this._fit();
    this.draw();
  };

  A.prototype.setMetrics = function (m, note) {
    this.metrics = m;
    if (note !== undefined) this.note.textContent = note || '';
    const rows = [
      ['PSNR', m.psnr == null ? '—' : (isFinite(m.psnr) ? m.psnr.toFixed(2) + ' dB' : '∞')],
      ['SSIM', m.ssim == null ? '—' : m.ssim.toFixed(3)],
      ['噪声 σ', m.noise == null ? '—' : m.noise.toFixed(1)],
      ['边缘能量', m.edge == null ? '—' : m.edge.toFixed(1)],
      ['耗时', m.ms == null ? '—' : m.ms.toFixed(1) + ' ms'],
      ['尺寸', m.size ? m.size : '—'],
    ];
    this.mBox.innerHTML = rows.map((r) => '<div class="metric"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
  };

  A.prototype.setOverview = function (html, note) {
    let ov = U.$('.a-ov', this.el);
    if (!ov) {
      ov = U.el('div', 'a-ov');
      U.$('.a-stage-wrap', this.el).appendChild(ov);
    }
    ov.innerHTML = '<div class="ov">' + html + '</div>';
    ov.hidden = false;
    if (note) this.note.textContent = note;
  };
  A.prototype.clearOverview = function () {
    const ov = U.$('.a-ov', this.el);
    if (ov) ov.hidden = true;
  };

  A.prototype.draw = function () {
    const ctx = this.canvas.getContext('2d');
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0f1113';
    ctx.fillRect(0, 0, W, H);
    if (!this.orig) return;

    const s = this.zoom * this.fitScale;
    const dpr = devicePixelRatio || 1;
    const self = this;

    function drawImg(img, v) {
      if (!img) return null;
      const dw = img.width * s, dh = img.height * s;
      const cx = v.x + v.w / 2 + self.pan.x;
      const cy = v.y + v.h / 2 + self.pan.y;
      ctx.imageSmoothingEnabled = s < 2.4;
      ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
      return { x: cx - dw / 2, y: cy - dh / 2, w: dw, h: dh };
    }

    if (this.mode === 'side') {
      const vs = this._viewport();
      drawImg(this.orig, vs[0]);
      const r1 = drawImg(this.proc, vs[1]);
      ctx.strokeStyle = '#2c333b'; ctx.lineWidth = 1 * dpr;
      ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
      this._label(ctx, '原图', 12 * dpr, 16 * dpr, dpr, '#8b949e');
      this._label(ctx, '处理后', W / 2 + 12 * dpr, 16 * dpr, dpr, '#7fb4ff');
      if (r1) this._mark(ctx, r1, s, dpr);
    } else if (this.mode === 'slider') {
      const v = this._viewport()[0];
      const r = drawImg(this.orig, v);
      const sx = v.x + v.w * this.split;
      ctx.save();
      ctx.beginPath(); ctx.rect(v.x, v.y, sx - v.x, v.h); ctx.clip();
      drawImg(this.proc, v);
      ctx.restore();
      ctx.strokeStyle = '#4c9aff'; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
      ctx.fillStyle = '#4c9aff';
      ctx.beginPath(); ctx.arc(sx, H / 2, 7 * dpr, 0, Math.PI * 2); ctx.fill();
      this._label(ctx, '原图', 12 * dpr, 16 * dpr, dpr, '#8b949e');
      this._label(ctx, '处理后', sx + 10 * dpr, 16 * dpr, dpr, '#7fb4ff');
      if (r) this._mark(ctx, r, s, dpr);
    } else if (this.mode === 'diff') {
      drawImg(this.diffCV, this._viewport()[0]);
      this._label(ctx, '差分 |原图 − 处理后| ×4', 12 * dpr, 16 * dpr, dpr, '#f5a524');
    } else {
      const v = this._viewport()[0];
      drawImg(this.orig, v);
      ctx.globalAlpha = 0.5;
      drawImg(this.proc, v);
      ctx.globalAlpha = 1;
      this._label(ctx, '叠加 50%', 12 * dpr, 16 * dpr, dpr, '#a78bfa');
    }

    if (this.hover && this.mode !== 'diff') {
      const v = this._viewport()[0];
      const img = this.orig;
      const dw = img.width * s, dh = img.height * s;
      const cx = v.x + v.w / 2 + this.pan.x, cy = v.y + v.h / 2 + this.pan.y;
      const px = cx - dw / 2 + this.hover.x * s;
      const py = cy - dh / 2 + this.hover.y * s;
      ctx.strokeStyle = 'rgba(76,154,255,.5)'; ctx.lineWidth = 1 * dpr;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
    }
  };

  A.prototype._mark = function (ctx, rect, s, dpr) {
    if (!this.hover) return;
    const px = rect.x + this.hover.x * s;
    const py = rect.y + this.hover.y * s;
    ctx.strokeStyle = '#4c9aff';
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeRect(px - s / 2, py - s / 2, s, s);
  };

  A.prototype._label = function (ctx, txt, x, y, dpr, color) {
    ctx.font = (11 * dpr) + 'px ' + getComputedStyle(document.body).fontFamily;
    const w = ctx.measureText(txt).width;
    ctx.fillStyle = 'rgba(12,14,16,.72)';
    ctx.fillRect(x - 5 * dpr, y - 11 * dpr, w + 10 * dpr, 16 * dpr);
    ctx.fillStyle = color;
    ctx.fillText(txt, x, y);
  };

  A.prototype.drawHisto = function () {
    const c = this.hCanvas;
    if (!c.parentElement) return;
    const box = c.parentElement.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    c.width = Math.max(80, Math.round((box.width - 14) * dpr));
    c.height = Math.round(78 * dpr);
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#181b1f';
    ctx.fillRect(0, 0, W, H);
    if (!this.origID || !this.procID) return;
    const h1 = CVL.metrics.hist(this.origID);
    const h2 = CVL.metrics.hist(this.procID);
    const mx = Math.max(h1.max, h2.max, 1);
    const bar = (arr, color, alpha) => {
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      for (let i = 0; i < 256; i++) {
        const v = arr[i] / mx;
        const h = v * (H - 6);
        if (h > 0.4) ctx.fillRect((i / 256) * W, H - h, W / 256 + 0.6, h);
      }
      ctx.globalAlpha = 1;
    };
    bar(h1.gray, '#5c6673', 0.55);
    bar(h2.gray, '#4c9aff', 0.85);
  };

  CVL.ViewA = A;
})();
