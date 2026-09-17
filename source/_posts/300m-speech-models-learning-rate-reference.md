---
title: 300M 量级语音模型学习率速查：一个窄带里的两个世界
date: 2026-09-17 10:45:00
tags: [TTS, 语音, 学习率, 训练技巧, 文献整理]
categories: [深度学习实践]
description: 给"300M 参数附近"的流行语音模型建一个学习率参照系：生成式集中在 7.5e-5~2e-4（锚点 1e-4），自监督表征却用 5e-4~1e-3。先把速查表记下来，规律和原因后续展开。
---

> 起因：微调 F5-TTS 时对学习率没手感，翻了一圈文献和官方配置，把"300M 附近"的流行语音模型学习率整理成一张速查表。warmup 的理论解释写了一节，其余（batch 换算、语音敏感性分析）后面补。

## 速查表

| 模型 | 参数量 | 范式 | 优化器 | 峰值 LR | 调度 / warmup |
|---|---|---|---|---|---|
| F5-TTS Base | 336M | NAR 流匹配 TTS | AdamW | **7.5e-5**（官方配置） | 2 万步 warmup，grad clip 1.0 |
| VoiceBox (Meta) | ~330M | NAR 流匹配 infilling | Adam | **1e-4** | 500K updates，EMA 权重推理 |
| MegaTTS 3 (字节) | 0.45B | 潜空间扩散 DiT | Adam | **1e-4** | 1 万步 warmup，β=0.9/0.999 |
| Whisper Small | 244M | 弱监督 ASR | AdamW | **1.75e-4** | ~2k 步 warmup + 线性衰减到 0 |
| StyleTTS 2 | — | 扩散 + GAN | AdamW | **1e-4** | 两阶段训练，batch 16 句 |
| wav2vec 2.0 Large / XLS-R | 317M / 300M | 自监督表征 | Adam | **6e-4 ~ 1e-3** | tri-stage（10% warmup, 40% 恒定, 50% 衰减） |
| emotion2vec | base ~95M / large ~300M | 自监督情感表征 | Adam | 论文只给"cosine + 5% 线性 warmup" | 10 万步 |
| F5-TTS 官方微调 | 336M 全参 | 微调 | AdamW | **1e-5**（官方默认，比预训练低 7.5 倍） | 同上框架 |

几点备注：

