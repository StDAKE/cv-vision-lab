/* 算子注册表：参数 schema + 执行 + Python 代码模板 + 演示类型 */
(function () {
  const CVL = (typeof window !== 'undefined' ? window : self).CVL;
  const R = {
    map: new Map(),
    groups: [
      { id: 'sampling', label: '采样 · 量化', lecture: 2 },
      { id: 'color', label: '色彩空间', lecture: 2 },
      { id: 'noise', label: '噪声注入', lecture: 4 },
      { id: 'filter', label: '空间滤波', lecture: 3 },
      { id: 'edge', label: '边缘检测', lecture: 3 },
      { id: 'morph', label: '形态学', lecture: 3 },
      { id: 'enhance', label: '增强', lecture: 4 },
      { id: 'feature', label: '特征', lecture: 3 },
      { id: 'geom', label: '尺寸与几何', lecture: 5 },
      { id: 'norm', label: '归一化', lecture: 5 },
    ],
  };

  R.define = function (def) {
    def.params = def.params || [];
    R.map.set(def.id, def);
  };
  R.get = function (id) { return R.map.get(id); };
  R.list = function (group) {
    return Array.from(R.map.values()).filter((d) => !group || d.group === group);
  };

  /* 参数默认值 */
  R.defaults = function (id) {
    const d = R.get(id);
    const p = {};
    if (!d) return p;
    d.params.forEach((x) => (p[x.key] = x.def));
    return p;
  };

  /* 参数值格式化为代码里的字面量 */
  R.literal = function (v, type) {
    if (type === 'select' || typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    return String(v);
  };

  /* 代码渲染：把参数代入模板。def.code 可以是数组，也可以是 (p) => 数组（随参数改结构） */
  R.renderCode = function (id, p) {
    const d = R.get(id);
    if (!d) return [];
    const src = typeof d.code === 'function' ? d.code(p) : (d.code || []);
    const lines = [];
    src.forEach((ln) => {
      let t = ln.t;
      t = t.replace(/\{\{(\w+)\}\}/g, (m, k) => {
        const val = p[k];
        if (val === undefined) return m;
        const spec = d.params.find((x) => x.key === k);
        if (spec && typeof spec.py === 'function') return spec.py(val);
        return R.literal(val, spec && spec.type);
      });
      lines.push({ t, tag: ln.tag });
    });
    return lines;
  };

  CVL.op = R;

  /* 通用参数片段 */
  R.P = {
    ksize: (def, max) => ({
      key: 'ksize', label: 'ksize（核边长）', type: 'range', min: 3, max: max || 15, step: 2, def: def || 3,
      tip: (v) => (v % 2 === 0 ? '核必须奇数，否则没有中心像素，OpenCV 直接抛异常' : null),
    }),
    border: () => ({
      key: 'border', label: '边界处理', type: 'select', def: 'reflect',
      options: [{ v: 'reflect', label: '反射 REFLECT' }, { v: 'replicate', label: '复制 REPLICATE' }, { v: 'constant', label: '补零 CONSTANT' }],
      py: (v) => 'cv.BORDER_' + String(v).toUpperCase(),
    }),
  };
})();
