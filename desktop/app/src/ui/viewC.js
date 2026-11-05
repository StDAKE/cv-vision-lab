/* C 区：算子选择与参数调节 */
(function () {
  const CVL = window.CVL;
  const U = CVL.util;

  function C() {
    this.el = U.$('#cBody');
    this.opId = 'filter.gaussian';
    this.params = {};
    this.groupOpen = 'filter';
    this._build();
  }

  C.prototype._build = function () {
    this.el.innerHTML = '';
    this.wrap = U.el('div', 'c-wrap');
    this.el.appendChild(this.wrap);
    this.topicBar = U.el('div');
    this.topicBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px';
    this.wrap.appendChild(this.topicBar);
    this.head = U.el('div');
    this.pbody = U.el('div');
    this.wrap.appendChild(this.head);
    this.wrap.appendChild(this.pbody);

    // 算子库
    this.lib = U.el('div');
    this.wrap.appendChild(this.lib);
    const groups = CVL.op.groups;
    groups.forEach((g) => {
      const list = CVL.op.list(g.id).filter((d) => d.id !== 'none');
      if (!list.length) return;
      const det = U.el('details', 'op-group');
      det.open = g.id === this.groupOpen;
      const sm = U.el('summary');
      sm.innerHTML = `<span>${g.label}</span><span style="margin-left:auto;font-size:10px;color:#5c6673">L${g.lecture}</span>`;
      det.appendChild(sm);
      const body = U.el('div', 'body');
      const ol = U.el('div', 'op-list');
      list.forEach((d) => {
        const b = U.el('button', 'chip', d.label);
        b.dataset.op = d.id;
        b.onclick = () => { CVL.bus.emit('selectOp', d.id); };
        ol.appendChild(b);
      });
      body.appendChild(ol);
      det.appendChild(body);
      this.lib.appendChild(det);
    });

    // 处理栈
    const det = U.el('details', 'op-group');
    det.open = true;
    const sm = U.el('summary');
    sm.innerHTML = '<span>处理栈（流水线）</span><span style="margin-left:auto;font-size:10px;color:#5c6673">顺序即结果</span>';
    det.appendChild(sm);
    this.pipeBody = U.el('div', 'body');
    det.appendChild(this.pipeBody);
    this.lib.appendChild(det);
  };

  C.prototype.setOp = function (id, params) {
    this.opId = id;
    this.params = params;
    this.render();
  };

  C.prototype.render = function () {
    const d = CVL.op.get(this.opId);
    if (!d) return;
    const self = this;

    // 标题
    this.head.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:13.5px;font-weight:600">${d.label}</span>
        <span class="chip" style="cursor:default;font-size:10px">第 ${d.lecture} 讲</span>
      </div>`;

    // 参数
    this.pbody.innerHTML = '';
    if (!d.params.length) {
      this.pbody.innerHTML = '<div style="font-size:11.5px;color:#767f89;padding:2px 0 8px">该算子无可调参数。</div>';
    }
    d.params.forEach((s) => {
      const box = U.el('div', 'ctrl');
      const val = this.params[s.key];
      if (s.type === 'range') {
        const lab = U.el('label');
        lab.innerHTML = `<span>${s.label}</span><b>${U.fmt(val, 2)}</b>`;
        const inp = U.el('input');
        inp.type = 'range';
        inp.min = s.min; inp.max = s.max; inp.step = s.step;
        inp.value = val;
        const tip = U.el('div', 'tip');
        tip.hidden = true;
        const refresh = () => {
          this.params[s.key] = parseFloat(inp.value);
          lab.querySelector('b').textContent = U.fmt(this.params[s.key], 2);
          const t = s.tip ? s.tip(this.params[s.key], this.params) : null;
          tip.textContent = t || '';
          tip.hidden = !t;
        };
        inp.oninput = () => { refresh(); CVL.bus.emit('param', { key: s.key, value: this.params[s.key], silent: true }); };
        inp.onchange = () => { refresh(); CVL.bus.emit('param', { key: s.key, value: this.params[s.key] }); };
        refresh();
        box.appendChild(lab); box.appendChild(inp); box.appendChild(tip);
      } else if (s.type === 'select') {
        const lab = U.el('label');
        lab.innerHTML = `<span>${s.label}</span>`;
        const sel = U.el('select');
        s.options.forEach((o) => {
          const op = U.el('option', '', o.label);
          op.value = o.v;
          if (String(val) === String(o.v)) op.selected = true;
          sel.appendChild(op);
        });
        sel.onchange = () => {
          this.params[s.key] = sel.value;
          CVL.bus.emit('param', { key: s.key, value: sel.value });
        };
        box.appendChild(lab); box.appendChild(sel);
      } else if (s.type === 'check') {
        const lab = U.el('label', 'switch');
        const inp = U.el('input');
        inp.type = 'checkbox';
        inp.checked = !!val;
        inp.onchange = () => {
          this.params[s.key] = inp.checked;
          CVL.bus.emit('param', { key: s.key, value: inp.checked });
        };
        lab.appendChild(inp);
        lab.appendChild(document.createTextNode(s.label));
        box.appendChild(lab);
        if (s.tip) {
          const t = s.tip(inp.checked, this.params);
          if (t) { const tip = U.el('div', 'tip', t); box.appendChild(tip); }
        }
      }
      this.pbody.appendChild(box);
    });

    // 当前选中高亮
    U.$$('.chip', this.lib).forEach((b) => {
      b.classList.toggle('on', b.dataset.op === this.opId);
    });

    CVL.pipeline && CVL.pipeline.render(this.pipeBody);
  };

  C.prototype.setTopics = function (list, idx) {
    if (!this.topicBar) return;
    this.topicBar.innerHTML = '';
    const lab = U.el('div', '', '本讲知识点');
    lab.style.cssText = 'font-size:10.5px;color:#5c6673;width:100%;letter-spacing:.4px';
    this.topicBar.appendChild(lab);
    list.forEach((t, i) => {
      const b = U.el('button', 'chip' + (i === idx ? ' on' : ''), t.t);
      b.style.fontSize = '11px';
      b.onclick = () => CVL.bus.emit('gotoTopic', i);
      this.topicBar.appendChild(b);
    });
  };

  CVL.ViewC = C;
})();
