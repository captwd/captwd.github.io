---
title: 工程改造三件套：声码器注册表、评价指标体系与静态 Demo 页
date: 2026-09-06 12:00:00
tags: [Matcha-TTS, TTS, 重构, 评估]
categories: [深度学习实践]
description: 声码器注册表、MCD/WER/CER 评价体系与静态试听 Demo 页的工程化改造记录。
---

> **系列 · Matcha-TTS 训练手记** ｜ [目录](/series/) ｜ 上一篇：[PyTorch 参数解剖](/2026/09/06/pytorch-tensor-parameters-and-checkpoint-anatomy/) ｜ 下一篇：[ConvNeXt V2 与 MCD 震荡机制](/2026/09/07/convnext-v2-and-lr-decay-experiment/)

模型训练之外，"怎么优雅地换声码器""怎么客观评价合成质量""怎么展示结果"这三件事同样值得工程化。这篇记录对 Matcha-TTS 做的三项改造：注册表重构、MCD/WER/CER 评价体系、以及一个纯静态试听 Demo 页。

## 一、声码器注册表：加新声码器只加文件

### 问题

原版推理框架里，声码器的加载是 `if/else` 硬编码。每接一个新声码器（HiFi-GAN 的各个版本、BigVGAN……）都要去改 `cli.py` 的主流程，越改越乱。

### 方案：装饰器注册表

```python
# matcha/vocoders/__init__.py
@register_vocoder("hifigan_T2_v1")
def load_hifigan_t2(ckpt, device):
    ...
    return vocoder, denoiser

def load_vocoder(name, ckpt, device):
    return VOCODER_REGISTRY[name](ckpt, device)
```

统一了加载签名：`loader(ckpt, device) -> (vocoder, denoiser)`。改造后接一个新声码器的流程变成：

1. 新建 `matcha/vocoders/<name>.py`，写一个带 `@register_vocoder("name")` 的加载函数
2. 在 `vocoders/__init__.py` 底部补一行 import

`cli.py` 里只剩一行分发，`--vocoder` 的候选值也自动来自注册表。顺带修了一个 Windows 下的小问题：中文 GBK 控制台打印 emoji 会崩，加 `sys.stdout.reconfigure(errors="replace")` 兜底。

### 附带设计：BigVGAN 的离线加载

BigVGAN 官方 `from_pretrained` 依赖较重的 huggingface_hub 流程，且会拉取训练残留（~140MB 判别器）。改成了手动加载：优先在本地缓存里找快照（离线可用），缓存不全才联网，且**只下载推理所需两个文件**（`config.json` + `bigvgan_generator.pt`）：

```text
本地缓存 snapshots/*/ 里有 config.json + bigvgan_generator.pt → 直接用
否则 snapshot_download(model_id, allow_patterns=[这两个文件])
```

## 二、评价指标体系：MCD + WER/CER

只看 loss 是不够的。加了两类客观指标，全部零新依赖（无需 SPTK/mcep）：

| 文件 | 内容 |
|---|---|
| `matcha/utils/metrics.py` | `mel_cepstral_distortion`（DTW / min_len 对齐 + DCT-II）、`wer` / `cer`（手写 Levenshtein + 文本归一化） |
| `scripts/evaluate.py` | 批量评估 CLI：合成 → MCD → 存 wav → ASR 转写 → WER/CER，逐条写 `results.csv` |
| `baselightningmodule.py` | 验证钩子新增 `val_mcd/mean` 标量 → tensorboard 可看质量曲线 |

ASR 用 `torchaudio` 自带的 `WAV2VEC2_ASR_BASE_960H`（360MB，仅评估用，与训练无关）；`--asr none` 可跳过。另一个实用选项是 `--calibrate`：用**真实 mel → wav → 声码器 → mel** 的往返过程测出声码器链路的下限。

### MCD 的标定（重要）

自研提取器和论文常用的 SPTK-mcep **量纲不同**，绝对值只能做同提取器下的相对比较。所以做了三个参照点：

