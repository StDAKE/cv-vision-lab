/* 算子实现（纯 JS 内核，与代码区展示的 Python/OpenCV 代码一一对应） */
(function () {
  const CVL = (typeof window !== 'undefined' ? window : self).CVL;
  const R = CVL.op;
  const IO = CVL.IO;

  const BORDER_PY = { reflect: 'BORDER_REFLECT', replicate: 'BORDER_REPLICATE', constant: 'BORDER_CONSTANT' };
  const borderPy = (p) => 'cv.' + (BORDER_PY[p.border] || 'BORDER_REFLECT');
  const toU8 = IO.toU8;

  const K = {
    mean: (k) => Array.from({ length: k }, () => new Array(k).fill(1 / (k * k))),
    gauss2d: (k, sigma) => {
      const g = IO.gauss1d(k, sigma);
      return g.map((a) => g.map((b) => a * b));
    },
  };
  const LAPLACE3 = [[0, -1, 0], [-1, 4, -1], [0, -1, 0]];
  const SOBEL_X = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
  const SOBEL_Y = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
  CVL.kernels = Object.assign(CVL.kernels || {}, K, { LAPLACE3, SOBEL_X, SOBEL_Y });

  /* ---------- 采样 / 量化 ---------- */
  R.define({
    id: 'sampling.quant', label: '位深量化', group: 'sampling', lecture: 2, demo: 'grid',
    params: [{ key: 'bits', label: '位深 (bit)', type: 'select', def: '8', options: [
      { v: '8', label: '8 bit · 256 级' }, { v: '4', label: '4 bit · 16 级' },
      { v: '2', label: '2 bit · 4 级' }, { v: '1', label: '1 bit · 2 级' }],
      py: (v) => String(+v) }],
    code: [
      { t: 'import cv2, numpy as np' },
      { t: 'img = cv2.imread("part.png")' },
      { t: 'levels = 2 ** {{bits}}', tag: 'run' },
      { t: 'lut = np.array([round(np.floor(i / 256 * levels) / (levels - 1) * 255)' },
      { t: '                 for i in range(256)], dtype=np.uint8)' },
      { t: 'out = cv2.LUT(img, lut)', tag: 'write' },
    ],
    note: (p) => '量化级数 ' + Math.pow(2, +p.bits) + ' 级：级数越少，渐变被压成台阶（色阶断层），这是采集端不可逆的损失。',
    run(img, p) {
      const levels = Math.pow(2, +p.bits);
      const lut = new Uint8Array(256);
      for (let i = 0; i < 256; i++) lut[i] = Math.round(Math.floor((i / 256) * levels) / Math.max(1, levels - 1) * 255);
      return { out: IO.lut(img, lut) };
    },
  });

  R.define({
    id: 'sampling.down', label: '采样不足 / 降采样', group: 'sampling', lecture: 2, demo: 'grid',
    params: [
      { key: 'k', label: '降采样倍数 1/', type: 'range', min: 1, max: 12, step: 1, def: 4,
        tip: (v) => (v >= 6 ? '采样过稀：细纹理折叠成粗条纹，这是混叠，不是噪声，滤不掉' : null) },
      { key: 'antialias', label: '采样前先低通（抗混叠）', type: 'check', def: false },
    ],
    code: [
      { t: 'h, w = img.shape[:2]' },
      { t: 'small = cv2.resize(img, (w // {{k}}, h // {{k}}), interpolation=cv2.INTER_NEAREST)', tag: 'run' },
      { t: 'out = cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)', tag: 'write' },
    ],
    note: (p) => (p.antialias
      ? '采样前先低通，把超出采样能力的高频提前滤掉——混叠是"信息换了身份"，只能提前防。'
      : '降采样 ' + p.k + ' 倍后放大：纹理折叠出的条纹与真实低频无法区分，这就是混叠。'),
    run(img, p) {
      const k = Math.max(1, p.k | 0);
      let src = img;
      if (p.antialias && k > 1) src = toU8(IO.gaussian(img, 5, Math.max(0.6, k * 0.5), 'reflect'));
      const sw = Math.max(1, Math.round(img.w / k)), sh = Math.max(1, Math.round(img.h / k));
      const small = IO.resize(src, sw, sh, 'nearest');
      return { out: IO.resize(small, img.w, img.h, 'nearest') };
    },
  });

  /* ---------- 色彩 ---------- */
  R.define({
    id: 'color.hsv', label: 'RGB → HSV', group: 'color', lecture: 2, demo: 'grid',
    params: [{ key: 'space', label: '目标空间', type: 'select', def: 'hsv', options: [
      { v: 'hsv', label: 'HSV（H 抗光照）' }, { v: 'lab', label: 'LAB' }, { v: 'gray', label: '灰度' }] }],
    code: (p) => {
      const M = { hsv: 'COLOR_RGB2HSV', lab: 'COLOR_RGB2LAB', gray: 'COLOR_RGB2GRAY' };
      const NOTE = {
        hsv: '# H 回答"什么颜色"，V 回答"有多亮"',
        lab: '# L 亮度、a/b 是对立色轴：与人眼感知更接近',
        gray: '# 三通道压成一条：亮度信息保留，颜色信息被丢弃',
      };
      return [
        { t: 'img = cv2.imread("part.png")' },
        { t: 'img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)' },
        { t: 'out = cv2.cvtColor(img, cv2.' + (M[p.space] || 'COLOR_RGB2HSV') + ')', tag: 'run' },
        { t: NOTE[p.space] || NOTE.hsv },
      ];
    },
    note: () => 'HSV 把亮度单独拆成 V：光照变化主要落在 V 上，判断颜色只用 H，一套阈值跨班次通用。',
    run(img, p) {
      if (p.space === 'gray') return { out: IO.gray(img) };
      if (p.space === 'lab') return { out: IO.lab(img) };
      return { out: IO.hsv(img) };
    },
  });

  /* ---------- 噪声 ---------- */
  R.define({
    id: 'noise.add', label: '噪声注入', group: 'noise', lecture: 4, demo: 'grid',
    params: [
      { key: 'type', label: '噪声类型', type: 'select', def: 'gauss', options: [
        { v: 'gauss', label: '高斯（幅度型）' }, { v: 'sp', label: '椒盐（极值型）' }] },
      { key: 'sigma', label: 'σ / 比例', type: 'range', min: 0, max: 40, step: 1, def: 18 },
      { key: 'seed', label: '随机种子（可复现）', type: 'range', min: 1, max: 999, step: 1, def: 42 },
    ],
    code: [
      { t: 'rng = np.random.default_rng({{seed}})' },
      { t: 'noise = rng.normal(0, {{sigma}}, img.shape)', tag: 'run' },
      { t: 'out = np.clip(img + noise, 0, 255).astype(np.uint8)' },
      { t: '# 椒盐：稀疏、幅度极大，直接置 0 / 255' },
    ],
    note: (p) => (p.type === 'gauss'
      ? '高斯噪声处处都有、幅度小，像蒙了一层薄雾——用加权平均类滤波。'
      : '椒盐噪声稀疏、幅度极大——只有排序类（中值）能把它整条排除掉。'),
    run(img, p) {
      const out = IO.clone(img);
      let s = ((p.seed | 0) * 9301 + 49297) % 233280;
      const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
      const n = img.w * img.h;
      if (p.type === 'sp') {
        const ratio = (p.sigma / 100) * 0.5;
        for (let i = 0; i < n; i++) {
          if (rnd() < ratio) {
            const v = rnd() < 0.5 ? 0 : 255;
            const k = i * img.c;
            for (let ch = 0; ch < img.c; ch++) out.d[k + ch] = v;
          }
        }
      } else {
        for (let i = 0; i < out.d.length; i++) {
          const u1 = Math.max(1e-6, rnd()), u2 = rnd();
          const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * p.sigma;
          out.d[i] = Math.max(0, Math.min(255, out.d[i] + g));
        }
      }
      return { out };
    },
  });

  /* ---------- 滤波 ---------- */
  function defFilter(id, label, params, kernelFn, code, note, demo) {
    R.define({
      id, label, group: 'filter', lecture: 3, demo: demo || 'conv', params,
      code, kernel: kernelFn, note,
      run(img, p) {
        const k = p.ksize;
        if (id === 'filter.mean') return { out: toU8(IO.mean(img, k, p.border)) };
        if (id === 'filter.gaussian') return { out: toU8(IO.gaussian(img, k, p.sigma, p.border)) };
        if (id === 'filter.median') return { out: IO.median(img, k) };
        if (id === 'filter.bilateral') return { out: IO.bilateral(img, p.d, p.sigmaColor, p.sigmaSpace) };
        return { out: img };
      },
    });
  }

  defFilter('filter.mean', '均值滤波', [R.P.ksize(3), R.P.border()], (p) => K.mean(p.ksize),
    [
      { t: 'import cv2, numpy as np' },
      { t: 'img = cv2.imread("part.png")' },
      { t: 'k = np.ones(({{ksize}}, {{ksize}}), np.float32) / {{ksize}}**2', tag: 'kernel' },
      { t: 'out = cv2.filter2D(img, -1, k, borderType={{border}})', tag: 'run' },
      { t: '# 权重全正、和为 1：平坦区域不变，不一致处被抹平' },
    ],
    (p) => '核 ' + p.ksize + '×' + p.ksize + ' 全取平均：边缘和噪声得到同样待遇，所以边缘会被糊掉。');

  defFilter('filter.gaussian', '高斯滤波', [
    R.P.ksize(5),
    { key: 'sigma', label: 'sigma（0=由 ksize 推）', type: 'range', min: 0, max: 8, step: 0.1, def: 1.0,
      tip: (v) => (v === 0 ? 'sigma=0 时由 ksize 自动推出：σ ≈ 0.3((k−1)/2 − 1) + 0.8' : null) },
    R.P.border(),
  ], (p) => K.gauss2d(p.ksize, p.sigma),
    [
      { t: 'import cv2, numpy as np' },
      { t: 'img = cv2.imread("part.png")' },
      { t: 'g = cv2.getGaussianKernel({{ksize}}, {{sigma}})', tag: 'kernel' },
      { t: 'k = np.outer(g, g)          # 二维核 = 一维核外积' },
      { t: 'out = cv2.filter2D(img, -1, k, borderType={{border}})', tag: 'run' },
      { t: '# 按距离加权：离得近的像素更可能属于同一物体 → 保边优于均值' },
    ],
    () => '高斯核中心权重大、四周小：保边能力优于均值，但核越大，1–2 px 的划痕越容易被抹掉。');

  defFilter('filter.median', '中值滤波', [
    { key: 'ksize', label: 'ksize（核边长）', type: 'range', min: 3, max: 11, step: 2, def: 3,
      tip: (v) => (v % 2 === 0 ? 'ksize 必须奇数' : null) },
  ], null,
    [
      { t: 'import cv2' },
      { t: 'img = cv2.imread("part.png")' },
      { t: 'out = cv2.medianBlur(img, {{ksize}})', tag: 'run' },
      { t: '# 不是加权和：9 个数排序取中间，极值被直接排除' },
      { t: '# 所以它能治椒盐，而均值只会把噪点摊成灰斑' },
    ],
    () => '中值取排序后的中间值：255 的噪点排到最后，永远不会被选中——排序类专治极值型噪声。', 'median');

  defFilter('filter.bilateral', '双边滤波', [
    { key: 'd', label: 'd（邻域直径）', type: 'range', min: 3, max: 15, step: 2, def: 9 },
    { key: 'sigmaColor', label: 'sigmaColor', type: 'range', min: 10, max: 150, step: 5, def: 60 },
    { key: 'sigmaSpace', label: 'sigmaSpace', type: 'range', min: 10, max: 150, step: 5, def: 60 },
  ], null,
    [
      { t: 'import cv2' },
      { t: 'img = cv2.imread("part.png")' },
      { t: 'out = cv2.bilateralFilter(img, {{d}}, {{sigmaColor}}, {{sigmaSpace}})', tag: 'run' },
      { t: '# 同时考虑空间距离与像素值差异：值差大的邻居权重 → 0' },
      { t: '# 代价：慢，参数难调' },
    ],
    () => '双边滤波把"值差太大"的邻居权重压到接近 0，所以边缘不会被平均掉；代价是慢、参数难调。');

  /* ---------- 边缘 ---------- */
  R.define({
    id: 'edge.sobel', label: 'Sobel 梯度', group: 'edge', lecture: 3, demo: 'conv',
    params: [
      { key: 'mode', label: '输出', type: 'select', def: 'mag', options: [
        { v: 'mag', label: '幅值 √(gx²+gy²)' }, { v: 'x', label: 'gx（水平）' }, { v: 'y', label: 'gy（垂直）' }] },
      { key: 'ksize', label: 'ksize', type: 'range', min: 3, max: 7, step: 2, def: 3 },
      { key: 'preblur', label: '先高斯去噪再求梯度', type: 'check', def: true,
        tip: (v) => (v ? null : '关掉它：噪声会被微分放大，边缘淹没在噪点里') },
    ],
    code: [
      { t: 'import cv2, numpy as np' },
      { t: 'gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)' },
      { t: 'if {{preblur}}: gray = cv2.GaussianBlur(gray, (3, 3), 0)', tag: 'pre' },
      { t: 'gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize={{ksize}})', tag: 'run' },
      { t: 'gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize={{ksize}})' },
      { t: 'mag = np.sqrt(gx**2 + gy**2)' },
      { t: 'out = cv2.convertScaleAbs(mag)' },
    ],
    kernel: (p) => (p.mode === 'y' ? SOBEL_Y : SOBEL_X),
    note: (p) => (p.preblur
      ? '边缘 = 亮度显著变化 → 导数大。微分是高通，会放大噪声，所以"先降噪再求梯度"是从定义推出来的。'
      : '把去噪关掉：噪声被微分放大，真实边缘被淹没——顺序不是口诀，是有数学原因的。'),
    run(img, p) {
      const g = IO.grayF(img);
      const src = p.preblur ? IO.gaussian(g, 3, 0.8, 'reflect') : g;
      const { gx, gy } = IO.sobel(src, p.ksize);
      const out = IO.make(g.w, g.h, 1);
      for (let i = 0; i < g.w * g.h; i++) {
        let v;
        if (p.mode === 'x') v = Math.abs(gx.d[i]) * 2;
        else if (p.mode === 'y') v = Math.abs(gy.d[i]) * 2;
        else v = Math.sqrt(gx.d[i] * gx.d[i] + gy.d[i] * gy.d[i]) * 2;
        out.d[i] = v > 255 ? 255 : v;
      }
      return { out };
    },
  });

  R.define({
    id: 'edge.canny', label: 'Canny 边缘', group: 'edge', lecture: 3, demo: 'grid',
    params: [
      { key: 'low', label: '低阈值', type: 'range', min: 0, max: 255, step: 1, def: 50 },
      { key: 'high', label: '高阈值', type: 'range', min: 0, max: 255, step: 1, def: 150 },
      { key: 'ksize', label: 'Sobel ksize', type: 'range', min: 3, max: 7, step: 2, def: 3 },
      { key: 'preblur', label: '第一步：高斯去噪', type: 'check', def: true },
    ],
    code: [
      { t: 'gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)   # 1 灰度化' },
      { t: 'g = cv2.GaussianBlur(gray, (5, 5), 1.4)        # 2 去噪' },
      { t: 'gx = cv2.Sobel(g, cv2.CV_32F, 1, 0); gy = cv2.Sobel(g, cv2.CV_32F, 0, 1)  # 3 梯度' },
      { t: '# 4 非极大值抑制：沿梯度方向只留局部最大，边缘细化到 1 px' },
      { t: 'out = cv2.Canny(g, {{low}}, {{high}}, apertureSize={{ksize}})', tag: 'run' },
      { t: '# 5 双阈值滞后连接：高于 high 的做骨架，low–high 之间看是否与强边相连' },
    ],
    note: (p) => '双阈值 ' + p.low + ' / ' + p.high + '：调高断线，调低毛刺。滞后连接本质是"用上下文补信息"。',
    run(img, p) {
      const lo = Math.min(p.low, p.high), hi = Math.max(p.low, p.high);
      const res = IO.canny(img, lo, hi, p.ksize);
      return { out: res.img, meta: { edgePixels: res.count, ratio: res.count / (img.w * img.h) } };
    },
  });

  R.define({
    id: 'edge.laplacian', label: 'Laplacian 二阶微分', group: 'edge', lecture: 3, demo: 'conv',
    params: [{ key: 'ksize', label: 'ksize', type: 'range', min: 1, max: 7, step: 2, def: 3 }],
    code: [
      { t: 'gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)' },
      { t: 'lap = cv2.Laplacian(gray, cv2.CV_32F, ksize={{ksize}})', tag: 'run' },
      { t: 'out = cv2.convertScaleAbs(lap)' },
    ],
    kernel: () => LAPLACE3,
    note: () => '中心 +4、四周 −1，和为 0：平坦区域响应为 0，只有亮度突变处才有输出。',
    run(img) {
      const g = IO.grayF(img);
      const lap = IO.laplacian(g);
      const out = IO.make(g.w, g.h, 1);
      for (let i = 0; i < g.w * g.h; i++) {
        const v = Math.abs(lap.d[i]) * 2.2;
        out.d[i] = v > 255 ? 255 : v;
      }
      return { out };
    },
  });

  /* ---------- 形态学 ---------- */
  R.define({
    id: 'morph.op', label: '形态学操作', group: 'morph', lecture: 3, demo: 'morph',
    params: [
      { key: 'op', label: '操作', type: 'select', def: 'open', options: [
        { v: 'erode', label: '腐蚀（变瘦）' }, { v: 'dilate', label: '膨胀（变胖）' },
        { v: 'open', label: '开运算（去小白点）' }, { v: 'close', label: '闭运算（填小黑洞）' },
        { v: 'tophat', label: '顶帽（突出小亮块）' }, { v: 'blackhat', label: '黑帽' }] },
      { key: 'shape', label: '结构元素形状', type: 'select', def: 'ellipse', options: [
        { v: 'rect', label: '矩形' }, { v: 'ellipse', label: '圆盘' }, { v: 'cross', label: '十字' }, { v: 'line', label: '线形（修划痕）' }] },
      { key: 'size', label: '结构元素尺寸', type: 'range', min: 3, max: 15, step: 2, def: 5,
        tip: (v) => (v > 9 ? '结构元素越大，细节损失越多：比要删的略大、比要留的明显小' : null) },
      { key: 'thr', label: '二值化阈值', type: 'range', min: 0, max: 255, step: 1, def: 110 },
    ],
    code: (p) => {
      const OP_PY = { erode: 'MORPH_ERODE', dilate: 'MORPH_DILATE', open: 'MORPH_OPEN', close: 'MORPH_CLOSE', tophat: 'MORPH_TOPHAT', blackhat: 'MORPH_BLACKHAT' };
      const SH_PY = { rect: 'MORPH_RECT', ellipse: 'MORPH_ELLIPSE', cross: 'MORPH_CROSS', line: 'MORPH_RECT' };
      return [
        { t: 'gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)' },
        { t: '_, mask = cv2.threshold(gray, ' + p.thr + ', 255, cv2.THRESH_BINARY)' },
        { t: 'k = cv2.getStructuringElement(cv2.' + (SH_PY[p.shape] || 'MORPH_ELLIPSE') + ', (' + p.size + ', ' + p.size + '))', tag: 'kernel' },
        { t: 'out = cv2.morphologyEx(mask, cv2.' + (OP_PY[p.op] || 'MORPH_OPEN') + ', k)', tag: 'run' },
        { t: '# 开 = 先腐蚀后膨胀 → 去孤立小白点；闭 = 先膨胀后腐蚀 → 填小黑洞' },
      ];
    },
    footprint: (p) => IO.footprint(p.shape, p.size),
    note: (p) => {
      const m = {
        erode: '腐蚀：邻域里只要有黑，中心就变黑——边界被啃掉一圈。',
        dilate: '膨胀：邻域里只要有白，中心就变白——边界向外扩一圈。',
        open: '开运算 = 先腐蚀后膨胀：小白点被彻底消掉，主体恢复原状。',
        close: '闭运算 = 先膨胀后腐蚀：内部的小黑洞被填掉。',
        tophat: '顶帽 = 原图 − 开运算：只留下比结构元素小的亮细节（细划痕就靠它）。',
        blackhat: '黑帽 = 闭运算 − 原图：只留下暗的小结构。',
      };
      return m[p.op] || '';
    },
    run(img, p) {
      const g = IO.gray(img);
      const bin = IO.make(g.w, g.h, 1);
      for (let i = 0; i < g.d.length; i++) bin.d[i] = g.d[i] > p.thr ? 255 : 0;
      const fp = IO.footprint(p.shape, p.size);
      let out;
      if (p.op === 'erode') out = IO.morph(bin, fp, 'erode');
      else if (p.op === 'dilate') out = IO.morph(bin, fp, 'dilate');
      else if (p.op === 'open') out = IO.morph(IO.morph(bin, fp, 'erode'), fp, 'dilate');
      else if (p.op === 'close') out = IO.morph(IO.morph(bin, fp, 'dilate'), fp, 'erode');
      else if (p.op === 'tophat') {
        const o = IO.morph(IO.morph(bin, fp, 'erode'), fp, 'dilate');
        out = IO.make(bin.w, bin.h, 1);
        for (let i = 0; i < bin.d.length; i++) out.d[i] = Math.max(0, bin.d[i] - o.d[i]);
      } else {
        const c = IO.morph(IO.morph(bin, fp, 'dilate'), fp, 'erode');
        out = IO.make(bin.w, bin.h, 1);
        for (let i = 0; i < bin.d.length; i++) out.d[i] = Math.max(0, c.d[i] - bin.d[i]);
      }
      return { out };
    },
  });

  /* ---------- 增强 ---------- */
  R.define({
    id: 'enhance.histeq', label: '直方图均衡化', group: 'enhance', lecture: 4, demo: 'grid',
    params: [],
    code: [
      { t: 'gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)' },
      { t: 'out = cv2.equalizeHist(gray)', tag: 'run' },
      { t: '# 用累积分布函数做映射：像素多的灰度被拉宽，少的被压缩' },
      { t: '# 副作用：暗部的一点噪声被一并拉开成明显颗粒' },
    ],
    note: () => '全局均衡化不分区域、不看内容：看起来更清楚，指标却可能更差——它连噪声一起增强了。',
    run(img) { return { out: IO.histeq(IO.gray(img)) }; },
  });

  R.define({
    id: 'enhance.clahe', label: 'CLAHE 自适应均衡', group: 'enhance', lecture: 4, demo: 'grid',
    params: [
      { key: 'clip', label: 'clipLimit（限幅）', type: 'range', min: 0.5, max: 10, step: 0.5, def: 3,
        tip: (v) => (v > 6 ? '限幅越大，噪声放大越明显——这就是限幅存在的理由' : null) },
      { key: 'tile', label: 'tileGridSize', type: 'range', min: 2, max: 16, step: 1, def: 8,
        tip: (v) => (v === 8 ? '8×8 是通用起点；块要比你关心的缺陷大' : null) },
      { key: 'onL', label: '只作用于亮度通道', type: 'check', def: true },
    ],
    code: [
      { t: 'lab = cv2.cvtColor(img, cv2.COLOR_RGB2LAB)' },
      { t: 'l, a, b = cv2.split(lab)' },
      { t: 'clahe = cv2.createCLAHE(clipLimit={{clip}}, tileGridSize=({{tile}}, {{tile}}))', tag: 'run' },
      { t: 'l2 = clahe.apply(l)          # 分块均衡 + 双线性插值 + 限幅' },
      { t: 'out = cv2.cvtColor(cv2.merge([l2, a, b]), cv2.COLOR_LAB2RGB)' },
    ],
    note: (p) => 'clipLimit=' + p.clip + '：超过限幅的直方图峰被削平再均摊，等于给噪声设了上限；块 ' + p.tile + '×' + p.tile + ' 决定"局部"有多局部。',
    run(img, p) { return { out: IO.clahe(img, p.clip, p.tile) }; },
  });

  R.define({
    id: 'enhance.bc', label: '亮度 / 对比度', group: 'enhance', lecture: 4, demo: 'grid',
    params: [
      { key: 'alpha', label: 'α（对比度）', type: 'range', min: 0.2, max: 3, step: 0.05, def: 1.4 },
      { key: 'beta', label: 'β（亮度）', type: 'range', min: -100, max: 100, step: 1, def: 10 },
    ],
    code: [
      { t: '# g = α·f + β  ：线性变换，不是卷积' },
      { t: 'out = cv2.convertScaleAbs(img, alpha={{alpha}}, beta={{beta}})', tag: 'run' },
    ],
    note: () => 'g = α·f + β：α 拉开或压缩对比度，β 整体加亮。简单，但它是"改值域"不是"改分布"。',
    run(img, p) { return { out: IO.brightnessContrast(img, p.alpha, p.beta) }; },
  });

  R.define({
    id: 'enhance.sharpen', label: '锐化（USM）', group: 'enhance', lecture: 4, demo: 'grid',
    params: [
      { key: 'k', label: 'k（加多少高频）', type: 'range', min: 0, max: 3, step: 0.1, def: 0.8,
        tip: (v) => (v > 1.6 ? 'k 过大：边缘两侧出现亮暗镶边，这就是光晕' : null) },
      { key: 'radius', label: '低频尺度（高斯 σ）', type: 'range', min: 0.5, max: 5, step: 0.5, def: 1.5 },
    ],
    code: [
      { t: '# 非锐化掩膜：out = f + k·(f − 低频)' },
      { t: 'low = cv2.GaussianBlur(img, (0, 0), {{radius}})' },
      { t: 'out = cv2.addWeighted(img, 1 + {{k}}, low, -{{k}}, 0)', tag: 'run' },
      { t: '# 锐化放大高频，噪声也在高频 → 顺序必须放在最后' },
    ],
    note: () => '锐化只放大已有的高频，不能创造细节；k 太大就在边缘两侧镶出亮暗边（光晕）。',
    run(img, p) {
      const g = IO.gaussian(img, 5, p.radius, 'reflect');
      const out = IO.clone(img);
      for (let i = 0; i < img.d.length; i++) out.d[i] = Math.max(0, Math.min(255, img.d[i] + p.k * (img.d[i] - g.d[i])));
      return { out };
    },
  });

  /* ---------- 特征 ---------- */
  R.define({
    id: 'feature.lbp', label: 'LBP 纹理', group: 'feature', lecture: 3, demo: 'grid',
    params: [
      { key: 'radius', label: '半径 R', type: 'range', min: 1, max: 3, step: 1, def: 1 },
      { key: 'pts', label: '邻域点数 P', type: 'range', min: 4, max: 12, step: 1, def: 8 },
    ],
    code: [
      { t: 'gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)' },
      { t: 'out = np.zeros_like(gray)' },
      { t: 'for i, (dy, dx) in enumerate(neighbors({{radius}}, {{pts}})):', tag: 'loop' },
      { t: '    out += ((gray_shifted(dy, dx) >= gray) << i)   # 比中心大记 1', tag: 'mul' },
      { t: '# 只比较相对大小 → 整幅图变亮不改变任何一次比较' },
    ],
    note: () => 'LBP 只比较相对大小，对单调光照变换免疫——正好打中"偏亮偏暗"的痛点；但噪声会改变比较结果。',
    run(img, p) { return { out: IO.lbp(IO.gray(img), p.radius, p.pts) }; },
  });

  /* ---------- 尺寸 ---------- */
  R.define({
    id: 'geom.resize', label: '尺寸处理', group: 'geom', lecture: 5, demo: 'grid',
    params: [
      { key: 'size', label: '目标边长', type: 'range', min: 128, max: 640, step: 32, def: 224 },
      { key: 'mode', label: '策略', type: 'select', def: 'letterbox', options: [
        { v: 'stretch', label: '直接拉伸（会形变）' },
        { v: 'crop', label: '短边缩放 + 中心裁剪（会丢内容）' },
        { v: 'letterbox', label: '保比缩放 + 填充（推荐）' }] },
      { key: 'interp', label: '插值', type: 'select', def: 'linear', options: [
        { v: 'linear', label: '双线性（默认）' }, { v: 'nearest', label: '最近邻（掩码）' },
        { v: 'area', label: '面积平均（大比例缩小）' }] },
      { key: 'pad', label: '填充值', type: 'select', def: '0', options: [
        { v: '0', label: '0（= 平均亮度）' }, { v: '255', label: '255（会造出假边缘）' }], py: (v) => String(+v) },
    ],
    code: [
      { t: 'target = {{size}}' },
      { t: 'h, w = img.shape[:2]; s = target / max(h, w)' },
      { t: 'img = cv2.resize(img, (round(w*s), round(h*s)), interpolation=cv2.INTER_LINEAR)' },
      { t: 'img = cv2.copyMakeBorder(img, 0, target-img.shape[0], 0, target-img.shape[1],', tag: 'run' },
      { t: '                      cv2.BORDER_CONSTANT, value=({{pad}},)*3)' },
      { t: '# 填 0 等价于告诉网络"这里没有信息"；填 255 会引入一条假强边' },
    ],
    note: (p) => (p.mode === 'stretch'
      ? '直接拉伸把 16:9 压成 1:1，圆形变椭圆——如果"圆不圆"是你的判据，这一步就把判据毁了。'
      : p.mode === 'crop'
        ? '中心裁剪不形变，但会丢掉两侧内容——缺陷在边上就永远检不出来。'
        : '保比 + 填充：内容完整、不形变，代价是多一步 pad。填充值选 0。'),
    run(img, p) {
      const t = p.size;
      if (p.mode === 'stretch') return { out: IO.resize(img, t, t, p.interp === 'nearest' ? 'nearest' : 'linear') };
      const s = t / (p.mode === 'crop' ? Math.min(img.h, img.w) : Math.max(img.h, img.w));
      const nw = Math.max(1, Math.round(img.w * s)), nh = Math.max(1, Math.round(img.h * s));
      const r = IO.resize(img, nw, nh, p.interp === 'nearest' ? 'nearest' : p.interp === 'area' ? 'area' : 'linear');
      if (p.mode === 'crop') {
        if (r.w >= t && r.h >= t) return { out: IO.cropCenter(r, t, t) };
        return { out: IO.padTo(r, t, t, 0) };
      }
      return { out: IO.padTo(r, t, t, p.pad === '255' ? 255 : 0) };
    },
  });

  /* ---------- 归一化 ---------- */
  R.define({
    id: 'norm.scale', label: '归一化 / 标准化', group: 'norm', lecture: 5, demo: 'grid',
    params: [
      { key: 'mode', label: '方式', type: 'select', def: 'zscore', options: [
        { v: 'minmax', label: 'Min-Max（/255）' },
        { v: 'zscore', label: 'Z-score（减均值除标准差）' },
        { v: 'none', label: '不做（直接用 0–255）' }] },
      { key: 'stat', label: '统计量来源', type: 'select', def: 'imagenet', options: [
        { v: 'imagenet', label: 'ImageNet（与权重配套）' }, { v: 'custom', label: '当前图统计量' }] },
    ],
    code: (p) => {
      if (p.mode === 'none') return [
        { t: '# 不归一化：直接喂 0–255 的 uint8' },
        { t: 'x = img.astype(np.float32)              # 只是换了 dtype', tag: 'run' },
        { t: '# 权重是按 0–1 输入训练的：值域错了，输出全乱，但不会报错' },
      ];
      if (p.mode === 'minmax') return [
        { t: 'x = img.astype(np.float32) / 255.0      # 先转浮点，再缩放', tag: 'run' },
        { t: '# 值域固定 0–1，但对异常值敏感：一个 255 的坏点就能把整幅图压暗' },
      ];
      if (p.stat === 'custom') return [
        { t: 'x = img.astype(np.float32) / 255.0', tag: 'run' },
        { t: 'mean = x.mean(axis=(0, 1))              # 用当前图自己的统计量' },
        { t: 'std  = x.std(axis=(0, 1))' },
        { t: 'x = (x - mean) / (std + 1e-6)           # 部署时若换了算法，必须跟着换' },
      ];
      return [
        { t: 'x = img.astype(np.float32) / 255.0      # 先转浮点，再缩放', tag: 'run' },
        { t: 'mean = np.array([0.485, 0.456, 0.406], np.float32)' },
        { t: 'std  = np.array([0.229, 0.224, 0.225], np.float32)' },
        { t: 'x = (x - mean) / std                    # 统计量必须与权重配套' },
        { t: '# 删掉这一行：Top-1 从 88.6% 掉到 77.2%，而且不报错' },
      ];
    },
    note: (p) => (p.mode === 'minmax'
      ? 'Min-Max 把值压到 0–1：简单、值域确定，但对异常值极敏感——一个 255 的坏点就能把整幅图压暗。'
      : 'Z-score 把分布搬到均值 0、方差 1：对异常值稳健，且三个通道量纲一致，同一学习率都合适。'),
    run(img, p) {
      if (p.mode === 'none') return { out: IO.clone(img) };
      let mean = [0, 0, 0], std = [1, 1, 1];
      if (p.stat === 'custom') {
        const st = IO.statsRGB(img);
        mean = st.mean; std = st.std;
      } else {
        mean = [0.485, 0.456, 0.406]; std = [0.229, 0.224, 0.225];
      }
      const f = IO.norm(img, p.mode === 'minmax' ? [0, 0, 0] : mean, p.mode === 'minmax' ? [1, 1, 1] : std);
      const r = IO.floatToRGB(f);
      return { out: r.img, meta: { mean, std, range: r.range } };
    },
  });

  R.define({
    id: 'none', label: '原图（不处理）', group: 'sampling', lecture: 2, demo: 'grid',
    params: [],
    code: [
      { t: 'img = cv2.imread("part.png")' },
      { t: 'img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)' },
      { t: 'print(img.shape, img.dtype, img.min(), img.max())', tag: 'run' },
    ],
    note: () => '任何一张图，第一步都是看 shape、dtype、min/max —— 形状错了，后面所有运算都在错误的对象上。',
    run(img) { return { out: IO.clone(img) }; },
  });
})();
