/* 客观指标：全部基于 ImageData，不依赖 OpenCV */
(function () {
  const CVL = window.CVL;
  const M = {};

  function grayArray(id) {
    const n = id.width * id.height;
    const g = new Uint8Array(n);
    const d = id.data;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      g[i] = (0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]) | 0;
    }
    return g;
  }

  M.psnr = function (a, b) {
    if (!a || !b || a.width !== b.width || a.height !== b.height) return null;
    const n = a.width * a.height;
    const da = a.data, db = b.data;
    let se = 0;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const d1 = da[j] - db[j], d2 = da[j + 1] - db[j + 1], d3 = da[j + 2] - db[j + 2];
      se += d1 * d1 + d2 * d2 + d3 * d3;
    }
    const mse = se / (n * 3);
    if (mse < 1e-9) return Infinity;
    return 10 * Math.log10((255 * 255) / mse);
  };

  M.ssim = function (a, b) {
    if (!a || !b || a.width !== b.width || a.height !== b.height) return null;
    const A = grayArray(a), B = grayArray(b);
    const n = A.length;
    let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += A[i]; mb += B[i]; }
    ma /= n; mb /= n;
    let va = 0, vb = 0, cov = 0;
    for (let i = 0; i < n; i++) {
      const x = A[i] - ma, y = B[i] - mb;
      va += x * x; vb += y * y; cov += x * y;
    }
    va /= n - 1; vb /= n - 1; cov /= n - 1;
    const C1 = Math.pow(0.01 * 255, 2), C2 = Math.pow(0.03 * 255, 2);
    return ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
  };

  M.noiseSigma = function (id) {
    const g = grayArray(id), w = id.width, h = id.height;
    if (w < 5 || h < 5) return 0;
    let sum = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const v = g[i - w - 1] + g[i - w] + g[i - w + 1] + g[i - 1] - 8 * g[i] + g[i + 1] + g[i + w - 1] + g[i + w] + g[i + w + 1];
        sum += Math.abs(v);
      }
    }
    return Math.sqrt(Math.PI / 2) * sum / (6 * (w - 2) * (h - 2));
  };

  M.edgeEnergy = function (id) {
    const g = grayArray(id), w = id.width, h = id.height;
    let e = 0, c = 0;
    for (let y = 1; y < h - 1; y += 2) {
      for (let x = 1; x < w - 1; x += 2) {
        const i = y * w + x;
        e += Math.abs(g[i + 1] - g[i - 1]) + Math.abs(g[i + w] - g[i - w]);
        c++;
      }
    }
    return c ? e / c : 0;
  };

  M.hist = function (id) {
    const out = { gray: new Uint32Array(256), r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256), max: 1 };
    if (!id) return out;
    const d = id.data, n = id.width * id.height;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const r = d[j], g = d[j + 1], b = d[j + 2];
      out.r[r]++; out.g[g]++; out.b[b]++;
      out.gray[(0.299 * r + 0.587 * g + 0.114 * b) | 0]++;
    }
    let mx = 1;
    for (let i = 0; i < 256; i++) mx = Math.max(mx, out.gray[i], out.r[i], out.g[i], out.b[i]);
    out.max = mx;
    return out;
  };

  CVL.metrics = M;
})();