| 参照 | 数值 | 含义 |
|---|---|---|
| 声码器往返（无损链路） | **3.65 dB** | 理论上限 |
| 已训模型 | ~51–53 dB | 当前水平 |
| 跨语句自然语音 | ~55–90 dB | 超过说明细节明显糊 |

排查链也很重要：往返 3.65（链路无损）→ ASR 逐词全对（输出可懂）→ 真实语音自变速 1.81（DTW 正确）→ mel 图对比。最终定性：**模型输出现象是"可懂但细节偏糊"**，MCD 偏高反映细节损失而非内容错误——这也是为什么后来引入去噪器、并统一评估协议。

## 三、静态 Demo 页

做了一个单文件纯静态页，包含：

- 架构流水线图（高亮改动模块）
- 工作内容卡片
- **试听表**：多系统 × 多句子的播放矩阵，悬停列还能切换转写文本
- 指标汇总表

配套 `scripts/prepare_demo_audio.py` 一键重新生成全部演示音频（换模型/声码器后重跑即可）。试听句子是 val 集里 WER 与 GT-WER 都为 0 的"干净样本"，避免用错误样本误导听感。

部署：GitHub Pages 只能从仓库根或 `/docs` 托管——把 `demo/` 内容放进 `docs/` 或单独 `gh-pages` 分支即可。

## 四、为什么值得做

- 注册表把"接入新声码器"从改框架变成了加文件，之后换声码器的成本基本为零
- 有了指标和标定，"模型有没有变好"才能从主观听感变成能比较、能做统计检验的数字，后面换骨干的实验能下结论靠的就是这个
- Demo 页则是给外面看的：一个能点开就听的矩阵，比一张表格更有说服力

## 关键代码

### 注册表本体

```python
VOCODER_REGISTRY = {}

def register_vocoder(name):
    def decorator(loader):
        if name in VOCODER_REGISTRY:
            raise KeyError(f"Vocoder '{name}' is already registered!")
        VOCODER_REGISTRY[name] = loader
        return loader
    return decorator

def load_vocoder(name, checkpoint_path, device):
    if name not in VOCODER_REGISTRY:
        raise NotImplementedError(f"Vocoder '{name}' not implemented! Registered: {sorted(VOCODER_REGISTRY)}")
    return VOCODER_REGISTRY[name](checkpoint_path, device)
```

### 接一个 HiFi-GAN：写个带装饰器的加载函数就行

```python
@register_vocoder(HIFIGAN_T2_V1)
def load_hifigan_t2_v1(checkpoint_path, device):
    return _load_hifigan_with_denoiser(checkpoint_path, device)
```

推理侧只剩一行分发：

```python
vocoder, denoiser = vocoder_registry.load_vocoder(vocoder_name, checkpoint_path, device)
```

### MCD 的核心（DCT + DTW，零新依赖）

```python
def mel_cepstral_distortion(gen_mel, ref_mel, n_mfcc=13, skip_c0=True, align="dtw"):
    gen_mc = dct(gen_mel, type=2, axis=0, norm="ortho")[:n_mfcc, :]
    ref_mc = dct(ref_mel, type=2, axis=0, norm="ortho")[:n_mfcc, :]
    if skip_c0:                       # 去掉能量项，聚焦音色 / 清晰度
        gen_mc, ref_mc = gen_mc[1:, :], ref_mc[1:, :]

    if align == "dtw":
        g, r = gen_mc.T, ref_mc.T
        cost = (g**2).sum(-1)[:, None] + (r**2).sum(-1)[None, :] - 2.0 * (g @ r.T)
        path = _dtw_align(np.maximum(cost, 0.0))
        diffs = np.array([np.linalg.norm(gen_mc[:, i] - ref_mc[:, j]) for i, j in path])

    return float(_MCD_SCALE * diffs.mean())
```

相关文件：`matcha/vocoders/__init__.py`、`matcha/utils/metrics.py`、`scripts/evaluate.py`。
