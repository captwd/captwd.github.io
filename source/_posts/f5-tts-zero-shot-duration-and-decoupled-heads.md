---
title: F5-TTS 零样本的时长之困：从参考音频的坑，到"解耦预测头"的想法
date: 2026-09-13 22:30:00
tags: [F5-TTS, 流匹配, 零样本TTS, 时长控制, 解耦, 研究想法]
categories: [F5-TTS]
description: 第一次真正跑 F5-TTS 零样本克隆，从"语速对不上"一路想到"给流匹配模型加解耦预测头"。记一下这条链，以及我最后那个想法：用时长/音高/能量几个头预测出韵律，再当成条件塞给下游生成器。
---

> 相关：[Sway Sampling 实测](/2026/09/13/sway-sampling-for-flow-matching-tts/) ｜ 代码：[F5-TTS](https://github.com/SWivid/F5-TTS) ｜ 论文：[arXiv 2410.06885](https://arxiv.org/abs/2410.06885)

今天第一次把 F5-TTS 真正跑起来，本来只是想克隆一个音色，结果被"语速太快"这件事绊住，然后顺着它一路想到模型结构。这篇把整条链记下来，**重点放在最后那个解耦预测头的想法**。

## 一、F5-TTS 是什么（一句话版）

F5-TTS 是**条件流匹配（CFM）+ DiT** 的非自回归 TTS：

- 训练：取真实 mel `x1` 和高斯噪声 `x0`，随机时刻 `t` 构造 `x_t=(1−t)x0+t·x1`，让网络预测直线速度 `v=x1−x0`，只对被 mask 的"待生成区"算 MSE。
- 推理：从噪声出发，用 ODE 沿学到的速度场积分到 `t=1`，得到 mel。
- 条件：把**参考 mel 和文本一起拼进序列**，参考区被"钉住"不动（in-context infilling）——这就是零样本声音克隆的来源。
- 它刻意做得很简：**没有 duration model、没有 text encoder、没有 phoneme alignment**，也没有说话人编码器。

这几条代码里都能对上：`cfm.py` 的 `forward` / `sample` 是训练和推理两个入口，`dit.py:202` 把 `[带噪mel | cond | 文本]` 三路拼成一个序列。

## 二、跑起来：参考音频、文本、时长的三角关系

环境用 conda 的 `myagent`（F5-TTS 是 editable 装的，torch 2.7.1+cu128）。权重放本地，`--ckpt_file` 指过去。声码器 Vocos 首次会从 HF 下，国内挂个镜像即可。

跑通了，但踩了两个坑，正好把问题暴露出来。

### 坑 1：参考音频被截断，但参考文本没截

`utils_infer.py:325` 会把超过 12s 的参考音频**自动截短到 12s**，但如果你给的 `ref_text` 是整段 23s 的转写，两者就对不上了。

F5 的时长是这么估的（`utils_infer.py:503`）：

```python
duration = ref_audio_len + int(ref_audio_len / ref_text_len * gen_text_len / local_speed)
```

`ref_audio_len` 只有 12s 的帧数，`ref_text_len` 却是 23s 文本的长度 → 每字节对应帧数被低估约一半 → 生成只有应有长度的一半。**11s 的文本生成了 5s，听起来飞快。**

### 坑 2：参考有停顿、文本又短，反而生成超长

换成另一段 10.14s 的参考，文本只有 16 字。一量发现：**有效人声只有 6.9s，中间夹了 3.2s 停顿**。模型按"10.14s / 16 字"估语速，于是 50 字的生成直接拖到 **30.6s**。

这告诉我们一件很关键的事：

> **F5 的"语速"是从参考音频的 `帧数/文本长度` 反推出来的。** 参考里有多少停顿、文本和音频对不对得上，会一比一地转移到生成结果上。

短期只能补偿：`speed`（全局缩放）、`fix_duration`（直接给总时长）。但都是治标。

## 三、根因：F5 根本没有"时长建模"

顺着上面往下想，会发现 F5 缺的不是某个参数，而是**一个独立的"我该说多长"的机制**。这里有三个容易混的"进度轴"：

| 轴 | 含义 | 在 F5 里 |
|---|---|---|
| 流时间 `t` | 从噪声去噪到哪一步 | `[0,1]`，本来就归一化；通过 `TimestepEmbedding` 注入 |
| 位置 | 生成到第几帧 | 由 RoPE 编码（普通、未归一化） |
| 时长 / 任务进度 | 这句话总共多长 | **没有显式建模**，靠参考比例猜 |

- 把**流时间 `t`** 再归一化 → 只是换采样时刻表，那就是 **Sway Sampling**（`cfm.py:263`），影响采样质量，不影响时长。
- 把**位置**归一化 `i/L`，并把 `L` 暴露成可控输入 → 这正是 **VoiceStar 的 PM-RoPE**：用"完成百分之多少"取代绝对位置，从而实现时长控制 + 长音频外推。

也就是说：**想让 F5 更好控时长，该动的是"时长"，而不是 RoPE、也不是流时间 `t`。**

## 四、时长控制的三条路

| 层次 | 做法 | 成本 | 粒度 |
|---|---|---|---|
| 免训练 | 参考 VAD 剪停顿 + 准确转写 + `fix_duration` / `speed` | 极低 | 只能控总长 |
| 工程改进 | 用**学出来的 duration predictor** 替换比例启发式 | 低 | 整句时长 |
| 研究级 | 把时长/语速做成**条件输入** + 时长增强训练 | 中 | 整句→字级 |

这也是我后面那个想法的起点。

## 五、当前零样本 / 小样本 TTS 速览（2025–2026）

零样本这块这两年非常卷，但**没有单一"最好"，看维度**：

| 模型 | 架构 | 强项 |
|---|---|---|
| IndexTTS 2 / 2.5 | AR + FM | 时长/情感**解耦**，韵律可控 |
| CosyVoice 2 / 3 | AR LLM + FM | 流式低延迟、多语言、指令/标签控制 |
| MegaTTS 3 | Latent Diffusion | 音色相似、口音强度可控 |
| Seed-TTS / MiniMax | AR/混合 | 综合最强（多为闭源） |
| **VoiceStar** | AR | **显式时长控制 + 长音频外推（PM-RoPE）** |
| F5-TTS / E2-TTS | NAR FM | 简洁、鲁棒、易训（我在用的） |

小样本现在基本不"从零训练"了，而是**零样本 + 少量数据微调（LoRA/adapter）**做说话人适配。

顺带一提：同组的 **X-Voice**（arXiv 2605.05611）直接**在 F5-TTS 上扩展**——多语言、免参考转写，还加了语言注入和**解耦的 CFG**。说明"给 F5 加可控性"这条线是有人在做、且认可的。

## 六、F5 没有解耦——这是空位

我在代码里确认了一遍：模型里没有 speaker / pitch / energy / variance 任何预测头。DiT 的输入只有 `cond`、文本、`t`，输出只有速度场；`trainer.py:154` 那个 `duration_predictor` 钩子注释明写"目前未启用训练"。

后果就是：**音色、内容、韵律、时长全部纠缠在同一份 in-context 表示里，无法独立控制**。想"同音色、只改语速"，F5 做不到。

这既是它目前不好控的原因，**也正是最容易切入做改进的地方**。

## 七、我的想法：解耦多预测头 → 条件化下游生成器

思路一句话：**先解耦地预测出韵律（时长、音高、能量……），再把这些预测当成条件，塞给下游的流匹配生成器。**

### 1. 架构

```
                 ┌──────────────┐
   text  ───────▶│  文本编码器   │──┐
                 └──────────────┘  │
                 ┌──────────────┐  │   ┌──────────────────────┐
   ref   ───────▶│ 参考/风格编码 │──┼──▶│ 多个预测头            │
                 └──────────────┘  │   │ duration / F0 / energy│
                                   │   │ (+ style/emotion)     │──▶ 条件向量
                                   │   └──────────────────────┘
                                   │              │
                                 文本             ▼（作为条件注入）
                         ┌──────────────────────────────────┐
                         │   流匹配生成器 (DiT / CFM)         │──▶ mel ──▶ vocoder
                         └──────────────────────────────────┘
```

它其实是把 F5 缺失的 **duration model** 补回来，并且顺便把 **variance adaptor**（FastSpeech 2 的时长/音高/能量预测器）搬进流匹配的零样本框架里。

### 2. 训练 / 推理

- **监督来源**：时长用强制对齐（MFA / ctc-forced-aligner）得到帧级时长；F0 用 pyworld/parselmouth 提基频；能量用 RMS。**每个头用真值监督。**
- **生成器**：训练时用**真值条件**（teacher forcing），推理时用**预测条件**。
- **注入方式**：可以像时间步 `t` 一样走 AdaLN 调制，也可以直接拼进输入嵌入；每个条件还能配独立的 CFG。

### 3. 和既有工作的关系

这不是全新范式——FastSpeech 2 / NaturalSpeech 早就用 variance adaptor，IndexTTS 2 做了时长/情感解耦，VoiceStar 用 PM-RoPE 在 AR 上做时长控制。**空位在于：把它做进"非自回归 + 流匹配 + 零样本克隆"这个组合里，并且把解耦做干净。** F5 恰好是 NAR，能和 AR 系（VoiceStar 那类）形成对照。

### 4. 三个真正的难点

1. **监督从哪来**：对齐、F0、能量的提取比"音频对"麻烦，且对齐误差会传下去。
2. **训练 / 推理不一致**：训练喂真值、推理喂预测，预测有误差就会掉质量。要处理（按概率混用预测值、条件 dropout、给每个条件配 CFG）。
3. **解耦的泄漏**（最要命）：时长和内容强相关、音高和说话人强相关。naive 地多接几个头，很容易把"说话人身份"漏进音高、"语速"漏进情感，结果"换音色时韵律跟着变"。**能不能干净解耦，才是这类工作的卖点。**
4. **一对多**：韵律从文本不可唯一确定（同一句话有很多种说法），所以要么加风格/情感条件，要么允许采样。

### 5. 受控实验设计（把"收益"拆成三笔账）

沿用我一贯的做法——不能只看"加头 vs 不加"的总分，因为那同时改了三样东西：**架构**（多了头、容量变大）、**机制**（多了一条条件路径）、**内容**（条件值携带真实韵律）。设计成每次只变一个：

| 条件 | 变化 | 逐差得到 |
|---|---|---|
| Baseline | 原始 F5 | 测量原点 |
| Max-heads, shuffled | 加了头，但条件值与样本**打乱对应** | 架构 + 机制 |
| Max-heads, true | 真实时长/音高/能量条件 | 架构 + 机制 + 内容 |

于是有加性分解：

```
Δtotal = Δ(arch+mech) + Δcontent
Δ(arch+mech) = P(shuffled) − P(baseline)
Δcontent     = P(true)     − P(shuffled)
```

**打乱对照是命门**：它保留"条件通道存在"这一事实，只破坏"条件值 ↔ 韵律"的对应。如果 `Δcontent ≈ 0`，说明模型只是在消费那条路径（归纳偏置），而不是真的用了韵律内容。

另外还要专门测**解耦**：
- 固定音色、只换韵律条件 → 看说话人相似度是否漂移；
- 固定韵律、只换音色 → 看韵律指标是否漂移；
- 交叉验证"两维互不干扰"。

### 6. 评估

时长误差（ms）／语速一致性、WER（ASR 回识）、SIM（说话人相似度）、UTMOS（自然度）、F0 的 RMSE/相关性，以及上面的解耦漂移量。

## 小结

1. **F5 的"语速"是从参考音频比例反推的**，参考里有多少停顿、音文对不对得上，会一比一转移到生成结果——这是今天所有坑的根因。
2. 想控时长，别去碰流时间 `t`（那等于 Sway Sampling）；该建的是**独立的时长机制**：短中期用 duration predictor，长期把它变成条件。
3. **F5 在解耦度上是"零"**：没有 speaker/pitch/energy 头，音色/内容/韵律/时长全部纠缠。
4. **我的思路**：加**解耦的韵律预测头（时长/音高/能量）→ 当条件喂给下游流匹配生成器**。范式成熟（variance adaptor），但"零样本 + NAR + 流匹配 + 干净解耦"这个组合有空位。
5. 难点不在"能不能加头"，而在**监督来源、训练/推理一致、以及解耦不泄漏**——把这三件解决，就是一个像样的课题。
6. 验证要**受控**：用打乱对照把"架构/机制"和"内容"拆开，再专门测两维之间的解耦漂移。

## 关键代码

### F5 的时长估算（要替换的目标）

```python
# utils_infer.py:503
ref_text_len = len(ref_text.encode("utf-8"))
gen_text_len = len(gen_text.encode("utf-8"))
duration = ref_audio_len + int(ref_audio_len / ref_text_len * gen_text_len / local_speed)
```

### 参考音频 >12s 会被截断（坑的来源）

```python
# utils_infer.py:325
if len(non_silent_wave) > 6000 and len(non_silent_wave + non_silent_seg) > 12000:
    show_info("Audio is over 12s, clipping short. (1)")
    break
```

### Sway Sampling：改的是流时间 t 的分布

```python
# cfm.py:263
if sway_sampling_coef is not None:
    t = t + sway_sampling_coef * (torch.cos(torch.pi / 2 * t) - 1 + t)
```

### RoPE 的注入点（普通、未归一化）

```python
# dit.py:418 → block → modules.py:601
rope = self.rotary_embed.forward_from_seq_len(seq_len)
query = apply_rotary_pos_emb(query, freqs, q_xpos_scale)
key   = apply_rotary_pos_emb(key,   freqs, k_xpos_scale)
```

### 注入一个条件（多头的目标形态，仿时间步 t）

```python
# 条件向量 c 与时间嵌入一样进入 AdaLN 调制 / 或拼进输入
x = self.input_embed(torch.cat((x, cond, text_embed, duration_emb, f0_emb), dim=-1))
```

### 三路分解的自检

```python
d_arch_mech = mean(shuffled) - mean(baseline)
d_content   = mean(true)     - mean(shuffled)
assert abs((d_arch_mech + d_content) - (mean(true) - mean(baseline))) < 1e-9
```
