---
title: Sway Sampling 实测：少步数推理的收益与代价
date: 2026-09-13 12:00:00
tags: [TTS, 实验方法, 推理优化, MCD]
categories: [Matcha-TTS]
description: 把 F5-TTS 的 sway sampling 接到 Matcha-TTS：5 个模型上的指标收益，以及一个指标看不出来的代价——语音变轻了。追加实验：二阶 AB2 求解器在真实模型上全面落败的机制分析。
updated: 2026-09-19
---

> 相关：[Matcha-TTS 训练手记系列](/series/) ｜ 项目代码：<https://github.com/captwd/mamba-matcha-tts>

前面几篇都在改模型（换 Mamba、换 ConvNeXt）。这篇换个方向：**不动模型、不重新训练**，只在推理时改一下 ODE 的时间步怎么分配，能拿到多少收益——以及一个只看指标发现不了的问题。

**先抛一个保留意见**：sway"前期密集、后期稀疏"的步长分配逻辑我是认同的，但我对它在极低步数下的实际收益一直存疑。理由是个简单的数学事实：sway 保持端点不变，而 **1 步的时间网格只有 [0, 1] 两个端点，和均匀网格完全一致**——1 步下 sway 理论上是个彻底的空操作；2~3 步时网格虽然不同了（2 步从中点切分变成约 0.29/0.71），但这种量级的重排，未必撬得动被整体粗粒度支配的离散误差。所以我的预期是：**低步数下 sway 与均匀的差别不应该特别大**。后文的实验数据对得上这个预期——收益虽然配对检验显著（p<0.0001），绝对幅度也只有 0.1~0.4 dB。"显著"和"大"是两回事，这恰好也是本文想讲的"怎么读指标"的一部分。这个怀疑精神在文末的追加实验里派上了更大的用场——那一次被检验的，是"更高级的求解器必然更好"这条理论直觉。

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

## 追加实验：二阶求解器 AB2，全面落败

sway 改的是职责一——"在哪几个时刻问模型"（时间网格）。顺着追一步，自然的问题是：**职责二——"怎么用模型的回答"——能不能也升级？** Euler 每步只用当前一次速度求值（一阶精度）；教科书上的 Adams-Bashforth 两步法（AB2）额外利用**上一步的速度求值**做线性外推：

```
x_{i+1} = x_i + dt · ( 3/2·f_i − 1/2·f_{i−1} )
```

不加 NFE、不动模型、不重训——理论上把全局积分精度从 O(dt) 提到 O(dt²)。注意 f_prev 的系数是**负**的：这不是"平滑历史"，而是用两次求值之差放大场的变化趋势。

**先验算数学（玩具 ODE）**。dx/dt = e^t 有解析解，验证结果完全符合教科书：Euler 一阶（n 翻倍误差减半）、AB2 二阶（n 翻倍误差 ÷4）、且 sway 非均匀网格上 AB2 依然二阶（实现用变步长系数，与 sway 天然兼容）。数学全对，上真模型。

**然后全面翻车**。2 个权重 × {2,3,4,6,10} 步 × {euler, ab2} × {均匀网格, sway(−1.0)}，共 24 个配置、同协议同种子逐句配对（全部 p<0.0001）。convnext_decay134 的 MCD：

| 步数 | euler | euler+sway | ab2 | ab2+sway |
|---|---|---|---|---|
| 2 | 49.31 | **49.03** | 50.39 (+1.09) | 51.34 (+2.31) |
| 4 | 50.20 | **49.83** | 51.18 (+0.98) | 51.21 (+1.38) |
| 10 | 50.89 | **50.70** | 51.47 (+0.58) | 51.47 (+0.77) |

official 权重同模式（2 步 ab2 差 +0.83/+1.72，10 步 +0.56/+0.73）。ASR 确认：2 步+sway 下 WER 8.7% → 11.8%（+3.1pp，显著）；official 7.0% → 7.5%（不显著）。**AB2 在所有配置上都输，步数越少输得越狠**。

**为什么——四个机制**：

