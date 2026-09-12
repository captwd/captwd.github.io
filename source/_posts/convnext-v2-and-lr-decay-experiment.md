---
title: 换掉 U-Net 的卷积块：ConvNeXt V2 实验与一次 MCD 震荡的机制归因
date: 2026-09-07 12:00:00
tags: [ConvNeXt, TTS, 实验方法, 超参]
categories: [Matcha-TTS]
description: 把 U-Net 的卷积块换成 ConvNeXt V2，并用学习率衰减干预实验归因 MCD 震荡的机制。
---

> **系列 · Matcha-TTS 训练手记** ｜ [目录](/series/) ｜ 上一篇：[声码器注册表与评估体系](/2026/09/06/matcha-tts-vocoder-registry-metrics-and-demo/) ｜ 下一篇：[迁移 WSL2 与 mamba-ssm 安装](/2026/09/11/migrate-matcha-tts-to-wsl-and-install-mamba-ssm/)

前几篇讲了环境和基础设施，这篇进入模型侧：把 Matcha-TTS 声学骨干里 U-Net 的**局部特征块**换成 ConvNeXt V2 单元，然后处理一个意外发现——模型质量指标（MCD）不是单调变化，而是围绕均值剧烈震荡。最后用一次学习率干预实验把它归因到了"小参数持续摆动"。

## 一、范围决策：只换 CNN，不改框架

Matcha 的 U-Net 骨干里有两类可替换的模块：

- **局部块**（ResnetBlock1D）：Conv + GroupNorm + 激活
- **全局混合器块**（Transformer / Conformer）：自注意力 + 前馈

这次只换**局部块**，并且明确概念：ConvNeXt V2 是**块设计**而不是"卷积替代品"——1×1 投影、采样层、输出头都保留（ConvNeXt 官方自己也保留）。做法是给 Decoder 加一个开关：

```yaml
resnet_type: "conv"          # 原版 Block1D（默认，老 checkpoint 兼容）
resnet_type: "convnext_v2"   # ConvNeXt V2 单元
```

本地算子换掉，down/mid/up/skip/Transformer 块/采样层一律不动——这是"最小可解释改动"。

## 二、ConvNeXt V2 单元的移植与两个 bug

移植了三个组件：

| 组件 | 作用 |
|---|---|
| `GlobalResponseNorm1D`（GRN） | 逐通道响应归一化，ConvNeXt V2 的核心 |
| `ConvNeXtV2Unit1D` | k7 深度卷积 + LayerNorm + 倒瓶颈 + GRN + **内部残差/LayerScale**，替代 Block1D |
| `ConvNeXtV2ResBlock1D` | 替代 ResnetBlock1D，时间注入/残差外壳与原版对齐 |

过程中修掉两个 bug，都很有代表性：

1. **GRN 死路（自写实现 bug）**：GRN 零初始化 + 单元没有内部残差 → 单元初始输出与输入无关 → **时间步条件被整个抹掉**。按官方结构补回内部残差 + LayerScale(1e-6) 后恢复。
2. **上游遗留**：`Decoder.__init__` 的 Python 默认 `act_fn="snake"`，但 `FeedForward` 里根本没有 `snake` 分支（训练没炸只因 hydra 实际传的是 `snakebeta`）。已对齐修正。

参数量（torchinfo 实测）：U-Net 基线全模型 18.2M → ConvNeXt 版 22.5M（decoder 从 11.0M 涨到 15.3M，多出的主要是每单元 4× 升维的 pointwise 层）。

## 三、意外发现：MCD 不是"退化"，是"震荡"

补测多个 checkpoint 后的结果（BigVGAN / noDen 配方）：

| epoch | MCD | WER |
|---|---|---|
| 90 | 56.67 | 12.6% |
| 95 | 52.54 | 11.0% |
| 100 | 54.39 | 10.4% |
| 130 | **51.79** | 10.4% |
| 135 | 54.40 | 10.6% |
| 140 | 56.33 | 10.6% |

相邻 checkpoint（5 个 epoch）之间 MCD 波动 ±2~4dB，**幅度远大于骨干差异（~1dB）**。先前"ep100→140 单调退化"的判断被修正为"震荡恰好取到波峰"。

为了排除干扰，做了一轮排查：

- **声码器**：BigVGAN 与 HiFi-GAN 两条独立采样链在每个 checkpoint 读数差 <0.3dB、同步起落 → 排除声码器随机性
- **时长漂移**：`gen_len/ref_len` 全程 0.98~1.03，DTW 对齐难度无趋势变化
- **去噪器**：同一 checkpoint 挂/不挂，数字几乎相同
- **WER**：全程鲁棒（9.2%~10.6%），说明"可懂度"没受影响，**只有 MCD 这类细节指标能看见**

