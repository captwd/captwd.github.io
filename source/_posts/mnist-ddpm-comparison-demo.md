---
title: DDPM × MNIST：统一协议下的分类模型对比实验
date: 2026-09-12
tags: [DDPM, MNIST, 对比实验, Demo]
categories: [深度学习实践]
description: 统一数据/训练/评估协议，横向对比 ANN、CNN、ViT 与传统机器学习模型，并用 DDPM 生成数据做下游可用性评估。
---

最近把 DDPM 在 MNIST 上的复现做完后，顺手搭了一套**统一对比框架**：把 ANN、CNN、ViT 和几种传统机器学习模型放到完全相同的数据、训练协议和测试集下横向对比，再用训好的 DDPM 生成数据训练同一批分类器，量化生成数据的下游可用性。交互版 Demo 在[这里](/demo/ddpm/)，本文是跟随博客主题的精简版。

## 实验设计

两条链路，全部模型在**同一份官方 MNIST 测试集（10k）**上评估 Top-1 准确率：

- **链路一（真实数据）**：官方 MNIST 60k → 统一预处理到 [−1,1] → 7 个模型训练 → 测试集评估；
- **链路二（DDPM 合成）**：已训练 DDPM → 1000 步反向采样 2000 张 → 用真实数据组最优分类器（CNN）打伪标签（置信度 ≥ 0.9，保留 94.2%）→ 仅用合成数据从零训练 ANN/CNN/ViT → 同一测试集评估。

DDPM 是生成模型没有分类准确率，采用标准的**下游评估**进入对比表：合成图像训练出的分类器在真实测试集上的表现，就是"生成数据质量"的量化体现。

**对齐协议**：官方 60k/10k 划分 · `Normalize((0.5,),(0.5,)) → [−1,1]` · batch 64 · 10 epochs · Adam(1e-3) + StepLR(5, 0.5) · CrossEntropy · seed 42 · 传统 ML 输入同样对齐到 [−1,1]。此前各脚本 `root='./MNIST'` 实际会触发重复下载、传统 ML 归一化是 [0,1]，这次一并修齐。

<div class="dddemo">

## 结果：真实数据训练

<table class="dd-metrics">
<thead><tr><th>模型</th><th>参数量</th><th>时长 (s)</th><th>最佳测试准确率</th><th>说明</th></tr></thead>
<tbody>
<tr><td>ANN（784-15-10 · Sigmoid）</td><td>11,935</td><td>81.4</td><td>0.9338</td><td class="l">容量极小，第 10 轮仍在缓慢提升</td></tr>
<tr class="best"><td><b>CNN</b>（2×Conv-BN-Pool + FC）</td><td>421,834</td><td>96.8</td><td><b>0.9939</b></td><td class="l">全场最佳（ep6 达峰）</td></tr>
<tr><td>ViT（16 patch · dim128 · 6 层）</td><td>1,199,882</td><td>217.9</td><td>0.9736</td><td class="l">参数最多，落后 CNN 约 2pp，仍在爬升</td></tr>
<tr><td>SVM（RBF 核）</td><td>—</td><td>198.4</td><td>0.9792</td><td class="l">传统组最佳，仅落后 CNN 1.5pp</td></tr>
<tr><td>KNN（k=5）</td><td>—</td><td>9.3</td><td>0.9688</td><td class="l">无显式训练，预测慢</td></tr>
<tr><td>RandomForest（100 树）</td><td>—</td><td>25.4</td><td>0.9705</td><td class="l">对输入缩放不敏感</td></tr>
<tr><td>LogisticRegression</td><td>—</td><td>10.5</td><td>0.9225*</td><td class="l">100 迭代未收敛，数值为下限</td></tr>
</tbody>
</table>

## 结果：DDPM 合成数据训练

生成链路：2000 张 → 置信度 0.9 过滤 → **保留 1,883 张（94.2%）**，伪标签器为真实数据组最优的 CNN（0.9939）。

<table class="dd-metrics">
<thead><tr><th>模型</th><th>训练规模</th><th>最佳测试准确率</th><th>vs 真实数据组</th></tr></thead>
<tbody>
<tr><td>ANN</td><td>1,883</td><td>0.6658</td><td>−26.8pp</td></tr>
<tr class="best"><td><b>CNN</b></td><td>1,883</td><td><b>0.9603</b></td><td>−3.4pp</td></tr>
<tr><td>ViT</td><td>1,883</td><td>0.8047</td><td>−16.9pp</td></tr>
</tbody>
</table>

