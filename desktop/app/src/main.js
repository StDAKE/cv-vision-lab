/* 主控：状态、联动、讲次编排 */
(function () {
  const CVL = window.CVL;
  const U = CVL.util;

  const S = {
    lecture: 'L3',
    topicIdx: 0,
    topic: null,
    channel: 'gray',
    probe: { x: 0, y: 0 },
    imgName: '',
    imgId: 'scratch',
    play: { frames: null, i: -1, timer: 0, playing: false, speed: 380 },
    editOp: null,
    showLayout: false,
    presetIdx: 0,
    bctx: null,
  };

  let viewA, viewB, viewC, viewD;
  let refreshing = false;

  function showLoading(txt) {
    const el = U.$('.loading');
    if (!el) return;
    el.hidden = false;
    const t = el.querySelector('.txt');
    if (t) t.textContent = txt;
  }
  function hideLoading() {
    const el = U.$('.loading');
    if (el) el.hidden = true;
  }

  function buildNav() {
    const nav = U.$('#lectureNav');
    nav.innerHTML = '';
    CVL.lectures.forEach((l) => {
      const b = U.el('button', 'lec' + (l.id === S.lecture ? ' on' : ''), l.nav);
      b.onclick = () => applyLecture(l.id);
      nav.appendChild(b);
    });
  }

  function syncNav() {
    U.$$('#lectureNav .lec').forEach((b, i) => b.classList.toggle('on', CVL.lectures[i].id === S.lecture));
  }

  function applyLecture(id) {
    S.lecture = id;
    S.topicIdx = 0;
    S.presetIdx = 0;
    const lec = CVL.lectures.find((l) => l.id === id);
    if (lec) U.$('#lectureTitle').textContent = lec.title;
    applyTopic(0);
  }

  function applyTopic(idx) {
    const lec = CVL.lectures.find((l) => l.id === S.lecture);
    if (!lec) return;
    const t = lec.topics[idx];
    if (!t) return;
    S.topicIdx = idx;
    S.topic = t;
    stopPlay();

    if (t.kind === 'overview') {
      viewA.setOverview(t.html, t.note);
      CVL.pipeline.reset();
      viewB.setContext(null);
      viewD.setCode([
        { t: '# 第 1 讲是全景，不写代码。' },
        { t: '# 后面四讲逐层落到像素：shape → dtype → 核 → 归一化' },
        { t: 'img = cv2.imread("part.png")', tag: 'run' },
        { t: 'print(img.shape, img.dtype, img.min(), img.max())' },
      ]);
      viewD.setVars([['shape', '(H, W, 3)'], ['dtype', 'uint8'], ['range', '0 – 255']]);
      if (viewC.topicBar && viewC.pipeBody) CVL.pipeline.render(viewC.pipeBody);
      U.$('#stShape').textContent = 'shape —';
      U.$('#stDtype').textContent = 'dtype —';
      U.$('#stOp').textContent = '算子 —';
      U.$('#stHint').textContent = t.note ? '' : '';
      viewC.setTopics(lec.topics, idx);
      syncNav();
      return;
    }

    viewA.clearOverview();
    CVL.pipeline.reset();
    if (t.steps && t.steps.length) t.steps.forEach((s) => CVL.pipeline.push(s.op, s.p));
    else if (t.op) CVL.pipeline.push(t.op, t.p || {});
    if (t.channel) { S.channel = t.channel; viewB.setChannel(t.channel); }
    viewA.setMode(t.view || 'side');
    S.editOp = null;
    U.$('#stHint').textContent = t.hint || '';
    viewC.setTopics(lec.topics, idx);
    syncNav();
    refreshAll();
  }

  async function refreshAll() {
    if (!CVL.cv.srcID) return;
    refreshing = true;
    try {
      const out = await CVL.pipeline.run();
      const idx = CVL.pipeline.editIndex;
      const st = idx >= 0 ? CVL.pipeline.steps[idx] : null;
      const def = st ? CVL.op.get(st.id) : null;
      const params = st ? st.params : {};

      viewA.setImages(CVL.cv.srcID, out || CVL.cv.srcID);
      if (S.topic && S.topic.note) viewA.note.textContent = S.topic.note;

      const ctx = buildBContext(def, params, idx);
      S.bctx = ctx;
      viewB.setContext(ctx);
      buildTrace(def, params, ctx);

      if (st) {
        const key = st.id + ':' + idx;
        if (S.editOp !== key) { S.editOp = key; viewC.setOp(st.id, params); }
        else CVL.pipeline.render(viewC.pipeBody);
        const lines = CVL.op.renderCode(st.id, params);
        const head = [{ t: '# ' + (def ? def.label : st.id) + ' · 第 ' + (def ? def.lecture : '') + ' 讲' }];
        viewD.setCode(head.concat(lines));
        viewD.setActiveTag('run');
      } else {
        viewC.setOp('none', {});
        viewD.setCode([{ t: 'img = cv2.imread("part.png")', tag: 'run' }, { t: 'print(img.shape, img.dtype)' }]);
      }
      setStatus(def, params, out);
      scheduleMetrics(out);
    } finally {
      refreshing = false;
    }
  }

  function buildBContext(def, params, idx) {
    const input = CVL.pipeline.inputOf(idx);
    const ctx = {
      demo: def ? def.demo : 'grid',
      kernel: def && def.kernel ? def.kernel(params) : null,
      footprint: def && def.footprint ? def.footprint(params) : null,
      patchSource: input,
      probe: S.probe,
      channel: S.channel,
      note: def ? def.note(params) : '',
      patchData: null,
      frame: null,
      medianFrame: null,
    };
    if (def) {
      const n = 10;
      const f = params.ksize || 3;
      if (def.id.indexOf('filter.') === 0 || def.id.indexOf('edge.') === 0) {
        ctx.sizeFormula = '⌊(' + n + ' + 2×0 − ' + f + ') / 1⌋ + 1 = ' + (Math.floor((n - f) / 1) + 1);
      }
      if (def.id === 'geom.resize') ctx.sizeFormula = input.width + '×' + input.height + ' → ' + params.size + '×' + params.size + '（' + params.mode + '）';
      if (def.id === 'morph.op') ctx.sizeFormula = '结构元素 ' + params.size + '×' + params.size + ' · ' + (params.op || '');
    }
    if (input && input.width > 8) {
      const px = [];
      for (let i = 0; i < 4; i++) {
        const p = CVL.cv.pixelAt(input, S.probe.x - 2 + i, S.probe.y, 'rgb');
        if (p) px.push(p);
      }
      if (px.length === 4) ctx.layoutPixels = px;
    }
    return ctx;
  }

  function buildTrace(def, params, ctx) {
    if (!def || !ctx || !ctx.patchData) { S.play.frames = null; S.play.i = -1; return; }
    if (def.demo === 'conv' && ctx.kernel) {
      const res = CVL.trace.convFrames(ctx.patchData.data, ctx.kernel, 1, 0);
      S.play.frames = res.frames;
      S.play.kind = 'conv';
    } else if (def.demo === 'median') {
      const d = ctx.patchData.data;
      const vals = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) vals.push(d[Math.min(r, d.length - 1)][Math.min(c, d[0].length - 1)]);
      const res = CVL.trace.medianFrames(vals);
      S.play.frames = res.frames;
      S.play.kind = 'median';
    } else if (def.demo === 'morph' && ctx.footprint) {
      const res = CVL.trace.morphFrames(ctx.patchData.data, ctx.footprint, params.op === 'erode' ? 'erode' : 'dilate');
      S.play.frames = res.frames;
      S.play.kind = 'morph';
    } else {
      S.play.frames = null;
      S.play.i = -1;
    }
    if (S.play.frames && S.play.frames.length) {
      applyFrame(S.play.kind === 'median' ? S.play.frames.length - 1 : -1, true);
    }
  }

  function applyFrame(i, silent) {
    const f = S.play.frames;
    const ctx = S.bctx;
    if (!f || !ctx) return;
    S.play.i = i;
    if (i < 0) { ctx.frame = null; ctx.medianFrame = null; }
    else if (S.play.kind === 'median') ctx.medianFrame = f[i];
    else ctx.frame = f[i];
    viewB.setContext(ctx);
    if (!silent && ctx.frame) {
      viewD.setActiveTag('mul');
      viewD.setVars([
        ['滑窗', '(' + ctx.frame.oy + ', ' + ctx.frame.ox + ')'],
        ['核', (ctx.kernel ? ctx.kernel.length : 3) + '×' + (ctx.kernel ? ctx.kernel.length : 3)],
        ['Σ 乘积', U.fmt(ctx.frame.sum, 2)],
        ['输出', 'out[' + ctx.frame.oy + ',' + ctx.frame.ox + ']'],
      ]);
    }
    if (S.play.kind === 'median' && ctx.medianFrame && ctx.medianFrame.stage === 'pick') viewD.setActiveTag('run');
  }

  function togglePlay() {
    if (S.play.playing) return stopPlay();
    if (!S.play.frames || !S.play.frames.length) { U.toast('当前算子没有分步过程，试试均值 / 高斯 / 中值 / 形态学'); return; }
    if (S.play.i >= S.play.frames.length - 1) S.play.i = -1;
    S.play.playing = true;
    viewD.setPlaying(true);
    const tick = () => {
      if (!S.play.playing) return;
      const next = S.play.i + 1;
      if (next >= S.play.frames.length) { stopPlay(); return; }
      applyFrame(next);
      S.play.timer = setTimeout(tick, S.play.speed);
    };
    S.play.timer = setTimeout(tick, 60);
  }
  function stopPlay() {
    S.play.playing = false;
    clearTimeout(S.play.timer);
    if (viewD) viewD.setPlaying(false);
  }

  let metricTimer = 0;
  function scheduleMetrics(out) {
    clearTimeout(metricTimer);
    metricTimer = setTimeout(() => {
      const a = CVL.cv.srcID, b = out || CVL.cv.srcID;
      if (!a || !b) return;
      viewA.setMetrics({
        psnr: CVL.metrics.psnr(a, b),
        ssim: CVL.metrics.ssim(a, b),
        noise: CVL.metrics.noiseSigma(b),
        edge: CVL.metrics.edgeEnergy(b),
        ms: CVL.pipeline.lastRun,
        size: b.width + '×' + b.height + '×3',
      });
      viewA.drawHisto();
    }, 200);
  }

  function setStatus(def, params, out) {
    const m = out || CVL.cv.srcID;
    if (!m) return;
    const px = m.width * m.height * 3;
    U.$('#stShape').textContent = 'shape (' + m.height + ', ' + m.width + ', 3)';
    U.$('#stDtype').textContent = 'dtype uint8';
    U.$('#stMem').textContent = U.bytes(px) + ' · float32 ' + U.bytes(px * 4);
    U.$('#stOp').textContent = '步骤 ' + (CVL.pipeline.steps.length ? CVL.pipeline.editIndex + 1 : 0) + '/' + CVL.pipeline.steps.length + (def ? ' · ' + def.label : '');
    U.$('#stTime').textContent = CVL.pipeline.lastRun.toFixed(1) + ' ms';
  }

  /* 内置素材下拉：6 张程序合成图 + 同一零件的两种光照（第 4 讲分布偏移） */
  const IMG_OPTS = () => CVL.images.list.concat([
    { id: 'pair:1', name: '同一件 · 光照正常', desc: '与下面那张只差光照，用于分布偏移演示' },
    { id: 'pair:0.55', name: '同一件 · 光照偏暗', desc: '同一零件、同一缺陷，只是曝光不同' },
  ]);

  function fillImgSel() {
    const sel = U.$('#imgSel');
    if (!sel) return;
    sel.innerHTML = '';
    IMG_OPTS().forEach((o) => {
      const op = document.createElement('option');
      op.value = o.id;
      op.textContent = o.name;
      op.title = o.desc || '';
      sel.appendChild(op);
    });
    const custom = document.createElement('option');
    custom.value = '';
    custom.textContent = '自定义图片…';
    sel.appendChild(custom);
    sel.onchange = () => {
      if (!sel.value) { U.$('#fileInput').click(); sel.value = S.imgId; return; }
      loadImage(sel.value);
    };
  }

  async function loadImage(id) {
    let c, name;
    if (String(id).indexOf('pair:') === 0) {
      const lv = parseFloat(id.slice(5)) || 1;
      c = CVL.images.pair(lv);
      name = lv < 0.8 ? '同一件 · 光照偏暗' : '同一件 · 光照正常';
    } else {
      c = CVL.images.get(id);
      const it = CVL.images.list.find((x) => x.id === id);
      if (!it && !c) { U.toast('未知素材：' + id); return; }
      name = (it || {}).name || id;
    }
    const idt = CVL.cv.imageDataFrom(c);
    await CVL.cv.setSource(idt);
    S.imgId = id;
    S.imgName = name;
    const sel = U.$('#imgSel');
    if (sel && sel.value !== id) sel.value = id;
    if (U.$('#stImg')) U.$('#stImg').textContent = '素材 ' + name;
    S.probe = { x: Math.floor(idt.width * 0.42), y: Math.floor(idt.height * 0.44) };
    S.play.frames = null;
    applyTopic(S.topicIdx);
  }

  function loadFile(file) {
    const img = new Image();
    img.onload = async () => {
      const idt = CVL.cv.imageDataFrom(img);
      await CVL.cv.setSource(idt);
      S.imgId = '';
      if (U.$('#imgSel')) U.$('#imgSel').value = '';
      S.imgName = file.name;
      if (U.$('#stImg')) U.$('#stImg').textContent = '素材 ' + file.name;
      S.probe = { x: Math.floor(CVL.cv.srcID.width / 2), y: Math.floor(CVL.cv.srcID.height / 2) };
      applyTopic(S.topicIdx);
      U.toast('已导入 ' + file.name + ' · ' + CVL.cv.srcID.width + '×' + CVL.cv.srcID.height);
    };
    img.onerror = () => U.toast('图片读取失败');
    img.src = URL.createObjectURL(file);
  }

  function bind() {
    CVL.bus.on('selectOp', (id) => { stopPlay(); if (CVL.pipeline.push(id) < 0) return; S.editOp = null; refreshAll(); });
    CVL.bus.on('param', (e) => {
      const idx = CVL.pipeline.editIndex;
      if (idx < 0) return;
      CVL.pipeline.setParam(idx, e.key, e.value);
      CVL.pipeline.render(viewC.pipeBody);
      refreshAll();
    });
    CVL.bus.on('editStep', (i) => { stopPlay(); CVL.pipeline.editIndex = i; CVL.pipeline.dirtyFrom = Math.min(CVL.pipeline.dirtyFrom, i); S.editOp = null; refreshAll(); });
    CVL.bus.on('removeStep', (i) => { stopPlay(); CVL.pipeline.remove(i); S.editOp = null; refreshAll(); });
    CVL.bus.on('moveStep', (dir) => { const i = CVL.pipeline.editIndex; if (i < 0) return; CVL.pipeline.move(i, dir); S.editOp = null; refreshAll(); });
    CVL.bus.on('clearSteps', () => { CVL.pipeline.reset(); S.editOp = null; refreshAll(); });
    CVL.bus.on('gotoTopic', (i) => applyTopic(i));

    CVL.bus.on('probe', (p) => {
      S.probe = p;
      const ctx = S.bctx;
      if (!ctx) return;
      ctx.probe = p;
      ctx.patchData = null;
      viewB.setContext(ctx);
      if (S.play.frames && S.play.kind !== 'median') {
        const ei = CVL.pipeline.editIndex;
        if (ei >= 0) {
          const st = CVL.pipeline.steps[ei];
          ctx.patchData = viewB._patch();
          buildTrace(CVL.op.get(st.id), st.params, ctx);
        }
      }
    });
    CVL.bus.on('channel', (c) => {
      S.channel = c;
      if (S.bctx) { S.bctx.channel = c; S.bctx.patchData = null; viewB.setContext(S.bctx); }
    });
    CVL.bus.on('toggleLayout', () => {
      S.showLayout = !S.showLayout;
      if (S.bctx) viewB.setContext(S.bctx);
      U.toast(S.showLayout ? '右侧已显示 HWC / CHW 两种读法' : '已隐藏存储布局');
    });
    CVL.bus.on('togglePlay', togglePlay);
    CVL.bus.on('stepFrame', (d) => {
      if (!S.play.frames) { U.toast('当前算子没有分步过程'); return; }
      stopPlay();
      const cur = S.play.i < 0 ? (d > 0 ? -1 : 0) : S.play.i;
      applyFrame(U.clamp(cur + d, 0, S.play.frames.length - 1));
    });

    U.$('#btnUpload').onclick = () => U.$('#fileInput').click();
    U.$('#fileInput').onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) loadFile(f);
      e.target.value = '';
    };
    U.$('#btnFull').onclick = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    };
    U.$('#btnHelp').onclick = () => (U.$('#helpOverlay').hidden = false);
    U.$('#btnHelpClose').onclick = () => (U.$('#helpOverlay').hidden = true);
    U.$('#btnShot').onclick = exportShot;
    U.$('#btnPreset').onclick = applyPreset;

    window.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); CVL.bus.emit('stepFrame', 1); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); CVL.bus.emit('stepFrame', -1); }
      else if (e.key === 'r' || e.key === 'R') applyTopic(S.topicIdx);
      else if (e.key === 'f' || e.key === 'F') U.$('#btnFull').click();
      else if (e.key === '1') viewA.setMode('side');
      else if (e.key === '2') viewA.setMode('slider');
      else if (e.key === '3') viewA.setMode('diff');
      else if (e.key === '4') viewA.setMode('overlay');
    });

    window.addEventListener('resize', U.debounce(() => {
      viewA.resize(); viewA.draw(); viewA.drawHisto();
      viewB.size(); viewB.draw();
    }, 120));
  }

  function exportShot() {
    const out = CVL.pipeline.final();
    if (!out) return;
    const c = CVL.cv.canvasOf(out);
    const a = document.createElement('a');
    a.download = 'cvlab_' + S.lecture + '_' + Date.now() + '.png';
    a.href = c.toDataURL('image/png');
    a.click();
    U.toast('已导出处理后图像');
  }

  function applyPreset() {
    S.presetIdx = (S.presetIdx + 1) % 3;
    CVL.pipeline.reset();
    if (S.presetIdx === 0) {
      CVL.pipeline.push('noise.add', { type: 'sp', sigma: 24, seed: 42 });
      CVL.pipeline.push('filter.median', { ksize: 5 });
      U.toast('预设 1：椒盐 + 中值（正确打法）');
    } else if (S.presetIdx === 1) {
      CVL.pipeline.push('noise.add', { type: 'sp', sigma: 24, seed: 42 });
      CVL.pipeline.push('filter.gaussian', { ksize: 7, sigma: 2 });
      U.toast('预设 2：椒盐 + 高斯（越处理越糟）');
    } else {
      CVL.pipeline.push('enhance.sharpen', { k: 2.4, radius: 1.5 });
      CVL.pipeline.push('filter.gaussian', { ksize: 5, sigma: 1.4 });
      U.toast('预设 3：先锐化再降噪（顺序反了）');
    }
    S.editOp = null;
    S.topic = { note: '对照三个预设：噪声的分布形态决定滤波器的选择；顺序错了，前面的步骤会把后面的步骤废掉。' };
    viewA.note.textContent = S.topic.note;
    refreshAll();
  }

  async function boot() {
    showLoading('正在启动算子线程…');
    const t0 = performance.now();
    try {
      await CVL.cv.init();
    } catch (e) {
      showLoading('算子线程启动失败：' + (e && e.message) + '。请注意本页面需通过 http 服务打开（直接双击 file:// 无法创建 Worker）。');
      return;
    }
    const initMs = Math.round(performance.now() - t0);
    showLoading('正在生成素材…');
    viewA = new CVL.ViewA();
    viewB = new CVL.ViewB();
    viewC = new CVL.ViewC();
    viewD = new CVL.ViewD();
    buildNav();
    bind();
    fillImgSel();
    await loadImage('scratch');
    hideLoading();
    setTimeout(() => U.toast('四区联动已就绪（算子线程 ' + initMs + ' ms）', 2400), 500);
  }

  window.addEventListener('load', boot);
})();
