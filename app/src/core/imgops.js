/* 纯 JS 图像算法内核：无外部依赖，可在 Worker 中运行
   图像统一表示为 {w, h, c, d: Uint8ClampedArray | Float32Array} */
(function () {
  const root = typeof window !== 'undefined' ? window : self;
  const CVL = root.CVL || (root.CVL = {});
  const IO = {};

  const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

  IO.make = function (w, h, c) { return { w, h, c: c || 3, d: new Uint8ClampedArray(w * h * (c || 3)) }; };
  IO.makeF = function (w, h, c) { return { w, h, c: c || 1, d: new Float32Array(w * h * (c || 1)) }; };
  IO.clone = function (im) { return { w: im.w, h: im.h, c: im.c, d: im.d.slice() }; };

  /* RGBA <-> RGB */
  IO.fromRGBA = function (buf, w, h) {
    const n = w * h;
    const out = IO.make(w, h, 3);
    for (let i = 0, j = 0, k = 0; i < n; i++, j += 4, k += 3) {
      out.d[k] = buf[j]; out.d[k + 1] = buf[j + 1]; out.d[k + 2] = buf[j + 2];
    }
    return out;
  };
  IO.toRGBA = function (im) {
    const n = im.w * im.h;
    const out = new Uint8ClampedArray(n * 4);
    if (im.c === 1) {
      for (let i = 0, j = 0; i < n; i++, j += 4) {
        const v = im.d[i];
        out[j] = v; out[j + 1] = v; out[j + 2] = v; out[j + 3] = 255;
      }
    } else if (im.c === 3) {
      for (let i = 0, j = 0, k = 0; i < n; i++, j += 4, k += 3) {
        out[j] = im.d[k]; out[j + 1] = im.d[k + 1]; out[j + 2] = im.d[k + 2]; out[j + 3] = 255;
      }
    } else {
      const cols = [[235, 64, 52], [97, 203, 122], [76, 154, 255], [245, 165, 36], [167, 139, 250], [45, 212, 191]];
      for (let i = 0, j = 0; i < n; i++, j += 4) {
        const v = im.d[i];
        const col = cols[(v + 1) % cols.length];
        out[j] = col[0]; out[j + 1] = col[1]; out[j + 2] = col[2]; out[j + 3] = 255;
      }
    }
    return out;
  };

  IO.gray = function (im) {
    if (im.c === 1) return IO.clone(im);
    const out = IO.make(im.w, im.h, 1);
    for (let i = 0, k = 0, j = 0; i < im.w * im.h; i++, k += 3, j++) {
      out.d[j] = (0.299 * im.d[k] + 0.587 * im.d[k + 1] + 0.114 * im.d[k + 2]) | 0;
    }
    return out;
  };
  IO.grayF = function (im) {
    const g = IO.makeF(im.w, im.h, 1);
    if (im.c === 1) { for (let i = 0; i < im.w * im.h; i++) g.d[i] = im.d[i]; return g; }
    for (let i = 0, k = 0; i < im.w * im.h; i++, k += 3) {
      g.d[i] = 0.299 * im.d[k] + 0.587 * im.d[k + 1] + 0.114 * im.d[k + 2];
    }
    return g;
  };
  IO.grayToRGB = function (g) {
    const out = IO.make(g.w, g.h, 3);
    for (let i = 0, k = 0; i < g.w * g.h; i++, k += 3) {
      const v = g.d[i];
      out.d[k] = v; out.d[k + 1] = v; out.d[k + 2] = v;
    }
    return out;
  };

  IO.hsv = function (im) {
    const out = IO.make(im.w, im.h, 3);
    for (let i = 0, k = 0; i < im.w * im.h; i++, k += 3) {
      const r = im.d[k] / 255, g = im.d[k + 1] / 255, b = im.d[k + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), df = mx - mn;
      let h = 0;
      if (df > 1e-6) {
        if (mx === r) h = ((g - b) / df) % 6;
        else if (mx === g) h = (b - r) / df + 2;
        else h = (r - g) / df + 4;
        h *= 60; if (h < 0) h += 360;
      }
      out.d[k] = Math.round(h / 2);       // OpenCV: H ∈ [0,179]
      out.d[k + 1] = Math.round((mx <= 0 ? 0 : df / mx) * 255);
      out.d[k + 2] = Math.round(mx * 255);
    }
    return out;
  };

  IO.lab = function (im) {
    // 简化 LAB：只用于显示，近似用 YCbCr 拉伸
    const out = IO.make(im.w, im.h, 3);
    for (let i = 0, k = 0; i < im.w * im.h; i++, k += 3) {
      const r = im.d[k], g = im.d[k + 1], b = im.d[k + 2];
      out.d[k] = clamp255(0.299 * r + 0.587 * g + 0.114 * b);
      out.d[k + 1] = clamp255(128 - 0.168736 * r - 0.331264 * g + 0.5 * b);
      out.d[k + 2] = clamp255(128 + 0.5 * r - 0.418688 * g - 0.081312 * b);
    }
    return out;
  };

  /* ---------- 卷积 ---------- */
  function borderIndex(i, n, mode) {
    if (i >= 0 && i < n) return i;
    if (mode === 'replicate') return i < 0 ? 0 : n - 1;
    if (mode === 'constant') return -1;
    // reflect
    if (n === 1) return 0;
    let x = i;
    while (x < 0 || x >= n) {
      if (x < 0) x = -x;
      if (x >= n) x = 2 * n - 2 - x;
    }
    return x;
  }

  /* 卷积：与 cv2.filter2D 一致，输出与输入同尺寸（窗口中心对齐，越界按 border 处理） */
  IO.convolve = function (src, kernel, border, stride) {
    const kh = kernel.length, kw = kernel[0].length;
    const s = stride || 1;
    const cyk = (kh - 1) / 2, cxk = (kw - 1) / 2;
    const outW = Math.floor((src.w - 1) / s) + 1;
    const outH = Math.floor((src.h - 1) / s) + 1;
    const out = IO.makeF(outW, outH, src.c);
    const bd = border || 'reflect';
    const cnum = src.c;
    for (let y = 0; y < outH; y++) {
      const cy = y * s;
      for (let x = 0; x < outW; x++) {
        const cx = x * s;
        const oi = y * outW + x;
        for (let ch = 0; ch < cnum; ch++) {
          let acc = 0;
          for (let ky = 0; ky < kh; ky++) {
            const sy = borderIndex(cy + ky - cyk, src.h, bd);
            if (sy < 0) continue;
            for (let kx = 0; kx < kw; kx++) {
              const sx = borderIndex(cx + kx - cxk, src.w, bd);
              if (sx < 0) continue;
              acc += src.d[(sy * src.w + sx) * cnum + ch] * kernel[ky][kx];
            }
          }
          out.d[oi * cnum + ch] = acc;
        }
      }
    }
    return out;
  };

  IO.toU8 = function (f) {
    const out = IO.make(f.w, f.h, f.c);
    for (let i = 0; i < f.d.length; i++) out.d[i] = clamp255(Math.round(f.d[i]));
    return out;
  };

  IO.gauss1d = function (k, sigma) {
    if (!sigma || sigma <= 0) sigma = 0.3 * ((k - 1) * 0.5 - 1) + 0.8;
    const c = (k - 1) / 2, a = [];
    let s = 0;
    for (let i = 0; i < k; i++) { const v = Math.exp(-((i - c) * (i - c)) / (2 * sigma * sigma)); a.push(v); s += v; }
    return a.map((v) => v / s);
  };

  /* 可分离高斯（快） */
  IO.gaussian = function (src, k, sigma, border) {
    const g = IO.gauss1d(k, sigma);
    const bd = border || 'reflect';
    const cnum = src.c;
    const tmp = IO.makeF(src.w, src.h, cnum);
    const half = (k - 1) / 2;
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        for (let ch = 0; ch < cnum; ch++) {
          let acc = 0;
          for (let t = 0; t < k; t++) {
            const sx = borderIndex(x + t - half, src.w, bd);
            acc += (sx < 0 ? 0 : src.d[(y * src.w + sx) * cnum + ch]) * g[t];
          }
          tmp.d[(y * src.w + x) * cnum + ch] = acc;
        }
      }
    }
    const out = IO.makeF(src.w, src.h, cnum);
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        for (let ch = 0; ch < cnum; ch++) {
          let acc = 0;
          for (let t = 0; t < k; t++) {
            const sy = borderIndex(y + t - half, src.h, bd);
            acc += (sy < 0 ? 0 : tmp.d[(sy * src.w + x) * cnum + ch]) * g[t];
          }
          out.d[(y * src.w + x) * cnum + ch] = acc;
        }
      }
    }
    return out;
  };

  IO.mean = function (src, k, border) {
    const ker = Array.from({ length: k }, () => new Array(k).fill(1 / (k * k)));
    return IO.convolve(src, ker, border);
  };

  /* 中值：滑窗直方图法（8 bit，逐行滑动，O(1) 摊还），无需逐像素排序 */
  function medianFromHist(hist, target, start) {
    let v = start < 0 ? 0 : start > 255 ? 255 : start;
    let below = 0;
    for (let i = 0; i < v; i++) below += hist[i];
    for (let guard = 0; guard < 1024; guard++) {
      if (below > target) {
        if (v === 0) return 0;
        v--; below -= hist[v];
      } else if (below + hist[v] <= target) {
        if (v === 255) return 255;
        below += hist[v]; v++;
      } else return v;
    }
    return v;
  }

  IO.median = function (src, k) {
    const half = (k - 1) >>> 1;
    const out = IO.make(src.w, src.h, src.c);
    const w = src.w, h = src.h, c = src.c;
    const win = k * k;
    const target = (win - 1) >>> 1;
    const hist = new Int32Array(256);

    for (let ch = 0; ch < c; ch++) {
      for (let y = 0; y < h; y++) {
        // 首窗精确统计
        hist.fill(0);
        for (let ky = -half; ky <= half; ky++) {
          const sy = borderIndex(y + ky, h, 'reflect');
          const row = sy * w;
          for (let kx = -half; kx <= half; kx++) {
            hist[src.d[(row + borderIndex(kx, w, 'reflect')) * c + ch]]++;
          }
        }
        let med = medianFromHist(hist, target, 128);
        out.d[(y * w) * c + ch] = med;
        for (let x = 1; x < w; x++) {
          const xa = borderIndex(x - 1 - half, w, 'reflect');
          const xb = borderIndex(x + half, w, 'reflect');
          for (let ky = -half; ky <= half; ky++) {
            const sy = borderIndex(y + ky, h, 'reflect');
            const row = sy * w;
            hist[src.d[(row + xa) * c + ch]]--;
            hist[src.d[(row + xb) * c + ch]]++;
          }
          med = medianFromHist(hist, target, med);
          out.d[(y * w + x) * c + ch] = med;
        }
      }
    }
    return out;
  };

  IO.bilateral = function (src, d, sigmaColor, sigmaSpace) {
    const r = Math.max(1, Math.floor(d / 2));
    const out = IO.make(src.w, src.h, src.c);
    const sSpace = sigmaSpace || 75, sColor = sigmaColor || 75;
    const spaceLut = new Float32Array((2 * r + 1) * (2 * r + 1));
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        spaceLut[(dy + r) * (2 * r + 1) + (dx + r)] = Math.exp(-(dx * dx + dy * dy) / (2 * sSpace * sSpace));
      }
    }
    const colorLut = new Float32Array(256);
    for (let i = 0; i < 256; i++) colorLut[i] = Math.exp(-(i * i) / (2 * sColor * sColor));
    const cnum = src.c;
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const ci = (y * src.w + x) * cnum;
        for (let ch = 0; ch < cnum; ch++) {
          const center = src.d[ci + ch];
          let wsum = 0, acc = 0;
          for (let dy = -r; dy <= r; dy++) {
            const sy = borderIndex(y + dy, src.h, 'reflect');
            for (let dx = -r; dx <= r; dx++) {
              const sx = borderIndex(x + dx, src.w, 'reflect');
              const v = src.d[(sy * src.w + sx) * cnum + ch];
              const w = spaceLut[(dy + r) * (2 * r + 1) + (dx + r)] * colorLut[Math.abs(v - center) | 0];
              wsum += w; acc += v * w;
            }
          }
          out.d[ci + ch] = wsum > 0 ? acc / wsum : center;
        }
      }
    }
    return out;
  };

  /* ---------- 边缘 ---------- */
  IO.sobel = function (gray, ksize) {
    const k = ksize && ksize >= 3 ? ksize : 3;
    if (k > 3) {
      // 大核近似：先高斯平滑再求梯度
      const sm = IO.gaussian(gray, k, 0, 'reflect');
      const gx2 = IO.convolve(sm, [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], 'reflect');
      const gy2 = IO.convolve(sm, [[-1, -2, -1], [0, 0, 0], [1, 2, 1]], 'reflect');
      return { gx: gx2, gy: gy2 };
    }
    const gx = IO.convolve(gray, [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], 'reflect');
    const gy = IO.convolve(gray, [[-1, -2, -1], [0, 0, 0], [1, 2, 1]], 'reflect');
    return { gx, gy };
  };

  IO.laplacian = function (gray) {
    return IO.convolve(gray, [[0, -1, 0], [-1, 4, -1], [0, -1, 0]], 'reflect');
  };

  /* 完整 Canny：灰度 → 高斯 → 梯度 → NMS → 双阈值滞后 */
  IO.canny = function (src, low, high, ksize) {
    const gray = src.c === 1 ? src : IO.gray(src);
    const gf = IO.grayF(gray);
    const sm = IO.gaussian(gf, 5, 1.4, 'reflect');
    const gx = IO.convolve(sm, [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], 'reflect', 1);
    const gy = IO.convolve(sm, [[-1, -2, -1], [0, 0, 0], [1, 2, 1]], 'reflect', 1);
    const w = gray.w, h = gray.h;
    const mag = new Float32Array(w * h);
    const dir = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const a = gx.d[i], b = gy.d[i];
      mag[i] = Math.sqrt(a * a + b * b);
      dir[i] = Math.atan2(b, a);
    }
    // NMS
    const nms = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        let ang = (dir[i] * 180) / Math.PI;
        if (ang < 0) ang += 180;
        let a1, a2;
        const idx = (yy, xx) => yy * w + xx;
        if (ang < 22.5 || ang >= 157.5) { a1 = mag[idx(y, x - 1)]; a2 = mag[idx(y, x + 1)]; }
        else if (ang < 67.5) { a1 = mag[idx(y - 1, x + 1)]; a2 = mag[idx(y + 1, x - 1)]; }
        else if (ang < 112.5) { a1 = mag[idx(y - 1, x)]; a2 = mag[idx(y + 1, x)]; }
        else { a1 = mag[idx(y - 1, x - 1)]; a2 = mag[idx(y + 1, x + 1)]; }
        nms[i] = mag[i] >= a1 && mag[i] >= a2 ? mag[i] : 0;
      }
    }
    // 双阈值
    const out = IO.make(w, h, 1);
    const strong = new Uint8Array(w * h);
    const weak = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (nms[i] >= high) strong[i] = 1;
      else if (nms[i] >= low) weak[i] = 1;
    }
    const stack = [];
    for (let i = 0; i < w * h; i++) if (strong[i]) stack.push(i);
    while (stack.length) {
      const i = stack.pop();
      const y = (i / w) | 0, x = i % w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy < 0 || xx < 0 || yy >= h || xx >= w) continue;
          const j = yy * w + xx;
          if (weak[j] && !strong[j]) { strong[j] = 1; stack.push(j); }
        }
      }
    }
    let count = 0;
    for (let i = 0; i < w * h; i++) { if (strong[i]) { out.d[i] = 255; count++; } }
    return { img: out, count };
  };

  /* ---------- 形态学 ---------- */
  IO.footprint = function (shape, size) {
    const r = (size - 1) / 2;
    const m = Array.from({ length: size }, () => new Array(size).fill(0));
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        if (shape === 'ellipse') {
          const dx = (i - r) / (r + 0.01), dy = (j - r) / (r + 0.01);
          m[i][j] = dx * dx + dy * dy <= 1.05 ? 1 : 0;
        } else if (shape === 'cross') m[i][j] = i === r || j === r ? 1 : 0;
        else if (shape === 'line') m[i][j] = i === r ? 1 : 0;
        else m[i][j] = 1;
      }
    }
    return m;
  };

  IO.morph = function (bin, fp, mode) {
    const kh = fp.length, kw = fp[0].length;
    const halfY = (kh - 1) / 2, halfX = (kw - 1) / 2;
    const out = IO.make(bin.w, bin.h, 1);
    for (let y = 0; y < bin.h; y++) {
      for (let x = 0; x < bin.w; x++) {
        let result = mode === 'erode' ? 255 : 0;
        for (let ky = 0; ky < kh; ky++) {
          for (let kx = 0; kx < kw; kx++) {
            if (!fp[ky][kx]) continue;
            const sy = borderIndex(y + ky - halfY, bin.h, 'replicate');
            const sx = borderIndex(x + kx - halfX, bin.w, 'replicate');
            const v = bin.d[sy * bin.w + sx];
            if (mode === 'erode') { if (v < 128) result = 0; }
            else if (v > 127) result = 255;
          }
        }
        out.d[y * bin.w + x] = result;
      }
    }
    return out;
  };

  /* ---------- 增强 ---------- */
  IO.histeq = function (gray) {
    const hist = new Float64Array(256);
    const n = gray.w * gray.h;
    for (let i = 0; i < n; i++) hist[gray.d[i]]++;
    const cdf = new Float64Array(256);
    let acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; cdf[i] = acc / n; }
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) lut[i] = Math.round(cdf[i] * 255);
    const out = IO.make(gray.w, gray.h, 1);
    for (let i = 0; i < n; i++) out.d[i] = lut[gray.d[i]];
    return out;
  };

  /* CLAHE：分块直方图 + 限幅 + 双线性插值；只作用于亮度，保持色度 */
  IO.clahe = function (src, clipLimit, tiles) {
    const w = src.w, h = src.h;
    const tt = Math.max(2, tiles | 0);
    const Y = new Float32Array(w * h);
    const isGray = src.c === 1;
    for (let i = 0, k = 0; i < w * h; i++, k += src.c) {
      Y[i] = isGray ? src.d[i] : 0.299 * src.d[k] + 0.587 * src.d[k + 1] + 0.114 * src.d[k + 2];
    }
    const tw = Math.ceil(w / tt), th = Math.ceil(h / tt);
    const maps = [];
    for (let ty = 0; ty < tt; ty++) {
      for (let tx = 0; tx < tt; tx++) {
        const x0 = tx * tw, y0 = ty * th;
        const x1 = Math.min(w, x0 + tw), y1 = Math.min(h, y0 + th);
        const hist = new Float64Array(256);
        let cnt = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { hist[Y[y * w + x] | 0]++; cnt++; }
        const limit = Math.max(1, (clipLimit * cnt) / 256);
        let excess = 0;
        for (let i = 0; i < 256; i++) if (hist[i] > limit) { excess += hist[i] - limit; hist[i] = limit; }
        const add = excess / 256;
        for (let i = 0; i < 256; i++) hist[i] += add;
        const lut = new Float32Array(256);
        let acc = 0;
        for (let i = 0; i < 256; i++) { acc += hist[i]; lut[i] = (acc / (cnt || 1)) * 255; }
        maps.push(lut);
      }
    }
    const out = IO.make(w, h, src.c);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const fx = (x + 0.5) / tw - 0.5, fy = (y + 0.5) / th - 0.5;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const dx = fx - x0, dy = fy - y0;
        const cx0 = Math.max(0, Math.min(tt - 1, x0)), cx1 = Math.max(0, Math.min(tt - 1, x0 + 1));
        const cy0 = Math.max(0, Math.min(tt - 1, y0)), cy1 = Math.max(0, Math.min(tt - 1, y0 + 1));
        const v = Y[y * w + x] | 0;
        const m00 = maps[cy0 * tt + cx0][v], m10 = maps[cy0 * tt + cx1][v];
        const m01 = maps[cy1 * tt + cx0][v], m11 = maps[cy1 * tt + cx1][v];
        const top = m00 + (m10 - m00) * dx;
        const bot = m01 + (m11 - m01) * dx;
        const nv = top + (bot - top) * dy;
        const i = (y * w + x) * src.c;
        if (src.c === 1) { out.d[i] = clamp255(nv); continue; }
        const sign = (Y[y * w + x] > 1 ? nv / Y[y * w + x] : 1);
        const sc = Math.min(3, Math.max(0.2, sign));
        out.d[i] = clamp255(src.d[i] * sc);
        out.d[i + 1] = clamp255(src.d[i + 1] * sc);
        out.d[i + 2] = clamp255(src.d[i + 2] * sc);
      }
    }
    return out;
  };

  IO.brightnessContrast = function (src, alpha, beta) {
    const out = IO.make(src.w, src.h, src.c);
    for (let i = 0; i < src.d.length; i++) out.d[i] = clamp255(alpha * src.d[i] + beta);
    return out;
  };

  IO.sharpen = function (src, k, radius) {
    const g = IO.gaussian(src, 5, radius, 'reflect');
    const out = IO.make(src.w, src.h, src.c);
    for (let i = 0; i < src.d.length; i++) {
      out.d[i] = clamp255(src.d[i] + k * (src.d[i] - g.d[i]));
    }
    return out;
  };

  IO.lut = function (src, lut) {
    const out = IO.make(src.w, src.h, src.c);
    for (let i = 0; i < src.d.length; i++) out.d[i] = lut[src.d[i]];
    return out;
  };

  IO.lbp = function (gray, R, P) {
    const w = gray.w, h = gray.h, s = gray.d;
    const out = IO.make(w, h, 1);
    // 采样点偏移预计算（避免每像素三角函数）
    const offs = [];
    for (let i = 0; i < P; i++) {
      const ang = (2 * Math.PI * i) / P;
      offs.push([Math.round(R * Math.sin(ang)), Math.round(R * Math.cos(ang)), 1 << i]);
    }
    for (let y = R; y < h - R; y++) {
      for (let x = R; x < w - R; x++) {
        const c = s[y * w + x];
        let code = 0;
        for (let i = 0; i < P; i++) {
          const o = offs[i];
          if (s[(y + o[0]) * w + (x + o[1])] >= c) code |= o[2];
        }
        out.d[y * w + x] = code;
      }
    }
    return out;
  };

  /* ---------- 几何 ---------- */
  function sampleNearest(src, x, y) {
    const sx = Math.max(0, Math.min(src.w - 1, Math.round(x)));
    const sy = Math.max(0, Math.min(src.h - 1, Math.round(y)));
    const i = (sy * src.w + sx) * src.c;
    return [src.d[i], src.d[i + 1] === undefined ? src.d[i] : src.d[i + 1], src.d[i + 2] === undefined ? src.d[i] : src.d[i + 2]];
  }
  function sampleBilinear(src, x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const dx = x - x0, dy = y - y0;
    const p = (xx, yy) => {
      const cx = Math.max(0, Math.min(src.w - 1, xx));
      const cy = Math.max(0, Math.min(src.h - 1, yy));
      const i = (cy * src.w + cx) * src.c;
      return [src.d[i], src.c > 1 ? src.d[i + 1] : src.d[i], src.c > 2 ? src.d[i + 2] : src.d[i]];
    };
    const a = p(x0, y0), b = p(x0 + 1, y0), c = p(x0, y0 + 1), d = p(x0 + 1, y0 + 1);
    const out = [];
    for (let ch = 0; ch < 3; ch++) {
      const top = a[ch] + (b[ch] - a[ch]) * dx;
      const bot = c[ch] + (d[ch] - c[ch]) * dx;
      out.push(top + (bot - top) * dy);
    }
    return out;
  }

  IO.resize = function (src, tw, th, interp) {
    const out = IO.make(tw, th, Math.max(src.c, 3));
    const sx = src.w / tw, sy = src.h / th;
    const area = interp === 'area' || (interp !== 'nearest' && tw < src.w * 0.5);
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        let rgb;
        if (interp === 'nearest') rgb = sampleNearest(src, x * sx, y * sy);
        else if (area) {
          const x0 = Math.floor(x * sx), x1 = Math.min(src.w, Math.ceil((x + 1) * sx));
          const y0 = Math.floor(y * sy), y1 = Math.min(src.h, Math.ceil((y + 1) * sy));
          let r = 0, g = 0, b = 0, n = 0;
          for (let yy = y0; yy < y1; yy++) {
            for (let xx = x0; xx < x1; xx++) {
              const i = (yy * src.w + xx) * src.c;
              r += src.d[i]; g += src.c > 1 ? src.d[i + 1] : src.d[i]; b += src.c > 2 ? src.d[i + 2] : src.d[i];
              n++;
            }
          }
          rgb = n ? [r / n, g / n, b / n] : [0, 0, 0];
        } else rgb = sampleBilinear(src, (x + 0.5) * sx - 0.5, (y + 0.5) * sy - 0.5);
        const o = (y * tw + x) * 3;
        out.d[o] = clamp255(rgb[0]); out.d[o + 1] = clamp255(rgb[1]); out.d[o + 2] = clamp255(rgb[2]);
      }
    }
    return out;
  };

  IO.padTo = function (src, tw, th, value) {
    const out = IO.make(tw, th, 3);
    const v = value || 0;
    for (let i = 0; i < tw * th * 3; i += 3) { out.d[i] = v; out.d[i + 1] = v; out.d[i + 2] = v; }
    const ox = Math.floor((tw - src.w) / 2), oy = Math.floor((th - src.h) / 2);
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const dx = x + ox, dy = y + oy;
        if (dx < 0 || dy < 0 || dx >= tw || dy >= th) continue;
        const si = (y * src.w + x) * src.c;
        const di = (dy * tw + dx) * 3;
        out.d[di] = src.d[si];
        out.d[di + 1] = src.c > 1 ? src.d[si + 1] : src.d[si];
        out.d[di + 2] = src.c > 2 ? src.d[si + 2] : src.d[si];
      }
    }
    return out;
  };

  IO.cropCenter = function (src, tw, th) {
    const out = IO.make(tw, th, 3);
    const ox = Math.floor((src.w - tw) / 2), oy = Math.floor((src.h - th) / 2);
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const sx = Math.max(0, Math.min(src.w - 1, x + ox));
        const sy = Math.max(0, Math.min(src.h - 1, y + oy));
        const si = (sy * src.w + sx) * src.c;
        const di = (y * tw + x) * 3;
        out.d[di] = src.d[si];
        out.d[di + 1] = src.c > 1 ? src.d[si + 1] : src.d[si];
        out.d[di + 2] = src.c > 2 ? src.d[si + 2] : src.d[si];
      }
    }
    return out;
  };

  IO.norm = function (src, mean, std) {
    const f = IO.makeF(src.w, src.h, 3);
    for (let i = 0, k = 0; i < src.w * src.h; i++, k += src.c) {
      f.d[i * 3] = (src.d[k] / 255 - mean[0]) / std[0];
      f.d[i * 3 + 1] = ((src.c > 1 ? src.d[k + 1] : src.d[k]) / 255 - mean[1]) / std[1];
      f.d[i * 3 + 2] = ((src.c > 2 ? src.d[k + 2] : src.d[k]) / 255 - mean[2]) / std[2];
    }
    return f;
  };

  IO.statsRGB = function (src) {
    const n = src.w * src.h;
    const mean = [0, 0, 0], std = [0, 0, 0];
    for (let ch = 0; ch < 3; ch++) {
      let s = 0, s2 = 0;
      for (let i = 0; i < n; i++) {
        const k = i * src.c + Math.min(ch, src.c - 1);
        const v = src.d[k] / 255;
        s += v; s2 += v * v;
      }
      mean[ch] = s / n;
      std[ch] = Math.sqrt(Math.max(1e-6, s2 / n - mean[ch] * mean[ch]));
    }
    return { mean, std };
  };

  IO.floatToRGB = function (f) {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < f.d.length; i++) { const v = f.d[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    if (!isFinite(mn)) { mn = 0; mx = 1; }
    if (mx - mn < 1e-6) mx = mn + 1e-6;
    const out = IO.make(f.w, f.h, 3);
    const k = 255 / (mx - mn);
    for (let i = 0; i < f.w * f.h; i++) {
      out.d[i * 3] = clamp255((f.d[i * 3] - mn) * k);
      out.d[i * 3 + 1] = clamp255((f.d[i * 3 + 1] - mn) * k);
      out.d[i * 3 + 2] = clamp255((f.d[i * 3 + 2] - mn) * k);
    }
    return { img: out, range: { min: mn, max: mx } };
  };

  CVL.IO = IO;
})();