- F5-TTS 的数值取自[官方仓库配置](https://github.com/swivid/F5-TTS)（F5TTS_Base.yaml：`learning_rate: 7.5e-5`、`num_warmup_updates: 20000`），微调默认值取自 `finetune_cli.py`（1e-5）。
- 老一代参照：Tacotron2 用 1e-3 Adam 起步再衰减——自回归+注意力时代的 LR 普遍比现在的流匹配/扩散模型大 5~10 倍。
- CosyVoice 2（0.5B LLM + 流匹配）没查到公开的确切 LR，它的 LLM 部分是在预训练 LM 上低学习率续训，属于另一套参照系，待确认。
- LoRA 微调 F5（可训练参数约 0.85%）社区常用 1e-4。

## 四条规律（待展开）

1. **生成式和自监督是两个世界**：同样是 300M，F5/VoiceBox/MegaTTS3/Whisper 全在 1e-4 附近，wav2vec2/XLS-R 却用 5e-4 往上——自监督目标（预测被 mask 的连续特征）梯度更平稳，且配超大 batch + tri-stage。
2. **模型越大 LR 越小**：Whisper 的内部证据最干净——Tiny 3.75e-4 → Small 1.75e-4 → Medium/Large 更低，Large-v2 还把 warmup 拉长到 8k 步并换成 cosine。粗略换算：参数量 ×4，LR 减半。
3. **微调比预训练低一个数量级**：F5 预训练 7.5e-5 → 官方全参微调 1e-5；LoRA 因为可训练参数少，反而可以 1e-4。可训练参数越少，LR 越可以往大走。
4. **warmup 没有例外**：2k 步（Whisper）到 2 万步（F5），或按比例 5~10%。调度器三派：tri-stage（fairseq 家族）、线性衰减（Whisper v1）、cosine（emotion2vec、Whisper v2、扩散系）。为什么人人都要热身？见下一节。

## 为什么 warmup 是标配：三代解释

1. **经验起源（2017–2019）**：Transformer 的 Noam 计划就是"先热身、后衰减"，大 batch 训练（Goyal et al. 的线性缩放）也是加 warmup 才稳。当时没人说得清原理，只知道不热身就炸。
2. **优化器方差解释（RAdam, ICLR 2020）**：Adam 的二阶矩 v_t 是指数滑动平均，训练初期样本太少，估计出来的自适应学习率不是"太大"，而是**方差太大**——更新方向忽东忽西。RAdam 对这个方差项做数学修正之后 warmup 可以省掉。这也是所有 Adam 家族模型（语音模型全在里面）都需要热身的根因。
3. **机制归因（2024，两篇 NeurIPS）**：
   - Kalra & Barkeshli 把 warmup 的收益归因于**训练初期的梯度噪声**；
   - Kosson et al. 在 GPT 训练上做了系统分析，认为核心是**限制每步参数更新量 Δw_t**：初始化附近梯度信噪比（SNR）很差、参数的角度更新过大、有效临界 batch size 很小。他们提出按梯度 SNR 缩放的优化器改进，相当于"自动 warmup"，实测能大幅替代手动 warmup。这也解释了 warmup 步数为什么没有万能值——它近似等于"SNR 恢复所需的时间"，随模型和数据而变（F5 要 2 万步，Whisper 只要 2 千步）。

**为什么语音这边尤其没人敢关**：

- 语音模型清一色 Adam 家族 + 帧级回归，正中 RAdam 解释的适用面；
- 对齐结构（注意力 / in-context infilling）对早期大更新极敏感，出问题表现为吞字、对齐崩塌，而且 **loss 曲线上常常看不出来，只能靠听**——试错成本比 NLP 高得多；
- 流匹配/扩散还叠着 EMA 权重，早期权重震荡会污染教师；
- fairseq 把 tri-stage 固化成默认配置，全行业沿用，没人有动力去冒险。

想跳过 warmup 调参，现成的替代是 RAdam / Prodigy 这类把"自动热身"内置进优化器的方案——这也是后面想实测的方向。

## 落地备忘（针对少样本微调 F5）

全参微调 1e-5 起步（数据干净可试 2e-5~3e-5）；LoRA 1e-4。warmup 保留（几百到 2k 步），grad clip 1.0 别关。warmup 期 loss 不降不用慌，mel 谱出横向条纹或推理吞字就是 LR 过大的信号，减半再试。

## 来源

- [F5-TTS 论文 (arXiv 2410.06885)](https://arxiv.org/html/2410.06885v3) / [官方仓库](https://github.com/swivid/f5-tts)
- [VoiceBox (arXiv 2306.15687)](https://arxiv.org/abs/2306.15687) / [OpenReview PDF](https://openreview.net/pdf?id=gzCS252hCO)
- [MegaTTS 3 (arXiv 2502.18924)](https://arxiv.org/html/2502.18924v4) / [官方仓库](https://github.com/bytedance/MegaTTS3)
- [Whisper 论文 (OpenAI)](https://cdn.openai.com/papers/whisper.pdf) / [Collabora 微调笔记](https://www.collabora.com/news-and-blog/news-and-events/breaking-language-barriers-fine-tuning-whisper-for-hindi.html)
- [wav2vec 2.0 (NeurIPS 2020)](https://proceedings.neurips.cc/paper/2020/file/92d1e1eb1cd6f9fba3227870bb6d7f07-Paper.pdf) / [XLS-R (arXiv 2111.09296)](https://arxiv.org/abs/2111.09296) / [fairseq XLS-R 配置](https://github.com/facebookresearch/fairseq/blob/main/examples/wav2vec/xlsr/README.md) / [WavLM (arXiv 2110.13900)](https://arxiv.org/html/2110.13900v5)
- [emotion2vec (arXiv 2312.15185)](https://arxiv.org/html/2312.15185v1)
- [StyleTTS 2 (arXiv 2306.07691)](https://arxiv.org/abs/2306.07691) / [NeurIPS 页面](https://neurips.cc/virtual/2023/poster/70566)

warmup 理论：

- [RAdam: On the Variance of the Adaptive Learning Rate and Beyond (ICLR 2020)](https://openreview.net/forum?id=rkgz2aEKDr)
- [Analyzing & Reducing the Need for Learning Rate Warmup in GPT Training (NeurIPS 2024)](https://arxiv.org/abs/2410.23922)
- [Why Warmup the Learning Rate? Underlying Mechanisms (NeurIPS 2024)](https://arxiv.org/abs/2406.09405)
