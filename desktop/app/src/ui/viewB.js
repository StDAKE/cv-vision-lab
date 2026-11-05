/* B 区：矩阵 / 数字本质 / 滑窗手算 / 中值排序 */
(function () {
  const CVL = window.CVL;
  const U = CVL.util;

  function B() {
    this.el = U.$('#bBody');
    this.channel = 'gray';
    this.ctx = null;
    this.n = 10;
    this._build();
  }

  B.prototype._build = function () {
    const self = this;
    this.el.innerHTML = '';
    const wrap = U.el('div', 'b-wrap');
    const m = U.el('div', 'b-matrix');
    this.canvas = U.el('canvas');
    m.appendChild(this.canvas);
    const p = U.el('div', 'b-panel');
    this.panel = p;
    wrap.appendChild(m); wrap.appendChild(p);
    this.el.appendChild(wrap);

    const tools = U.$('#bTools');
    tools.innerHTML = '';
    const chans = [['gray', '灰'], ['r', 'R'], ['g', 'G'], ['b', 'B'], ['h', 'H'], ['s', 'S'], ['v', 'V']];
    chans.forEach(([k, lab]) => {
      const b = U.el('button', 'chip' + (k === 'gray' ? ' on' : ''), lab);
      b.onclick = () => {
        self.channel = k;
        U.$$('#bTools .chip').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        CVL.bus.emit('channel', k);
        self.draw();
      };
      tools.appendChild(b);
    });
    const layoutBtn = U.el('button', 'chip', 'HWC/CHW');
    layoutBtn.onclick = () => CVL.bus.emit('toggleLayout');
    tools.appendChild(layoutBtn);

    new ResizeObserver(() => { this.size(); this.draw(); }).observe(m);
    this.size();
  };

  B.prototype.size = function () {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    this.canvas.width = Math.max(80, Math.round(r.width * dpr));
    this.canvas.height = Math.max(80, Math.round(r.height * dpr));
  };

  /* 由外部注入上下文 */
  B.prototype.setContext = function (ctx) {
    this.ctx = ctx;
    this.draw();
  };

  B.prototype.draw = function () {
    if (!this.ctx) return;
    this.drawMatrix();
    this.drawPanel();
  };

  B.prototype._patchSize = function () {
    const c = this.ctx;
    let n = 10;
    if (c.demo === 'conv' && c.kernel) n = Math.max(10, c.kernel.length + 5);
    if (c.demo === 'morph' && c.footprint) n = Math.max(10, c.footprint.length + 5);
    return n;
  };

  B.prototype._patch = function () {
    const c = this.ctx;
    const n = this._patchSize();
    const id = c.patchSource;
    if (!id) return null;
    const px = c.probe ? c.probe.x : Math.floor(id.width / 2);
    const py = c.probe ? c.probe.y : Math.floor(id.height / 2);
    const x0 = U.clamp(px - Math.floor(n / 2), 0, Math.max(0, id.width - n));
    const y0 = U.clamp(py - Math.floor(n / 2), 0, Math.max(0, id.height - n));
    this.patchRect = { x: x0, y: y0, n };
    return CVL.cv.patchOf(id, x0, y0, n, n, this.channel);
  };

  B.prototype.drawMatrix = function () {
    const ctx = this.canvas.getContext('2d');
    const dpr = devicePixelRatio || 1;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#121417';
    ctx.fillRect(0, 0, W, H);

    const c = this.ctx;
    if (!c) {
      this._hint(ctx, '选择算子后显示像素矩阵', W, H, dpr);
      return;
    }

    // 1) 中值排序模式
    if (c.demo === 'median' && c.medianFrame) {
      this._drawBars(ctx, W, H, dpr, c.medianFrame);
      return;
    }

    const patch = c.patchData || this._patch();
    if (!patch) { this._hint(ctx, '无数据', W, H, dpr); return; }
    c.patchData = patch;

    const n = patch.w;
    const pad = 14;
    const avail = Math.min(W - pad * 2, H - pad * 2 - 18 * dpr);
    let cell = Math.floor(avail / n);
    cell = Math.max(8, cell);
    const gridW = cell * n, gridH = cell * n;
    const ox = Math.round((W - gridW) / 2);
    const oy = Math.round((H - gridH) / 2 - 4 * dpr);

    // 单元格
    for (let r = 0; r < n; r++) {
      for (let col = 0; col < n; col++) {
        const v = patch.data[r][col];
        const x = ox + col * cell, y = oy + r * cell;
        ctx.fillStyle = U.grayColor(v);
        ctx.fillRect(x, y, cell - 1, cell - 1);
        if (cell >= 20) {
          ctx.fillStyle = U.lum(v);
          ctx.font = `${Math.min(13, Math.floor(cell * 0.36))}px ${'Consolas, monospace'}`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(Math.round(v)), x + cell / 2, y + cell / 2 + 0.5);
        }
      }
    }

    // 网格线
    if (cell >= 10) {
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= n; i++) {
        ctx.beginPath(); ctx.moveTo(ox + i * cell, oy); ctx.lineTo(ox + i * cell, oy + gridH); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox, oy + i * cell); ctx.lineTo(ox + gridW, oy + i * cell); ctx.stroke();
      }
    }

    // 探针
    if (c.probe && this.patchRect) {
      const pr = c.probe.y - this.patchRect.y, pc = c.probe.x - this.patchRect.x;
      if (pr >= 0 && pr < n && pc >= 0 && pc < n) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5 * dpr;
        ctx.strokeRect(ox + pc * cell + 0.5, oy + pr * cell + 0.5, cell - 1, cell - 1);
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.font = `${10 * dpr}px ${'Consolas, monospace'}`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText(`[${c.probe.y}, ${c.probe.x}]`, ox + 2, oy - 6 * dpr);
      }
    }

    // 滑窗 / 形态学框
    if ((c.demo === 'conv' || c.demo === 'morph') && c.frame) {
      const f = c.frame;
      const s = f.s || 1;
      const kh = c.demo === 'morph' && c.footprint ? c.footprint.length : (c.kernel ? c.kernel.length : 3);
      const kw = kh;
      const fr = f.oy * s, fc = f.ox * s;
      ctx.strokeStyle = '#4c9aff';
      ctx.lineWidth = 2.4 * dpr;
      ctx.strokeRect(ox + fc * cell - 1, oy + fr * cell - 1, kw * cell + 1, kh * cell + 1);
      ctx.fillStyle = 'rgba(76,154,255,.14)';
      ctx.fillRect(ox + fc * cell, oy + fr * cell, kw * cell, kh * cell);

      // 参与计算的单元格描边
      if (f.cells) {
        ctx.strokeStyle = 'rgba(245,165,36,.9)';
        ctx.lineWidth = 1 * dpr;
        f.cells.forEach((cc) => {
          if (cc.r < 0 || cc.c < 0 || cc.r >= n || cc.c >= n) return;
          ctx.strokeRect(ox + cc.c * cell + 1, oy + cc.r * cell + 1, cell - 3, cell - 3);
        });
      }
    }

    // 输出位置标记
    if (c.demo === 'conv' && c.outGrid) {
      // 不额外绘制，保留空间
    }

    // 角标
    ctx.fillStyle = '#5c6673';
    ctx.font = `${10.5 * dpr}px ${'Consolas, monospace'}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const r0 = this.patchRect || { x: 0, y: 0 };
    ctx.fillText(`ROI (${r0.x}, ${r0.y})  ${n}×${n}  ${c.patchFloat ? 'float32' : 'uint8'}`, 10 * dpr, 8 * dpr);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`shape (${c.patchFloat ? n : n}, ${n})`, W - 10 * dpr, H - 8 * dpr);
  };

  B.prototype._hint = function (ctx, txt, W, H, dpr) {
    ctx.fillStyle = '#5c6673';
    ctx.font = `${12 * dpr}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, W / 2, H / 2);
  };

  B.prototype._drawBars = function (ctx, W, H, dpr, frame) {
    const arr = frame.arr;
    const n = arr.length;
    const maxV = Math.max(...arr.map((a) => a.v), 1);
    const padX = 40 * dpr, padY = 40 * dpr;
    const bw = (W - padX * 2) / n;
    const baseY = H - padY;
    ctx.font = `${11 * dpr}px ${'Consolas, monospace'}`;
    ctx.textAlign = 'center';
    for (let i = 0; i < n; i++) {
      const a = arr[i];
      const h = (a.v / maxV) * (H - padY * 2);
      const x = padX + i * bw + bw * 0.16;
      const w = bw * 0.68;
      let color;
      color = a.dead ? '#f2555a' : (frame.stage === 'pick' && a === arr[frame.mid] ? '#3ecf8e' : '#4c9aff');
      if (frame.swaps && frame.swaps.includes(i)) color = '#f5a524';
      ctx.fillStyle = color;
      ctx.fillRect(x, baseY - h, w, h);
      ctx.fillStyle = '#c8d0d9';
      ctx.textBaseline = 'bottom';
      ctx.fillText(String(a.v), x + w / 2, baseY - h - 4 * dpr);
    }
    ctx.strokeStyle = '#333941';
    ctx.beginPath(); ctx.moveTo(padX - 8 * dpr, baseY); ctx.lineTo(W - padX + 8 * dpr, baseY); ctx.stroke();
    ctx.fillStyle = '#767f89';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('排序类：把 9 个数排序，取中间 —— 极值被排除，不是被平均', 12 * dpr, 10 * dpr);
    if (frame.stage === 'pick') {
      ctx.fillStyle = '#3ecf8e';
      ctx.font = `${13 * dpr}px ${'Consolas, monospace'}`;
      ctx.fillText(`中值 = ${frame.out}`, 12 * dpr, 30 * dpr);
    }
  };

  B.prototype.drawPanel = function () {
    const c = this.ctx;
    const P = this.panel;
    if (!c) { P.innerHTML = ''; return; }
    const parts = [];

    // 统计
    if (c.patchData) {
      const all = c.patchData.data.flat();
      const mn = Math.min(...all), mx = Math.max(...all);
      const mean = all.reduce((a, b) => a + b, 0) / all.length;
      parts.push(`<div class="kv"><span>min / max</span><b>${U.fmt(mn, 1)} / ${U.fmt(mx, 1)}</b></div>`);
      parts.push(`<div class="kv"><span>mean</span><b>${U.fmt(mean, 2)}</b></div>`);
    }
    parts.push(`<div class="kv"><span>通道</span><b>${this.channel.toUpperCase()}</b></div>`);

    // 核
    if (c.kernel) {
      parts.push('<div class="b-sec">卷积核（人写死的 9 个数）</div>');
      parts.push(this._kernelHTML(c.kernel));
    }
    if (c.footprint) {
      parts.push('<div class="b-sec">结构元素</div>');
      parts.push(this._kernelHTML(c.footprint, true));
    }

    // 算式
    if (c.demo === 'conv' && c.frame) {
      parts.push('<div class="b-sec">逐项相乘再相加</div>');
      parts.push(this._calcHTML(c.frame));
    }
    if (c.demo === 'median' && c.medianFrame && c.medianFrame.stage === 'pick') {
      parts.push('<div class="b-sec">排序结果</div>');
      parts.push(`<div class="formula">中值 = ${c.medianFrame.out}</div>`);
    }
    if (c.demo === 'morph' && c.frame) {
      parts.push('<div class="b-sec">规则</div>');
      parts.push(`<div class="formula">${c.frame.mode === 'erode' ? '邻域有黑 → 中心黑' : '邻域有白 → 中心白'}<br>输出 = ${c.frame.sum > 0 ? 255 : 0}</div>`);
    }

    // 尺寸公式
    if (c.sizeFormula) {
      parts.push('<div class="b-sec">输出尺寸</div>');
      parts.push(`<div class="formula">${c.sizeFormula}</div>`);
    }

    // 存储布局
    if (c.layoutPixels && c.layoutPixels.length) {
      parts.push('<div class="b-sec">同一批数字，两种读法</div>');
      parts.push(this._layoutHTML(c.layoutPixels, 'HWC', [0, 1, 2]));
      parts.push(this._layoutHTML(c.layoutPixels, 'CHW', [0, 1, 2]));
    }

    if (c.note) parts.push(`<div class="a-note" style="margin-top:auto">${c.note}</div>`);
    P.innerHTML = parts.join('');
    // 长条按通道着色
    U.$$('.strip i', P).forEach((el) => {
      const cIdx = +el.dataset.c;
      el.style.background = ['#e05c5c', '#4cbf7a', '#4c9aff'][cIdx] || '#888';
    });
  };

  B.prototype._kernelHTML = function (k, binary) {
    const n = k.length;
    const flat = k.flat();
    const mx = Math.max(...flat.map(Math.abs), 1e-6);
    let h = '<div style="display:grid;grid-template-columns:repeat(' + n + ',1fr);gap:1px;background:#333941;border:1px solid #333941;border-radius:4px;overflow:hidden">';
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const v = k[i][j];
        let bg;
        if (binary) bg = v ? '#1d3a5c' : '#1b1e23';
        else if (v > 0) bg = `rgba(76,154,255,${0.12 + 0.55 * (v / mx)})`;
        else if (v < 0) bg = `rgba(242,85,90,${0.12 + 0.55 * (-v / mx)})`;
        else bg = '#1b1e23';
        h += `<div style="background:${bg};text-align:center;font-family:Consolas,monospace;font-size:9px;color:#c8d0d9;padding:2px 0">${binary ? (v ? '1' : '·') : (Math.abs(v) < 0.001 ? '0' : U.round(v, 2))}</div>`;
      }
    }
    h += '</div>';
    return h;
  };

  B.prototype._calcHTML = function (f) {
    const cells = f.cells.slice(0, 9);
    let h = '<div class="calc">';
    cells.forEach((c) => {
      h += `<div class="term"><span>${U.fmt(c.v, 1)} × ${U.fmt(c.w, 2)}</span><span>${U.fmt(c.prod, 2)}</span></div>`;
    });
    if (f.cells.length > 9) h += `<div class="term" style="color:#767f89"><span>… 共 ${f.cells.length} 项</span><span></span></div>`;
    h += `<div class="term sum"><span>Σ</span><span>${U.fmt(f.sum, 2)}</span></div>`;
    h += `<div class="term" style="color:#4c9aff"><span>out[${f.oy}, ${f.ox}]</span><span>${f.outVal !== undefined ? U.fmt(f.outVal, 0) : U.fmt(f.sum, 0)}</span></div>`;
    h += '</div>';
    return h;
  };

  B.prototype._layoutHTML = function (pixels, mode, chans) {
    const colors = ['#e05c5c', '#4cbf7a', '#4c9aff'];
    let items = [];
    if (mode === 'HWC') {
      pixels.forEach((p, i) => {
        p.forEach((v, ci) => items.push({ v, ci }));
      });
    } else {
      for (let ci = 0; ci < 3; ci++) {
        pixels.forEach((p) => items.push({ v: p[ci], ci }));
      }
    }
    let h = `<div style="font-size:10.5px;color:#767f89;margin:2px 0 3px">${mode}${mode === 'CHW' ? ' ← permute(2,0,1)' : ''}</div><div class="strip">`;
    items.forEach((it) => {
      h += `<i data-c="${it.ci}" style="background:${colors[it.ci]}">${Math.round(it.v)}</i>`;
    });
    h += '</div>';
    return h;
  };

  B.prototype.setChannel = function (c) {
    this.channel = c;
    U.$$('#bTools .chip').forEach((b) => {
      b.classList.toggle('on', b.textContent === ({ gray: '灰', r: 'R', g: 'G', b: 'B', h: 'H', s: 'S', v: 'V' }[c]));
    });
  };

  CVL.ViewB = B;
})();
