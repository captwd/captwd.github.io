---
title: 给 Matcha-TTS 加情感：emotion2vec 条件注入、1200 轮长跑与一次评估反转
date: 2026-09-15 21:00:00
tags: [TTS, 情感合成, emotion2vec, 过拟合, 训练监控]
categories: [Matcha-TTS]
description: 把 emotion2vec 句级向量接进 CFM decoder，在 ESD 上从 ep126 训到 ep1199：WER 45.7%→13.0%。期间一条过拟合曲线骗了我——真相是 2 句样本的验证指标噪声 ±10dB，协议全量评估才是真相。
---

> 相关：[Matcha-TTS 训练手记系列](/series/) ｜ 项目代码：<https://github.com/captwd/mamba-matcha-tts>

前几篇都在改"客观质量"：换骨干、换采样、换评估协议，数据一直是单说话人的 LJSpeech。这篇换个方向——**可控性**：给定一句文本，指定用愤怒、开心还是悲伤的语气读出来。做法是把 [emotion2vec](https://github.com/egerber5/Emotion2Vec-Supervised-and-Self-supervised)（自监督语音情感表征模型）的句级向量接进 Matcha 的 CFM decoder，在 ESD 情感数据集上从 ep126 一路训到 ep1199。结果是可懂度的大幅提升、一条教科书式的过拟合曲线，和一个最贵的教训：**最优的 checkpoint 出现在 ep349，而它没有被存下来**。

## 设计：三件事防止模型"假装看条件"

| 模块 | 做法 | 位置 |
|---|---|---|
| **条件注入** | emotion2vec 句级向量 (768d) → 两层 MLP 投影到 64d → 与说话人嵌入一样沿时间复制、通道拼接进 CFM estimator 的输入 | `matcha_tts.py` · `decoder.py` |
| **辅助分类器** | 3 层 Conv1d + mean/max 双池化的小分类头，接在 CFM 反推的预测干净梅尔 `x1_hat` 上做情感分类，交叉熵损失反传回 decoder | `emotion.py` |
| **条件 dropout + CFG** | 训练时按 10% 概率把情感向量置零；推理时 `emo_scale` 对 ODE 结果做线性外推放大情感 | `flow_matching.py` |

辅助分类器是关键。条件生成有个经典失败模式：模型发现忽略条件也能把主损失降得差不多，于是条件被慢慢边缘化，训完发现情感没用上。对策就是加一个"监工"——生成器必须把情感画得连这个小分类器都认得出来，才算过关。实测它的验证损失在 ep30 左右就收敛到 ~0.05（5 类基本全对），说明情感通路确实被用起来了。

emotion2vec 的选择也有讲究：它输出的是**连续、细粒度**的情感向量而不是 5 类标签，意味着推理时可以拿任意一段"你想要的语气"的参考音频抽一个向量传进去——情感迁移而不是简单的标签开关。

## 数据与管线

主战场是 **ESD 英文子集**：10 个说话人 × 5 种情感 × 350 句 = 17,500 条（同一批文本用不同情感各读一遍——所以"光看文本猜语气"在原理上就无解，条件向量就是消歧手段）。另有 RAVDESS（24 演员 × 8 情感）做小规模验证。

管线三个脚本：重采样 + 生成 filelist（`prepare_esd.py`）、FunASR 加载 emotion2vec 批量抽特征（`extract_emotion2vec_funasr.py`，17,500 条句级 768d 向量）、从目录结构生成类别标签（`build_emo_labels.py`）。

## 训练：本地 127 轮 → 服务器 1200 轮

先在本地跑通了 127 轮（恒定 LR），确认情感通路收敛后整体迁到 4090 服务器，从 ep130 断点续训到 **ep1199**，共约 **34.5 万步**。LR 采用阶梯衰减：恒定 1e-4 走到 ep600，之后 5e-5 → 2.5e-5 → 1.25e-5 → 6.25e-6。

中间踩的运维坑够单写一篇的，挑三个最疼的：

- **Lightning 2.6 的 checkpoint 陷阱**：`save_top_k=0` + `save_last=true` 的组合**不会落盘**——`last.ckpt` 只在"当轮存过编号 checkpoint"时才写入。第一次长跑 13 个 epoch 零 checkpoint，重启后只能从头再来。
- **被杀的 pip 会留下半棵包树**：几次中断的安装让 numpy/scipy 目录混进了两个版本的文件。旧进程内存里有模块所以一切正常，**重启后新 import 直接 ABI 崩溃**。修复只能彻底删除干净重装。
- **并发训练必炸显存**：8GB 的本地卡上边跑主训练边做冒烟测试，直接 CUDA OOM。

## 结果：可懂度大幅提升

统一协议（875 句验证集 · HiFi-GAN T2 · 10 步 ODE · 情感匹配条件 · seed 1234）：

| 指标 | ep126（长跑前） | ep1199（长跑后） |
|---|---|---|
| MCD ↓ | 61.41 | **56.85** |
| WER ↓ | 45.7% | **13.0%** |
| CER ↓ | 26.4% | **4.9%** |
| GT-WER（真人录音 ASR 上限） | 7.9% | 7.9% |

两个读法：**可懂度的进步是决定性的**——WER 从接近不可用的 45.7% 压到 13.0%，CER 4.9% 说明音素发音本身清晰，错误集中在词级。而天花板是 7.9%（连真人录音过同一个 ASR 都有这个错误率，情感韵律本身就会干扰识别），13% 意味着还有空间但已在可用区间。

### MCD 为什么比 LJSpeech 系高那么多

把官方预训练模型放进来对比就清楚了。同协议（LJSpeech val 100 句）下官方 ckpt 的成绩是 **MCD 26.1 dB / WER 7.0%**（4 步 ODE 25.3，2 步 + sway 可到 24.6）——比 ESD 的 56.85 低了一倍不止。但这中间大部分差距是"题面"不同，不是模型更差：

- **数据带宽**：ESD 原始音频是 16 kHz，上采样到 22.05 kHz 后 8 kHz 以上没有真实能量，而声码器会"补"出高频——光是"GT → 声码器 → 重提 mel"的往返校准（理想下限），ESD 就有 **9.94 dB**，LJSpeech 只有 **3.6**；
- **任务方差**：10 说话人 × 5 情感，同一句话的情感实现每次都不同，韵律差会直接进 MCD；
- **训练量**：官方 50 万步 vs 本次 34.5 万步，且 ep349 后已进入过拟合段。

一个更公平的视角：两个模型都坐在各自数据"理想下限"上方约 **47 dB**（ESD：56.85 − 9.94；LJSpeech：51.0 − 3.6）。MCD 只在"同数据集 + 同协议"内可比，所以 ESD 和 LJSpeech 的结果应分开两张表看。

### 试听（同一说话人，三种情感 × 两种 CFG 强度）

三条文本分别匹配 happy / angry / sad 的类别中心向量，spk 0，10 步 ODE：

| 情感 | 文本 | s=1.0（自然） | s=2.0（加强） |
|---|---|---|---|
| 😊 | "We are going to the beach this weekend, I am so excited!" | <audio controls preload="none" src="/emo_audio/happy_s1.wav"></audio> | <audio controls preload="none" src="/emo_audio/happy_s2.wav"></audio> |
| 😠 | "How many times do I have to tell you not to leave the door open?" | <audio controls preload="none" src="/emo_audio/angry_s1.wav"></audio> | <audio controls preload="none" src="/emo_audio/angry_s2.wav"></audio> |
| 😢 | "I still remember the day she left, it was raining heavily." | <audio controls preload="none" src="/emo_audio/sad_s1.wav"></audio> | <audio controls preload="none" src="/emo_audio/sad_s2.wav"></audio> |

（s 是推理期 CFG 外推强度，越大情感越夸张。）

## 一个反转：训练内曲线是噪声，协议评估才是真相

训练时每轮在验证集"首个 batch 的 2 句"上快速算一个 val_mcd。1070 个点连成曲线，ep349 触底 54.39 后一路爬到 62——我当时据此判断"ep349 之后过拟合，最优 checkpoint 已丢"。

但把三个 checkpoint 都拉到统一协议（875 句全量、完整 10 步 ODE、情感匹配条件）下重新评估，故事完全反转：

| 指标 | ep126 | ep183 | ep1199 |
|---|---|---|---|
| MCD ↓ | 61.41 | 60.52 | **56.85** |
| WER ↓ | 45.7% | 33.5% | **13.0%** |
| CER ↓ | 26.4% | 18.0% | **4.9%** |

**协议指标单调改善，1200 轮没有过拟合。**那条"触底回升"的 val_mcd 曲线是 2 句样本的噪声：MCD 的句间标准差就有 ±13~15，2 句均值的抽样误差 ±10dB 起步，54.4→62 的"趋势"完全在噪声带里。

教训升一级：

- **小样本验证指标不能用来判断过拟合**，更不能做 checkpoint 监控——v2 的 EarlyStopping 盯着它，在 ep183 后"80 轮无改善"提前停了，而协议数据显示后面还在大幅进步；
- 正确姿势：把验证 MCD 的样本量加到几十句以上，或训练中定期做小型协议评估；
- 好在主线没被带偏：v1 的 1200 轮成果是真实的，v3（ep1199 + lr 3e-5 → 全局 ep2000）继续训也是数据支持的正确选择。

## 结论与下一步

- **条件注入 + 辅助分类器的设计成立**：情感通路收敛快、无条件崩溃，WER/CER 达到可用水平；
- **1200 轮没有过拟合**（协议评估修正）：ep1199 是当前最优权重；真正的教训是 2 句样本的 val_mcd 监控完全是噪声，已改成加大样本量 + 定期协议评估；
- **数据量是天花板**：全量 ESD（含中文 10 说话人，总 35 万句量级）或加 RAVDESS 混训才是根治过拟合的方向；
- 推理侧 `emo_scale` 的扫描、以及"用一段参考音频现场抽情感"的 zero-shot 用法，值得一篇单独展开。

一句话总结：**情感可控性做通了，1200 轮长跑货真价实；而那条过拟合曲线提醒我的是另一件事——用 2 句样本的噪声指标下过拟合的结论，比不监控更危险。**
