/* 讲次模块：把教案的知识点编排成可点选的演示脚本 */
(function () {
  const CVL = window.CVL;

  const L = [
    {
      id: 'L1', nav: '第1讲 · 概述', title: '深度学习与计算机视觉概述',
      topics: [
        {
          t: '整门课的坐标', kind: 'overview', view: '概述',
          html: `
            <h3>深度学习是什么：可学习参数的多级非线性变换</h3>
            <p>结构由人设计，参数由数据决定——这是"学习"二字的全部含义。</p>
            <div class="flow">
              <span class="n">原始像素 0–255</span><span class="ar">→</span>
              <span class="n">边缘 · 纹理</span><span class="ar">→</span>
              <span class="n">形状 · 部件</span><span class="ar">→</span>
              <span class="n">缺陷语义</span><span class="ar">→</span>
              <span class="n">可直接判别的结论</span>
            </div>
            <div class="ov-grid">
              <div class="ov-card"><span class="k">2012</span><b>三次转折</b><p>2006 深层训不动 → 逐层预训练；2012 手工特征到顶 → CNN+ReLU+GPU；2017 长距离依赖太贵 → 自注意力。</p></div>
              <div class="ov-card"><span class="k">28.2 → 3.57</span><b>ImageNet 的台阶</b><p>两年降 2.4 个点，2012 一年降 10.5 个点。不是平滑下降，是换了物种。</p></div>
              <div class="ov-card"><span class="k">4 类输出</span><b>粒度决定一切</b><p>标签 / 框 / 掩码 / 个体。粒度细化一级，预测变量升一个数量级。</p></div>
              <div class="ov-card"><span class="k">3 项代价</span><b>数据 · 算力 · 可解释</b><p>标注随粒度上升、边缘设备 30 ms、审计场景说不清理由。</p></div>
            </div>
            <p style="margin-top:14px;color:#767f89">后面四讲分别落地：图像的数字本质 → 滤波边缘特征 → 噪声增强顺序 → 归一化尺寸流水线。这条线决定了模型的上限。</p>`,
          channel: 'gray', steps: [], note: '整门课的落点：拿到一个视觉需求，能判断它是否可行、要多少数据、用什么指标验收、会在哪里失败。',
        },
        {
          t: '同一张图，四种输出', kind: 'overview', view: '四种任务',
          html: `
            <h3>同一张零件图，四种任务给出四种输出</h3>
            <p>粒度每细化一级，模型要预测的变量维度上升一个数量级——难度、数据量、标注成本全都跟着走。</p>
            <div class="ov-grid">
              <div class="ov-card"><span class="k">分类</span><b>有没有</b><p>输出一个标签。指标：准确率。标注 2 秒/张。<br>代表方法：ResNet</p></div>
              <div class="ov-card"><span class="k">检测</span><b>在哪里、有几个</b><p>输出一组带类别的框。指标：IoU / mAP。标注 10 秒/目标。<br>代表方法：YOLO</p></div>
              <div class="ov-card"><span class="k">语义分割</span><b>形状与边界</b><p>输出逐像素类别。指标：mIoU。标注 3 分钟/张。<br>代表方法：U-Net</p></div>
              <div class="ov-card"><span class="k">实例分割</span><b>每一个个体</b><p>逐像素 + 个体区分。指标：mask mAP。标注更贵。<br>代表方法：Mask R-CNN</p></div>
            </div>
            <div class="flow" style="margin-top:14px">
              <span class="n">粒度</span><span class="ar">→</span><span class="n">输出形态</span><span class="ar">→</span>
              <span class="n">指标必须同构</span><span class="ar">→</span><span class="n">标注成本</span>
            </div>
            <p style="color:#767f89">数据预算有限时，选那个仍能满足业务判据的、最粗的粒度。</p>`,
          channel: 'gray', steps: [], note: '粒度—指标—标注成本是一条不可拆分的链：选任务的第一约束往往不是效果，而是"我标得起哪个"。',
        },
        {
          t: '三项代价 → 后四讲', kind: 'overview', view: '代价',
          html: `
            <h3>它要付什么：三项代价，各自对应一组讲次</h3>
            <p>这三项不是"附加讨论"，它们就是课程主体。</p>
            <div class="ov-grid">
              <div class="ov-card"><span class="k">L2–L5</span><b>数据代价</b><p>缺陷样本约 200 张、像素占比 1%。所以预处理决定上限，第 11 讲用迁移学习解决小样本。</p></div>
              <div class="ov-card"><span class="k">L3–L5</span><b>算力代价</b><p>单张推理 30 ms。所以尺寸、归一化、通道数都要算清楚——它们在乘进计算量。</p></div>
              <div class="ov-card"><span class="k">贯穿</span><b>可解释代价</b><p>模型能给结论，给不了逐条理由。所以预处理链要写得清楚、可复现、可审计。</p></div>
            </div>
            <p style="margin-top:14px">主线项目 DefectVision 的四项约束：<b>缺陷样本约 200 张 · 缺陷像素占比约 1% · 单张推理 30 ms · 误检一次停线十分钟</b>。这四条一摆出来，很多方法当场就被否掉。</p>`,
          channel: 'gray', steps: [], note: '很多项目失败不是方法不行，是条件不齐：先看数据和算力具不具备，再看方法本身。',
        },
      ],
    },
    {
      id: 'L2', nav: '第2讲 · 数字本质', title: '图像的数字本质',
      topics: [
        { t: '图像 = 离散化的亮度函数', op: 'none', p: {}, channel: 'gray',
          note: '位置、取值、范围——三个限定缺一不可。语义是人的解释，不是数据自带的。',
          hint: '先 print shape、dtype、min/max，再看图' },
        { t: '采样不足 → 混叠', op: 'sampling.down', p: { k: 6, antialias: false }, channel: 'gray',
          note: '采样过稀：细纹理折叠成粗条纹。折叠后的频率与真实低频无法区分——混叠是信息换了身份，滤不掉，只能提前防。',
          hint: '把"采样前低通"打开，看条纹是否消失' },
        { t: '采样前低通（抗混叠）', op: 'sampling.down', p: { k: 6, antialias: true }, channel: 'gray',
          note: '在采样之前把超出采样能力的高频滤掉。这就是为什么工业相机的镜头比相机贵。',
          hint: '对比上一项：同一个降采样倍数，只差一道前置低通' },
        { t: '位深不足 → 色阶断层', op: 'sampling.quant', p: { bits: '4' }, channel: 'gray',
          note: '渐变变成台阶。8 bit 起步、条件允许上 10 bit——多出来的两位买的不是画质，是检测余量。',
          hint: '在 A 区把渐变区放大到 8×，看台阶' },
        { t: '1 bit：只剩黑白', op: 'sampling.quant', p: { bits: '1' }, channel: 'gray',
          note: '级数降到 2 级，图像只剩黑白。量化是在采集端丢信息，后面的模型补不回来。',
          hint: '观察 B 区矩阵：数值只剩 0 和 255' },
        { t: '通道：三个并列的平面', op: 'none', p: {}, channel: 'r',
          note: '把 R 通道单独拎出来，它是一张完整的灰度图，不是"红色的图"——它只表示每个位置的红色分量强度。',
          hint: '在 B 区切换 灰/R/G/B，看同一位置的三个数' },
        { t: 'HSV：把亮度拆出来', op: 'color.hsv', p: { space: 'hsv' }, channel: 'h', view: 'side',
          note: 'H 回答"什么颜色"，V 回答"有多亮"。光照变化主要落在 V 上，所以判断颜色只用 H。',
          hint: 'B 区切到 H / V，看两个通道的稳定性差异' },
        { t: '量化前先看清楚：8 bit vs 4 bit', op: 'sampling.quant', p: { bits: '8' }, channel: 'gray',
          note: '8 bit 是 256 级。这张图现在就是 8 bit——后面所有算子都在这个精度上工作。',
          hint: '对比"位深不足"那一项' },
      ],
    },
    {
      id: 'L3', nav: '第3讲 · 滤波边缘特征', title: '滤波、边缘与特征',
      topics: [
        { t: '空间滤波：一个滑窗走遍全图', op: 'filter.mean', p: { ksize: 3, border: 'reflect' }, channel: 'gray',
          note: '邻域的加权和。9 个权重是人写死的——下一章 CNN，唯一的变化就是这 9 个数改成学出来的。',
          hint: '在 D 区点"播放"，看滑窗逐格乘加' },
        { t: '均值：边缘一起被糊掉', op: 'filter.mean', p: { ksize: 7 }, channel: 'gray',
          note: '核越大，1–2 px 的划痕越容易被抹掉。均值对所有邻居一视同仁。',
          hint: '把 ksize 从 3 拖到 15，盯住划痕' },
        { t: '高斯：按距离加权', op: 'filter.gaussian', p: { ksize: 5, sigma: 1.4 }, channel: 'gray',
          note: '中心权重大、四周小：离得近的像素更可能属于同一物体，所以保边优于均值。',
          hint: 'B 区看核：中心大、四周衰减' },
        { t: '中值：排序取中间', op: 'filter.median', p: { ksize: 3 }, channel: 'gray',
          note: '不是加权和，是排序。极值被直接排除——所以它专治椒盐噪声。',
          hint: 'B 区看 9 个数排序，255 被划掉' },
        { t: '双边：保边去噪', op: 'filter.bilateral', p: { d: 9, sigmaColor: 75, sigmaSpace: 75 }, channel: 'gray',
          note: '同时考虑空间距离和像素值差异：值差太大的邻居权重接近 0，边缘不会被平均掉。代价是慢。',
          hint: '和均值对比边缘锐度，再看耗时' },
        { t: '边缘 = 梯度大的地方', op: 'edge.sobel', p: { mode: 'mag', ksize: 3, preblur: true }, channel: 'gray',
          note: 'Sobel 两个 3×3 核，一个算 gx、一个算 gy，幅值 = √(gx²+gy²)。',
          hint: '切到 gx / gy，看方向差异' },
        { t: '顺序错了会怎样', op: 'edge.sobel', p: { mode: 'mag', preblur: false }, channel: 'gray',
          note: '关掉去噪：微分把噪声放大了，真实边缘淹没在噪点里。先降噪再求梯度，是从定义推出来的。',
          hint: '和上一项对比边缘图' },
        { t: 'Canny：五步与双阈值', op: 'edge.canny', p: { low: 50, high: 150, preblur: true }, channel: 'gray',
          note: '灰度 → 高斯 → 梯度 → 非极大值抑制（细化到 1 px）→ 双阈值滞后连接。顺序不能颠倒。',
          hint: '调高阈值看断线，调低看毛刺' },
        { t: '阈值两难：断线 vs 毛刺', op: 'edge.canny', p: { low: 120, high: 220 }, channel: 'gray',
          note: '单一阈值无解：调高断线、调低毛刺。双阈值引入上下文：孤立的噪声点因为没有强边相连而被丢掉。',
          hint: '看指标条里的边缘像素数变化' },
        { t: '形态学：四把工具', op: 'morph.op', p: { op: 'open', shape: 'ellipse', size: 5 }, channel: 'gray',
          note: '开 = 先腐蚀后膨胀，去小白点；闭 = 先膨胀后腐蚀，填小黑洞。分割出来的掩码永远不干净。',
          hint: '切换 erode / dilate / open / close 对比' },
        { t: '结构元素：比要删的略大', op: 'morph.op', p: { op: 'open', size: 11, shape: 'line' }, channel: 'gray',
          note: '结构元素的大小决定能删掉多大的东西；形状要和目标匹配——修划痕用线形，圆盘会把划痕一起削掉。',
          hint: '把 size 拖大，看细节一起消失' },
        { t: 'LBP：对光照免疫的纹理', op: 'feature.lbp', p: { radius: 1, pts: 8 }, channel: 'gray',
          note: '只比较相对大小：整幅图变亮不改变任何一次比较的结果。正好打中"偏亮偏暗"的痛点。',
          hint: 'B 区看 8 邻域比较 → 0–255 的编码' },
      ],
    },
    {
      id: 'L4', nav: '第4讲 · 噪声与增强', title: '噪声、增强与顺序',
      topics: [
        { t: '高斯噪声：幅度型', op: 'noise.add', p: { type: 'gauss', sigma: 20, seed: 42 }, channel: 'gray',
          note: '处处都有、幅度小，像蒙了一层薄雾。传感器热噪声、低光照都属这一类。',
          hint: '去噪用加权平均类' },
        { t: '椒盐噪声：极值型', op: 'noise.add', p: { type: 'sp', sigma: 20 }, channel: 'gray',
          note: '稀疏、幅度极大，随机撒纯黑纯白点。对策只有排序取中值。',
          hint: '下一步用中值滤波处理它' },
        { t: '为什么均值治不了椒盐', op: 'filter.mean', p: { ksize: 5 }, channel: 'gray',
          note: '255 的噪点和周围 8 个 100 平均得 117——噪声没消失，只是被摊成一块灰斑，还污染了周围。',
          hint: '切到中值滤波再对比一次' },
        { t: '中值：把极值删掉', op: 'filter.median', p: { ksize: 5 }, channel: 'gray',
          note: '9 个数排序，255 排最后，永远不会被选中。极值型必须用能排除极值的方法。',
          hint: 'B 区看排序动画' },
        { t: '直方图均衡化', op: 'enhance.histeq', p: {}, channel: 'gray',
          note: '用累积分布函数做映射：像素多的灰度被拉宽。不需要参数，但也不分区域、不看内容。',
          hint: '看 A 区直方图：从挤在中间变成铺满' },
        { t: 'CLAHE：分块 + 限幅', op: 'enhance.clahe', p: { clip: 3, tile: 8, onL: true }, channel: 'gray',
          note: '分块各自均衡，块间双线性插值；限幅把直方图的高峰削平再均摊——等于给噪声设了上限。',
          hint: '调 clipLimit 看噪声' },
        { t: 'clipLimit 调大了会怎样', op: 'enhance.clahe', p: { clip: 9, tile: 8 }, channel: 'gray',
          note: '限幅越大，局部对比度拉得越狠，噪声放大越明显。这就是限幅机制存在的理由。',
          hint: '对比上一个 clip=3' },
        { t: '亮度 / 对比度：线性变换', op: 'enhance.bc', p: { alpha: 1.6, beta: 20 }, channel: 'gray',
          note: 'g = α·f + β：α 拉开对比、β 整体加亮。简单，但它是"改值域"，不是"改分布"。',
          hint: 'α 拖到 3 看高光截断' },
        { t: '锐化与光晕', op: 'enhance.sharpen', p: { k: 2.2, radius: 1.5 }, channel: 'gray',
          note: 'k 太大：边缘两侧出现亮暗镶边，这就是光晕。锐化只放大已有高频，不能创造细节。',
          hint: 'k 拖回 0.8 对比' },
        { t: '顺序：先锐化再降噪 = 白做', op: 'enhance.sharpen', p: { k: 2.2 }, channel: 'gray',
          note: '锐化放大高频，噪声也在高频。顺序必须是：去噪 → 增强 → 尺寸 → 归一化 → 锐化。',
          hint: '在 C 区处理栈里把顺序拖反，看指标掉多少' },
      ],
    },
    {
      id: 'L5', nav: '第5讲 · 归一化与流水线', title: '归一化、尺寸与流水线',
      topics: [
        { t: 'Min-Max：压值域', op: 'norm.scale', p: { mode: 'minmax' }, channel: 'gray',
          note: '把值压到 0–1。简单、值域确定，但对异常值极敏感：一个 255 的坏点就能把整幅图压暗。',
          hint: 'B 区看数值变成小数' },
        { t: 'Z-score：搬分布', op: 'norm.scale', p: { mode: 'zscore', stat: 'imagenet' }, channel: 'gray',
          note: '减均值除标准差，把分布搬到均值 0、方差 1。对异常值稳健，且三个通道量纲一致。',
          hint: '注意标准化后会出现负数，这是正常的' },
        { t: '统计量必须与权重配套', op: 'norm.scale', p: { mode: 'zscore', stat: 'custom' }, channel: 'gray',
          note: '换成自己的统计量：实测 88.6 → 83.8。删掉这一行：77.2。程序不报错，白丢一成性能。',
          hint: '这是"预处理是权重的一部分"的直接后果' },
        { t: '尺寸：为什么非要 224', op: 'geom.resize', p: { size: 224, mode: 'stretch', interp: 'linear' }, channel: 'gray',
          note: 'batch 必须同形、全连接层定长、算力预算——224 是三条约束的交点，不是魔法数字。',
          hint: '这一步用的是"直接拉伸"' },
        { t: '保比 + 填充：不形变、不丢内容', op: 'geom.resize', p: { size: 224, mode: 'letterbox', pad: '0' }, channel: 'gray',
          note: '工业检测推荐这一种。多写两行，换一个"不会莫名其妙丢分"的保证。',
          hint: '和直接拉伸对比圆是否变椭圆' },
        { t: '填充 255 会造出假边缘', op: 'geom.resize', p: { size: 224, mode: 'letterbox', pad: '255' }, channel: 'gray',
          note: '标准化之后 0 就是"平均亮度"，等价于告诉网络"这里没有信息"。填 255 会引入一条强边，网络会去学它。',
          hint: '下一项用边缘检测看这条假边' },
        { t: '插值：缩放用双线性，掩码用最近邻', op: 'geom.resize', p: { size: 320, mode: 'letterbox', interp: 'nearest' }, channel: 'gray',
          note: '掩码里的类别编号不能插值——用双线性会算出"2.5 类"这种不存在的东西，而且不报错。',
          hint: '放大 A 区看锯齿' },
        { t: '完整流水线：六个环节', steps: [
          { op: 'filter.gaussian', p: { ksize: 3, sigma: 1 } },
          { op: 'enhance.clahe', p: { clip: 3, tile: 8 } },
          { op: 'geom.resize', p: { size: 224, mode: 'letterbox' } },
        ], channel: 'gray',
          note: '读取 → 去噪 → 增强 → 尺寸 → 转张量 → 标准化。中间不落地、不存盘：存成 uint8 会把小数截断，标准化白做。',
          hint: 'C 区处理栈里可以增删、重排每一步' },
      ],
    },
  ];

  CVL.lectures = L;
  CVL.findTopic = function (lecId, idx) {
    const l = L.find((x) => x.id === lecId);
    return l ? l.topics[idx] : null;
  };
})();
