/* 执行轨迹：把"滑窗 / 排序"这类过程拆成可单步的帧，供 B 区动画与 D 区高亮共用 */
(function () {
  const CVL = (typeof window !== 'undefined' ? window : self).CVL;
  const T = {};

  /* 从 ImageData 中取一块数值矩阵（按通道） */
  T.patch = function (id, x, y, w, h, channel) {
    const rows = [];
    for (let r = 0; r < h; r++) {
      const row = [];
      for (let c = 0; c < w; c++) {
        const yy = Math.min(id.height - 1, Math.max(0, y + r));
        const xx = Math.min(id.width - 1, Math.max(0, x + c));
        const p = CVL.cv.pixelAt(id, xx, yy, channel || 'gray');
        row.push(p ? p[0] : 0);
      }
      rows.push(row);
    }
    return { data: rows, w, h, float: false };
  };

  /* 卷积帧：patch 为输入数据，kernel 为核（二维数组） */
  T.convFrames = function (patch, kernel, stride, pad) {
    const kh = kernel.length, kw = kernel[0].length;
    const ph = patch.length, pw = patch[0].length;
    const s = stride || 1;
    const p = pad || 0;
    const outH = Math.floor((ph + 2 * p - kh) / s) + 1;
    const outW = Math.floor((pw + 2 * p - kw) / s) + 1;
    const frames = [];
    const outGrid = Array.from({ length: Math.max(outH, 0) }, () => new Array(Math.max(outW, 0)).fill(null));
    for (let oy = 0; oy < outH; oy++) {
      for (let ox = 0; ox < outW; ox++) {
        const cells = [];
        let sum = 0;
        for (let ki = 0; ki < kh; ki++) {
          for (let kj = 0; kj < kw; kj++) {
            const pr = oy * s + ki - p;
            const pc = ox * s + kj - p;
            let v = 0, inside = false;
            if (pr >= 0 && pr < ph && pc >= 0 && pc < pw) { v = patch[pr][pc]; inside = true; }
            const w = kernel[ki][kj];
            const prod = v * w;
            sum += prod;
            cells.push({ r: pr, c: pc, v, w, prod, inside, kr: ki, kc: kj });
          }
        }
        outGrid[oy][ox] = sum;
        frames.push({
          stage: 'mul',
          oy, ox, s, kh, kw,
          cells, sum,
          outH, outW, outGrid: outGrid.map((row) => row.slice()),
        });
      }
    }
    return { frames, outH, outW, outGrid, kh, kw };
  };

  /* 中值排序帧：对 9 个数做冒泡，记录每一步交换 */
  T.medianFrames = function (values) {
    const arr = values.map((v, i) => ({ v, i, dead: false }));
    const frames = [];
    frames.push({ arr: arr.map((a) => ({ ...a })), stage: 'init', swaps: [] });
    const n = arr.length;
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < n - 1 - i; j++) {
        if (arr[j].v > arr[j + 1].v) {
          const t = arr[j]; arr[j] = arr[j + 1]; arr[j + 1] = t;
          frames.push({ arr: arr.map((a) => ({ ...a })), stage: 'swap', swaps: [j, j + 1] });
        }
      }
    }
    const mid = Math.floor(n / 2);
    const out = arr[mid].v;
    const marked = arr.map((a, i) => ({ ...a, dead: i === 0 || i === n - 1 }));
    frames.push({ arr: marked, stage: 'pick', swaps: [], out, mid });
    return { frames, out, sorted: arr.map((a) => a.v) };
  };

  /* 形态学：结构元素命中帧（用于"邻域有黑则中心黑"的演示） */
  T.morphFrames = function (patch, footprint, mode) {
    const kh = footprint.length, kw = footprint[0].length;
    const ph = patch.length, pw = patch[0].length;
    const outH = ph - kh + 1, outW = pw - kw + 1;
    const frames = [];
    for (let oy = 0; oy < Math.max(1, outH); oy++) {
      for (let ox = 0; ox < Math.max(1, outW); ox++) {
        const cells = [];
        let hit = mode === 'erode';
        for (let ki = 0; ki < kh; ki++) {
          for (let kj = 0; kj < kw; kj++) {
            if (!footprint[ki][kj]) continue;
            const pr = oy + ki, pc = ox + kj;
            const v = (patch[pr] && patch[pr][pc]) || 0;
            const white = v > 127;
            cells.push({ r: pr, c: pc, v, w: 1, prod: white ? 1 : 0, inside: true });
            if (mode === 'erode') { if (!white) hit = false; }
            else if (white) hit = true;
          }
        }
        frames.push({ stage: 'mul', oy, ox, cells, sum: hit ? 255 : 0, outH, outW, mode });
      }
    }
    return { frames, outH, outW };
  };

  CVL.trace = T;
})();
