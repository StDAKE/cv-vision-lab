/* 处理栈：维护算子链，调用算子线程执行，缓存每步产物（ImageData） */
(function () {
  const CVL = window.CVL;
  const U = CVL.util;

  const P = {
    steps: [],
    outputs: [],
    editIndex: -1,
    dirtyFrom: 0,
    lastRun: 0,
    running: false,
    queued: false,
  };

  P.reset = function () {
    P.steps = [];
    P.outputs = [];
    P.editIndex = -1;
    P.dirtyFrom = 0;
  };

  P.push = function (id, params) {
    if (!CVL.op.get(id)) { U.toast('未知算子：' + id); return -1; }
    P.steps.push({ id, params: Object.assign(CVL.op.defaults(id), params || {}), enabled: true });
    P.editIndex = P.steps.length - 1;
    P.dirtyFrom = 0;
    return P.editIndex;
  };

  P.remove = function (i) {
    if (i < 0 || i >= P.steps.length) return;
    P.steps.splice(i, 1);
    P.outputs = P.outputs.slice(0, i);
    if (P.editIndex >= P.steps.length) P.editIndex = P.steps.length - 1;
    P.dirtyFrom = Math.min(P.dirtyFrom, Math.max(0, i));
  };

  P.move = function (i, dir) {
    const j = i + dir;
    if (j < 0 || j >= P.steps.length) return;
    const t = P.steps[i]; P.steps[i] = P.steps[j]; P.steps[j] = t;
    P.editIndex = j;
    P.dirtyFrom = 0;
  };

  P.toggle = function (i) {
    P.steps[i].enabled = !P.steps[i].enabled;
    P.dirtyFrom = Math.min(P.dirtyFrom, i);
  };

  P.setParam = function (i, key, val) {
    P.steps[i].params[key] = val;
    P.dirtyFrom = Math.min(P.dirtyFrom, i);
  };

  P.inputOf = function (i) {
    if (i <= 0) return CVL.cv.srcID;
    return P.outputs[i - 1] || CVL.cv.srcID;
  };

  P.outputOf = function (i) {
    return P.outputs[i] || CVL.cv.srcID;
  };

  P.final = function () {
    if (!P.steps.length) return CVL.cv.srcID;
    return P.outputs[P.outputs.length - 1] || CVL.cv.srcID;
  };

  /* 执行；并发时只跑最新一次 */
  P.run = async function () {
    if (P.running) { P.queued = true; return P.final(); }
    P.running = true;
    try {
      const from = P.dirtyFrom;
      const res = await CVL.cv.run(P.steps, from);
      P.outputs = res.outs;
      P.lastRun = res.ms;
      P.metas = res.metas;
      P.dirtyFrom = P.steps.length;
      return P.final();
    } finally {
      P.running = false;
      if (P.queued) {
        P.queued = false;
        setTimeout(() => P.onDirty && P.onDirty(), 16);
      }
    }
  };

  P.summary = function (st) {
    const def = CVL.op.get(st.id);
    if (!def) return '';
    const keys = def.params.slice(0, 2).map((p) => p.key);
    return keys.map((k) => {
      const v = st.params[k];
      if (typeof v === 'boolean') return v ? 'on' : 'off';
      if (typeof v === 'string') {
        const sp = def.params.find((p) => p.key === k);
        const opt = sp && sp.options && sp.options.find((o) => String(o.v) === v);
        return opt ? opt.label.split('（')[0] : v;
      }
      return v;
    }).join(' · ');
  };

  P.render = function (host) {
    if (!host) return;
    host.innerHTML = '';
    if (!P.steps.length) {
      host.innerHTML = '<div style="font-size:11.5px;color:#767f89">空。点上面的算子会自动加入。</div>';
      return;
    }
    const list = U.el('div', 'pipe');
    P.steps.forEach((st, i) => {
      const def = CVL.op.get(st.id);
      const row = U.el('div', 'pipe-step' + (st.enabled ? ' on' : '') + (i === P.editIndex ? ' cur' : ''));
      row.innerHTML = `<span class="idx">${i + 1}</span><span class="nm">${def ? def.label : st.id}</span><span class="pv">${P.summary(st)}</span>`;
      row.onclick = () => CVL.bus.emit('editStep', i);
      const x = U.el('span', 'x', '✕');
      x.onclick = (e) => { e.stopPropagation(); CVL.bus.emit('removeStep', i); };
      row.appendChild(x);
      list.appendChild(row);
    });
    host.appendChild(list);
    const acts = U.el('div', 'pipe-actions');
    const b1 = U.el('button', 'chip', '↑ 上移');
    b1.onclick = () => CVL.bus.emit('moveStep', -1);
    const b2 = U.el('button', 'chip', '↓ 下移');
    b2.onclick = () => CVL.bus.emit('moveStep', 1);
    const b3 = U.el('button', 'chip', '清空');
    b3.onclick = () => CVL.bus.emit('clearSteps');
    acts.appendChild(b1); acts.appendChild(b2); acts.appendChild(b3);
    host.appendChild(acts);
  };

  CVL.pipeline = P;
})();