1. **玩具验证的盲区**：验证用的场与 x 无关，意味着无论漂移多远，每次求值都精确落在真轨迹上——这是 AB2 的理想国。真实场依赖 x：Euler 每步有漂移，"历史速度"是在**偏离轨迹的状态**上取的，二阶外推的前提（两个干净的历史点）已经坏了。
2. **放大器效应**：AB2 的更新可以写成 `Euler 项 + 0.5·dt·(f_i − f_{i−1})`。解析场里两次求值之差是干净的趋势；学习场里它混着模型自身的不完美。Euler 不放大任何历史，AB2 把这些噪声放大 0.5 倍再注入。
3. **大步长越冲**：2~10 步意味着 dt 巨大，多项式外推越过冲——所以误差随步数减少而增大（10 步 +0.6 → 2 步 +1.1/+2.3）。1 步时 AB2 无历史可用、完全退化为 Euler，与开头的保留意见互相印证。
4. **附带发现**：ab2+sway 比 ab2 还差。sway 正弦网格开头步长剧变（0.012 → 0.037，比值 3），变步长 AB2 的系数 `1+dt/(2g)` 在步长比大时爆炸——**变步长多步法要求步长比平滑变化**，这本身就是一条独立教训。

**三句话结论**：Euler + sway(−1.0) 的组合比看起来更"抗打"，连二阶方法都打不过它；文献里低步数增益（DPM-Solver / UniPC 一族）靠的不是朴素多步外推，而是指数积分器重构 + 专门的稳定性设计——朴素 AB2 的失败恰好解释了那些设计为什么必要；**玩具 ODE 上的收敛阶 ≠ 学习场上的实际收益**——"理论精度阶"的兑现需要求值干净、步长相对场的尺度足够小，两个前提在 2~10 步的学习场采样里都不成立。

## 结论

1. **sway 是免费的收益**：不改模型、不重训，5 个模型全部显著改善 MCD（−0.08 ~ −0.44 dB），步数越少收益越大
2. **"少步数"的收益有代价**：步数越少能量越低。1 步在我的权重上会明显变轻变闷，**不推荐**；2 步是折中
3. **推荐设置：`2 步 + sway(−1.0)`** —— MCD 49.03 / WER 8.7%（官方权重 24.58 / 7.0%），比原来的 10 步基线更好，而且**快 5 倍**；想要更接近原听感可以用 `4 步 + sway`
4. **1 步只在训练充分的权重上可行**（官方权重上能量几乎不掉、WER 7.4% 贴近 ASR 上限）
5. **教训**：调采样设置时**一定要听**，并给评估补一个响度指标——MCD 变好不等于语音变好
6. **追加的 AB2 实验全面落败**：教科书二阶方法在学习场上输给一阶 Euler（步数越少输得越狠，sway 网格上更差）——"理论精度阶"的兑现要求求值干净、步长相对场尺度足够小，2~10 步的学习场采样两个都不满足；反过来，Euler + sway 的组合因为"不放大任何历史"而格外稳健

## 复现

```bash
# 单次评估（2 步 + sway）
python scripts/evaluate.py --checkpoint_path <ckpt> \
  --filelist data/LJSpeech-1.1/val.txt --output_folder results/eval_xxx \
  --vocoder hifigan_T2_v1 --steps 2 --seed 1234 --sway_sampling_coef -1.0

# sway 系数 × 极低 NFE 曲线（1/2/3/4/6/10 步）
bash wsl_env/sway_curve.sh && python wsl_env/sway_curve_compare.py

# AB2 求解器自检（几秒，无需 checkpoint；含公式验证 + 实现回归测试）
python scripts/test_ab2_convergence.py

# AB2 配置评估（与 euler 同协议同种子，逐句可配对）
python scripts/evaluate.py --checkpoint_path <ckpt> \
  --filelist data/LJSpeech-1.1/val.txt --output_folder results/ab2_curve/<name>/s2_ab2_m10 \
  --vocoder hifigan_T2_v1 --steps 2 --seed 1234 --sampling_method ab2 --sway_sampling_coef -1.0

# 全矩阵（2 权重 × 5 步数 × {ab2_off, ab2_m10} + ASR 关键档）与对照分析
bash wsl_env/ab2_curve.sh && python wsl_env/ab2_curve_compare.py

# 生成试听音频（两个权重 × 5 档设置）
python wsl_env/synth_steps_ab.py && python wsl_env/synth_steps_ab_official.py
```

完整记录：`docs/2026-09-12_summary.md`（sway 全部表格与脚本说明）；AB2 实验数据在 `results/ab2_curve/`（24 配置），对照脚本 `wsl_env/ab2_curve_compare.py`。
