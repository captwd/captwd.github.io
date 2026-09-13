---
title: Sway Sampling 实测：少步数推理的收益与代价
date: 2026-09-13 12:00:00
tags: [TTS, 实验方法, 推理优化, MCD]
categories: [Matcha-TTS]
description: 把 F5-TTS 的 sway sampling 接到 Matcha-TTS：5 个模型上的指标收益，以及一个指标看不出来的代价——语音变轻了。
---

> 相关：[Matcha-TTS 训练手记系列](/series/) ｜ 项目代码：<https://github.com/captwd/mamba-matcha-tts>

前面几篇都在改模型（换 Mamba、换 ConvNeXt）。这篇换个方向：**不动模型、不重新训练**，只在推理时改一下 ODE 的时间步怎么分配，能拿到多少收益——以及一个只看指标发现不了的问题。

## Sway Sampling 是什么

来自 [F5-TTS](https://arxiv.org/abs/2410.06885)（arXiv 2410.06885）。推理时把均匀的时间轴做一次非线性重参数化：

```
t ← t + a · ( cos(π/2 · t) − 1 + t )
```

- 端点不变（t=0→0，t=1→1），所以积分的起点终点不受影响，只改中间的步长分布
- `a < 0` 时步长在噪声端（t≈0）更密；F5 的默认值是 `a = −1.0`
- 本质是**数值积分的步长分配**：步数有限时，离散化误差沿轨迹并不均匀，把步子挪到误差大的地方更划算

## 接进 Matcha 只要三处

| 文件 | 改动 |
|---|---|
| `matcha/models/components/flow_matching.py` | `t_span` 生成后加一行 sway 变换（`None` 时跳过） |
| `configs/model/cfm/default.yaml` | 新增 `sway_sampling_coef: null` |
| `scripts/evaluate.py` | 新增 `--sway_sampling_coef` 和 `--seed` |

```python
t_span = torch.linspace(0, 1, n_timesteps + 1, device=mu.device)
if self.sway_sampling_coef is not None:
    t_span = t_span + self.sway_sampling_coef * (torch.cos(torch.pi / 2 * t_span) - 1 + t_span)
```

**不需要重训**：流匹配生成是在解一个 ODE（`dx/dt = v_θ(x,t)`），它的解只取决于速度场和初值；sway 只是换了一组离散点去逼近同一条轨迹，模型一个字都没动。

`--seed` 是我加的另一件事：ODE 的起点噪声是随机的，如果两次评估各自随机采样，差异会被采样噪声淹没。固定"每条语句一个种子"之后，同一个句子在不同配置下用**同一份起点噪声**，才能做逐句配对比较。

## 指标：5 个模型全部改善

协议：LJSpeech val 全量 100 句 · HiFi-GAN T2 + Denoiser · temperature 0.667 · seed 1234 · 逐句配对 Wilcoxon。

MCD（dB，越低越好），括号是 sway(−1.0) 相对关闭的变化：

| 模型 | 4 步 | 6 步 | 10 步 |
|---|---|---|---|
| U-Net 基线 | 51.79 (−0.27) | 52.26 (−0.20) | 52.70 (−0.08) |
| ConvNeXt 恒定 LR | 55.19 (−0.44) | 55.70 (−0.30) | 56.20 (−0.19) |
| ConvNeXt + LR 衰减 | 49.83 (−0.37) | 50.27 (−0.23) | 50.70 (−0.19) |
| 双向 Mamba2 | 50.88 (−0.19) | 51.26 (−0.12) | 51.58 (−0.10) |
| 官方预训练 | 25.33 (−0.24) | 25.71 (−0.20) | 26.10 (−0.15) |

所有对比 **p < 0.0001**。两个规律：sway 在所有模型上都有改善；**步数越少，收益越大**。

## 更意外的：步数越少，MCD 反而越好

顺手把步数一路降到 1 步：

| steps | ConvNeXt+衰减（关 / −1.0） | 官方预训练（关 / −1.0） |
|---|---|---|
| **1** | **48.48** | **24.18** |
| 2 | 49.31 / 49.03 | 24.83 / 24.58 |
| 3 | 49.86 / 49.59 | 25.28 / 25.01 |
| 4 | 50.20 / 49.83 | 25.57 / 25.33 |
| 6 | 50.50 / 50.27 | 25.91 / 25.71 |
| 10 | 50.89 / 50.70 | 26.25 / 26.10 |

MCD 随步数**单调下降**，一路降到 1 步最低；sway 的排序恒为 `−1.0 > −0.5 > 关闭`。配对检验全部 p<0.0001（2 步+sway vs 10 步：Δ = −1.86 / −1.67 dB）。

如果只看这张表，结论会是"1 步最好，又快又好"。

## 但是：听感不是这样的

下面是同一批句子、同一份起点噪声、不同推理设置。先听**我训练权重**（ConvNeXt + 衰减）：

| 设置 | 句子 1 | 句子 3 |
|---|---|---|
| 1 步 | <audio controls preload="none" src="/sway_audio/ours_1step_s1.wav"></audio> | <audio controls preload="none" src="/sway_audio/ours_1step_s3.wav"></audio> |
| 2 步 + sway | <audio controls preload="none" src="/sway_audio/ours_2step_sway_s1.wav"></audio> | <audio controls preload="none" src="/sway_audio/ours_2step_sway_s3.wav"></audio> |
| 10 步（原基线） | <audio controls preload="none" src="/sway_audio/ours_10step_s1.wav"></audio> | <audio controls preload="none" src="/sway_audio/ours_10step_s3.wav"></audio> |

再听**官方预训练权重**：

| 设置 | 句子 1 | 句子 3 |
|---|---|---|
| 1 步 | <audio controls preload="none" src="/sway_audio/official_1step_s1.wav"></audio> | <audio controls preload="none" src="/sway_audio/official_1step_s3.wav"></audio> |
| 2 步 + sway | <audio controls preload="none" src="/sway_audio/official_2step_sway_s1.wav"></audio> | <audio controls preload="none" src="/sway_audio/official_2step_sway_s3.wav"></audio> |
| 10 步（原基线） | <audio controls preload="none" src="/sway_audio/official_10step_s1.wav"></audio> | <audio controls preload="none" src="/sway_audio/official_10step_s3.wav"></audio> |

## 指标看不见的那个维度：响度

为什么 1 步的 MCD 最好，听起来却不对？我把生成音频的能量量了一下（5 句均值）：

| 设置 | 我的权重 RMS | 相对 10 步 | 官方权重 RMS | 相对 10 步 |
|---|---|---|---|---|
| 10 步 | 0.0517 | — | 0.0737 | — |
| 4 步 + sway | 0.0454 | −12% | 0.0725 | −2% |
| 2 步 + sway | 0.0384 | −26% | 0.0704 | −4% |
| **1 步** | **0.0276** | **−47%（约 −5.4 dB）** | 0.0677 | −8%（约 −0.7 dB） |

**步数越少，输出能量越低**——1 步在我的权重上只有 10 步的 53%，听起来就是"轻、闷、没劲"。而 MCD 量的是频谱形状的距离、WER 量的是可懂度，**两个都不看响度**，所以指标一路变好，听感却在退化。

顺带一个对照：**在官方权重上 1 步只掉 8% 的能量**，听感基本正常。所以"1 步能不能用"取决于速度场的精度，不能只看 MCD。

## 结论

1. **sway 是免费的收益**：不改模型、不重训，5 个模型全部显著改善 MCD（−0.08 ~ −0.44 dB），步数越少收益越大
2. **"少步数"的收益有代价**：步数越少能量越低。1 步在我的权重上会明显变轻变闷，**不推荐**；2 步是折中
3. **推荐设置：`2 步 + sway(−1.0)`** —— MCD 49.03 / WER 8.7%（官方权重 24.58 / 7.0%），比原来的 10 步基线更好，而且**快 5 倍**；想要更接近原听感可以用 `4 步 + sway`
4. **1 步只在训练充分的权重上可行**（官方权重上能量几乎不掉、WER 7.4% 贴近 ASR 上限）
5. **教训**：调采样设置时**一定要听**，并给评估补一个响度指标——MCD 变好不等于语音变好

## 复现

```bash
# 单次评估（2 步 + sway）
python scripts/evaluate.py --checkpoint_path <ckpt> \
  --filelist data/LJSpeech-1.1/val.txt --output_folder results/eval_xxx \
  --vocoder hifigan_T2_v1 --steps 2 --seed 1234 --sway_sampling_coef -1.0

# sway 系数 × 极低 NFE 曲线（1/2/3/4/6/10 步）
bash wsl_env/sway_curve.sh && python wsl_env/sway_curve_compare.py

# 生成试听音频（两个权重 × 5 档设置）
python wsl_env/synth_steps_ab.py && python wsl_env/synth_steps_ab_official.py
```

完整记录：`docs/2026-09-12_summary.md`（含全部表格与脚本说明）。
