/* D 区：Python 代码展示 + 执行高亮 + 变量监视 */
(function () {
  const CVL = window.CVL;
  const U = CVL.util;

  const KEYWORDS = /^(import|from|as|for|in|if|elif|else|while|def|return|None|True|False|and|or|not|with|class|lambda|print|range|len|int|float|str|list|dict|tuple|set|sum|min|max|abs|round|enumerate|zip)$/;

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function highlight(src) {
    let out = '';
    let i = 0;
    const n = src.length;
    while (i < n) {
      const ch = src[i];
      // 注释
      if (ch === '#') {
        out += `<span class="tk-c">${esc(src.slice(i))}</span>`;
        break;
      }
      // 字符串
      if (ch === '"' || ch === "'") {
        let j = i + 1;
        while (j < n && src[j] !== ch) { if (src[j] === '\\') j++; j++; }
        j = Math.min(n, j + 1);
        out += `<span class="tk-s">${esc(src.slice(i, j))}</span>`;
        i = j; continue;
      }
      // 数字
      if (/[0-9]/.test(ch)) {
        let j = i;
        while (j < n && /[0-9._]/.test(src[j])) j++;
        out += `<span class="tk-n">${esc(src.slice(i, j))}</span>`;
        i = j; continue;
      }
      // 标识符
      if (/[A-Za-z_]/.test(ch)) {
        let j = i;
        while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
        const w = src.slice(i, j);
        if (KEYWORDS.test(w)) out += `<span class="tk-k">${esc(w)}</span>`;
        else if (src[j] === '(') out += `<span class="tk-f">${esc(w)}</span>`;
        else if (/^(np|cv2|cv|img|out|k|g|gray|mask|x|y)$/.test(w)) out += `<span class="tk-o">${esc(w)}</span>`;
        else out += esc(w);
        i = j; continue;
      }
      out += esc(ch);
      i++;
    }
    return out;
  }

  function D() {
    this.el = U.$('#dBody');
    this.lines = [];
    this.vars = [];
    this.activeTag = 'run';
    this.activeLine = -1;
    this.playing = false;
    this._build();
  }

  D.prototype._build = function () {
    const self = this;
    this.el.innerHTML = '';
    const wrap = U.el('div', 'd-wrap');
    this.codeEl = U.el('div', 'd-code');
    this.varEl = U.el('div', 'd-vars');
    const bar = U.el('div', 'd-bar');

    const mk = (txt, fn, title) => {
      const b = U.el('button', 'chip', txt);
      if (title) b.title = title;
      b.onclick = fn;
      return b;
    };
    this.btnPlay = mk('▶ 播放', () => CVL.bus.emit('togglePlay'));
    bar.appendChild(this.btnPlay);
    bar.appendChild(mk('‹ 上一步', () => CVL.bus.emit('stepFrame', -1)));
    bar.appendChild(mk('下一步 ›', () => CVL.bus.emit('stepFrame', 1)));
    const sp = U.el('div');
    sp.style.cssText = 'flex:1';
    bar.appendChild(sp);
    this.btnCopy = mk('复制代码', () => this.copy());
    bar.appendChild(this.btnCopy);
    this.btnFollow = mk('跟随执行', () => {
      this.follow = !this.follow;
      this.btnFollow.classList.toggle('on', this.follow);
    }, '播放时自动高亮当前执行行');
    this.follow = true;
    this.btnFollow.classList.add('on');
    bar.appendChild(this.btnFollow);

    wrap.appendChild(this.codeEl);
    wrap.appendChild(this.varEl);
    wrap.appendChild(bar);
    this.el.appendChild(wrap);
  };

  D.prototype.setCode = function (lines, meta) {
    this.lines = lines || [];
    this.meta = meta || {};
    this.activeTag = null;
    this.activeLine = -1;
    this.renderCode();
  };

  D.prototype.renderCode = function () {
    const self = this;
    let i = 0;
    this.codeEl.innerHTML = this.lines.map((ln) => {
      i++;
      const cls = 'cl' + (ln.t.trim().startsWith('#') ? ' comment' : '');
      return `<div class="${cls}" data-line="${i - 1}" data-tag="${ln.tag || ''}"><span class="no">${i}</span><span class="src">${highlight(ln.t) || ' '}</span></div>`;
    }).join('');
    U.$$('.cl', this.codeEl).forEach((el) => {
      el.onclick = () => {
        this.follow = false;
        this.btnFollow.classList.remove('on');
        this.setActive(+el.dataset.line);
      };
    });
    this.setActiveTag(this.activeTag || 'run');
  };

  D.prototype.setActive = function (idx) {
    this.activeLine = idx;
    U.$$('.cl', this.codeEl).forEach((el) => el.classList.toggle('active', +el.dataset.line === idx));
    const act = U.$('.cl.active', this.codeEl);
    if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
  };

  D.prototype.setActiveTag = function (tag) {
    this.activeTag = tag;
    if (!tag) { this.setActive(-1); return; }
    const els = U.$$('.cl', this.codeEl);
    let idx = -1;
    for (let i = 0; i < els.length; i++) {
      if (els[i].dataset.tag === tag) {
        // 同一个 tag 的最后一个匹配（循环体最后一行更适合"执行中"）
        idx = i;
        break;
      }
    }
    if (idx < 0) idx = els.length - 1;
    this.setActive(idx);
  };

  D.prototype.setVars = function (rows) {
    this.vars = rows || [];
    this.varEl.innerHTML = this.vars.map((r) => `<div class="row"><span>${r[0]}</span><span>${r[1]}</span></div>`).join('');
  };

  D.prototype.setPlaying = function (p) {
    this.playing = p;
    this.btnPlay.textContent = p ? '⏸ 暂停' : '▶ 播放';
    this.btnPlay.classList.toggle('on', p);
  };

  D.prototype.copy = function () {
    const txt = this.lines.map((l) => l.t).join('\n');
    navigator.clipboard.writeText(txt).then(
      () => U.toast('代码已复制，可直接在 Python 环境运行'),
      () => U.toast('复制失败，请手动选择文本')
    );
  };

  CVL.ViewD = D;
  CVL.highlightPython = highlight;
})();
