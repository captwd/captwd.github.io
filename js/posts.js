// 文章数据 —— 新增文章在此追加，再照 posts/<slug>/index.html 建页面
window.POSTS = [
  {
    slug: "cfm-velocity-field-notes",
    title: "生成模型为什么可以只是一个 MSE：流匹配的速度场视角",
    date: "2026-09-24",
    tags: ["生成模型", "CFM"],
    landscape: { label: "速度场与流匹配", region: "生成模型", frequency: .27, depth: .24, color: "#a1f9d5" },
    excerpt: "把扩散模型那条长长的去噪链换成一个回归问题：学一个速度场，沿 ODE 积分就能从噪声走到数据。记一笔流匹配的几何直觉，以及它为什么让 F5、Matcha 这一代 TTS 模型变得干净。",
  },
  {
    slug: "conditions-and-cfg-in-cfm",
    title: "CFM 的条件与 CFG：模型怎么\u201c听话\u201d，大 s 为什么会出伪影",
    date: "2026-09-27",
    tags: ["生成模型", "CFG"],
    landscape: { label: "条件与 CFG", region: "生成模型", frequency: .40, depth: .44, color: "#a1f9d5" },
    excerpt: "条件注入的三条路（拼通道、加性调制、AdaLN）与 classifier-free guidance 的两副面孔：训练期随机丢条件，推理期往条件方向外推。外推系数一大，样本外的伪影就从哪里来。",
  },
  {
    slug: "300m-speech-models-learning-rate-reference",
    title: "300M 量级语音模型学习率速查：一个窄带里的两个世界",
    date: "2026-10-02",
    tags: ["训练", "TTS"],
    landscape: { label: "语音模型的训练", region: "语音训练", frequency: .58, depth: .64, color: "#bfa9f4" },
    excerpt: "扒了几篇同量级语音生成论文的超参表：AdamW + warmup + cosine 之下，峰值学习率挤在 1e-4 到 5e-4 的窄带里，但 batch 的单位（token、帧还是句）让同一个数字含义完全不同。",
  },
  {
    slug: "about-this-blog",
    title: "关于本站：为什么要 3D",
    date: "2026-10-11",
    tags: ["meta"],
    landscape: { label: "这片山脉的来处", region: "站点手记", frequency: .75, depth: .80, color: "#e4c99b" },
    excerpt: "让声音成为可以触碰的材料：点按波形试听，拖动选段，拉伸时间，再把同一段声音展开成频谱地形与噪声到语音的空间插值。这里记下这间声音实验室怎么做的。",
  },
];