## 生成样本与训练曲线

<div class="dd-figs">
<figure><img src="/demo/ddpm/img/ddpm_preview.png" alt="DDPM 生成样本预览"><figcaption>DDPM 生成样本预览（8×8 = 64 张 · 1000 步采样）</figcaption></figure>
<figure><img src="/demo/ddpm/img/CNN_real.png" alt="CNN 真实数据曲线"><figcaption>CNN · 真实数据（loss / test acc，逐 epoch）</figcaption></figure>
<figure><img src="/demo/ddpm/img/ViT_real.png" alt="ViT 真实数据曲线"><figcaption>ViT · 真实数据</figcaption></figure>
<figure><img src="/demo/ddpm/img/ANN_real.png" alt="ANN 真实数据曲线"><figcaption>ANN · 真实数据</figcaption></figure>
<figure><img src="/demo/ddpm/img/CNN_ddpm.png" alt="CNN 合成数据曲线"><figcaption>CNN · DDPM 合成数据</figcaption></figure>
<figure><img src="/demo/ddpm/img/ViT_ddpm.png" alt="ViT 合成数据曲线"><figcaption>ViT · DDPM 合成数据</figcaption></figure>
<figure><img src="/demo/ddpm/img/ANN_ddpm.png" alt="ANN 合成数据曲线"><figcaption>ANN · DDPM 合成数据</figcaption></figure>
</div>

## 结果分析

**① 架构对比**：CNN 0.9939 ≫ ViT 0.9736 &gt; ANN 0.9338。卷积归纳偏置在 28×28 小图 + 短训练下收益压倒性；ViT 参数最多（120 万）却落后约 2pp 且末轮仍在爬升——欠训练特征，文献预期成立（ViT 需大数据/强增广）；ANN 受限于 1.2 万参数 + Sigmoid，~93% 见顶。

**② 深度 vs 传统**：SVM-RBF 0.9792 是被低估的强基线，反超 ViT 与 ANN，距 CNN 仅 1.5pp；RF、KNN 同样压过 ViT/ANN。"深度全面占优"在 MNIST 上不成立——只有 CNN 占优。

**③ DDPM 生成数据质量**：保留率 94.2% + CNN 仅掉 3.4pp（0.9939 → 0.9603）——只用真实数据量 1/32 的合成样本就达 96%，生成样本判别信息密度高。gap 排序 CNN(−3.4pp) &lt; ViT(−16.9pp) &lt; ANN(−26.8pp)：掉点主因是**数据规模/多样性而非模型容量**（容量最小的 ANN 掉最狠）；上限同时受伪标签教师（CNN 自身 0.9939）限制。

<p class="dd-note">环境：RTX 5060 Laptop · torch 2.7.1+cu128 · 全程约 55 分钟。深度模型数值为最新一轮实测（CUDA 非确定性导致 ±0.1pp 漂移），传统 ML 来自首次全量实验。代码与完整协议见 <a href="https://github.com/captwd/MNIST-DDPM">GitHub 仓库 captwd/MNIST-DDPM</a>，交互版 Demo 见 <a href="/demo/ddpm/">/demo/ddpm/</a>。</p>
</div>

<style>
.dddemo { font-size: .95rem; line-height: 1.6; }
.dddemo table.dd-metrics { width: 100%; border-collapse: collapse; margin: 0 0 1rem; font-size: .88rem; }
.dddemo th, .dddemo td { border: 1px solid rgba(127,127,127,.35); padding: 7px 8px; text-align: center; }
.dddemo thead th { background: #1e7a55; color: #fff; font-weight: 600; }
.dddemo td.l { text-align: left; }
.dddemo tr.best td { background: rgba(30,122,85,.12); }
.dddemo .dd-figs { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; margin: 0 0 1rem; }
.dddemo figure { margin: 0; border: 1px solid rgba(127,127,127,.3); border-radius: 10px; overflow: hidden; }
.dddemo figure img { width: 100%; display: block; }
.dddemo figcaption { font-size: .8rem; opacity: .75; padding: 6px 10px; border-top: 1px solid rgba(127,127,127,.25); }
.dddemo .dd-note { font-size: .85rem; opacity: .8; }
.dddemo .dd-note a { color: #1e7a55; }
[data-theme="dark"] .dddemo thead th { background: #2c8f66; }
[data-theme="dark"] .dddemo tr.best td { background: rgba(76,195,138,.15); }
[data-theme="dark"] .dddemo .dd-note a { color: #4cc38a; }
</style>
