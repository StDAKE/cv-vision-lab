/* 内置素材：程序化合成的零件表面图（无版权依赖，缺陷位置可控） */
(function () {
  const CVL = window.CVL;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rnd) {
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* 主生成器 */
  function makePart(o) {
    const opt = Object.assign({
      w: 1000, h: 640, seed: 7, scratches: 0, pits: 0, light: 1,
      vignette: 0.0, uneven: 0, brushed: 1, noise: 3.2, blurEdge: 1,
      dents: 0, name: '',
    }, o || {});
    const { w, h } = opt;
    const rnd = mulberry32(opt.seed);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;

    // 零件区域（圆角矩形）
    const px0 = w * 0.17, px1 = w * 0.83, py0 = h * 0.19, py1 = h * 0.81;
    const r = Math.min(w, h) * 0.06;
    function inPart(x, y) {
      if (x < px0 || x > px1 || y < py0 || y > py1) return 0;
      const cx = Math.min(Math.max(x, px0 + r), px1 - r);
      const cy = Math.min(Math.max(y, py0 + r), py1 - r);
      const dx = x - cx, dy = y - cy;
      const dd = Math.sqrt(dx * dx + dy * dy);
      if (dd > r) return 0;
      return 1;
    }
    // 到边界的距离（用于倒角）
    function edgeDist(x, y) {
      return Math.min(x - px0, px1 - x, y - py0, py1 - y);
    }

    // 划痕定义
    const scratchDefs = [];
    for (let i = 0; i < opt.scratches; i++) {
      const sx = px0 + (px1 - px0) * (0.15 + 0.7 * rnd());
      const sy = py0 + (py1 - py0) * (0.15 + 0.7 * rnd());
      const ang = (rnd() - 0.5) * 0.9 + (i % 2 ? 0.55 : -0.35);
      const len = 60 + rnd() * 150;
      const width = 0.9 + rnd() * 1.1;
      const depth = 26 + rnd() * 26;
      scratchDefs.push({ sx, sy, ang, len, width, depth });
    }
    const pitDefs = [];
    for (let i = 0; i < opt.pits; i++) {
      pitDefs.push({
        x: px0 + (px1 - px0) * rnd(),
        y: py0 + (py1 - py0) * rnd(),
        r: 2 + rnd() * 3.4,
        depth: 30 + rnd() * 35,
      });
    }

    const cosA = Math.cos, sinA = Math.sin;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const inside = inPart(x, y);

        // 背景：台面
        let base = 96 + 10 * Math.sin(x * 0.011 + 1.2) + 8 * Math.sin(y * 0.017);
        base += 4 * gauss(rnd);

        if (inside) {
          // 零件本体
          base = 178;
          // 拉丝纹理：沿 x 的高频
          if (opt.brushed) {
            const b = Math.sin(y * 1.7 + x * 0.06) * 3.2
              + Math.sin(y * 0.9 + Math.sin(x * 0.13) * 2.2) * 2.4
              + (rnd() - 0.5) * 5;
            base += b;
          }
          // 倒角
          const ed = edgeDist(x, y);
          if (ed < 7) base -= (7 - ed) * 4.6;
          // 中心高光
          const nx = (x - w / 2) / (w * 0.34);
          const ny = (y - h / 2) / (h * 0.34);
          const rr = Math.sqrt(nx * nx + ny * ny);
          base += 26 * Math.exp(-rr * rr * 1.5);

          // 划痕
          for (let k = 0; k < scratchDefs.length; k++) {
            const s = scratchDefs[k];
            const dx = x - s.sx, dy = y - s.sy;
            const u = dx * cosA(s.ang) + dy * sinA(s.ang);
            const v = -dx * sinA(s.ang) + dy * cosA(s.ang);
            if (u > -s.len / 2 && u < s.len / 2 && Math.abs(v) < s.width) {
              const t = 1 - Math.abs(u) / (s.len / 2);
              const core = 1 - Math.abs(v) / s.width;
              base -= s.depth * t * (0.35 + 0.65 * core);
              // 一侧高光
              if (v > 0) base += s.depth * 0.35 * t;
            }
          }
          // 麻点
          for (let k = 0; k < pitDefs.length; k++) {
            const p = pitDefs[k];
            const dd = Math.hypot(x - p.x, y - p.y);
            if (dd < p.r) {
              base -= p.depth * (1 - dd / p.r);
            } else if (dd < p.r + 1.2) {
              base += p.depth * 0.25;
            }
          }
          // 凹坑
          for (let k = 0; k < opt.dents; k++) {
            const cxp = px0 + (px1 - px0) * (0.3 + 0.4 * ((k * 37) % 100) / 100);
            const cyp = py0 + (py1 - py0) * (0.3 + 0.4 * ((k * 61) % 100) / 100);
            const dd = Math.hypot(x - cxp, y - cyp);
            if (dd < 26) base -= 22 * Math.cos((dd / 26) * Math.PI * 0.5);
          }
        }

        // 光照
        base *= opt.light;
        if (opt.uneven) {
          // 上暗下亮 / 左暗右亮
          base *= 1 + opt.uneven * ((y / h) - 0.5) * 1.4;
        }
        if (opt.vignette) {
          const nx = (x - w / 2) / (w / 2), ny = (y - h / 2) / (h / 2);
          base *= 1 - opt.vignette * (nx * nx + ny * ny) * 0.45;
        }
        // 噪声
        base += gauss(rnd) * opt.noise;

        const v = base < 0 ? 0 : base > 255 ? 255 : base;
        d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    canvas.__defect = scratchDefs.length ? { x: scratchDefs[0].sx - 60, y: scratchDefs[0].sy - 30, w: 140, h: 70 } : { x: w * 0.4, y: h * 0.4, w: w * 0.2, h: h * 0.2 };
    return canvas;
  }

  /* 灰阶渐变（位深/色阶断层演示） */
  function makeGradient(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const t = x / (w - 1);
        const v = Math.round(t * 255);
        img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  /* 彩色色卡（通道 / HSV 演示） */
  function makeSwatch(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const cols = ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#2980b9', '#8e44ad', '#ecf0f1', '#34495e'];
    const cw = w / 4, chh = h / 2;
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = cols[i];
      ctx.fillRect((i % 4) * cw, Math.floor(i / 4) * chh, cw + 1, chh + 1);
    }
    return c;
  }

  const cache = new Map();

  CVL.images = {
    list: [
      { id: 'clean', name: '零件 · 良品', desc: '正常表面，拉丝纹理' },
      { id: 'scratch', name: '零件 · 细划痕', desc: '1–2 px 宽划痕，用于滤波与边缘' },
      { id: 'pit', name: '零件 · 麻点', desc: '小斑点，用于形态学与特征' },
      { id: 'uneven', name: '零件 · 光照不均', desc: '下暗上亮，用于 CLAHE' },
      { id: 'gradient', name: '灰阶渐变', desc: '位深与色阶断层' },
      { id: 'swatch', name: '色卡', desc: '通道与 HSV 演示' },
    ],
    get(id) {
      if (cache.has(id)) return cache.get(id);
      let c;
      switch (id) {
        case 'scratch': c = makePart({ seed: 21, scratches: 4, noise: 3.0, dents: 1 }); break;
        case 'pit': c = makePart({ seed: 33, pits: 26, noise: 3.4, scratches: 1 }); break;
        case 'uneven': c = makePart({ seed: 12, scratches: 2, uneven: 0.85, noise: 3.2 }); break;
        case 'gradient': c = makeGradient(1000, 640); break;
        case 'swatch': c = makeSwatch(800, 560); break;
        default: c = makePart({ seed: 7, noise: 3.0 });
      }
      cache.set(id, c);
      return c;
    },
    // 同一件良品的两种光照（第4讲分布偏移）
    pair(level) {
      const key = 'pair_' + level;
      if (cache.has(key)) return cache.get(key);
      const c = makePart({ seed: 7, noise: 3.0, light: level, vignette: 0.3 });
      cache.set(key, c);
      return c;
    },
    makePart,
  };
})();