## 四、干预实验：把学习率作为唯一变量

假设：**恒定 lr=1e-4、临近收敛的大步长让权重在损失盆内弹跳**。设计一个唯一变量实验：

- 从同一个 ep100 checkpoint 续训 40 epoch
- 实验组：MultiStepLR 阶梯衰减（全局 ep105/115/125/135 各减半，1e-4 → 6.25e-6）
- 对照组：原运行的恒定 lr，取 ep130/135/140 三个点

| epoch | 恒定 LR (MCD) | 衰减 LR (MCD) | Δ（衰减更好为负） | 配对 p |
|---|---|---|---|---|
| 130 | 51.79 | 51.18 | −0.62 | 0.036 |
| 135 | 54.40 | 51.02 | −3.37 | <0.0001 |
| 140 | 56.33 | 52.56 | −3.78 | <0.0001 |

三条结论：

1. **因果确认**：衰减后 ep120 起 MCD 平稳在 51~52.6 区间，恒定组同期震荡到 56.3
2. **剂量-反应**：同 epoch 配对差距随 LR 降低逐级扩大（−0.62 → −3.37 → −3.78），且 WER 全程不受影响（p>0.59）——排除"衰减顺带改变了别的"
3. **骨干替换获得正面结论**：ConvNeXt + 衰减的最佳点（ep135：WER 10.1% / MCD 51.02）MCD 显著优于基线，WER 打平

> 顺带一个静默失效的坑：第一次衰减重训完全没生效——里程碑按"本 run 局部 epoch"写成 `[5,15,25,35]`，但恢复 checkpoint 时 scheduler 计数器被拨到 `恢复 epoch-1`（99），里程碑永远够不到，全程恒定 lr 且不报错。**里程碑必须写在全局 epoch 轴上**。

## 五、机制归因：漂移分析指认"小参数"

写了一个 `analyze_drift.py`，对比恒定 LR 下 ep100→ep140 各模块组的相对权重漂移 `‖ΔW‖/‖W‖`：

| 模块组 | 相对漂移 |
|---|---|
| **estimator GRN gamma/beta** | **0.574** |
| **estimator LayerScale** | **0.554** |
| encoder 文本编码器 | 0.165 |
| estimator Conv/Linear 大权重 | 0.157 |
| estimator Transformer 注意力 | 0.135 |
| estimator time_mlp | 0.052 |

解读：恒定 LR 下训 40 epoch，**归一化类小参数（GRN 的 gamma/beta、LayerScale）漂移超过自身量级的一半**，而大权重层只漂 ~15%。这类逐通道调制增益直接改变每个位置、每个通道的响应幅度，恰好对应 MCD 所量化的"细节结构变化"；而 MSE 型验证损失对这类低能量方向的扰动不敏感（曲线平坦）。

这跟机制对得上：零初始化的小参数、大梯度、恒定步长凑在一起就会一直摆。LR 衰减管用，就是因为它把步长压了下来。

## 六、给同类实验的启示

1. 换骨干类改动要用**开关 + 默认回退**，保证老 checkpoint 与旧路径零影响
2. 评估要**多 checkpoint 采样**，别拿单点下结论——质量可能围着均值震荡
3. 震荡出现时，先排除声码器/时长/去噪器，再动超参
4. 单变量干预（这里只有 LR）配合配对检验，才能把"因果"和"相关"分开
5. **漂移分析**是低成本的机制探针：哪组参数漂移异常，往往就是震荡来源

## 关键代码

### 局部算子开关

```python
if resnet_type == "convnext_v2":
    from matcha.models.components.convnext_v2 import ConvNeXtV2ResBlock1D, ConvNeXtV2Unit1D
    resnet_cls = ConvNeXtV2ResBlock1D
    final_block_cls = ConvNeXtV2Unit1D
elif resnet_type == "conv":
    resnet_cls = ResnetBlock1D
    final_block_cls = Block1D
else:
    raise ValueError(f"Unknown resnet_type: {resnet_type} (use 'conv' or 'convnext_v2')")
```

### LR 衰减配置（里程碑写在全局 epoch 轴）

```yaml
scheduler:
  _target_: torch.optim.lr_scheduler.MultiStepLR
  _partial_: true
  milestones: [104, 114, 124, 134]   # 全局轴：衰减在 ep105/115/125/135 生效
  gamma: 0.5

lightning_args:
  interval: epoch
  frequency: 1
```

第一次把里程碑写成局部 epoch `[5, 15, 25, 35]`，但恢复 checkpoint 时计数器从 99 起跳，永远够不到，衰减静默失效——这一点比代码本身更值得记。

相关文件：`matcha/models/components/decoder.py`、`configs/model/scheduler/multistep_late.yaml`。
