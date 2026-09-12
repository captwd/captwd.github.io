---
title: Matcha-TTS 训练手记
date: 2026-09-11
---

从一个 18M 参数的 Matcha-TTS 项目出发，记录从环境搭建、数据管线优化、结构替换实验，一直到迁移 WSL2 并换用 Mamba 骨干的完整过程。共 10 篇，建议按顺序阅读。

> **试听 Demo**：[站内试听](https://captwd.github.io/2026/09/12/matcha-tts-demo/) ｜ [独立版](https://captwd.github.io/demo/)
> **项目代码**：<https://github.com/captwd/mamba-matcha-tts>

| # | 日期 | 文章 |
|---|---|---|
| 1 | 2026-09-04 | [离线预处理缓存方案](/2026/09/04/offline-preprocessing-cache-for-tts-training/) |
| 2 | 2026-09-05 | [Windows 从零训练踩坑全集](/2026/09/05/matcha-tts-windows-training-pitfalls/) |
| 3 | 2026-09-06 | [硬件原理入门](/2026/09/06/dl-hardware-primer/) |
| 4 | 2026-09-06 | [训练时硬件实况解读](/2026/09/06/what-cpu-gpu-memory-do-during-training/) |
| 5 | 2026-09-06 | [PyTorch 参数解剖](/2026/09/06/pytorch-tensor-parameters-and-checkpoint-anatomy/) |
| 6 | 2026-09-06 | [声码器注册表与评估体系](/2026/09/06/matcha-tts-vocoder-registry-metrics-and-demo/) |
| 7 | 2026-09-07 | [ConvNeXt V2 与 MCD 震荡机制](/2026/09/07/convnext-v2-and-lr-decay-experiment/) |
| 8 | 2026-09-11 | [迁移 WSL2 与 mamba-ssm 安装](/2026/09/11/migrate-matcha-tts-to-wsl-and-install-mamba-ssm/) |
| 9 | 2026-09-11 | [双向 Mamba2 集成](/2026/09/11/integrate-bidirectional-mamba2-into-matcha-tts/) |
| 10 | 2026-09-11 | [换骨干的公平评估](/2026/09/11/fair-evaluation-for-backbone-swap/) |

## 读什么

- **想复现环境/踩坑**：第 1、2、8 篇
- **想理解硬件与显存**：第 3、4、5 篇
- **想做模型改造**：第 6、7、9 篇
- **想做严谨的对比实验**：第 10 篇
