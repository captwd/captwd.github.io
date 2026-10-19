// 文章数据 —— 新增文章在此追加，再照 posts/<slug>/index.html 建页面
window.POSTS = [
  {
    "slug": "about-this-blog",
    "title": "关于本站：为什么要 3D",
    "date": "2026-10-11",
    "tags": [
      "meta"
    ],
    "landscape": {
      "label": "这片山脉的来处",
      "region": "站点手记",
      "frequency": 0.75,
      "depth": 0.8,
      "color": "#e4c99b",
      "theme": "wire",
      "sound": {
        "start": 171.52,
        "end": 190.72,
        "title": "留一点余白",
        "note": "在接近尾声的地方，看看声音背后的线条，也看看这片山脉如何被搭起来。"
      }
    },
    "excerpt": "让声音成为可以触碰的材料：点按波形试听，拖动选段，拉伸时间，再把同一段声音展开成频谱地形与噪声到语音的空间插值。这里记下这间声音实验室怎么做的。"
  },
  {
    "slug": "alignment-ctc-transducer-aed-mas",
    "title": "没有帧级标注，语音模型怎么活：CTC、Transducer、AED 与 MAS",
    "date": "2026-09-19",
    "tags": [
      "语音识别",
      "CTC",
      "对齐",
      "TTS",
      "学习笔记"
    ],
    "categories": [
      "深度学习实践"
    ],
    "excerpt": "音频上千帧、文本几十个字、帧级标注不存在——这是 ASR 和 TTS 共同的根本困难。把四种解法放进同一张图：CTC 对齐求和、Transducer 求和加内部语言模型、AED 注意力学软对齐、MAS 取最大再加时长蒸馏。"
  },
  {
    "slug": "cfm-velocity-field-notes",
    "title": "生成模型为什么可以只是一个 MSE：流匹配的速度场视角",
    "date": "2026-09-19",
    "tags": [
      "流匹配",
      "TTS",
      "语音合成",
      "学习笔记"
    ],
    "landscape": {
      "label": "速度场与流匹配",
      "region": "生成模型",
      "frequency": 0.27,
      "depth": 0.24,
      "color": "#a1f9d5",
      "theme": "flow",
      "sound": {
        "start": 7.68,
        "end": 20.48,
        "title": "第一道轮廓",
        "note": "从几个散落的音符，到一条渐渐清晰的轨迹。把这一刻，留给速度场。"
      }
    },
    "excerpt": "流匹配（CFM/rectified flow）的核心机制拆解：线性插值路径怎么同时造出训练输入和监督标签、\"速度恒定\"到底恒的是哪个轴、MSE 为什么恰好是数学上选对的损失，以及一行算术外推出\"生成中的 mel\"的 x1_hat。",
    "categories": [
      "深度学习实践"
    ]
  },
  {
    "slug": "conditions-and-cfg-in-cfm",
    "title": "CFM 的条件与 CFG：模型怎么\"听话\"，大 s 为什么会出伪影",
    "date": "2026-09-19",
    "tags": [
      "流匹配",
      "TTS",
      "CFG",
      "DiT",
      "学习笔记"
    ],
    "landscape": {
      "label": "条件与 CFG",
      "region": "生成模型",
      "frequency": 0.4,
      "depth": 0.44,
      "color": "#a1f9d5",
      "theme": "guidance",
      "sound": {
        "start": 55.36,
        "end": 71.36,
        "title": "同一条路的偏移",
        "note": "听旋律沿着熟悉的方向继续，也想想条件如何牵引一次生成。"
      }
    },
    "excerpt": "条件流匹配里的\"条件\"到底指什么：Matcha 与 F5 的条件清单对比、F5 DiT 结构的两个常见误解、逐步引导与整条外推两种 CFG 的等价条件，以及\"越出数据流形\"的几何解释——合法 mel 只是一小片弯曲的薄皮，线性外推走的是弦。",
    "categories": [
      "深度学习实践"
    ]
  },
  {
    "slug": "metrics-three-layers",
    "title": "读指标的三个层次：测量什么、扔掉什么、噪声多大",
    "date": "2026-09-19",
    "tags": [
      "实验方法",
      "评估",
      "MCD",
      "统计检验",
      "学习笔记"
    ],
    "categories": [
      "深度学习实践"
    ],
    "excerpt": "每个客观指标都有三层：它测量什么、它刻意扔掉了什么、它的噪声有多大。用 MCD 的三个实例串起来——skip_c0 造成的响度盲区、2 句验证集均值 ±10dB 的抽样噪声、声码器往返校准给出的\"这把尺子自己的刻度\"。"
  },
  {
    "slug": "speech-ssl-three-paradigms",
    "title": "掩码预测的副产品：自监督语音表征为什么\"接个头就能用\"",
    "date": "2026-09-19",
    "tags": [
      "自监督学习",
      "语音",
      "emotion2vec",
      "wav2vec2",
      "学习笔记"
    ],
    "categories": [
      "深度学习实践"
    ],
    "excerpt": "语音自监督的三种范式（对比学习 / 离线伪标签 / 在线 EMA 回归）统一拆解：EMA 教师到底是不是\"另一个模型\"、为什么不回传梯度、decay 为什么要退火，以及掩码预测学到的表征为什么接一个线性头就能做情感分类。"
  },
  {
    "slug": "300m-speech-models-learning-rate-reference",
    "title": "300M 量级语音模型学习率速查：一个窄带里的两个世界",
    "date": "2026-09-17",
    "tags": [
      "TTS",
      "语音",
      "学习率",
      "训练技巧",
      "文献整理"
    ],
    "landscape": {
      "label": "语音模型的训练",
      "region": "语音训练",
      "frequency": 0.58,
      "depth": 0.64,
      "color": "#bfa9f4",
      "theme": "spectrum",
      "sound": {
        "start": 106.24,
        "end": 124.16,
        "title": "时间里的刻度",
        "note": "把一段声音展开成频率与时间，再回到训练过程中那些容易混淆的尺度。"
      }
    },
    "excerpt": "给\"300M 参数附近\"的流行语音模型建一个学习率参照系：生成式集中在 7.5e-5~2e-4（锚点 1e-4），自监督表征却用 5e-4~1e-3。先把速查表记下来，规律和原因后续展开。",
    "categories": [
      "深度学习实践"
    ]
  },
  {
    "slug": "emotion-controllable-matcha-tts-with-emotion2vec",
    "title": "给 Matcha-TTS 加情感：emotion2vec 条件注入与 55 万步训练",
    "date": "2026-09-17",
    "tags": [
      "TTS",
      "情感合成",
      "emotion2vec",
      "训练监控"
    ],
    "categories": [
      "Matcha-TTS"
    ],
    "excerpt": "把 emotion2vec 句级向量接进 CFM decoder，在 ESD 上训练 55.3 万步（超过官方 Matcha 的 50 万）：WER 45.7%→13.0%、MCD 61.4→56.3；情感可辨识度仍有明显差距（ECA 28.8% vs 真实录音 68.6%），以及一次被 2 句样本验证指标骗过的评估教训。"
  },
  {
    "slug": "f5-tts-zero-shot-duration-and-decoupled-heads",
    "title": "F5-TTS 零样本的时长之困：从参考音频的坑，到\"解耦预测头\"的想法",
    "date": "2026-09-13",
    "tags": [
      "F5-TTS",
      "流匹配",
      "零样本TTS",
      "时长控制",
      "解耦",
      "数据增广",
      "研究想法"
    ],
    "categories": [
      "F5-TTS"
    ],
    "excerpt": "第一次真正跑 F5-TTS 零样本克隆，从\"语速对不上\"一路想到\"给流匹配模型加解耦预测头\"。记一下这条链，以及我最后那个想法：用时长/音高/能量几个头预测出韵律，再当成条件塞给下游生成器。顺带记下数据层面的抓手——语速扰动增广，和 tempo/speed 那个坑。"
  },
  {
    "slug": "injecting-statistical-potentials-ideas-and-architecture",
    "title": "给蛋白距离预测注入统计势：想法与模型架构",
    "date": "2026-09-13",
    "tags": [
      "PMF",
      "ESM2",
      "蛋白质",
      "统计势",
      "模型架构"
    ],
    "categories": [
      "Protein"
    ],
    "excerpt": "记录把 PDB 统计势注入 ESM2 距离预测的思路与架构：37-bin Cβ 统计势的构建、四种注入机制，以及\"架构 / 机制 / 内容\"三路分解的受控设计。"
  },
  {
    "slug": "sway-sampling-for-flow-matching-tts",
    "title": "Sway Sampling 实测：少步数推理的收益与代价",
    "date": "2026-09-13",
    "tags": [
      "TTS",
      "实验方法",
      "推理优化",
      "MCD"
    ],
    "categories": [
      "Matcha-TTS"
    ],
    "excerpt": "把 F5-TTS 的 sway sampling 接到 Matcha-TTS：5 个模型上的指标收益，以及一个指标看不出来的代价——语音变轻了。追加实验：二阶 AB2 求解器在真实模型上全面落败的机制分析。"
  },
  {
    "slug": "matcha-tts-demo",
    "title": "试听 Demo：Matcha-TTS 复现与改进",
    "date": "2026-09-12",
    "tags": [
      "Matcha-TTS",
      "TTS",
      "Demo"
    ],
    "categories": [
      "Matcha-TTS"
    ],
    "excerpt": "架构、试听矩阵、客观指标与 MCD 震荡专题——本项目的一个汇总页。"
  },
  {
    "slug": "mnist-ddpm-comparison-demo",
    "title": "DDPM × MNIST：统一协议下的分类模型对比实验",
    "date": "2026-09-12",
    "tags": [
      "DDPM",
      "MNIST",
      "对比实验",
      "Demo"
    ],
    "categories": [
      "DDPM"
    ],
    "excerpt": "统一数据/训练/评估协议，横向对比 ANN、CNN、ViT 与传统机器学习模型，并用 DDPM 生成数据做下游可用性评估。"
  },
  {
    "slug": "fair-evaluation-for-backbone-swap",
    "title": "换骨干实验怎么做才公平：MCD 标定、协议统一与配对检验",
    "date": "2026-09-11",
    "tags": [
      "实验方法",
      "TTS",
      "统计检验",
      "MCD"
    ],
    "categories": [
      "Matcha-TTS"
    ],
    "excerpt": "换骨干实验的方法论：MCD 标定、评估协议统一、配对显著性检验与混淆变量的剥离。"
  },
  {
    "slug": "integrate-bidirectional-mamba2-into-matcha-tts",
    "title": "把双向 Mamba2 换进 Matcha-TTS 的 U-Net：设计、陷阱与验证",
    "date": "2026-09-11",
    "tags": [
      "Mamba",
      "TTS",
      "模型改造",
      "PyTorch"
    ],
    "categories": [
      "Matcha-TTS"
    ],
    "excerpt": "把双向 Mamba2 换进 Matcha-TTS 的 U-Net：设计决策、全局初始化陷阱与完整的验证清单。"
  },
  {
    "slug": "migrate-matcha-tts-to-wsl-and-install-mamba-ssm",
    "title": "从 Windows 到 WSL2：一次 TTS 训练迁移与 mamba-ssm 安装实录",
    "date": "2026-09-11",
    "tags": [
      "WSL",
      "CUDA",
      "Mamba",
      "TTS",
      "环境配置"
    ],
    "categories": [
      "Matcha-TTS"
    ],
    "excerpt": "WSL2 迁移与 mamba-ssm 安装实录：数据搬运、缓存复用与 CUDA 扩展安装的三个坑。"
  },
  {
    "slug": "convnext-v2-and-lr-decay-experiment",
    "title": "换掉 U-Net 的卷积块：ConvNeXt V2 实验与一次 MCD 震荡的机制归因",
    "date": "2026-09-07",
    "tags": [
      "ConvNeXt",
      "TTS",
      "实验方法",
      "超参"
    ],
    "categories": [
      "Matcha-TTS"
    ],
    "excerpt": "把 U-Net 的卷积块换成 ConvNeXt V2，并用学习率衰减干预实验归因 MCD 震荡的机制。"
  },
  {
    "slug": "dl-hardware-primer",
    "title": "硬件原理入门：为什么深度学习让 CPU、内存、磁盘、GPU 的特性被放大",
    "date": "2026-09-06",
    "tags": [
      "硬件",
      "GPU",
      "性能优化",
      "科普"
    ],
    "categories": [
      "Matcha-TTS"
    ],
    "excerpt": "CPU、内存、磁盘、GPU 的物理结构与延迟金字塔：理解深度学习训练瓶颈的硬件视角。"
  },
  {
    "slug": "matcha-tts-vocoder-registry-metrics-and-demo",
    "title": "工程改造三件套：声码器注册表、评价指标体系与静态 Demo 页",
    "date": "2026-09-06",
    "tags": [
      "Matcha-TTS",
      "TTS",
      "重构",
      "评估"
    ],
    "categories": [
      "Matcha-TTS"
    ],
    "excerpt": "声码器注册表、MCD/WER/CER 评价体系与静态试听 Demo 页的工程化改造记录。"
  },
  {
    "slug": "pytorch-tensor-parameters-and-checkpoint-anatomy",
    "title": "PyTorch 参数解剖：从 Tensor 内存布局到 258MB checkpoint 的精确账本",
    "date": "2026-09-06",
    "tags": [
      "PyTorch",
      "显存",
      "训练调优",
      "科普"
    ],
    "categories": [
      "Matcha-TTS"
    ],
    "excerpt": "从 Tensor 的内存布局到 258MB checkpoint 的精确账本，解释显存构成与权重迁移限制。"
  },
  {
    "slug": "what-cpu-gpu-memory-do-during-training",
    "title": "训练时 CPU、内存、磁盘、GPU 都在干什么：一次实测画面的逐项解读",
    "date": "2026-09-06",
    "tags": [
      "硬件",
      "GPU",
      "性能优化",
      "训练调优"
    ],
    "categories": [
      "Matcha-TTS"
    ],
    "excerpt": "一次实测训练的逐项解读：CPU 33%、内存 85%、磁盘 2%、GPU 46% 分别在说什么。"
  },
  {
    "slug": "matcha-tts-windows-training-pitfalls",
    "title": "Windows 从零训练 Matcha-TTS 的踩坑全集",
    "date": "2026-09-05",
    "tags": [
      "Matcha-TTS",
      "TTS",
      "环境配置",
      "Windows"
    ],
    "categories": [
      "Matcha-TTS"
    ],
    "excerpt": "在 Windows 上从零训练 Matcha-TTS：安装、数据管线、训练稳定性与显存调优的全部踩坑记录。"
  },
  {
    "slug": "offline-preprocessing-cache-for-tts-training",
    "title": "离线预处理缓存：把重复的 CPU 计算移出训练循环",
    "date": "2026-09-04",
    "tags": [
      "Matcha-TTS",
      "TTS",
      "性能优化",
      "数据管线"
    ],
    "categories": [
      "Matcha-TTS"
    ],
    "excerpt": "离线预处理缓存的实现：方案设计、逐位一致性验证，以及每轮实际省下的时间。"
  },
  {
    "slug": "advice-for-freshman",
    "title": "给计算机新生的建议",
    "date": "2026-07-08",
    "tags": [],
    "categories": [
      "随笔"
    ],
    "excerpt": "呃，我简单讲一些，给一些方向吧。"
  },
  {
    "slug": "freshman-summary",
    "title": "大一生活总结",
    "date": "2026-07-08",
    "tags": [],
    "categories": [
      "随笔"
    ],
    "excerpt": "大一的话，最开始一两个月还是比较充实的，每天看看python，学学ml，我个人还是比较满意的。然后我对自己也不是很自信，所以在期中和期末考试上花的时间比较多，两个学期都感觉期中刚过完就开始复习期末了。下面分享一些东西吧。"
  }
];
